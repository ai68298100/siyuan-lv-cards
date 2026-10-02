import { describe, expect, it } from "vitest";
import { dynamicPlanAdvice, type ExamPlan } from "../src/core/exam";

const DAY = 86400000;
const NOW = 1_800_000_000_000;

const plan = (over: Partial<ExamPlan> = {}): ExamPlan => ({
    id: "p1",
    name: "期末",
    examDate: "2027-06-15",
    scopeKind: "all",
    scopeId: "",
    scopeName: "全部",
    cramDays: 7,
    enabled: true,
    createdAt: NOW - 5 * DAY,
    ...over,
});

// examDate 距 NOW 30 天（动态计算，避免依赖系统时钟）
const EXAM_DATE = (() => {
    const d = new Date(NOW + 30 * DAY);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
const plan30 = plan({ examDate: EXAM_DATE, createdAt: NOW - 5 * DAY });

describe("dynamicPlanAdvice（AQ-8 动态重算建议层）", () => {
    it("基础日均 = 剩余量/剩余天数向上取整；与基线持平（无落后）时今日=日均", () => {
        // 容量 100、已学 20 → 剩余 80，30 天 → 日均 ceil(80/30)=3；已过 5 天基线 3×5=15 ≤ 已学 20 → 无落后
        const a = dynamicPlanAdvice(plan30, { now: NOW, capacity: 100, observed: 20, dailyCap: 200 });
        expect(a.baseDaily).toBe(3);
        expect(a.todayTarget).toBe(3);
        expect(a.behind).toBe(0);
        expect(a.infeasible).toBeNull();
        expect(a.capacityUnknown).toBe(false);
    });

    it("落后补偿：按已过天数的日均基线 − 本地已观察", () => {
        // 已过 5 天 × 日均 4 = 应完成 20；实际只学了 5 → 落后 15；今日 = 4 + 15
        const a = dynamicPlanAdvice(plan30, { now: NOW, capacity: 100, observed: 5, dailyCap: 200 });
        expect(a.behind).toBe(15);
        expect(a.todayTarget).toBe(19);
    });

    it("容量未知：todayTarget=null 且 capacityUnknown（不推算、不猜测）", () => {
        const a = dynamicPlanAdvice(plan30, { now: NOW, capacity: undefined, observed: 3, dailyCap: 200 });
        expect(a.capacityUnknown).toBe(true);
        expect(a.todayTarget).toBeNull();
        expect(a.observed).toBe(3);
    });

    it("不可行：剩余量超出 每日上限×剩余天数 → over-capacity + 所需天数", () => {
        // 剩余 1000、29 天、上限 20 → 需 50 天
        const a = dynamicPlanAdvice(plan30, { now: NOW, capacity: 1000, observed: 0, dailyCap: 20 });
        expect(a.infeasible).toBe("over-capacity");
        expect(a.daysNeededAtCap).toBe(50);
    });

    it("容量变化即时反映：deck size 从 100 涨到 300，日均同步上涨", () => {
        const a1 = dynamicPlanAdvice(plan30, { now: NOW, capacity: 100, observed: 10, dailyCap: 200 });
        const a2 = dynamicPlanAdvice(plan30, { now: NOW, capacity: 300, observed: 10, dailyCap: 200 });
        expect(a2.baseDaily).toBeGreaterThan(a1.baseDaily);
    });

    it("考试已过：expired", () => {
        const p = plan({ examDate: "2020-01-01" });
        const a = dynamicPlanAdvice(p, { now: NOW, capacity: 100, observed: 0, dailyCap: 200 });
        expect(a.infeasible).toBe("expired");
        expect(a.todayTarget).toBeNull();
    });

    it("学习日为 0 天（考试日当天）：按 1 天摊且今日=剩余全量", () => {
        const today = new Date(NOW);
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const p = plan({ examDate: todayStr, createdAt: NOW - 1 * DAY });
        const a = dynamicPlanAdvice(p, { now: NOW, capacity: 50, observed: 10, dailyCap: 999 });
        expect(a.baseDaily).toBe(40);
        expect(a.todayTarget).toBe(40);
    });
});
