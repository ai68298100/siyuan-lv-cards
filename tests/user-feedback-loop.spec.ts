import { describe, expect, it } from "vitest";
import {
    createEmptyFeedbackLoopStore,
    recordFeedbackLoopItem,
    advanceRevisitStatus,
    evaluateProductMetrics,
    exportFeedbackLoopMarkdown,
} from "../src/core/user-feedback-loop";

describe("user-feedback-loop (BL-14 产品目标与用户反馈闭环引擎)", () => {
    it("空存储状态初始化正确", () => {
        const store = createEmptyFeedbackLoopStore(1000);
        expect(store.version).toBe(1);
        expect(store.updatedAt).toBe(1000);
        expect(store.items).toHaveLength(0);
    });

    it("记录反馈条目：关联任务、证据与版本，敏感内容自动脱敏", () => {
        let store = createEmptyFeedbackLoopStore(1000);
        store = recordFeedbackLoopItem(store, {
            userTask: "复习医学药理学卡片",
            issueDescription: "公式渲染遇到异常，出现类似 sk-1234567890abcdef 的乱码",
            evidenceRef: "card-med-404",
            linkedTodoId: "AS-3",
            targetVersion: "v0.210.6",
            satisfactionRating: 4,
            now: 2000,
        });

        expect(store.items).toHaveLength(1);
        const item = store.items[0];
        expect(item.userTask).toBe("复习医学药理学卡片");
        expect(item.evidenceRef).toBe("card-med-404");
        expect(item.linkedTodoId).toBe("AS-3");
        expect(item.targetVersion).toBe("v0.210.6");
        expect(item.revisitStatus).toBe("unaddressed");
        expect(item.satisfactionRating).toBe(4);

        // 密钥脱敏验证
        expect(item.issueDescription).not.toContain("sk-1234567890abcdef");
        expect(item.issueDescription).toContain("sk-***cdef");
    });

    it("推进回访状态：从 unaddressed 最终流转至 verified-closed 并记录解决时间", () => {
        let store = createEmptyFeedbackLoopStore(1000);
        store = recordFeedbackLoopItem(store, {
            userTask: "导出周报",
            issueDescription: "重复点击导致并发写入冲突",
            evidenceRef: "report-week-1",
            now: 1500,
        });

        const id = store.items[0].id;

        // 标记为 in-progress
        store = advanceRevisitStatus(store, id, "in-progress", 2000);
        expect(store.items[0].revisitStatus).toBe("in-progress");

        // 标记为已验证关闭
        store = advanceRevisitStatus(store, id, "verified-closed", 3000);
        expect(store.items[0].revisitStatus).toBe("verified-closed");
        expect(store.items[0].resolvedAt).toBe(3000);
    });

    describe("三维指标独立解耦 (evaluateProductMetrics)", () => {
        it("假繁荣陷阱识别：使用率极高（heavy）但客观掌握率偏低（low） -> busyWithoutMastery 预警", () => {
            const metrics = evaluateProductMetrics({
                totalActions: 150, // heavy 使用
                activeDecks: 5,
                retentionRate: 0.55, // 仅 55% 掌握率
                achievedGoals: 0,
                ratings: [4, 4, 5],
            });

            expect(metrics.usage.usageLevel).toBe("heavy");
            expect(metrics.outcome.outcomeLevel).toBe("low");
            // 核心断言：坚决破除使用频次高即掌握得好的假象
            expect(metrics.alignmentInsightKey).toBe("userFeedbackLoop.insight.busyWithoutMastery");
        });

        it("高效轻量工具特征：使用频次适度甚至偏低（light），但达成高保持率与目标 -> efficientTool", () => {
            const metrics = evaluateProductMetrics({
                totalActions: 25, // light 使用
                activeDecks: 2,
                retentionRate: 0.92, // 92% 高保持率
                achievedGoals: 2,
                ratings: [5, 5, 5],
            });

            expect(metrics.usage.usageLevel).toBe("light");
            expect(metrics.outcome.outcomeLevel).toBe("high");
            expect(metrics.alignmentInsightKey).toBe("userFeedbackLoop.insight.efficientTool");
        });

        it("流程摩擦卡点识别：结果达标但用户评分差（detractor） -> frictionInWorkflow 警报", () => {
            const metrics = evaluateProductMetrics({
                totalActions: 50,
                activeDecks: 3,
                retentionRate: 0.9,
                achievedGoals: 1,
                ratings: [1, 2, 2], // 差评（平均 1.7 分）
            });

            expect(metrics.outcome.outcomeLevel).toBe("high");
            expect(metrics.satisfaction.npsCategory).toBe("detractor");
            expect(metrics.alignmentInsightKey).toBe("userFeedbackLoop.insight.frictionInWorkflow");
        });
    });

    it("exportFeedbackLoopMarkdown 导出清晰的 Markdown 闭环台账", () => {
        let store = createEmptyFeedbackLoopStore();
        store = recordFeedbackLoopItem(store, {
            userTask: "图片遮挡制卡",
            issueDescription: "手机端编辑多边形容易误触",
            evidenceRef: "block-occlusion-99",
            linkedTodoId: "BL-13",
        });

        const md = exportFeedbackLoopMarkdown(store);
        expect(md).toContain("# 小驴闪卡 · 用户反馈与任务闭环台账");
        expect(md).toContain("图片遮挡制卡");
        expect(md).toContain("BL-13");
        expect(md).toContain("[unaddressed]");
    });
});
