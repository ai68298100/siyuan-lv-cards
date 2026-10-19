import { describe, expect, it } from "vitest";
import {
    CARD_ISSUE_TYPES,
    createEmptyFeedbackStore,
    flagCardIssue,
    resolveCardIssue,
    clearCardIssue,
    clearAllResolvedIssues,
    queryFlaggedIssues,
    summarizeIssueMetrics,
} from "../src/core/review-feedback-triage";

describe("review-feedback-triage (AR-9 复习本地反馈标记与维护分流引擎)", () => {
    it("包含五大本地问题标签分类", () => {
        expect(CARD_ISSUE_TYPES).toEqual([
            "factual-error",
            "duplicate",
            "stale",
            "too-hard",
            "custom-note",
        ]);
    });

    it("空存储状态初始化正确", () => {
        const store = createEmptyFeedbackStore(1000);
        expect(store.version).toBe(1);
        expect(store.updatedAt).toBe(1000);
        expect(Object.keys(store.records)).toHaveLength(0);
    });

    it("flagCardIssue 为卡片打标：支持来源块绑定与备注脱敏，初始为 unresolved", () => {
        let store = createEmptyFeedbackStore(1000);
        store = flagCardIssue(store, {
            cardId: "c1",
            deckId: "d-math",
            issueType: "factual-error",
            note: "微积分公式符号写反了",
            sourceBlockId: "block-calc-1",
            now: 2000,
        });

        expect(store.records["c1"]).toBeDefined();
        const record = store.records["c1"];
        expect(record.cardId).toBe("c1");
        expect(record.deckId).toBe("d-math");
        expect(record.issueType).toBe("factual-error");
        expect(record.note).toBe("微积分公式符号写反了");
        expect(record.sourceBlockId).toBe("block-calc-1");
        expect(record.isResolved).toBe(false);
        expect(record.flaggedAt).toBe(2000);
    });

    it("解决卡片标记：resolveCardIssue 转移为 isResolved: true 并记录时间", () => {
        let store = createEmptyFeedbackStore();
        store = flagCardIssue(store, {
            cardId: "c2",
            deckId: "d-math",
            issueType: "stale",
            now: 1000,
        });

        store = resolveCardIssue(store, "c2", 2000);
        expect(store.records["c2"].isResolved).toBe(true);
        expect(store.records["c2"].resolvedAt).toBe(2000);
    });

    it("清除单项与批量清除已解决项", () => {
        let store = createEmptyFeedbackStore();
        store = flagCardIssue(store, { cardId: "c1", deckId: "d1", issueType: "too-hard" });
        store = flagCardIssue(store, { cardId: "c2", deckId: "d1", issueType: "duplicate" });
        store = flagCardIssue(store, { cardId: "c3", deckId: "d2", issueType: "stale" });

        // 解决 c2
        store = resolveCardIssue(store, "c2");

        // 单独清除 c1
        store = clearCardIssue(store, "c1");
        expect(store.records["c1"]).toBeUndefined();
        expect(store.records["c2"]).toBeDefined();
        expect(store.records["c3"]).toBeDefined();

        // 批量清除所有已解决项（清除 c2，保留 c3）
        store = clearAllResolvedIssues(store);
        expect(store.records["c2"]).toBeUndefined();
        expect(store.records["c3"]).toBeDefined();
        expect(Object.keys(store.records)).toHaveLength(1);
    });

    it("多维过滤 queryFlaggedIssues（按卡组、类型、是否包含已解决）", () => {
        let store = createEmptyFeedbackStore();
        store = flagCardIssue(store, { cardId: "c1", deckId: "d-math", issueType: "factual-error", now: 100 });
        store = flagCardIssue(store, { cardId: "c2", deckId: "d-math", issueType: "too-hard", now: 200 });
        store = flagCardIssue(store, { cardId: "c3", deckId: "d-english", issueType: "stale", now: 300 });

        // 默认过滤未解决项，时间倒序
        const allUnresolved = queryFlaggedIssues(store);
        expect(allUnresolved.map(r => r.cardId)).toEqual(["c3", "c2", "c1"]);

        // 按卡组过滤
        const mathIssues = queryFlaggedIssues(store, { deckId: "d-math" });
        expect(mathIssues.map(r => r.cardId)).toEqual(["c2", "c1"]);

        // 按问题类型过滤
        const errors = queryFlaggedIssues(store, { issueTypes: ["factual-error"] });
        expect(errors.map(r => r.cardId)).toEqual(["c1"]);
    });

    it("统计分布 summarizeIssueMetrics", () => {
        let store = createEmptyFeedbackStore();
        store = flagCardIssue(store, { cardId: "c1", deckId: "d1", issueType: "factual-error" });
        store = flagCardIssue(store, { cardId: "c2", deckId: "d1", issueType: "factual-error" });
        store = flagCardIssue(store, { cardId: "c3", deckId: "d1", issueType: "duplicate" });
        store = flagCardIssue(store, { cardId: "c4", deckId: "d1", issueType: "too-hard" });

        // 解决 c4
        store = resolveCardIssue(store, "c4");

        const summary = summarizeIssueMetrics(store);
        expect(summary.totalUnresolved).toBe(3);
        expect(summary.totalResolved).toBe(1);
        expect(summary.byType["factual-error"]).toBe(2);
        expect(summary.byType["duplicate"]).toBe(1);
        expect(summary.byType["too-hard"]).toBe(0); // c4 已解决，不计入待解决
    });
});
