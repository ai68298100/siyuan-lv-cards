/**
 * BL-2 规则化学习自动化引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 触发器事件源：笔记来源更新、考试完成、会话完成、顽疾卡标记、前置达成；
 * 2. 铁律一：规则仅生成待确认动作（Staged Proposals），绝不自动改分、绝不自动发外部事件；
 * 3. 铁律二：禁止静默修改原生内核由于时间或写入磁盘，必须交由用户显式审批（Approved/Rejected/Adjusted）；
 * 4. 纯函数设计，数据不可变隔离。
 */

import { sanitizeSensitiveText } from "./audit-log";

export const AUTOMATION_TRIGGER_TYPES = [
    "source-updated",
    "exam-completed",
    "session-finished",
    "card-leech-flagged",
    "prerequisite-cleared",
] as const;

export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

export type StagedProposalActionType =
    | "propose-scope-review"
    | "propose-card-candidate"
    | "propose-source-recheck"
    | "propose-atomic-split"
    | "propose-phase-archive";

export type ProposalStatus = "pending" | "approved" | "rejected" | "adjusted";

/** 自动化触发事件上下文 */
export interface AutomationEvent {
    id: string;
    type: AutomationTriggerType;
    targetId: string;
    timestamp: number;
    payload?: Record<string, unknown>;
}

/** 用户配置的自动化规则定义 */
export interface AutomationRule {
    id: string;
    nameKey: string;
    customName?: string;
    trigger: AutomationTriggerType;
    enabled: boolean;
    /** 触发条件评估表达式/预设参数（如分值阈值、遗忘次数等） */
    conditions?: {
        minScoreThreshold?: number;
        minFailuresThreshold?: number;
        targetTag?: string;
    };
    actionType: StagedProposalActionType;
    descriptionKey: string;
}

/** 规则触发后生成的待确认动作提案 */
export interface StagedProposal {
    id: string;
    ruleId: string;
    triggerType: AutomationTriggerType;
    actionType: StagedProposalActionType;
    status: ProposalStatus;
    title: string;
    summary: string;
    /** 提案详细载荷（待复习卡片ID列表、候选卡片草稿、受影响范围等） */
    payload: Record<string, unknown>;
    userAdjustment?: Record<string, unknown>;
    createdAt: number;
    resolvedAt?: number;
}

/** 自动化引擎持久化状态 */
export interface LearningAutomationState {
    version: 1;
    updatedAt: number;
    rules: AutomationRule[];
    proposals: StagedProposal[];
}

export function createDefaultAutomationRules(): AutomationRule[] {
    return [
        {
            id: "rule-source-updated-recheck",
            nameKey: "learningAutomation.rule.sourceUpdated.name",
            trigger: "source-updated",
            enabled: true,
            actionType: "propose-source-recheck",
            descriptionKey: "learningAutomation.rule.sourceUpdated.desc",
        },
        {
            id: "rule-exam-low-score-scope",
            nameKey: "learningAutomation.rule.examLowScore.name",
            trigger: "exam-completed",
            enabled: true,
            conditions: { minScoreThreshold: 60 },
            actionType: "propose-scope-review",
            descriptionKey: "learningAutomation.rule.examLowScore.desc",
        },
        {
            id: "rule-leech-split-prompt",
            nameKey: "learningAutomation.rule.leechSplit.name",
            trigger: "card-leech-flagged",
            enabled: true,
            conditions: { minFailuresThreshold: 4 },
            actionType: "propose-atomic-split",
            descriptionKey: "learningAutomation.rule.leechSplit.desc",
        },
    ];
}

export function createEmptyAutomationState(now: number = Date.now()): LearningAutomationState {
    return {
        version: 1,
        updatedAt: now,
        rules: createDefaultAutomationRules(),
        proposals: [],
    };
}

/**
 * 依据外部事件评估规则并生成待确认提案（纯函数）：
 * 绝不执行实际写入或改分，仅生成待确认草稿提案。
 */
export function evaluateAutomationRules(
    state: LearningAutomationState,
    event: AutomationEvent,
    now: number = Date.now(),
): { nextState: LearningAutomationState; generatedProposals: StagedProposal[] } {
    const matchingRules = state.rules.filter(r => r.enabled && r.trigger === event.type);
    const generatedProposals: StagedProposal[] = [];

    for (const rule of matchingRules) {
        let conditionMet = true;

        if (rule.conditions) {
            if (rule.conditions.minScoreThreshold !== undefined) {
                const score = (event.payload?.score as number) ?? 100;
                if (score >= rule.conditions.minScoreThreshold) conditionMet = false;
            }
            if (rule.conditions.minFailuresThreshold !== undefined) {
                const fails = (event.payload?.failureCount as number) ?? 0;
                if (fails < rule.conditions.minFailuresThreshold) conditionMet = false;
            }
        }

        if (conditionMet) {
            const proposalId = `prop-${now}-${Math.random().toString(36).substring(2, 6)}`;
            const proposal: StagedProposal = {
                id: proposalId,
                ruleId: rule.id,
                triggerType: rule.trigger,
                actionType: rule.actionType,
                status: "pending",
                title: sanitizeSensitiveText(`提案：触发于 ${rule.trigger}`, 50),
                summary: sanitizeSensitiveText(`目标实体 ${event.targetId} 满足自动化条件`, 100),
                payload: {
                    eventTargetId: event.targetId,
                    ...(event.payload || {}),
                },
                createdAt: now,
            };
            generatedProposals.push(proposal);
        }
    }

    if (generatedProposals.length === 0) {
        return { nextState: state, generatedProposals: [] };
    }

    return {
        nextState: {
            ...state,
            updatedAt: now,
            proposals: [...state.proposals, ...generatedProposals],
        },
        generatedProposals,
    };
}

/** 审批通过提案（纯函数） */
export function approveProposal(
    state: LearningAutomationState,
    proposalId: string,
    now: number = Date.now(),
): LearningAutomationState {
    return {
        ...state,
        updatedAt: now,
        proposals: state.proposals.map(p =>
            p.id === proposalId && p.status === "pending"
                ? { ...p, status: "approved" as const, resolvedAt: now }
                : p,
        ),
    };
}

/** 拒绝提案（纯函数） */
export function rejectProposal(
    state: LearningAutomationState,
    proposalId: string,
    now: number = Date.now(),
): LearningAutomationState {
    return {
        ...state,
        updatedAt: now,
        proposals: state.proposals.map(p =>
            p.id === proposalId && p.status === "pending"
                ? { ...p, status: "rejected" as const, resolvedAt: now }
                : p,
        ),
    };
}

/** 调整提案参数并采纳（纯函数） */
export function adjustAndApproveProposal(
    state: LearningAutomationState,
    proposalId: string,
    adjustment: Record<string, unknown>,
    now: number = Date.now(),
): LearningAutomationState {
    return {
        ...state,
        updatedAt: now,
        proposals: state.proposals.map(p =>
            p.id === proposalId && p.status === "pending"
                ? {
                      ...p,
                      status: "adjusted" as const,
                      userAdjustment: adjustment,
                      resolvedAt: now,
                  }
                : p,
        ),
    };
}
