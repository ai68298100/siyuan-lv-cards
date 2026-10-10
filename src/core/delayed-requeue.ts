/**
 * 会话内遗忘卡短期循环（展示层队列，不参与 FSRS 调度）。
 *
 * 该模块只负责时间窗口的纯逻辑，调用方决定何时把到期项目放回本地队列。
 * 默认延迟保持在几分钟，避免评分 Again 后马上看到同一张卡造成机械重复。
 */
export const SHORT_REQUEUE_DELAY_MS = 3 * 60 * 1000;

export interface DelayedRequeue<T> {
    card: T;
    dueAt: number;
}

/** 将一张遗忘卡加入会话内延迟队列。 */
export function enqueueDelayedRequeue<T>(
    pending: readonly DelayedRequeue<T>[],
    card: T,
    now = Date.now(),
    delayMs = SHORT_REQUEUE_DELAY_MS,
): DelayedRequeue<T>[] {
    const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : SHORT_REQUEUE_DELAY_MS;
    return [...pending, { card, dueAt: now + delay }];
}

/** 取出到期项目，并保持未到期项目的原有顺序。 */
export function takeDueRequeues<T>(
    pending: readonly DelayedRequeue<T>[],
    now = Date.now(),
): { due: T[]; pending: DelayedRequeue<T>[] } {
    const due: T[] = [];
    const rest: DelayedRequeue<T>[] = [];
    for (const item of pending) {
        if (item.dueAt <= now) {
            due.push(item.card);
        } else {
            rest.push(item);
        }
    }
    return { due, pending: rest };
}

/** 返回下一张延迟卡距离出现还需等待的毫秒数；没有待处理卡时返回 null。 */
export function nextRequeueDelay(
    pending: readonly DelayedRequeue<unknown>[],
    now = Date.now(),
): number | null {
    if (pending.length === 0) return null;
    const nextAt = Math.min(...pending.map(item => item.dueAt));
    return Math.max(0, nextAt - now);
}
