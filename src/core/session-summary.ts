/**
 * BI-8 会话收工与现场保存（纯逻辑，node 可单测）。
 * 会话结束原因 → 建议文案 + 数据摘要；done 屏据此展示。
 * 与 session-state.json 分工：session-state 恢复进度，本模块提供收工语义。
 */

export type SessionEndReason = "target-reached" | "queue-empty" | "user-exit";

export interface SessionStats {
    reviewed: number;
    newCount: number;
    forgetCount: number;
    skipCount: number;
    durationSec: number;
    dailyTarget: number;
}

export interface SessionSummary extends SessionStats {
    endReason: SessionEndReason;
    progressPct: number;
    suggestionKey: string;
}

/** 构建会话收工摘要：数据 + 进度百分比 + 建议文案键 */
export function buildSummary(stats: SessionStats, endReason: SessionEndReason): SessionSummary {
    const pct = stats.dailyTarget > 0
        ? Math.min(100, Math.round((stats.reviewed / stats.dailyTarget) * 100))
        : 0;
    return {
        ...stats,
        endReason,
        progressPct: pct,
        suggestionKey: suggestionKey(stats, endReason),
    };
}

function suggestionKey(stats: SessionStats, endReason: SessionEndReason): string {
    if (endReason === "target-reached" || (stats.dailyTarget > 0 && stats.reviewed >= stats.dailyTarget)) {
        return "done.targetReached";
    }
    if (stats.reviewed > 0) return "done.progressMade";
    return "done.noProgress";
}
