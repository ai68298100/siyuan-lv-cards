/**
 * BI-12 时间预算模式（纯逻辑，node 可单测）。
 * 用户输入 5/15/30/60 分钟或自定义预算；显示可完成范围与未完成项；
 * 预算到≠失败——不自动结束、不扣减任何目标、不写内核（验收硬性要求）。
 * 输入只依赖时间戳与时长样本，不读内核；估计仅供参考（提示文案自带「约」）。
 */

/** 预算预设（分钟）；0 = 未启用 */
export const BUDGET_PRESETS = [5, 15, 30, 60] as const;

/** 平均每卡耗时（秒）：正样本均值，兜底 10s；单样本封顶 3600 防离群值拖偏估计 */
export function avgSecPerCard(durs: number[]): number {
    const pos = durs.filter(d => Number.isFinite(d) && d > 0 && d <= 3600);
    if (pos.length === 0) return 10;
    return Math.max(1, Math.round(pos.reduce((a, b) => a + b, 0) / pos.length));
}

/** 预算剩余秒数（未启用返回 Infinity；已过期夹到 0） */
export function budgetLeftSec(startedAt: number, budgetMin: number, now: number): number {
    if (budgetMin <= 0 || startedAt <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.ceil((startedAt + budgetMin * 60000 - now) / 1000));
}

/** 预算是否已到（未启用永远 false——「时间到」语义只在预算存在时成立） */
export function isBudgetExpired(startedAt: number, budgetMin: number, now: number): boolean {
    return budgetLeftSec(startedAt, budgetMin, now) === 0 && budgetMin > 0 && startedAt > 0;
}

/** 可完成范围估计：剩余预算内约能完成几张（不超过剩余到期数；与未完成项相加=总量口径） */
export function estimateCompletable(leftSec: number, avgSec: number, remainingDue: number): number {
    if (!Number.isFinite(leftSec) || avgSec <= 0 || remainingDue <= 0) return 0;
    return Math.max(0, Math.min(remainingDue, Math.floor(leftSec / avgSec)));
}

/** 未完成项：预算内做不完的部分（0=预算足够；口径=剩余到期 − 可完成估计，不产生任何写入） */
export function estimateLeftover(leftSec: number, avgSec: number, remainingDue: number): number {
    if (!Number.isFinite(leftSec)) return 0;
    return Math.max(0, remainingDue - estimateCompletable(leftSec, avgSec, remainingDue));
}
