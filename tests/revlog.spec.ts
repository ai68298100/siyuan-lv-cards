import { describe, expect, it } from "vitest";
import {
    appendRevlog, emptyRevlog, mergeRevlog, normalizeRevlog, recalcDays, calcStreak, calcXp, localDate, lastNDays, weekCompare, calcMilestones,
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

describe("weekCompare（M5·周期对比）", () => {
    it("本周计入近 7 天，上周只取其前 7 天，delta 为差值", () => {
        const d = emptyRevlog();
        const now = new Date();
        const day = 86400000;
        // 本周：c1/c2 各两次（首次 new，后续 review）
        appendRevlog(d, entry(now.getTime(), "c1", 3));
        appendRevlog(d, entry(now.getTime() + 1, "c1", 3));
        appendRevlog(d, entry(now.getTime() + 2, "c2", 3));
        appendRevlog(d, entry(now.getTime() + 3, "c2", 1));
        // 上周：8 天前 c4 两次（不在本周窗口，在上周窗口）
        appendRevlog(d, entry(now.getTime() - 8 * day, "c4", 3));
        appendRevlog(d, entry(now.getTime() - 8 * day + 1, "c4", 3));
        const w = weekCompare(d);
        expect(w.thisWeek.new).toBe(2);
        expect(w.thisWeek.review).toBe(2);
        expect(w.thisWeek.forget).toBe(1);
        expect(w.lastWeek.review).toBe(1);
        expect(w.delta.review).toBe(1);
    });

    it("空日志返回全零", () => {
        const w = weekCompare(emptyRevlog());
        expect(w.thisWeek.review).toBe(0);
        expect(w.lastWeek.new).toBe(0);
        expect(w.delta.forget).toBe(0);
    });
});

describe("calcMilestones（M5·里程碑）", () => {
    it("累计/活跃/最长连续/单日之最/下一目标", () => {
        const d = emptyRevlog();
        const now = new Date();
        const day = 86400000;
        // 今天 + 昨天 + 前天：连续 3 天
        for (let i = 0; i < 3; i++) {
            appendRevlog(d, entry(now.getTime() - i * day, `c${i}`, 3));
            appendRevlog(d, entry(now.getTime() - i * day + 1, `c${i}`, 3));
        }
        // 单日之最：今天 4 次有效评分
        appendRevlog(d, entry(now.getTime() + 2, "cx", 3));
        appendRevlog(d, entry(now.getTime() + 3, "cy", 3));
        const m = calcMilestones(d);
        expect(m.totalReviews).toBe(8);
        expect(m.daysActive).toBe(3);
        expect(m.longestStreak).toBe(3);
        expect(m.currentStreak).toBe(3);
        expect(m.bestDay?.count).toBe(4);
        expect(m.nextGoal?.at).toBe(1000);
        expect(m.nextGoal?.remaining).toBe(992);
    });

    it("空日志不产出目标与单日之最", () => {
        const m = calcMilestones(emptyRevlog());
        expect(m.totalReviews).toBe(0);
        expect(m.bestDay).toBeNull();
        expect(m.nextGoal?.at).toBe(1000);
    });
});

describe("mergeRevlog 分叉检测（M10·FR3）", () => {
    it("同 ts+cardID 评分冲突计 forks，默认跳过；幂等重放 preferImport 覆盖", () => {
        const d = emptyRevlog();
        const t = Date.now();
        appendRevlog(d, entry(t, "c1", 3));
        // 第一次导入：c1 同刻评 1（分叉）+ c2 新记录
        const r1 = mergeRevlog(d, {
            entries: [
                { ts: t, cardID: "c1", rating: 1, source: "plugin" },
                { ts: t + 1, cardID: "c2", rating: 3, source: "plugin" },
            ],
        });
        expect(r1.forks).toBe(1);
        expect(r1.added).toBe(1);
        expect(r1.forkSamples[0]).toMatchObject({ cardID: "c1", imported: 1, local: 3 });
        expect(d.entries.find(e => e.cardID === "c1")?.rating).toBe(3);
        // 第二次重放同一文件（preferImport）：分叉以导入为准
        const r2 = mergeRevlog(d, {
            entries: [
                { ts: t, cardID: "c1", rating: 1, source: "plugin" },
                { ts: t + 1, cardID: "c2", rating: 3, source: "plugin" },
            ],
        }, { onFork: "preferImport" });
        expect(r2.forks).toBe(1);
        expect(r2.added).toBe(1);
        expect(d.entries.find(e => e.cardID === "c1")?.rating).toBe(1);
    });

    it("同 ts+cardID 同评分不同 source 不算分叉（正常双端记录）", () => {
        const d = emptyRevlog();
        const t = Date.now();
        appendRevlog(d, entry(t, "c1", 3, "plugin"));
        const r = mergeRevlog(d, { entries: [{ ts: t, cardID: "c1", rating: 3, source: "native" }] });
        expect(r.forks).toBe(0);
        expect(r.added).toBe(1);
    });
});

describe("calcXp（M8·FR3）", () => {
    it("xp = 复习×2 + 最长连击×15 + 活跃天×5，等级 √(xp/50)+1", () => {
        const d = emptyRevlog();
        const now = new Date();
        const day = 86400000;
        // 连续 2 天，各 2 条有效评分 → total=4, active=2, longest=2
        for (let i = 0; i < 2; i++) {
            appendRevlog(d, entry(now.getTime() - i * day, `c${i}`, 3));
            appendRevlog(d, entry(now.getTime() - i * day + 1, `c${i}`, 3));
        }
        const x = calcXp(d);
        expect(x.xp).toBe(4 * 2 + 2 * 15 + 2 * 5);
        expect(x.level).toBe(Math.floor(Math.sqrt(x.xp / 50)) + 1);
        expect(x.toNext).toBe(50 * x.level * x.level - x.xp);
    });

    it("空日志为 0 XP / 1 级", () => {
        const x = calcXp(emptyRevlog());
        expect(x.xp).toBe(0);
        expect(x.level).toBe(1);
        expect(x.toNext).toBe(50);
    });
});

describe("normalizeRevlog 运行时清洗（AQ-3）", () => {
    it("合法条目原样保留，聚合由明细重建", () => {
        const t = Date.now();
        const d = normalizeRevlog({
            version: 1,
            entries: [entry(t, "c1", 3), entry(t + 1, "c1", 1)],
            days: { "1999-01-01": { new: 99, review: 99, forget: 99 } },
        });
        expect(d.entries).toHaveLength(2);
        expect(d.days[localDate(t)]).toEqual({ new: 1, review: 1, forget: 1 });
        expect(d.days["1999-01-01"]).toBeUndefined(); // 污染聚合不透传
    });

    it("非法条目逐条剔除：NaN/负/越界时间、非法评分、非字符串卡 ID；数字字符串评分按修复收敛", () => {
        const t = Date.now();
        const d = normalizeRevlog({
            entries: [
                { ts: NaN, cardID: "c1", rating: 3 },
                { ts: -5, cardID: "c2", rating: 3 },
                { ts: 99999999999999, cardID: "c3", rating: 3 },
                { ts: t, cardID: "", rating: 3 },
                { ts: t, cardID: 42, rating: 3 },
                { ts: t, cardID: "c4", rating: 2.5 },
                { ts: t, cardID: "c4", rating: 5 },
                { ts: t, cardID: "c4", rating: -1 },
                // 存储自愈语义（与 mergeRevlog 一致）：数字字符串评分修复为数值保留
                { ts: t, cardID: "c4", rating: "3" },
                null,
                "junk",
                { ts: t, cardID: "ok", rating: 4, deckID: 7, blockID: null, source: "native" },
            ],
        });
        expect(d.entries.map(e => e.cardID)).toEqual(["c4", "ok"]);
        expect(d.entries[0]).toMatchObject({ rating: 3, source: "plugin" });
        expect(d.entries[1]).toMatchObject({ rating: 4, source: "native", deckID: "", blockID: "" });
    });

    it("随机脏输入不产生 NaN、不抛错（fuzz）", () => {
        const junk = [
            0, false, "", undefined,
            { entries: "x" },
            { entries: [{ ts: 1 }] },
            { entries: Array.from({ length: 50 }, (_, i) => ({ ts: i % 2 ? NaN : i, cardID: i % 3 ? null : `c${i}`, rating: i * 1.5 })) },
        ];
        for (const j of junk) {
            expect(() => normalizeRevlog(j)).not.toThrow();
        }
        const d = normalizeRevlog(junk[junk.length - 1]);
        for (const e of d.entries) {
            expect(Number.isFinite(e.ts)).toBe(true);
            expect(Number.isInteger(e.rating)).toBe(true);
            expect(e.rating >= 0 && e.rating <= 4).toBe(true);
        }
    });

    it("清洗幂等：normalize(normalize(x)) 与 normalize(x) 一致", () => {
        const t = Date.now();
        const raw = { entries: [entry(t, "c1", 3), { ts: t, cardID: "bad", rating: 9 }] };
        const once = normalizeRevlog(raw);
        const twice = normalizeRevlog(JSON.parse(JSON.stringify(once)));
        expect(twice).toEqual(once);
    });
});

describe("revlog 2 万条性能预算（G 组·内存审计）", () => {    it("2 万条写入 + 全量重算 + 聚合推导在 2s 内", () => {
        const t0 = performance.now();
        const d = emptyRevlog();
        const now = Date.now();
        const ratings = [1, 2, 3, 4];
        for (let i = 0; i < 20000; i++) {
            // 每小时一条，覆盖 ~833 天；评分循环 1-4
            appendRevlog(d, entry(now - i * 3600000, `c${i % 500}`, ratings[i % 4]));
        }
        recalcDays(d);
        expect(calcStreak(d)).toBeGreaterThanOrEqual(0);
        expect(lastNDays(d, 119)).toHaveLength(119);
        const m = calcMilestones(d);
        expect(m.totalReviews).toBe(20000);
        const w = weekCompare(d);
        expect(w.thisWeek.review).toBeGreaterThanOrEqual(0);
        const elapsed = performance.now() - t0;
        // 宽松预算（CI 波动安全）：2 万条全链路 < 2000ms
        expect(elapsed).toBeLessThan(2000);
    });
});
