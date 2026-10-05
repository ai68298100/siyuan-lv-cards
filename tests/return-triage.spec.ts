import { describe, expect, it } from "vitest";
import { RETURN_REASONS, recordTriage, triageReturn, type TriageFacts } from "../src/core/return-triage";

// BI-27 返场分流：六类原因六套方案，绝不统一补齐逾期；历史追加留痕
const facts: TriageFacts = { dueCount: 80, daysGap: 9, staleCount: 2 };

describe("return-triage（BI-27）", () => {
    it("六类原因在册且方案互不相同（验收：不统一方案）", () => {
        expect([...RETURN_REASONS]).toEqual(["time-short", "goal-changed", "content-stale", "data-failure", "pressure", "plain-leave"]);
        const plans = RETURN_REASONS.map(r => triageReturn(r, facts));
        const sigs = new Set(plans.map(p => p.steps.join(">") + "|" + p.suggestedCap));
        expect(sigs.size).toBe(RETURN_REASONS.length); // 六套方案两两不同
    });

    it("duePolicy 恒为 keep：任何方案都不补齐/清空逾期（验收硬性）", () => {
        for (const r of RETURN_REASONS) {
            expect(triageReturn(r, facts).duePolicy).toBe("keep");
        }
    });

    it("各原因的关键差异：压力=只读 0 张；时间不足=小上限；目标改变=先重审不限量", () => {
        expect(triageReturn("pressure", facts).suggestedCap).toBe(0);
        expect(triageReturn("time-short", facts).suggestedCap).toBe(10);
        expect(triageReturn("goal-changed", facts).suggestedCap).toBeNull();
        expect(triageReturn("goal-changed", facts).steps).toContain("review-criteria");
        expect(triageReturn("content-stale", facts).steps).toContain("source-health"); // 修订优先
        expect(triageReturn("data-failure", facts).steps).toContain("diagnostics"); // 先对账再复习
    });

    it("上限不超过剩余到期数", () => {
        expect(triageReturn("time-short", { ...facts, dueCount: 3 }).suggestedCap).toBe(3);
    });

    it("分流记录追加留痕（历史保留），截 30 条", () => {
        let h = recordTriage([], "time-short", facts, 1000);
        h = recordTriage(h, "pressure", facts, 2000);
        expect(h).toHaveLength(2);
        expect(h[0]).toMatchObject({ at: 1000, reason: "time-short", dueCount: 80 });
        expect(h[1].reason).toBe("pressure");
        for (let i = 0; i < 40; i++) {
            h = recordTriage(h, "plain-leave", facts, 3000 + i);
        }
        expect(h.length).toBeLessThanOrEqual(30);
    });
});
