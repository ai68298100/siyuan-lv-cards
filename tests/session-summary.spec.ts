import { describe, expect, it } from "vitest";
import { buildSummary } from "../src/core/session-summary";
import { normalizeErrorTags } from "../src/core/error-reasons";

// BI-8 会话收工摘要：建议键推导 + 进度百分比
describe("session-summary（BI-8）", () => {
    it("目标达成：reviewed >= dailyTarget → target-reached", () => {
        const s = buildSummary(
            { reviewed: 100, newCount: 80, forgetCount: 5, skipCount: 2, durationSec: 1200, dailyTarget: 100 },
            "queue-empty",
        );
        expect(s.suggestionKey).toBe("done.targetReached");
        expect(s.progressPct).toBe(100);
    });

    it("有进度但未达标 → progressMade", () => {
        const s = buildSummary(
            { reviewed: 30, newCount: 20, forgetCount: 3, skipCount: 0, durationSec: 600, dailyTarget: 100 },
            "user-exit",
        );
        expect(s.suggestionKey).toBe("done.progressMade");
        expect(s.progressPct).toBe(30);
    });

    it("零进度 → noProgress", () => {
        const s = buildSummary(
            { reviewed: 0, newCount: 0, forgetCount: 0, skipCount: 0, durationSec: 0, dailyTarget: 100 },
            "user-exit",
        );
        expect(s.suggestionKey).toBe("done.noProgress");
        expect(s.progressPct).toBe(0);
    });

    it("dailyTarget=0 → pct=0，suggestion 由 reviewed>0 决定", () => {
        const s = buildSummary(
            { reviewed: 5, newCount: 5, forgetCount: 0, skipCount: 0, durationSec: 300, dailyTarget: 0 },
            "queue-empty",
        );
        expect(s.suggestionKey).toBe("done.progressMade");
        expect(s.progressPct).toBe(0);
    });
});

// BJ-4 error-tags 30 天保留清理
describe("normalizeErrorTags 日期清理（BJ-4 防无限增长）", () => {
    const NOW = new Date("2026-10-04T12:00:00").getTime();
    const cutoff = new Date(NOW - 30 * 86400000);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    it("超过 30 天的旧标注被清理", () => {
        const old = new Date(NOW - 31 * 86400000).toISOString().slice(0, 10);
        const r = normalizeErrorTags({
            tags: [
                { cardID: "old", reason: "memory-blank", date: old },
                { cardID: "new", reason: "step-error", date: "2026-10-04" },
            ],
        }, NOW);
        expect(r.tags).toHaveLength(1);
        expect(r.tags[0].cardID).toBe("new");
    });

    it("30 天内的标注保留", () => {
        const recent = new Date(NOW - 29 * 86400000).toISOString().slice(0, 10);
        const r = normalizeErrorTags({
            tags: [{ cardID: "recent", reason: "step-error", date: recent }],
        }, NOW);
        expect(r.tags).toHaveLength(1);
    });
});
