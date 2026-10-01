import { describe, expect, it } from "vitest";
import {
    appendRevlog, emptyRevlog, mergeRevlog, recalcDays, calcStreak, localDate,
    type RevlogData,
} from "../src/core/revlog";

const entry = (ts: number, cardID: string, rating: number, source: "native" | "plugin" = "plugin") =>
    ({ ts, cardID, deckID: "deck", blockID: "blk", rating, source });

describe("appendRevlog（AJ1）", () => {
    it("首次有效评分计入 day.new，后续计入 day.review", () => {
        const d = emptyRevlog();
        const t = Date.now();
        appendRevlog(d, entry(t, "c1", 3));
        appendRevlog(d, entry(t + 1, "c1", 3));
        appendRevlog(d, entry(t + 2, "c2", 3));
        const day = d.days[localDate(t)];
        expect(day.new).toBe(2);
        expect(day.review).toBe(1);
        expect(day.forget).toBe(0);
    });

    it("skip（rating=0）入 entries 但不计聚合", () => {
        const d = emptyRevlog();
        const t = Date.now();
        appendRevlog(d, entry(t, "c1", 0));
        const day = d.days[localDate(t)];
        expect(day?.review ?? 0).toBe(0);
        expect(d.entries).toHaveLength(1);
    });

    it("recalcDays 幂等重算", () => {
        const d = emptyRevlog();
        const t = Date.now();
        appendRevlog(d, entry(t, "c1", 1));
        appendRevlog(d, entry(t + 1, "c1", 3));
        const before = JSON.stringify(d.days);
        recalcDays(d);
        expect(JSON.stringify(d.days)).toBe(before);
        expect(d.days[localDate(t)].forget).toBe(1);
    });
});

describe("mergeRevlog（M10·FR1）", () => {
    it("按 ts+cardID+rating+source 去重并清洗非法条目", () => {
        const d = emptyRevlog();
        const t = Date.now();
        appendRevlog(d, entry(t, "c1", 3));
        const result = mergeRevlog(d, {
            entries: [
                { ts: t, cardID: "c1", rating: 3, source: "plugin" },   // 重复
                { ts: t + 5, cardID: "c2", rating: 2, source: "native" }, // 新增
                { ts: "bad", cardID: "c3", rating: 2 },                 // 非法 ts
                { ts: t + 6, cardID: "c4", rating: 9 },                 // 非法评分
                { ts: t + 7, cardID: "", rating: 2 },                   // 空 cardID
            ],
        });
        expect(result.added).toBe(1);
        expect(result.skipped).toBe(4);
        expect(d.entries).toHaveLength(2);
    });

    it("合并后 days 已重算", () => {
        const d = emptyRevlog();
        const t = Date.now();
        mergeRevlog(d, { entries: [entry(t, "c9", 1)] });
        expect(d.days[localDate(t)].forget).toBe(1);
    });
});

describe("calcStreak", () => {
    it("昨天+今天连续 = 2", () => {
        const d = emptyRevlog();
        const now = new Date();
        const y = new Date(now.getTime() - 86400000);
        appendRevlog(d, entry(y.getTime(), "c1", 3));
        appendRevlog(d, entry(now.getTime(), "c2", 3));
        expect(calcStreak(d)).toBe(2);
    });
});
