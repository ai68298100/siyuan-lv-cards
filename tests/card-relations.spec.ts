import { describe, expect, it } from "vitest";
import {
    addRelation, detachCard, emptyCardRelations, normalizeCardRelations,
    relationsOf, removeRelation, RELATION_TYPES,
} from "../src/core/card-relations";

// BK-2 卡片关系图：纯元数据（不产生第二调度器）/ 无自环 / 去重 / 双向视图 / 端点清理
describe("card-relations（BK-2）", () => {
    it("非法形态回空库；坏边剔除（自环/缺字段/未知类型）", () => {
        const r = normalizeCardRelations({
            relations: [
                { from: "a", to: "a", type: "sibling" },        // 自环剔除
                { from: "a", to: "b", type: "mind-meld" },      // 未知类型剔除
                { from: "", to: "b", type: "source" },          // 缺字段剔除
                { from: "a", to: "b", type: "sibling" },
            ],
        }, 500);
        expect(r.relations).toEqual([{ from: "a", to: "b", type: "sibling", createdAt: 500 }]);
    });

    it("完全重复边去重（同 from+to+type）", () => {
        const r = normalizeCardRelations({
            relations: [
                { from: "a", to: "b", type: "sibling", createdAt: 1 },
                { from: "a", to: "b", type: "sibling", createdAt: 2 },
            ],
        }, 500);
        expect(r.relations).toHaveLength(1);
    });

    it("addRelation：新建/自环拒绝/重复返回 false", () => {
        const d = emptyCardRelations();
        expect(addRelation(d, "a", "b", "prerequisite")).toBe(true);
        expect(addRelation(d, "a", "a", "source")).toBe(false);   // 自环
        expect(addRelation(d, "a", "b", "prerequisite")).toBe(false); // 重复
        expect(d.relations).toHaveLength(1);
    });

    it("relationsOf 双向视图（outgoing/incoming）", () => {
        const d = emptyCardRelations();
        addRelation(d, "a", "b", "prerequisite");
        addRelation(d, "c", "a", "example");
        const view = relationsOf(d, "a");
        expect(view).toHaveLength(2);
        expect(view.map(v => v.direction).sort()).toEqual(["incoming", "outgoing"]);
    });

    it("removeRelation / detachCard 端点清理", () => {
        const d = emptyCardRelations();
        addRelation(d, "a", "b", "sibling");
        addRelation(d, "b", "c", "example");
        expect(removeRelation(d, "a", "b", "sibling")).toBe(true);
        expect(removeRelation(d, "a", "b", "sibling")).toBe(false);
        addRelation(d, "x", "b", "source");
        expect(detachCard(d, "b")).toBe(2); // b 作为 to/from 的两条边全清
        expect(relationsOf(d, "b")).toHaveLength(0);
    });

    it("七类关系类型全量在册", () => {
        expect(RELATION_TYPES).toHaveLength(7);
    });
});
