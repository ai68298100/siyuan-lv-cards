/**
 * BI-24 知识新鲜度与记忆掌握解耦引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 四类新鲜度异动标记：事实过时（content-stale）、版本变更（version-changed）、目标结束（goal-ended）、来源失效（source-invalid）；
 * 2. 验收铁律一：过时不统计成遗忘！因知识过时造成的答错绝不惩罚内核 FSRS 稳定度与调度间隔；
 * 3. 验收铁律二：更新前后强制保留原值与对照（Before-After Diff Contrast）；
 * 4. 纯函数设计，数据不可变隔离。
 */

import { sanitizeSensitiveText } from "./audit-log";

export const FRESHNESS_STATUSES = [
    "fresh",
    "content-stale",
    "version-changed",
    "goal-ended",
    "source-invalid",
] as const;

export type KnowledgeFreshnessStatus = (typeof FRESHNESS_STATUSES)[number];

/** 知识新鲜度记录模型 */
export interface CardFreshnessRecord {
    cardId: string;
    deckId: string;
    status: KnowledgeFreshnessStatus;
    flaggedAt: number;
    /** 异动原因说明多语言键或文本 */
    reasonKey: string;
    /** 原笔记/旧版本内容快照（用于对照） */
    previousSnapshot?: {
        prompt: string;
        answer: string;
        capturedAt: number;
    };
    /** 修订后的新内容（若已更新） */
    updatedSnapshot?: {
        prompt: string;
        answer: string;
        updatedAt: number;
    };
    /** 是否已完成平滑重校准并恢复为 fresh */
    isRecalibrated: boolean;
    recalibratedAt?: number;
}

/** 新鲜度存储状态 */
export interface KnowledgeFreshnessStoreState {
    version: 1;
    updatedAt: number;
    records: Record<string, CardFreshnessRecord>;
}

export function createEmptyFreshnessStore(now: number = Date.now()): KnowledgeFreshnessStoreState {
    return {
        version: 1,
        updatedAt: now,
        records: {},
    };
}

/** 标记卡片知识状态异动（纯函数） */
export function flagKnowledgeFreshness(
    state: KnowledgeFreshnessStoreState,
    params: {
        cardId: string;
        deckId: string;
        status: KnowledgeFreshnessStatus;
        reasonKey?: string;
        currentPrompt?: string;
        currentAnswer?: string;
        now?: number;
    },
): KnowledgeFreshnessStoreState {
    const ts = params.now ?? Date.now();
    const existing = state.records[params.cardId];

    const prevSnapshot = existing?.previousSnapshot ?? (params.currentPrompt && params.currentAnswer ? {
        prompt: sanitizeSensitiveText(params.currentPrompt, 100),
        answer: sanitizeSensitiveText(params.currentAnswer, 100),
        capturedAt: ts,
    } : undefined);

    const record: CardFreshnessRecord = {
        cardId: params.cardId,
        deckId: params.deckId,
        status: params.status,
        flaggedAt: ts,
        reasonKey: params.reasonKey ?? `knowledgeFreshness.reason.${params.status}`,
        previousSnapshot: prevSnapshot,
        isRecalibrated: false,
    };

    return {
        ...state,
        updatedAt: ts,
        records: {
            ...state.records,
            [params.cardId]: record,
        },
    };
}

/**
 * 判断卡片当前是否处于“知识失效/过时保护期”：
 * 处于保护期时，做错或放弃绝不写入内核遗忘日志（防止污染 FSRS）。
 */
export function isCardUnderFreshnessProtection(
    state: KnowledgeFreshnessStoreState,
    cardId: string,
): { isProtected: boolean; status: KnowledgeFreshnessStatus; reasonKey?: string } {
    const rec = state.records[cardId];
    if (!rec || rec.status === "fresh" || rec.isRecalibrated) {
        return { isProtected: false, status: "fresh" };
    }

    return {
        isProtected: true,
        status: rec.status,
        reasonKey: rec.reasonKey,
    };
}

/**
 * 录入知识修订并平滑重校准（更新前后可对照）：
 * 知识更新后解除过时保护，保留修改对照，安全回归常规复习。
 */
export function recalibrateWithUpdate(
    state: KnowledgeFreshnessStoreState,
    params: {
        cardId: string;
        newPrompt: string;
        newAnswer: string;
        now?: number;
    },
): {
    nextState: KnowledgeFreshnessStoreState;
    diffSummary: {
        promptChanged: boolean;
        answerChanged: boolean;
        oldPrompt?: string;
        newPrompt: string;
        oldAnswer?: string;
        newAnswer: string;
    };
} {
    const ts = params.now ?? Date.now();
    const existing = state.records[params.cardId];

    const oldPrompt = existing?.previousSnapshot?.prompt;
    const oldAnswer = existing?.previousSnapshot?.answer;

    const sanitizedNewPrompt = sanitizeSensitiveText(params.newPrompt, 100);
    const sanitizedNewAnswer = sanitizeSensitiveText(params.newAnswer, 100);

    const updatedRecord: CardFreshnessRecord = {
        cardId: params.cardId,
        deckId: existing?.deckId ?? "default",
        status: "fresh",
        flaggedAt: existing?.flaggedAt ?? ts,
        reasonKey: "knowledgeFreshness.reason.recalibrated",
        previousSnapshot: existing?.previousSnapshot,
        updatedSnapshot: {
            prompt: sanitizedNewPrompt,
            answer: sanitizedNewAnswer,
            updatedAt: ts,
        },
        isRecalibrated: true,
        recalibratedAt: ts,
    };

    const nextState: KnowledgeFreshnessStoreState = {
        ...state,
        updatedAt: ts,
        records: {
            ...state.records,
            [params.cardId]: updatedRecord,
        },
    };

    const diffSummary = {
        promptChanged: oldPrompt !== undefined && oldPrompt !== sanitizedNewPrompt,
        answerChanged: oldAnswer !== undefined && oldAnswer !== sanitizedNewAnswer,
        oldPrompt,
        newPrompt: sanitizedNewPrompt,
        oldAnswer,
        newAnswer: sanitizedNewAnswer,
    };

    return { nextState, diffSummary };
}

/** 统计全库新鲜度分布概览 */
export function summarizeFreshnessState(state: KnowledgeFreshnessStoreState): {
    totalFlagged: number;
    protectedCount: number;
    byStatus: Record<KnowledgeFreshnessStatus, number>;
} {
    const byStatus: Record<KnowledgeFreshnessStatus, number> = {
        "fresh": 0,
        "content-stale": 0,
        "version-changed": 0,
        "goal-ended": 0,
        "source-invalid": 0,
    };

    let protectedCount = 0;

    for (const rec of Object.values(state.records)) {
        byStatus[rec.status] = (byStatus[rec.status] || 0) + 1;
        if (rec.status !== "fresh" && !rec.isRecalibrated) {
            protectedCount++;
        }
    }

    return {
        totalFlagged: Object.keys(state.records).length,
        protectedCount,
        byStatus,
    };
}
