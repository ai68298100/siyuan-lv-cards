import { describe, expect, it } from "vitest";
import { buildDeckDashboard, type DeckDashEntry } from "../src/core/deck-dashboard";

const NOW = new Date(2026, 9, 7, 12, 0, 0); // 2026-10-07 12:00
const DAY = 86400000;
const ts = (daysAgo: number, hour = 10) => NOW.getTime() - daysAgo * DAY + (hour - 12) * 3600000;

const e = (deckID: string, cardID: string, rating: number, daysAgo: number): DeckDashEntry =>
    ({ ts: ts(daysAgo), deckID, cardID, rating });

describe("buildDeckDashboard", () => {
    it("按卡组聚合近 7 天复习/遗忘与今日到期", () => {
        const entries = [
            e("d1", "c1", 3, 0),
            e("d1", "c2", 1, 1),
            e("d2", "c3", 3, 2),
        ];
        const due = new Map([
            ["d1", { due: 4, newCards: 2 }],
            ["d2", { due: 0, newCards: 0 }],
        ]);
        const rows = buildDeckDashboard(entries, ["d1", "d2"], due, { now: NOW });
        expect(rows[0].deckID).toBe("d1"); // 到期多者在前
        expect(rows[0]).toMatchObject({ reviews7: 1, forgotten7: 1, dueToday: 4, newCount: 2 });
        expect(rows[1]).toMatchObject({ reviews7: 1, forgotten7: 0, dueToday: 0 });
    });

    it("保持率：样本足够才算百分比，不足为 null", () => {
        const entries = [
            ...Array.from({ length: 8 }, (_, i) => e("d1", "c" + i, 3, i % 7)),   // 8 通过
            e("d2", "c9", 1, 0),                                                   // 仅 1 样本
        ];
        const rows = buildDeckDashboard(entries, ["d1", "d2"], new Map(), { now: NOW });
        expect(rows.find(r => r.deckID === "d1")!.retention).toBe(100);
        expect(rows.find(r => r.deckID === "d2")!.retention).toBeNull();
    });

    it("顽固卡：窗口内遗忘 ≥3 次的卡计数一次", () => {
        const entries = [
            e("d1", "cx", 1, 1), e("d1", "cx", 1, 3), e("d1", "cx", 1, 5),  // 同卡 3 遗忘 → 1 张
            e("d1", "cy", 1, 2), e("d1", "cy", 1, 4),                        // 2 遗忘 → 不足
        ];
        const rows = buildDeckDashboard(entries, ["d1"], new Map(), { now: NOW });
        expect(rows[0].leeches).toBe(1);
        expect(rows[0].forgotten7).toBe(5);
    });

    it("窗口外（>30 天）不计入", () => {
        const rows = buildDeckDashboard([e("d1", "c1", 3, 40)], ["d1"], new Map(), { now: NOW });
        expect(rows[0]).toMatchObject({ reviews7: 0, retention: null, leeches: 0 });
    });

    it("无复习记录的卡组仍显示到期/新卡", () => {
        const due = new Map([["d9", { due: 6, newCards: 3 }]]);
        const rows = buildDeckDashboard([], ["d9"], due, { now: NOW });
        expect(rows[0]).toMatchObject({ deckID: "d9", dueToday: 6, newCount: 3, reviews7: 0, retention: null });
    });
});
