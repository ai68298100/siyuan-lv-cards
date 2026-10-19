import { describe, expect, it } from "vitest";
import {
    REVISION_FEEDBACK_KINDS,
    createEmptyRevisionInbox,
    calculateRevisionDiff,
    submitRevisionFeedback,
    approveRevision,
    customizeAndApproveRevision,
    rejectRevision,
    summarizeRevisionInbox,
} from "../src/core/revision-inbox";

describe("revision-inbox (BI-23 应用反馈反哺内容与修订收件箱引擎)", () => {
    it("包含三大应用反馈类型枚举", () => {
        expect(REVISION_FEEDBACK_KINDS).toEqual([
            "missing-condition",
            "misconception-fix",
            "new-example",
        ]);
    });

    it("calculateRevisionDiff 精准计算结构化差异对比", () => {
        const diff1 = calculateRevisionDiff({
            originalPrompt: "光合作用产生什么？",
            proposedPrompt: "在有光照条件下，植物光合作用产生什么？",
            originalAnswer: "氧气",
            proposedAnswer: "氧气和有机物",
        });

        expect(diff1.promptChanged).toBe(true);
        expect(diff1.answerChanged).toBe(true);

        const diff2 = calculateRevisionDiff({
            originalPrompt: "相同题面",
            proposedPrompt: "相同题面",
            originalAnswer: "相同答案",
            proposedAnswer: "相同答案",
        });

        expect(diff2.promptChanged).toBe(false);
        expect(diff2.answerChanged).toBe(false);
    });

    it("submitRevisionFeedback 暂存反哺条目：状态恒为 staged，绝不静默修改卡面", () => {
        let store = createEmptyRevisionInbox(1000);
        const { nextState, item } = submitRevisionFeedback(store, {
            cardId: "card-bio-1",
            deckId: "deck-biology",
            feedbackKind: "missing-condition",
            taskContext: "做高考模拟生物大题",
            evidenceText: "题目特意强调了无氧与有氧环境的产物差异",
            originalPrompt: "呼吸作用产物",
            proposedPrompt: "有氧呼吸作用的主要产物是什么？",
            originalAnswer: "水和二氧化碳",
            proposedAnswer: "二氧化碳、水和大量 ATP",
            now: 2000,
        });

        expect(nextState.items).toHaveLength(1);
        expect(item.status).toBe("staged"); // 核心原则：绝不直接落盘
        expect(item.cardId).toBe("card-bio-1");
        expect(item.diff.promptChanged).toBe(true);
        expect(item.diff.answerChanged).toBe(true);
        expect(item.stagedAt).toBe(2000);
    });

    it("用户决策路径一：approveRevision 确认采纳，状态变更为 applied 并生成最终内容", () => {
        let store = createEmptyRevisionInbox();
        const { nextState, item } = submitRevisionFeedback(store, {
            cardId: "card-1",
            deckId: "d1",
            feedbackKind: "misconception-fix",
            taskContext: "复盘错题",
            evidenceText: "混淆了重力与万有引力的边界",
            originalPrompt: "重力就是万有引力吗？",
            proposedPrompt: "重力与万有引力有什么严格区别？",
            originalAnswer: "是的",
            proposedAnswer: "不是，重力是万有引力在物体所在纬度的一个分力",
        });

        const res = approveRevision(nextState, item.id, 3000);
        expect(res.approvedItem?.status).toBe("applied");
        expect(res.approvedItem?.resolvedAt).toBe(3000);
        expect(res.finalCardContent?.prompt).toBe("重力与万有引力有什么严格区别？");
        expect(res.finalCardContent?.answer).toBe("不是，重力是万有引力在物体所在纬度的一个分力");
    });

    it("用户决策路径二：customizeAndApproveRevision 手工调整后采纳", () => {
        let store = createEmptyRevisionInbox();
        const { nextState, item } = submitRevisionFeedback(store, {
            cardId: "card-2",
            deckId: "d1",
            feedbackKind: "new-example",
            taskContext: "项目实战",
            evidenceText: "发现 Redis 缓存击穿的典型例子",
            originalPrompt: "缓存击穿定义",
            proposedPrompt: "什么是缓存击穿？",
            originalAnswer: "热点 key 失效",
            proposedAnswer: "热点 key 失效导致大量请求直击数据库",
        });

        const res = customizeAndApproveRevision(
            nextState,
            item.id,
            "什么是缓存击穿（附秒杀场景案例）？",
            "热点 key 过期瞬间并发涌入，可用互斥锁或逻辑永不过期防御",
            4000,
        );

        expect(res.customizedItem?.status).toBe("customized");
        expect(res.customizedItem?.userCustomizedContent?.prompt).toBe("什么是缓存击穿（附秒杀场景案例）？");
        expect(res.finalCardContent?.prompt).toBe("什么是缓存击穿（附秒杀场景案例）？");
    });

    it("用户决策路径三：rejectRevision 拒绝丢弃", () => {
        let store = createEmptyRevisionInbox();
        const { nextState, item } = submitRevisionFeedback(store, {
            cardId: "card-3",
            deckId: "d1",
            feedbackKind: "missing-condition",
            taskContext: "查阅资料",
            evidenceText: "误判需要补充",
            originalPrompt: "P",
            proposedPrompt: "P+",
            originalAnswer: "A",
            proposedAnswer: "A+",
        });

        const rejectedState = rejectRevision(nextState, item.id, 5000);
        expect(rejectedState.items[0].status).toBe("rejected");
        expect(rejectedState.items[0].resolvedAt).toBe(5000);
    });

    it("统计修订收件箱分布 summarizeRevisionInbox", () => {
        let store = createEmptyRevisionInbox();
        const res1 = submitRevisionFeedback(store, {
            cardId: "c1", deckId: "d1", feedbackKind: "missing-condition",
            taskContext: "t", evidenceText: "e", originalPrompt: "p", proposedPrompt: "p1", originalAnswer: "a", proposedAnswer: "a1",
        });
        const res2 = submitRevisionFeedback(res1.nextState, {
            cardId: "c2", deckId: "d1", feedbackKind: "misconception-fix",
            taskContext: "t", evidenceText: "e", originalPrompt: "p", proposedPrompt: "p2", originalAnswer: "a", proposedAnswer: "a2",
        });

        // 采纳 c1
        const approvedRes = approveRevision(res2.nextState, res1.item.id);

        const summary = summarizeRevisionInbox(approvedRes.nextState);
        expect(summary.total).toBe(2);
        expect(summary.stagedCount).toBe(1); // c2 仍在待办
        expect(summary.appliedCount).toBe(1); // c1 已采纳
        expect(summary.byKind["misconception-fix"]).toBe(1);
    });
});
