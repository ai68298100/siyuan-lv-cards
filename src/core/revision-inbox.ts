/**
 * BI-23 应用反馈反哺内容与修订收件箱引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 三大反哺类型：补充前置条件/边界（missing-condition）、纠正思维误区（misconception-fix）、沉淀新例子实战证据（new-example）；
 * 2. 验收铁律一：先产生差异对比（Diff）与证据链，绝不静默修改卡面；
 * 3. 验收铁律二：最终是否采纳、合并或拒绝，100% 由用户显式决策；
 * 4. 纯函数设计，数据不可变隔离。
 */

import { sanitizeSensitiveText } from "./audit-log";

export const REVISION_FEEDBACK_KINDS = [
    "missing-condition",
    "misconception-fix",
    "new-example",
] as const;

export type RevisionFeedbackKind = (typeof REVISION_FEEDBACK_KINDS)[number];

export type RevisionDecisionStatus = "staged" | "applied" | "rejected" | "customized";

/** 题面与答案修改差异对比模型 */
export interface RevisionContentDiff {
    originalPrompt: string;
    proposedPrompt: string;
    promptChanged: boolean;
    originalAnswer: string;
    proposedAnswer: string;
    answerChanged: boolean;
}

/** 修订收件箱单项条目 */
export interface RevisionInboxItem {
    id: string;
    cardId: string;
    deckId: string;
    feedbackKind: RevisionFeedbackKind;
    /** 触发反哺的用户任务上下文（如实战项目、解题失误） */
    taskContext: string;
    /** 观察到的事实或证据描述 */
    evidenceText: string;
    /** 差异对比详情 */
    diff: RevisionContentDiff;
    status: RevisionDecisionStatus;
    stagedAt: number;
    resolvedAt?: number;
    /** 用户自定义修改后再采纳的最终内容 */
    userCustomizedContent?: {
        prompt: string;
        answer: string;
    };
}

export interface RevisionInboxStoreState {
    version: 1;
    updatedAt: number;
    items: RevisionInboxItem[];
}

export function createEmptyRevisionInbox(now: number = Date.now()): RevisionInboxStoreState {
    return {
        version: 1,
        updatedAt: now,
        items: [],
    };
}

/**
 * 计算题面与答案的结构化差异（纯函数）
 */
export function calculateRevisionDiff(params: {
    originalPrompt: string;
    proposedPrompt: string;
    originalAnswer: string;
    proposedAnswer: string;
}): RevisionContentDiff {
    const oP = params.originalPrompt.trim();
    const pP = params.proposedPrompt.trim();
    const oA = params.originalAnswer.trim();
    const pA = params.proposedAnswer.trim();

    return {
        originalPrompt: oP,
        proposedPrompt: pP,
        promptChanged: oP !== pP,
        originalAnswer: oA,
        proposedAnswer: pA,
        answerChanged: oA !== pA,
    };
}

/**
 * 提交一条应用反馈至修订收件箱（纯函数，暂存为待审批状态）
 */
export function submitRevisionFeedback(
    state: RevisionInboxStoreState,
    params: {
        cardId: string;
        deckId: string;
        feedbackKind: RevisionFeedbackKind;
        taskContext: string;
        evidenceText: string;
        originalPrompt: string;
        proposedPrompt: string;
        originalAnswer: string;
        proposedAnswer: string;
        now?: number;
    },
): { nextState: RevisionInboxStoreState; item: RevisionInboxItem } {
    const ts = params.now ?? Date.now();
    const diff = calculateRevisionDiff({
        originalPrompt: params.originalPrompt,
        proposedPrompt: params.proposedPrompt,
        originalAnswer: params.originalAnswer,
        proposedAnswer: params.proposedAnswer,
    });

    const newItem: RevisionInboxItem = {
        id: `rev-${ts}-${Math.random().toString(36).substring(2, 6)}`,
        cardId: params.cardId,
        deckId: params.deckId,
        feedbackKind: params.feedbackKind,
        taskContext: sanitizeSensitiveText(params.taskContext, 60),
        evidenceText: sanitizeSensitiveText(params.evidenceText, 120),
        diff,
        status: "staged", // 核心原则：恒为 staged 暂存，绝不静默落地
        stagedAt: ts,
    };

    return {
        nextState: {
            ...state,
            updatedAt: ts,
            items: [...state.items, newItem],
        },
        item: newItem,
    };
}

