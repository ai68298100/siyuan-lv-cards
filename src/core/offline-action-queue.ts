/**
 * BL-8 离线动作队列、幂等重放与冲突保护引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 本地优先：断网/内核离线时安全保存创建、导出、改期、报告与维护动作；
 * 2. 幂等去重：基于 idempotencyKey 严格去重，多次重复重发不产生重复条目；
 * 3. 冲突阻断：检测到数据版本错位或来源被外部修改时，生成冲突预览并阻断静默覆盖（禁止最后写入覆盖一切）；
 * 4. 诚实状态机：绝不把失败或重试中显示成完成，保留逐条审计结果。
 */

import { sanitizeSensitiveText } from "./audit-log";

export type OfflineActionType =
    | "create-card"
    | "write-report"
    | "reschedule-card"
    | "suspend-card"
    | "export-backup";

export type OfflineActionStatus =
    | "pending"
    | "replaying"
    | "completed"
    | "conflict-blocked"
    | "failed";

/** 冲突预览差异快照 */
export interface ActionConflictPreview {
    targetId: string;
    /** 离线时的期望基线版本/内容摘要 */
    expectedBaseline: string;
    /** 宿主当前最新冲突版本/内容摘要 */
    currentActual: string;
    detectedAt: number;
    conflictReasonKey: string;
}

/** 离线队列单项条目 */
export interface OfflineActionItem<T = unknown> {
    id: string;
    /** 幂等去重键（相同动作与实体共享同一幂等键） */
    idempotencyKey: string;
    type: OfflineActionType;
    payload: T;
    status: OfflineActionStatus;
    queuedAt: number;
    replayedAt?: number;
    retryCount: number;
    maxRetries: number;
    lastError?: string;
    /** 冲突预览（当 status=conflict-blocked 时存在） */
    conflictPreview?: ActionConflictPreview;
}

/** 离线队列状态 */
export interface OfflineActionQueueState {
    version: 1;
    updatedAt: number;
    items: OfflineActionItem[];
}

export function createEmptyOfflineQueue(now: number = Date.now()): OfflineActionQueueState {
    return {
        version: 1,
        updatedAt: now,
        items: [],
    };
}

export interface EnqueueActionParams<T = unknown> {
    type: OfflineActionType;
    idempotencyKey: string;
    payload: T;
    maxRetries?: number;
    now?: number;
}

/**
 * 幂等追加离线动作（纯函数，返回新 state）：
 * 若已存在相同 idempotencyKey 且处于 pending 或 failed 状态的动作，更新 payload，不重复新增。
 */
export function enqueueOfflineAction<T = unknown>(
    state: OfflineActionQueueState,
    params: EnqueueActionParams<T>,
): OfflineActionQueueState {
    const ts = params.now ?? Date.now();
    const existingIndex = state.items.findIndex(
        i => i.idempotencyKey === params.idempotencyKey && (i.status === "pending" || i.status === "failed"),
    );

    if (existingIndex >= 0) {
        const existing = state.items[existingIndex];
        const updatedItem: OfflineActionItem = {
            ...existing,
            payload: params.payload,
            queuedAt: ts,
            status: "pending", // 重新激活
            lastError: undefined,
        };

        const nextItems = [...state.items];
        nextItems[existingIndex] = updatedItem;
        return {
            ...state,
            updatedAt: ts,
            items: nextItems,
        };
    }

    const newItem: OfflineActionItem<T> = {
        id: `act-${ts}-${Math.random().toString(36).substring(2, 6)}`,
        idempotencyKey: params.idempotencyKey,
        type: params.type,
        payload: params.payload,
        status: "pending",
        queuedAt: ts,
        retryCount: 0,
        maxRetries: params.maxRetries ?? 3,
    };

    return {
        ...state,
        updatedAt: ts,
        items: [...state.items, newItem],
    };
}

export type ActionHandlerResult =
    | { success: true }
    | { success: false; retryable: boolean; error: string }
    | {
          success: false;
          conflict: {
              targetId: string;
              expectedBaseline: string;
              currentActual: string;
              reasonKey?: string;
          };
      };

