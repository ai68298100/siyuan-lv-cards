import { describe, expect, it } from "vitest";
import {
    FRESHNESS_STATUSES,
    createEmptyFreshnessStore,
    flagKnowledgeFreshness,
    isCardUnderFreshnessProtection,
    recalibrateWithUpdate,
    summarizeFreshnessState,
} from "../src/core/knowledge-freshness";

describe("knowledge-freshness (BI-24 知识新鲜度与记忆掌握解耦引擎)", () => {
    it("包含全量五大知识新鲜度状态枚举", () => {
        expect(FRESHNESS_STATUSES).toEqual([
            "fresh",
            "content-stale",
            "version-changed",
            "goal-ended",
            "source-invalid",
        ]);
    });

    it("空存储状态初始化正确", () => {
        const store = createEmptyFreshnessStore(1000);
        expect(store.version).toBe(1);
        expect(store.updatedAt).toBe(1000);
        expect(Object.keys(store.records)).toHaveLength(0);
    });

    it("标记事实过时（content-stale）：自动保留旧题面答案快照并激活过时保护", () => {
        let store = createEmptyFreshnessStore(1000);
        store = flagKnowledgeFreshness(store, {
            cardId: "card-stale-1",
            deckId: "deck-laws",
            status: "content-stale",
            currentPrompt: "我国现行公司法注册资本认缴期限是几年？",
            currentAnswer: "无硬性限制",
            now: 2000,
        });

        expect(store.records["card-stale-1"]).toBeDefined();
        const rec = store.records["card-stale-1"];
        expect(rec.status).toBe("content-stale");
        expect(rec.previousSnapshot).toEqual({
            prompt: "我国现行公司法注册资本认缴期限是几年？",
            answer: "无硬性限制",
            capturedAt: 2000,
        });
        expect(rec.isRecalibrated).toBe(false);

        // 核心铁律：处于过时保护期，做错不计入遗忘惩罚！
        const check = isCardUnderFreshnessProtection(store, "card-stale-1");
        expect(check.isProtected).toBe(true);
        expect(check.status).toBe("content-stale");
    });

    it("普通正常卡（fresh）不处于保护期", () => {
        const store = createEmptyFreshnessStore();
        const check = isCardUnderFreshnessProtection(store, "card-normal");
        expect(check.isProtected).toBe(false);
        expect(check.status).toBe("fresh");
    });

    it("录入新版本并平滑重校准（recalibrateWithUpdate）：保留新旧对照，解除过时保护", () => {
        let store = createEmptyFreshnessStore(1000);
        store = flagKnowledgeFreshness(store, {
            cardId: "card-law-update",
            deckId: "deck-laws",
            status: "version-changed",
            currentPrompt: "旧规定",
            currentAnswer: "旧答案",
            now: 1500,
        });

        // 录入修订
        const { nextState, diffSummary } = recalibrateWithUpdate(store, {
            cardId: "card-law-update",
            newPrompt: "新规定（2024修订）",
            newAnswer: "5年内缴足",
            now: 3000,
        });

        // 差异对照完备
        expect(diffSummary.promptChanged).toBe(true);
        expect(diffSummary.answerChanged).toBe(true);
        expect(diffSummary.oldPrompt).toBe("旧规定");
        expect(diffSummary.newPrompt).toBe("新规定（2024修订）");
        expect(diffSummary.oldAnswer).toBe("旧答案");
        expect(diffSummary.newAnswer).toBe("5年内缴足");

        // 记录状态平滑更新为 fresh，解除过时保护
        const updatedRec = nextState.records["card-law-update"];
        expect(updatedRec.status).toBe("fresh");
        expect(updatedRec.isRecalibrated).toBe(true);
        expect(updatedRec.recalibratedAt).toBe(3000);

        const checkAfter = isCardUnderFreshnessProtection(nextState, "card-law-update");
        expect(checkAfter.isProtected).toBe(false);
    });

    it("统计全库新鲜度分布概览 summarizeFreshnessState", () => {
        let store = createEmptyFreshnessStore();
        store = flagKnowledgeFreshness(store, { cardId: "c1", deckId: "d1", status: "content-stale" });
        store = flagKnowledgeFreshness(store, { cardId: "c2", deckId: "d1", status: "version-changed" });
        store = flagKnowledgeFreshness(store, { cardId: "c3", deckId: "d2", status: "goal-ended" });

        // 重校准 c1
        const res = recalibrateWithUpdate(store, { cardId: "c1", newPrompt: "P", newAnswer: "A" });
        store = res.nextState;

        const summary = summarizeFreshnessState(store);
        expect(summary.totalFlagged).toBe(3);
        expect(summary.protectedCount).toBe(2); // c2, c3 处于保护期，c1 已重校准
        expect(summary.byStatus["fresh"]).toBe(1); // c1
        expect(summary.byStatus["version-changed"]).toBe(1); // c2
        expect(summary.byStatus["goal-ended"]).toBe(1); // c3
    });
});
