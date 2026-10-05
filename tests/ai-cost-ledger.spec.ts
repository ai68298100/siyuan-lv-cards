import { describe, expect, it } from "vitest";
import {
    emptyCostLedger,
    normalizeCostLedger,
    recordEntry,
    budgetState,
    aggregateByModel,
    aggregateByDay,
    type CostEntry,
} from "../src/core/ai-cost-ledger";

// BU-24/25 成本账本：估算显式标记、月度预算 warn/exceeded、按模型/日聚合、key 与原文不入账
const entry = (at: number, tokens: number, over: Partial<CostEntry> = {}): CostEntry => ({
    at,
    task: "cards-generate",
    mode: "custom",
    modelId: "gpt-4o-mini",
    tokens,
    est: true,
    costUsd: 0.01,
    algorithm: "chars/4",
    priceVersion: "2026-10",
    ...over,
});

describe("ai-cost-ledger（BU-24/25）", () => {
    it("清洗：坏条目剔除、est 缺省 true、task/priceVersion 截断、按时间排序限量", () => {
        const raw = {
            version: 1,
            entries: [
                entry(2000, 100),
                entry(1000, 50),
                { at: "bad", tokens: 1 },
                { at: 3000, tokens: -5 },
                { at: 3000, mode: "galaxy", tokens: 1 },
                { at: 3000, mode: "custom", tokens: "x" },
                entry(1500, 10, { task: "x".repeat(100), priceVersion: "v".repeat(50) }),
            ],
        };
        const r = normalizeCostLedger(raw);
        expect(r.entries.map(e => e.at)).toEqual([1000, 1500, 2000]); // 排序 + 坏条目剔除
        expect(r.entries[1].task.length).toBe(64);
        expect(r.entries[1].priceVersion.length).toBe(16);
        const many = Array.from({ length: 3000 }, (_, i) => entry(i + 1, 1));
        expect(normalizeCostLedger({ entries: many }).entries.length).toBe(2000);
    });

    it("记录：最新在后、上限截断；空库安全", () => {
        let l = emptyCostLedger();
        l = recordEntry(l, entry(1, 10));
        l = recordEntry(l, entry(2, 20));
        expect(l.entries.map(e => e.tokens)).toEqual([10, 20]);
        expect(recordEntry(emptyCostLedger(), entry(1, 1), 2).entries.length).toBe(1);
    });

    it("预算：本自然月窗口；enabled+cap>0 才生效；超限 exceeded、80% warn", () => {
        // 2026-10 内
        const t1 = new Date("2026-10-05T10:00:00").getTime();
        const t2 = new Date("2026-10-20T10:00:00").getTime();
        let l = emptyCostLedger();
        l = recordEntry(l, entry(t1, 60000));
        l = recordEntry(l, entry(t2, 30000));
        // 上月不计入
        const sep = new Date("2026-09-28T10:00:00").getTime();
        l = recordEntry(l, entry(sep, 999999));
        const b = { enabled: true, monthlyTokenCap: 100000 };
        const s = budgetState(l, b, t2);
        expect(s.monthUsed).toBe(90000);
        expect(s.active).toBe(true);
        expect(s.warn).toBe(true); // 90% ≥ 80%
        expect(s.exceeded).toBe(false);
        expect(s.remaining).toBe(10000);
        // 再记 10K → 恰好超限
        l = recordEntry(l, entry(t2 + 1000, 10000));
        const s2 = budgetState(l, b, t2 + 2000);
        expect(s2.exceeded).toBe(true);
        expect(s2.warn).toBe(false);
        expect(s2.remaining).toBe(0);
    });

    it("预算：未启用/上限 0 恒不阻断（不误伤）；warnRatio 可调", () => {
        const l = recordEntry(emptyCostLedger(), entry(Date.now(), 999999999));
        expect(budgetState(l, { enabled: false, monthlyTokenCap: 1000 }).exceeded).toBe(false);
        expect(budgetState(l, { enabled: true, monthlyTokenCap: 0 }).exceeded).toBe(false);
        const s = budgetState(l, { enabled: true, monthlyTokenCap: 1000000000, warnRatio: 0.5 });
        expect(s.warn).toBe(true);
        expect(s.exceeded).toBe(false);
    });

    it("聚合：按模型——价格未知组 costUsd=null（不编数字）；按日升序", () => {
        let l = emptyCostLedger();
        l = recordEntry(l, entry(1, 100, { modelId: "gpt-4o-mini", costUsd: 0.01 }));
        l = recordEntry(l, entry(2, 200, { modelId: "gpt-4o-mini", costUsd: 0.02 }));
        l = recordEntry(l, entry(3, 300, { modelId: "moonshot-v1-8k", costUsd: null }));
        l = recordEntry(l, entry(4, 400, { modelId: null, costUsd: null }));
        const byModel = aggregateByModel(l);
        expect(byModel[0]).toEqual({ modelId: null, calls: 1, tokens: 400, costUsd: null }); // tokens 降序
        const gpt = byModel.find(m => m.modelId === "gpt-4o-mini")!;
        expect(gpt.calls).toBe(2);
        expect(gpt.tokens).toBe(300);
        expect(gpt.costUsd).toBeCloseTo(0.03, 9);
        expect(byModel.find(m => m.modelId === "moonshot-v1-8k")?.costUsd).toBeNull();
        expect(byModel.find(m => m.modelId === null)?.costUsd).toBeNull();
        const days = aggregateByDay(l);
        expect(days.length).toBeGreaterThanOrEqual(1);
        expect([...days.map(d => d.day)]).toEqual([...days.map(d => d.day)].sort());
    });
});
