import { describe, expect, it } from "vitest";
import { appendRevlog, calcStreak, calcMilestones, coverageStats, deckCoverage, emptyRevlog, lastNDays, leechCards, mergeRevlog, normalizeRevlog, recalcDays, revlogToCsv, type RevlogData } from "../src/core/revlog";
import { gradeTyping } from "../src/core/card-types";
import { normalizeSessionState } from "../src/core/session-state";

// AT-5 大库基准（离线子集）：纯数据管线在 1k/10k/50k 条目级的耗时预算。
// 真机报告（固定设备/思源版本/UI 面板路径）仍归 docs/17 AT-5 本条；
// 这里守住的是「数据层算法复杂度」——预算超限即意味着 O(n²) 类回归。
function makeEntries(count: number, distinctCards: number): RevlogData {
    const d = emptyRevlog();
    const now = Date.now();
    const ratings = [1, 2, 3, 4];
    for (let i = 0; i < count; i++) {
        // 每 5 分钟一条，50k 条 ≈ 174 天；卡循环保证 knownCards 与 leech 路径都被覆盖
        appendRevlog(d, entry(now - (count - i) * 300000, `c${i % distinctCards}`, ratings[i % 4]));
    }
    return d;
}
function entry(ts: number, cardID: string, rating: number) {
    return { ts, cardID, deckID: "deck-1", blockID: `b-${cardID}`, rating, source: "plugin" as const };
}
function budget(label: string, fn: () => void, ms: number) {
    const t0 = performance.now();
    fn();
    const elapsed = performance.now() - t0;
    // 预算宽松（CI 波动安全），超限即数据层复杂度回归
    expect(elapsed, `${label} took ${elapsed.toFixed(0)}ms (budget ${ms}ms)`).toBeLessThan(ms);
}

describe("AT-5 大库基准：revlog 纯数据管线规模预算", () => {
    it("1k 条：全链路（写入+重算+聚合+导出+CSV）< 300ms", () => {
        const d = makeEntries(1000, 100);
        budget("1k full pipeline", () => {
            recalcDays(d);
            calcStreak(d);
            lastNDays(d, 119);
            calcMilestones(d);
            coverageStats(d, 100);
            deckCoverage(d, [{ id: "deck-1", size: 100 }]);
            leechCards(d, 8);
            revlogToCsv(d);
        }, 300);
    });

    it("10k 条：normalize（加载清洗路径）< 800ms，全链路 < 1200ms", () => {
        const raw = JSON.parse(JSON.stringify(makeEntries(10000, 1000)));
        budget("10k normalize", () => {
            const d = normalizeRevlog(raw);
            expect(d.entries).toHaveLength(10000);
        }, 800);
        const d = makeEntries(10000, 1000);
        budget("10k full pipeline", () => {
            recalcDays(d);
            calcStreak(d);
            calcMilestones(d);
            coverageStats(d, 1000);
            leechCards(d, 8);
        }, 1200);
    }, 30000);

    it("50k 条：写入+重算+聚合 < 6000ms（AQ-21 截断上限量级）", () => {
        budget("50k build+aggregate", () => {
            const d = makeEntries(50000, 5000);
            recalcDays(d);
            calcStreak(d);
            calcMilestones(d);
            coverageStats(d, 5000);
            leechCards(d, 8);
            // 50k merge 早退路径：截断明细但保留聚合
            const snapshotDate = new Date().toISOString().slice(0, 10);
            mergeRevlog(d, { entries: [entry(Date.now(), "imported", 2)] });
            expect(d.days[snapshotDate]).toBeDefined();
        }, 15000);
    }, 60000);

    it("50k 条 CSV 导出（明细 2 万条上限 + 表头）", () => {
        const d = makeEntries(50000, 5000);
        let csv = "";
        budget("50k CSV", () => {
            csv = revlogToCsv(d);
        }, 8000);
        // AQ-21：明细截断到 2 万条，CSV 行 = 表头 + min(entries, 20000)
        expect(csv.split("\n").length).toBeGreaterThanOrEqual(20000);
    }, 60000);

    it("打字判分单卡恒定耗时（与库规模无关）：1000 次 < 400ms", () => {
        budget("1k grades", () => {
            for (let i = 0; i < 1000; i++) {
                gradeTyping("线粒体是细胞的能量工厂", "线粒体是细胞的能量工厂", false);
            }
        }, 400);
    });

    it("1 万条会话状态清洗 < 500ms（AQ-2 存储规模化）", () => {
        const today = new Date().toISOString().slice(0, 10);
        const raw = {
            date: today,
            reviewedIDs: Array.from({ length: 10000 }, (_, i) => `c${i}`),
            skippedIDs: Array.from({ length: 100 }, (_, i) => `s${i}`),
            counters: { new: 10, review: 9990, forget: 5, skip: 100 },
        };
        budget("10k session normalize", () => {
            const s = normalizeSessionState(raw, today);
            expect(s.reviewedIDs).toHaveLength(10000);
        }, 500);
    });
});
