/**
 * 复习会话中断恢复（M3，M 组 P1）：评分进度落盘，插件重载后可继续且不重复评分。
 * AQ-2：计数与 skip 集合在每次动作后即时落盘；重载恢复后跳过的卡不再被拉回。
 */

export interface SessionState {
    date: string;
    reviewedIDs: string[];
    /** 本场已跳过的 cardID（AJ9 落盘版）：恢复会话后不再重复出现 */
    skippedIDs: string[];
    counters: { new: number; review: number; forget: number; skip: number };
}

export function emptySessionState(): SessionState {
    return { date: "", reviewedIDs: [], skippedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
}

const ID_LIST_MAX = 10000;

/** 字符串 ID 列表清洗：非字符串剔除、去重、限量 */
function cleanIDs(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const seen = new Set<string>();
    for (const x of raw) {
        if (typeof x === "string" && x && seen.size < ID_LIST_MAX) {
            seen.add(x);
        }
    }
    return [...seen];
}

/** 计数收敛：非负安全整数，其余（NaN/负数/小数）回 0（AQ-2） */
function cleanCount(v: unknown): number {
    const n = Number(v);
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

export function normalizeSessionState(raw: unknown, today: string): SessionState {
    const d = raw && typeof raw === "object" ? (raw as Partial<SessionState>) : null;
    if (!d || d.date !== today || !Array.isArray(d.reviewedIDs)) {
        return emptySessionState();
    }
    return {
        date: today,
        reviewedIDs: cleanIDs(d.reviewedIDs),
        skippedIDs: cleanIDs((d as Partial<SessionState>).skippedIDs),
        counters: {
            new: cleanCount(d.counters?.new),
            review: cleanCount(d.counters?.review),
            forget: cleanCount(d.counters?.forget),
            skip: cleanCount(d.counters?.skip),
        },
    };
}
