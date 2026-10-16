import { describe, expect, it } from "vitest";
import { decideTodayAction, type TodayDecisionFacts } from "../src/core/today-decision";
import zhCN from "../public/i18n/zh-CN.json";
import en from "../public/i18n/en.json";

describe("today-decision 今日智能行动决策管线 (切片 6 核心)", () => {
    it("状态未知或范围读取中时，输出 blocked 决策并锁定主按钮", () => {
        const facts: TodayDecisionFacts = { dueCount: 0, unknownDue: true };
        const decisionZh = decideTodayAction(facts, zhCN);
        expect(decisionZh.kind).toBe("blocked");
        expect(decisionZh.actionDisabled).toBe(true);
        expect(decisionZh.title).toContain("正在核对当前范围");
        expect(decisionZh.reason).toContain("先重试或缩小范围");

        const decisionEn = decideTodayAction(facts, en);
        expect(decisionEn.kind).toBe("blocked");
        expect(decisionEn.actionDisabled).toBe(true);
        expect(decisionEn.title).toContain("Checking Scope");
    });

    it("有本场未完成会话时，第一优先级为从第 N+1 张继续本场", () => {
        const facts: TodayDecisionFacts = {
            dueCount: 10,
            hasLiveSession: true,
            sessionReviewedCount: 4,
        };
        const decision = decideTodayAction(facts, zhCN);
        expect(decision.kind).toBe("resume");
        expect(decision.primaryAction).toBe("continue-review");
        expect(decision.title).toContain("从第 5 张继续");
        expect(decision.summary).toContain("已完成 4 张");
        expect(decision.actionDisabled).toBeFalsy();
    });

    it("今日到期队列中存在明确坏卡时，优先级提升为先修后学", () => {
        const facts: TodayDecisionFacts = {
            dueCount: 15,
            brokenCardsInDueCount: 3,
        };
        const decision = decideTodayAction(facts, zhCN);
        expect(decision.kind).toBe("fix-broken");
        expect(decision.primaryAction).toBe("open-maintenance");
        expect(decision.title).toContain("建议先修复题面有疑问的卡片");
        expect(decision.summary).toContain("有 3 张卡片存在结构问题");
    });

    it("长期未复习返场时（>=7天），建议从 5 分钟小目标温和启动", () => {
        const facts: TodayDecisionFacts = {
            dueCount: 25,
            daysGap: 14,
        };
        const decision = decideTodayAction(facts, zhCN);
        expect(decision.kind).toBe("long-gap-start");
        expect(decision.primaryAction).toBe("start-review");
        expect(decision.suggestedBudgetMinutes).toBe(5);
        expect(decision.title).toContain("用 5 分钟，温习旧知识");
        expect(decision.summary).toContain("已有 14 天");
    });

    it("正常今日到期复习，输出标准建议", () => {
        const facts: TodayDecisionFacts = {
            dueCount: 8,
            daysGap: 1,
        };
        const decision = decideTodayAction(facts, zhCN);
        expect(decision.kind).toBe("normal-start");
        expect(decision.primaryAction).toBe("start-review");
        expect(decision.summary).toContain("8 张待复习");
    });

    it("今日复习已完成但收件箱有待整理材料时，建议整理收件箱", () => {
        const facts: TodayDecisionFacts = {
            dueCount: 0,
            inboxCount: 6,
        };
        const decision = decideTodayAction(facts, zhCN);
        expect(decision.kind).toBe("clear-inbox");
        expect(decision.primaryAction).toBe("open-inbox");
        expect(decision.title).toContain("顺便整理材料");
        expect(decision.summary).toContain("6 项材料等待整理");
    });

    it("今日复习已完成但有维护债务时，建议顺手维护", () => {
        const facts: TodayDecisionFacts = {
            dueCount: 0,
            maintenanceDebtCount: 2,
            suspendedCount: 1,
        };
        const decision = decideTodayAction(facts, zhCN);
        expect(decision.kind).toBe("clear-maintenance");
        expect(decision.primaryAction).toBe("open-maintenance");
        expect(decision.summary).toContain("3 项维护债务");
    });

    it("全部清爽完成时，输出轻松收工建议", () => {
        const facts: TodayDecisionFacts = {
            dueCount: 0,
            inboxCount: 0,
            maintenanceDebtCount: 0,
            suspendedCount: 0,
        };
        const decision = decideTodayAction(facts, zhCN);
        expect(decision.kind).toBe("all-done");
        expect(decision.primaryAction).toBe("open-library");
        expect(decision.title).toContain("给记忆一点呼吸");
    });
});
