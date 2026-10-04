import { describe, expect, it } from "vitest";
import {
    avgSecPerCard, budgetLeftSec, BUDGET_PRESETS, estimateCompletable, estimateLeftover, isBudgetExpired,
} from "../src/core/session-budget";

// BI-12 时间预算：预算到≠失败（不自动结束）；估计口径=可完成+未完成=剩余总量
const MIN = 60000;

describe("session-budget（BI-12）", () => {
    it("预设为 5/15/30/60 分钟", () => {
        expect([...BUDGET_PRESETS]).toEqual([5, 15, 30, 60]);
    });

    it("avgSecPerCard：正样本均值、剔除离群/非法、空样本兜底 10s", () => {
        expect(avgSecPerCard([8, 12])).toBe(10);
        expect(avgSecPerCard([4000, 20])).toBe(20); // 4000 超上限被剔除
        expect(avgSecPerCard([0, -5, NaN])).toBe(10);
        expect(avgSecPerCard([1.4, 1.6])).toBe(2);
    });

    it("budgetLeftSec：未启用=Infinity；过期夹 0；否则向上取整秒", () => {
        expect(budgetLeftSec(0, 5, Date.now())).toBe(Number.POSITIVE_INFINITY);
        expect(budgetLeftSec(Date.now() - 10 * MIN, 5, Date.now())).toBe(0);
        expect(budgetLeftSec(1000, 5, 1000 + 90 * 1000)).toBe(210); // 300s 总量 - 90s 已用
    });

    it("isBudgetExpired：仅预算启用且到点为 true；未启用永远 false", () => {
        expect(isBudgetExpired(Date.now() - 6 * MIN, 5, Date.now())).toBe(true);
        expect(isBudgetExpired(0, 5, Date.now())).toBe(false);
        expect(isBudgetExpired(Date.now() - 6 * MIN, 0, Date.now())).toBe(false);
    });

    it("estimateCompletable：预算内可完成数（封顶剩余到期）", () => {
        expect(estimateCompletable(10 * 60, 30, 100)).toBe(20);   // 10 分钟 / 30s = 20
        expect(estimateCompletable(10 * 60, 30, 5)).toBe(5);      // 不超过剩余量
        expect(estimateCompletable(Number.POSITIVE_INFINITY, 30, 5)).toBe(0); // 未启用不估计
        expect(estimateCompletable(600, 0, 5)).toBe(0);           // 非法均值
    });

    it("estimateLeftover：未完成项；可完成+未完成=剩余总量；预算足够时为 0", () => {
        expect(estimateLeftover(10 * 60, 30, 100)).toBe(80);
        expect(estimateLeftover(10 * 60, 30, 5)).toBe(0);
        expect(estimateLeftover(Number.POSITIVE_INFINITY, 30, 5)).toBe(0);
        // 口径恒等式
        const left = 7 * 60, avg = 25, due = 40;
        expect(estimateCompletable(left, avg, due) + estimateLeftover(left, avg, due)).toBe(due);
    });
});
