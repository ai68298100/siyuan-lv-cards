/**
 * 复习会话中断恢复（M3，M 组 P1）：评分进度落盘，插件重载后可继续且不重复评分。
 */

export interface SessionState {
    date: string;
    reviewedIDs: string[];
    counters: { new: number; review: number; forget: number; skip: number };
}

export function emptySessionState(): SessionState {
    return { date: "", reviewedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
}

export function normalizeSessionState(raw: unknown, today: string): SessionState {
    const d = raw && typeof raw === "object" ? (raw as Partial<SessionState>) : null;
    if (!d || d.date !== today || !Array.isArray(d.reviewedIDs)) {
        return emptySessionState();
    }
    return {
        date: today,
        reviewedIDs: d.reviewedIDs.filter(x => typeof x === "string"),
        counters: {
            new: Number(d.counters?.new) || 0,
            review: Number(d.counters?.review) || 0,
            forget: Number(d.counters?.forget) || 0,
            skip: Number(d.counters?.skip) || 0,
        },
    };
}