/**
 * 顺序重放队列中首个待处理动作（纯函数状态转移）：
 * 配合异步执行器，返回更新后的队列状态与执行结果。
 */
export async function replayNextAction(
    state: OfflineActionQueueState,
    handler: (action: OfflineActionItem) => Promise<ActionHandlerResult>,
    now: number = Date.now(),
): Promise<{ nextState: OfflineActionQueueState; replayedAction?: OfflineActionItem; result?: ActionHandlerResult }> {
    const pendingItem = state.items.find(i => i.status === "pending");
    if (!pendingItem) {
        return { nextState: state };
    }

    // 1. 标记为 replaying
    let currentItems = state.items.map(i =>
        i.id === pendingItem.id ? { ...i, status: "replaying" as const, replayedAt: now } : i,
    );

    let res: ActionHandlerResult;
    try {
        res = await handler(pendingItem);
    } catch (e) {
        res = { success: false, retryable: true, error: e instanceof Error ? e.message : String(e) };
    }

    // 2. 根据结果转移终态
    currentItems = currentItems.map(item => {
        if (item.id !== pendingItem.id) return item;

        if (res.success) {
            return {
                ...item,
                status: "completed" as const,
                lastError: undefined,
                replayedAt: now,
            };
        }

        if ("conflict" in res && res.conflict) {
            // 冲突阻断，生成对比快照
            return {
                ...item,
                status: "conflict-blocked" as const,
                conflictPreview: {
                    targetId: res.conflict.targetId,
                    expectedBaseline: sanitizeSensitiveText(res.conflict.expectedBaseline, 80),
                    currentActual: sanitizeSensitiveText(res.conflict.currentActual, 80),
                    detectedAt: now,
                    conflictReasonKey: res.conflict.reasonKey ?? "offlineQueue.conflict.modifiedRemotely",
                },
                replayedAt: now,
            };
        }

        const isFailure = !res.success && !("conflict" in res);
        const retryable = isFailure ? (res as { retryable: boolean }).retryable : false;
        const errMsg = isFailure ? (res as { error: string }).error : "Unknown error";

        const nextRetries = item.retryCount + 1;
        const willRetry = retryable && nextRetries < item.maxRetries;
        return {
            ...item,
            status: willRetry ? ("pending" as const) : ("failed" as const),
            retryCount: nextRetries,
            lastError: sanitizeSensitiveText(errMsg, 100),
            replayedAt: now,
        };
    });

    return {
        nextState: {
            ...state,
            updatedAt: now,
            items: currentItems,
        },
        replayedAction: pendingItem,
        result: res,
    };
}

/** 移除已完成或用户主动丢弃的动作 */
export function removeOfflineAction(
    state: OfflineActionQueueState,
    actionId: string,
    now: number = Date.now(),
): OfflineActionQueueState {
    return {
        ...state,
        updatedAt: now,
        items: state.items.filter(i => i.id !== actionId),
    };
}

/** 解决冲突后强制重置为 pending（用户确认以离线版本为准） */
export function resolveConflictForceReplay(
    state: OfflineActionQueueState,
    actionId: string,
    now: number = Date.now(),
): OfflineActionQueueState {
    return {
        ...state,
        updatedAt: now,
        items: state.items.map(i =>
            i.id === actionId
                ? {
                      ...i,
                      status: "pending" as const,
                      conflictPreview: undefined,
                      lastError: undefined,
                  }
                : i,
        ),
    };
}

/** 查询离线队列概览统计 */
export function summarizeOfflineQueue(state: OfflineActionQueueState): {
    total: number;
    pendingCount: number;
    conflictCount: number;
    failedCount: number;
    completedCount: number;
} {
    let pendingCount = 0;
    let conflictCount = 0;
    let failedCount = 0;
    let completedCount = 0;

    for (const item of state.items) {
        if (item.status === "pending" || item.status === "replaying") pendingCount++;
        else if (item.status === "conflict-blocked") conflictCount++;
        else if (item.status === "failed") failedCount++;
        else if (item.status === "completed") completedCount++;
    }

    return {
        total: state.items.length,
        pendingCount,
        conflictCount,
        failedCount,
        completedCount,
    };
}