/**
 * 用户决策：直接审批采纳修订（纯函数）
 */
export function approveRevision(
    state: RevisionInboxStoreState,
    revisionId: string,
    now: number = Date.now(),
): {
    nextState: RevisionInboxStoreState;
    approvedItem?: RevisionInboxItem;
    finalCardContent?: { prompt: string; answer: string };
} {
    const target = state.items.find(i => i.id === revisionId);
    if (!target || target.status !== "staged") {
        return { nextState: state };
    }

    const updatedItem: RevisionInboxItem = {
        ...target,
        status: "applied",
        resolvedAt: now,
    };

    return {
        nextState: {
            ...state,
            updatedAt: now,
            items: state.items.map(i => (i.id === revisionId ? updatedItem : i)),
        },
        approvedItem: updatedItem,
        finalCardContent: {
            prompt: target.diff.proposedPrompt,
            answer: target.diff.proposedAnswer,
        },
    };
}

/**
 * 用户决策：调整定制后采纳（纯函数）
 */
export function customizeAndApproveRevision(
    state: RevisionInboxStoreState,
    revisionId: string,
    customPrompt: string,
    customAnswer: string,
    now: number = Date.now(),
): {
    nextState: RevisionInboxStoreState;
    customizedItem?: RevisionInboxItem;
    finalCardContent?: { prompt: string; answer: string };
} {
    const target = state.items.find(i => i.id === revisionId);
    if (!target || target.status !== "staged") {
        return { nextState: state };
    }

    const finalContent = {
        prompt: sanitizeSensitiveText(customPrompt, 100),
        answer: sanitizeSensitiveText(customAnswer, 100),
    };

    const updatedItem: RevisionInboxItem = {
        ...target,
        status: "customized",
        resolvedAt: now,
        userCustomizedContent: finalContent,
    };

    return {
        nextState: {
            ...state,
            updatedAt: now,
            items: state.items.map(i => (i.id === revisionId ? updatedItem : i)),
        },
        customizedItem: updatedItem,
        finalCardContent: finalContent,
    };
}

/**
 * 用户决策：拒绝/丢弃修订（纯函数）
 */
export function rejectRevision(
    state: RevisionInboxStoreState,
    revisionId: string,
    now: number = Date.now(),
): RevisionInboxStoreState {
    return {
        ...state,
        updatedAt: now,
        items: state.items.map(i =>
            i.id === revisionId && i.status === "staged"
                ? { ...i, status: "rejected" as const, resolvedAt: now }
                : i,
        ),
    };
}

/** 汇总修订收件箱状态分布 */
export function summarizeRevisionInbox(state: RevisionInboxStoreState): {
    total: number;
    stagedCount: number;
    appliedCount: number;
    rejectedCount: number;
    byKind: Record<RevisionFeedbackKind, number>;
} {
    const byKind: Record<RevisionFeedbackKind, number> = {
        "missing-condition": 0,
        "misconception-fix": 0,
        "new-example": 0,
    };

    let stagedCount = 0;
    let appliedCount = 0;
    let rejectedCount = 0;

    for (const item of state.items) {
        if (item.status === "staged") {
            stagedCount++;
            byKind[item.feedbackKind] = (byKind[item.feedbackKind] || 0) + 1;
        } else if (item.status === "applied" || item.status === "customized") {
            appliedCount++;
        } else if (item.status === "rejected") {
            rejectedCount++;
        }
    }

    return {
        total: state.items.length,
        stagedCount,
        appliedCount,
        rejectedCount,
        byKind,
    };
}
