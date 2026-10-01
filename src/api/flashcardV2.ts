/**
 * 内核闪卡 V2 API（feature/flashcard 分支，3.9.0）封装。
 * 端点清单见 docs/05-内核闪卡V2重构调研与应对.md；契约仍在变动，这里保持宽容解析、可降级。
 */
import { fetchSyncPost } from "siyuan";

async function v2<T>(endpoint: string, payload: Record<string, unknown> = {}): Promise<T> {
    const resp = await fetchSyncPost(`/api/flashcard/${endpoint}`, payload);
    return resp.data as T;
}

/** 迁移状态机：Legacy（纯旧数据）/ Preparing / Active（V2 生效）/ LegacyDiverged（迁移后旧侧又有写入） */
export type FlashcardV2State = "Legacy" | "Preparing" | "Active" | "LegacyDiverged";

export interface MigrationStatus {
    state: FlashcardV2State;
    report?: {
        Complete?: boolean;
        MigratedCards?: number;
        ArchivedCards?: number;
        ReviewSets?: number;
        ReviewEvents?: number;
        InvalidCards?: number;
        UnmappedLogs?: number;
    };
}

/**
 * 探测内核是否具备 V2 闪卡 API。
 * 返回 null = 当前内核无此端点（< 3.9.0），插件走 riff 兼容路径。
 */
export async function detectFlashcardV2(): Promise<MigrationStatus | null> {
    try {
        const data = await v2<MigrationStatus>("getMigrationStatus");
        if (data && typeof data.state === "string") {
            return data;
        }
        return null;
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

// ---- 工具 ----

/**
 * 从 getStatistics 的宽容返回中提取顶层标量摘要（契约未冻结，未知结构不渲染）。
 */
export function summarizeStatistics(data: Record<string, unknown> | null): { key: string; value: string }[] {
    if (!data || typeof data !== "object") {
        return [];
    }
    const out: { key: string; value: string }[] = [];
    const overview = (data.overview ?? data.result ?? data) as Record<string, unknown>;
    for (const [k, v] of Object.entries(overview)) {
        if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
            out.push({ key: k, value: String(v) });
        }
    }
    return out;
}
