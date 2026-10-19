import { describe, expect, it } from "vitest";
import {
    CONFLICT_DOMAINS,
    compareThreeWayEntity,
    resolveConflictItem,
    assembleFinalResolvedEntity,
    areValuesEqual,
} from "../src/core/sync-conflict-wizard";
import type {
    ThreeWayDiffInput,
    FieldConflictItem,
} from "../src/core/sync-conflict-wizard";

describe("sync-conflict-wizard (BL-9 多设备同步冲突决策向导与细粒度三向合并引擎)", () => {
    it("包含六大冲突领域", () => {
        expect(CONFLICT_DOMAINS).toEqual([
            "content",
            "personal",
            "template",
            "history",
            "plan",
            "event",
        ]);
    });

    describe("语义等价深比较 (areValuesEqual)", () => {
        it("基础标量、数组与嵌套对象深比较", () => {
            expect(areValuesEqual("abc", "abc")).toBe(true);
            expect(areValuesEqual("abc", "def")).toBe(false);
            expect(areValuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
            expect(areValuesEqual([1, 2], [1, 2, 3])).toBe(false);
            expect(areValuesEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
            expect(areValuesEqual({ a: 1 }, { a: 2 })).toBe(false);
            expect(areValuesEqual(null, null)).toBe(true);
            expect(areValuesEqual(null, undefined)).toBe(false);
        });
    });

    describe("字段级三向合并与冲突识别 (compareThreeWayEntity)", () => {
        it("正交字段无冲突自动合并：本地改题面，远端改标签，自动双向融合", () => {
            const input: ThreeWayDiffInput<Record<string, any>> = {
                domain: "content",
                entityId: "card-1",
                entityName: "高数卡片",
                base: { prompt: "初始题面", tags: ["基础"], note: "备忘" },
                local: { prompt: "本地精修题面", tags: ["基础"], note: "备忘" }, // 本地只改了题面
                remote: { prompt: "初始题面", tags: ["基础", "考研"], note: "备忘" }, // 远端只增了标签
            };

            const { autoMergedResult, conflicts } = compareThreeWayEntity(input);

            expect(conflicts).toHaveLength(0);
            expect(autoMergedResult.prompt).toBe("本地精修题面");
            expect(autoMergedResult.tags).toEqual(["基础", "考研"]);
            expect(autoMergedResult.note).toBe("备忘");
        });

        it("同字段修改产生冲突项并完整保留三方原值", () => {
            const input: ThreeWayDiffInput<Record<string, any>> = {
                domain: "content",
                entityId: "card-2",
                base: { answer: "初始答案" },
                local: { answer: "桌面端改写的详细答案" },
                remote: { answer: "手机端改写的精炼答案" },
            };

            const { autoMergedResult, conflicts } = compareThreeWayEntity(input);

            expect(conflicts).toHaveLength(1);
            const conflict = conflicts[0];
            expect(conflict.domain).toBe("content");
            expect(conflict.field).toBe("answer");
            expect(conflict.baseValue).toBe("初始答案");
            expect(conflict.localValue).toBe("桌面端改写的详细答案");
            expect(conflict.remoteValue).toBe("手机端改写的精炼答案");
            expect(conflict.resolved).toBe(false);
            expect(autoMergedResult.answer).toBeUndefined();
        });

        it("复习历史（history）CRDT 式去重并集自动合并，绝不丢学习记录", () => {
            const input: ThreeWayDiffInput<Record<string, any>> = {
                domain: "history",
                entityId: "card-3",
                base: { revlog: [{ id: "r1", rating: 3 }] },
                local: { revlog: [{ id: "r1", rating: 3 }, { id: "r2-desktop", rating: 4 }] },
                remote: { revlog: [{ id: "r1", rating: 3 }, { id: "r3-mobile", rating: 2 }] },
            };

            const { autoMergedResult, conflicts } = compareThreeWayEntity(input);
            expect(conflicts).toHaveLength(0);
            expect(autoMergedResult.revlog).toHaveLength(3);
            expect((autoMergedResult.revlog as any[]).map(r => r.id)).toEqual(["r1", "r2-desktop", "r3-mobile"]);
        });
    });

    describe("冲突解决与最终组装 (resolveConflictItem & assembleFinalResolvedEntity)", () => {
        const sampleConflict: FieldConflictItem = {
            id: "cnf-1",
            domain: "content",
            field: "mnemonic",
            entityId: "card-4",
            baseValue: "旧口诀",
            localValue: "本地幽默口诀",
            remoteValue: "远端生动口诀",
            resolved: false,
            descriptionKey: "syncConflict.field.mnemonic",
        };

        it("未解决冲突时组装实体抛出异常（阻断静默落盘）", () => {
            expect(() =>
                assembleFinalResolvedEntity({ prompt: "题目" }, [sampleConflict]),
            ).toThrowError(/Cannot assemble entity with unresolved conflict/);
        });

        it("策略一：choose-local 采纳本地值", () => {
            const resolved = resolveConflictItem(sampleConflict, "choose-local");
            expect(resolved.resolved).toBe(true);

            const { finalEntity, forkedVariants } = assembleFinalResolvedEntity(
                { prompt: "题目" },
                [resolved],
            );
            expect(finalEntity.mnemonic).toBe("本地幽默口诀");
            expect(forkedVariants).toBeUndefined();
        });

        it("策略二：choose-remote 采纳远端值", () => {
            const resolved = resolveConflictItem(sampleConflict, "choose-remote");
            const { finalEntity } = assembleFinalResolvedEntity({ prompt: "题目" }, [resolved]);
            expect(finalEntity.mnemonic).toBe("远端生动口诀");
        });

        it("策略三：manual-merge 人工定制合成", () => {
            const resolved = resolveConflictItem(
                sampleConflict,
                "manual-merge",
                "本地+远端综合口诀",
            );
            const { finalEntity } = assembleFinalResolvedEntity({ prompt: "题目" }, [resolved]);
            expect(finalEntity.mnemonic).toBe("本地+远端综合口诀");
        });

        it("策略四：fork-variant 分叉为兄弟变体卡，两侧原值 100% 完整保真", () => {
            const resolved = resolveConflictItem(sampleConflict, "fork-variant");
            const { finalEntity, forkedVariants } = assembleFinalResolvedEntity(
                { prompt: "题目" },
                [resolved],
            );

            // 主卡采纳本地
            expect(finalEntity.mnemonic).toBe("本地幽默口诀");
            expect(finalEntity.prompt).toBe("题目");

            // 孪生变体卡采纳远端，标记分叉来源
            expect(forkedVariants).toHaveLength(1);
            const variant = forkedVariants![0];
            expect(variant.mnemonic).toBe("远端生动口诀");
            expect(variant.prompt).toBe("题目");
            expect((variant as any).isForkedVariant).toBe(true);
            expect((variant as any).forkedFromId).toBe("card-4");
        });
    });
});
