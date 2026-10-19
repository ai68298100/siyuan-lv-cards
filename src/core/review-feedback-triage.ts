/**
 * AR-9 复习本地反馈标记与维护分流引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 五类本地反馈标签：事实有误（factual-error）、重复卡片（duplicate）、过时待更（stale）、过载太难（too-hard）、临时批注（custom-note）；
 * 2. 零遥测隐私铁律：纯本地存储，绝不外发网络，跨重载与备份导出完整保留；
 * 3. 绝不侵入内核调度：标记属于纯元数据，不篡改内核原生 FSRS 评分、due 时间与复习日志；
 * 4. 维护工作台直通：支持按标记过滤、关联来源块直达与修复后一键清除。
 */

import { sanitizeSensitiveText } from "./audit-log";

export const CARD_ISSUE_TYPES = [
    "factual-error",
    "duplicate",
    "stale",
    "too-hard",
    "custom-note",
] as const;

export type CardIssueType = (typeof CARD_ISSUE_TYPES)[number];

/** 单张卡片的本地反馈标记记录 */
export interface CardIssueRecord {
    cardId: string;
    deckId: string;
    issueType: CardIssueType;
    note?: string;
    flaggedAt: number;
    resolvedAt?: number;
    isResolved: boolean;
    sourceBlockId?: string;
}

/** 本地反馈存储状态 */
export interface ReviewFeedbackStoreState {
    version: 1;
    updatedAt: number;
    records: Record<string, CardIssueRecord>; // key: cardId
}

export function createEmptyFeedbackStore(now: number = Date.now()): ReviewFeedbackStoreState {
    return {
        version: 1,
        updatedAt: now,
        records: {},
    };
}

/**
 * 为指定卡片打上本地问题标记（纯函数，返回新 state）：
 * 若已存在相同标记，支持更新备注与时间戳；若更换标记类型则更新。
 */
export function flagCardIssue(
    state: ReviewFeedbackStoreState,
    params: {
        cardId: string;
        deckId: string;
        issueType: CardIssueType;
        note?: string;
        sourceBlockId?: string;
        now?: number;
    },
): ReviewFeedbackStoreState {
    const ts = params.now ?? Date.now();
    const sanitizedNote = params.note ? sanitizeSensitiveText(params.note, 100) : undefined;

    const newRecord: CardIssueRecord = {
        cardId: params.cardId,
        deckId: params.deckId,
        issueType: params.issueType,
        note: sanitizedNote,
        flaggedAt: ts,
        isResolved: false,
        sourceBlockId: params.sourceBlockId,
    };

    return {
        ...state,
        updatedAt: ts,
        records: {
            ...state.records,
            [params.cardId]: newRecord,
        },
    };
}

/**
 * 标记卡片问题已修复/已解决（纯函数）
 */
export function resolveCardIssue(
    state: ReviewFeedbackStoreState,
    cardId: string,
    now: number = Date.now(),
): ReviewFeedbackStoreState {
    const existing = state.records[cardId];
    if (!existing) return state;

    return {
        ...state,
        updatedAt: now,
        records: {
            ...state.records,
            [cardId]: {
                ...existing,
                isResolved: true,
                resolvedAt: now,
            },
        },
    };
}

/**
 * 彻底清除某卡片的问题标记（纯函数）
 */
export function clearCardIssue(
    state: ReviewFeedbackStoreState,
    cardId: string,
    now: number = Date.now(),
): ReviewFeedbackStoreState {
    if (!state.records[cardId]) return state;

    const nextRecords = { ...state.records };
    delete nextRecords[cardId];

    return {
        ...state,
        updatedAt: now,
        records: nextRecords,
    };
}

/**
 * 批量清除所有已解决的问题标记（整理维护台）
 */
export function clearAllResolvedIssues(
    state: ReviewFeedbackStoreState,
    now: number = Date.now(),
): ReviewFeedbackStoreState {
    const nextRecords: Record<string, CardIssueRecord> = {};
    for (const [id, rec] of Object.entries(state.records)) {
        if (!rec.isResolved) {
            nextRecords[id] = rec;
        }
    }

    return {
        ...state,
        updatedAt: now,
        records: nextRecords,
    };
}

/** 检索过滤条件 */
export interface IssueFilterOptions {
    deckId?: string;
    issueTypes?: CardIssueType[];
    includeResolved?: boolean;
}

/**
 * 多维过滤待维护问题卡片（纯函数）
 */
export function queryFlaggedIssues(
    state: ReviewFeedbackStoreState,
    options: IssueFilterOptions = {},
): CardIssueRecord[] {
    const list = Object.values(state.records);

    return list.filter(item => {
        if (!options.includeResolved && item.isResolved) {
            return false;
        }
        if (options.deckId && item.deckId !== options.deckId) {
            return false;
        }
        if (options.issueTypes && options.issueTypes.length > 0 && !options.issueTypes.includes(item.issueType)) {
            return false;
        }
        return true;
    }).sort((a, b) => b.flaggedAt - a.flaggedAt); // 最新标记排在最前
}

/** 统计各类型问题分布 */
export function summarizeIssueMetrics(state: ReviewFeedbackStoreState): {
    totalUnresolved: number;
    totalResolved: number;
    byType: Record<CardIssueType, number>;
} {
    const byType: Record<CardIssueType, number> = {
        "factual-error": 0,
        "duplicate": 0,
        "stale": 0,
        "too-hard": 0,
        "custom-note": 0,
    };

    let totalUnresolved = 0;
    let totalResolved = 0;

    for (const rec of Object.values(state.records)) {
        if (rec.isResolved) {
            totalResolved++;
        } else {
            totalUnresolved++;
            byType[rec.issueType] = (byType[rec.issueType] || 0) + 1;
        }
    }

    return {
        totalUnresolved,
        totalResolved,
        byType,
    };
}
