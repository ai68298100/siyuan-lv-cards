import { describe, expect, it } from "vitest";
import {
    affectedInstances, deriveInstance, emptyKnowledgeObjects, findObject,
    normalizeKnowledgeObjects, removeInstance, toggleInstance, type KnowledgeObjectsData,
} from "../src/core/knowledge-objects";

// BK-1 知识对象与卡实例分离：清洗/派生幂等/受影响清单/单变体停用/摘除
function makeData(): KnowledgeObjectsData {
    const d = emptyKnowledgeObjects();
    d.objects.push({
        id: "ko-mito",
        fact: "线粒体是细胞的能量工厂",
        sourceBlockID: "blk-1",
        instances: [
            { cardID: "card-qa", cardType: "qa", capability: "definition", disabled: false },
            { cardID: "card-cloze", cardType: "cloze", capability: "fact", disabled: false },
        ],
        updatedAt: 1000,
    });
    return d;
}

describe("normalizeKnowledgeObjects", () => {
    it("非法形态回空库", () => {
        expect(normalizeKnowledgeObjects(null)).toEqual(emptyKnowledgeObjects());
        expect(normalizeKnowledgeObjects({ objects: "x" })).toEqual(emptyKnowledgeObjects());
    });

    it("坏对象剔除、同 id 去重（后者丢弃）", () => {
        const r = normalizeKnowledgeObjects({
            objects: [
                { id: "bad", fact: "" },                      // 缺 fact：剔除
                { fact: "缺 id" },                            // 剔除
                { id: "ko-a", fact: "事实A", instances: [] },
                { id: "ko-a", fact: "重复 id 后者丢弃", instances: [] },
                { id: "ko-b", fact: "事实B", instances: [{ q: "非实例形状" }] },
            ],
        }, 500);
        expect(r.objects).toHaveLength(2);
        expect(r.objects[0].fact).toBe("事实A");
        expect(r.objects[1].id).toBe("ko-b");
        expect(r.objects[1].instances).toHaveLength(0);
        expect(r.objects[0].updatedAt).toBe(500);
    });

    it("fact 超长截断到 500", () => {
        const r = normalizeKnowledgeObjects({ objects: [{ id: "ko-long", fact: "长".repeat(600), instances: [] }] });
        expect(r.objects[0].fact).toHaveLength(500);
    });
});

describe("实例操作", () => {
    it("deriveInstance：追加实例；同 cardID 幂等返回 false", () => {
        const d = makeData();
        const obj = findObject(d, "ko-mito")!;
        expect(deriveInstance(obj, { cardID: "card-choice", cardType: "choice", capability: "distinction" })).toBe(true);
        expect(obj.instances).toHaveLength(3);
        expect(deriveInstance(obj, { cardID: "card-choice", cardType: "choice" })).toBe(false);
        expect(obj.instances).toHaveLength(3);
    });

    it("affectedInstances：列出全部实例（含已停用）", () => {
        const d = makeData();
        const obj = findObject(d, "ko-mito")!;
        toggleInstance(obj, "card-cloze", true);
        expect(affectedInstances(obj)).toHaveLength(2); // 含停用
    });

    it("toggleInstance：单变体停用/启用；未知 cardID 无操作", () => {
        const d = makeData();
        const obj = findObject(d, "ko-mito")!;
        expect(toggleInstance(obj, "card-qa", true)).toBe(true);
        expect(obj.instances.find(i => i.cardID === "card-qa")?.disabled).toBe(true);
        expect(toggleInstance(obj, "card-qa", true)).toBe(false); // 同状态无变更
        expect(toggleInstance(obj, "no-such", true)).toBe(false);
    });

    it("removeInstance：摘除内核已删的实例", () => {
        const d = makeData();
        const obj = findObject(d, "ko-mito")!;
        expect(removeInstance(obj, "card-qa")).toBe(true);
        expect(obj.instances.map(i => i.cardID)).toEqual(["card-cloze"]);
        expect(removeInstance(obj, "card-qa")).toBe(false);
    });
});
