/**
 * 内核闪卡 V2 API（feature/flashcard 分支，3.9.0）封装。
 * 端点清单见 docs/05-内核闪卡V2重构调研与应对.md；契约仍在变动，这里保持宽容解析、可降级。
 * 契约纯逻辑（状态白名单/清洗/摘要）在 v2-contract.ts，此处再导出保持调用方 import 路径不变。
 */
import { fetchSyncPost } from "siyuan";
import { normalizeMigrationStatus, summarizeStatistics, type FlashcardV2State, type MigrationStatus } from "./v2-contract";

export { normalizeMigrationStatus, summarizeStatistics };
export type { FlashcardV2State, MigrationStatus };

async function v2<T>(endpoint: string, payload: Record<string, unknown> = {}): Promise<T> {
    const resp = await fetchSyncPost(`/api/flashcard/${endpoint}`, payload);
    // AJ5：与 riff 同口径的响应校验
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
    return resp.data as T;
}

/**
 * 探测内核是否具备 V2 闪卡 API。
 * 返回 null = 当前内核无此端点（< 3.9.0 或不可达），插件走 riff 兼容路径；
 * 返回 state="Unknown" = 端点在但状态不可识别（保守降级，UI 显示未验证）。
 */
export async function detectFlashcardV2(): Promise<MigrationStatus | null> {
    try {
        const data = await v2<unknown>("getMigrationStatus");
        return normalizeMigrationStatus(data);
    } catch {
        return null;
    }
}

// ---- V2 核心数据结构（按分支 apicontract 建模，字段宽容） ----

export interface FlashcardReviewState {
    cardID: string;
    state: string;
    due: number;
    lastReview?: number;
    /** V2 直出 FSRS 内部量（旧 riff 不暴露） */
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
    reps: number;
    lapses: number;
    suspended: boolean;
}

export interface FlashcardCard {
    id: string;
    sourceID: string;
    templateID: string;
    variantKey?: string;
    variantData?: unknown;
    generationStatus?: string;
    flag?: number;
    presetOverrideID?: string;
    priorityOverride?: string;
    editLater?: { note: string; updatedAt: number };
    createdAt: number;
    updatedAt: number;
}

// ---- 端点封装（复习会话） ----

export const startFlashcardSession = (payload: Record<string, unknown>) =>
    v2<Record<string, unknown>>("startSession", payload);

export const getFlashcardSessionQueue = (payload: Record<string, unknown>) =>
    v2<Record<string, unknown>>("getSessionQueue", payload);

export const reviewFlashcardV2 = (payload: Record<string, unknown>) =>
    v2<Record<string, unknown>>("reviewCard", payload);

export const undoFlashcardReview = (payload: Record<string, unknown>) =>
    v2<Record<string, unknown>>("undoReview", payload);

export const finishFlashcardSession = (payload: Record<string, unknown>) =>
    v2<Record<string, unknown>>("finishSession", payload);

// ---- 端点封装（查询与管理） ----

export const queryFlashcards = (payload: Record<string, unknown>) =>
    v2<{ cards?: FlashcardCard[]; reviewStates?: FlashcardReviewState[]; total?: number }>("queryCards", payload);

export const manageFlashcards = (payload: Record<string, unknown>) =>
    v2<Record<string, unknown>>("manageCards", payload);

export const listFlashcardEntities = (payload: Record<string, unknown>) =>
    v2<Record<string, unknown>>("listEntities", payload);

// ---- 端点封装（统计） ----

export const getFlashcardStatistics = (payload: Record<string, unknown>) =>
    v2<Record<string, unknown>>("getStatistics", payload);

// ---- 端点封装（Anki 兼容） ----

/** AnkiConnect 兼容端点：思源扮演 Anki（version/deckNames/addNotes/findNotes/storeMediaFile 等） */
export const ankiConnect = (payload: { action: string; version?: number; params?: Record<string, unknown>; key?: string }) =>
    v2<{ result: unknown; error: string }>("ankiConnect", payload as unknown as Record<string, unknown>);
