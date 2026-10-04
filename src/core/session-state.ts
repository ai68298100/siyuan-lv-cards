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
    /** BI-8：收工原因（目标完成/时间到/精力不足/疑问待解决/手动结束）；未收集为空 */
    endReason?: EndReason | null;
}

/** BI-8：收工原因白名单（「验收：按目标完成、时间到、精力不足、疑问待解决等原因收工」） */
export const END_REASONS = ["goal-done", "time-up", "energy", "question", "manual"] as const;
export type EndReason = (typeof END_REASONS)[number];

function asEndReason(v: unknown): EndReason | null {
    return typeof v === "string" && (END_REASONS as readonly string[]).includes(v) ? (v as EndReason) : null;
}

/** BI-8：记录收工原因（不可变更新；跨天/空场拒绝返回 null） */
export function withEndReason(s: SessionState, reason: EndReason): SessionState | null {
    if (!s.date) return null;
    return { ...s, endReason: asEndReason(reason) };
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
        endReason: asEndReason((d as Partial<SessionState>).endReason),
    };
}
