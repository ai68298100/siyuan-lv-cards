import { describe, expect, it } from "vitest";
import {
    AUTOMATION_TRIGGER_TYPES,
    createEmptyAutomationState,
    evaluateAutomationRules,
    approveProposal,
    rejectProposal,
    adjustAndApproveProposal,
} from "../src/core/learning-automation";
import type { AutomationEvent } from "../src/core/learning-automation";

describe("learning-automation (BL-2 规则化学习自动化引擎)", () => {
    it("包含五大自动化触发器事件源", () => {
        expect(AUTOMATION_TRIGGER_TYPES).toEqual([
            "source-updated",
            "exam-completed",
            "session-finished",
            "card-leech-flagged",
            "prerequisite-cleared",
        ]);
    });

    it("空状态默认装配 3 条标准内置规则", () => {
        const state = createEmptyAutomationState(1000);
        expect(state.rules).toHaveLength(3);
        expect(state.rules.map(r => r.trigger)).toEqual([
            "source-updated",
            "exam-completed",
            "card-leech-flagged",
        ]);
        expect(state.proposals).toHaveLength(0);
    });

    it("笔记来源更新事件触发：生成 propose-source-recheck 待确认提案，绝不静默写入", () => {
        const state = createEmptyAutomationState(1000);
        const event: AutomationEvent = {
            id: "evt-1",
            type: "source-updated",
            targetId: "doc-math-algebra",
            timestamp: 1500,
            payload: { diffLineCount: 12 },
        };

        const { nextState, generatedProposals } = evaluateAutomationRules(state, event, 2000);
        expect(generatedProposals).toHaveLength(1);

        const proposal = generatedProposals[0];
        expect(proposal.triggerType).toBe("source-updated");
        expect(proposal.actionType).toBe("propose-source-recheck");
        expect(proposal.status).toBe("pending"); // 核心原则：恒为 pending，待用户显式确认
        expect(proposal.payload.eventTargetId).toBe("doc-math-algebra");

        expect(nextState.proposals).toHaveLength(1);
        expect(nextState.proposals[0].id).toBe(proposal.id);
    });

    it("条件过滤判定：模拟考分值低于阈值（<60）才触发提案，高分不打扰", () => {
        const state = createEmptyAutomationState(1000);

        // 高分考完（85 >= 60）：不触发
        const goodEvent: AutomationEvent = {
            id: "evt-2",
            type: "exam-completed",
            targetId: "exam-calculus-1",
            timestamp: 1500,
            payload: { score: 85 },
        };
        const resGood = evaluateAutomationRules(state, goodEvent, 1600);
        expect(resGood.generatedProposals).toHaveLength(0);

        // 低分考完（45 < 60）：触发专项复习提案
        const lowEvent: AutomationEvent = {
            id: "evt-3",
            type: "exam-completed",
            targetId: "exam-calculus-2",
            timestamp: 1700,
            payload: { score: 45 },
        };
        const resLow = evaluateAutomationRules(state, lowEvent, 1800);
        expect(resLow.generatedProposals).toHaveLength(1);
        expect(resLow.generatedProposals[0].actionType).toBe("propose-scope-review");
    });

    describe("人工审批流状态机流转", () => {
        it("approveProposal 确认采纳提案", () => {
            let state = createEmptyAutomationState();
            const { nextState, generatedProposals } = evaluateAutomationRules(state, {
                id: "e1",
                type: "source-updated",
                targetId: "doc-1",
                timestamp: 100,
            });
            state = nextState;
            const pId = generatedProposals[0].id;

            state = approveProposal(state, pId, 2000);
            expect(state.proposals[0].status).toBe("approved");
            expect(state.proposals[0].resolvedAt).toBe(2000);
        });

        it("rejectProposal 拒绝提案", () => {
            let state = createEmptyAutomationState();
            const { nextState, generatedProposals } = evaluateAutomationRules(state, {
                id: "e1",
                type: "source-updated",
                targetId: "doc-1",
                timestamp: 100,
            });
            state = nextState;
            const pId = generatedProposals[0].id;

            state = rejectProposal(state, pId, 3000);
            expect(state.proposals[0].status).toBe("rejected");
            expect(state.proposals[0].resolvedAt).toBe(3000);
        });

        it("adjustAndApproveProposal 调整参数并采纳", () => {
            let state = createEmptyAutomationState();
            const { nextState, generatedProposals } = evaluateAutomationRules(state, {
                id: "e1",
                type: "card-leech-flagged",
                targetId: "card-hard-1",
                timestamp: 100,
                payload: { failureCount: 5 },
            });
            state = nextState;
            const pId = generatedProposals[0].id;

            state = adjustAndApproveProposal(state, pId, { customTargetCardType: "cloze-only" }, 4000);
            expect(state.proposals[0].status).toBe("adjusted");
            expect(state.proposals[0].userAdjustment).toEqual({ customTargetCardType: "cloze-only" });
            expect(state.proposals[0].resolvedAt).toBe(4000);
        });
    });
});
