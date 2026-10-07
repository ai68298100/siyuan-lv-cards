import { describe, expect, it } from "vitest";
import {
    buildForecast,
    buildMonthGrid,
    dueMapFromForecast,
    localDateISO,
    parseCardDue,
    type ForecastCardInput,
} from "../src/core/forecast";

const TODAY = new Date(2026, 9, 7); // 2026-10-07 周三
const iso = (offsetDays: number) => localDateISO(new Date(2026, 9, 7 + offsetDays));

const card = (due: string, state = 1): ForecastCardInput => ({ due, state });

describe("parseCardDue", () => {
    it("解析内核紧凑格式 YYYYMMDDHHmmss", () => {
        const d = parseCardDue("20261012093000")!;
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(9);
        expect(d.getDate()).toBe(12);
    });
    it("解析 ISO 并容忍缺省", () => {
        expect(parseCardDue("2026-10-12T09:30:00")!.getDate()).toBe(12);
        expect(parseCardDue("")).toBeNull();
        expect(parseCardDue("garbage")).toBeNull();
    });
});

describe("buildForecast", () => {

    it("复习卡按 due 落日", () => {
        const cards = [card("20261007090000"), card("20261008090000"), card("20261008090000")];
        const r = buildForecast(cards, { today: TODAY, horizonDays: 14 });
        expect(r.days[0]).toMatchObject({ reviews: 1, news: 0 });
        expect(r.days[1]).toMatchObject({ reviews: 2 });
        expect(r.coveredTotal).toBe(3);
    });

    it("到期积压（早于今天）计入今天，不藏负数", () => {
        const r = buildForecast([card("20260901090000")], { today: TODAY });
        expect(r.days[0].reviews).toBe(1);
        expect(r.laterCount).toBe(0);
    });

    it("窗口之外计入 laterCount", () => {
        const r = buildForecast([card("20261201090000")], { today: TODAY, horizonDays: 14 });
        expect(r.laterCount).toBe(1);
    });

    it("新卡按每日上限摊入（20 张 · 上限 10 → 今天 10 明天 10）", () => {
        const news = Array.from({ length: 20 }, () => card("20261007090000", 0));
        const r = buildForecast(news, { today: TODAY, dailyNewTarget: 10 });
        expect(r.days[0].news).toBe(10);
        expect(r.days[1].news).toBe(10);
    });

    it("缺 due 记 skipped，不参与统计", () => {
        const r = buildForecast([card(""), card("20261007090000")], { today: TODAY });
        expect(r.skippedTotal).toBe(1);
        expect(r.coveredTotal).toBe(1);
    });
});

describe("buildMonthGrid", () => {
    it("2026 年 10 月：周一开头 3 格补位、31 天、今日标示", () => {
        const cells = buildMonthGrid(2026, 10, TODAY, new Map(), new Map());
        expect(cells.filter(c => c.date === null)).toHaveLength(3);
        expect(cells.filter(c => c.date)).toHaveLength(31);
        const todayCell = cells.find(c => c.date === "2026-10-07")!;
        expect(todayCell.tone).toBe("today");
        expect(cells[0].date).toBeNull();
    });
    it("过去按复习量着色、未来按到期量着色", () => {
        const reviews = new Map([["2026-10-05", 10]]);
        const dues = new Map([["2026-10-20", 8]]);
        const cells = buildMonthGrid(2026, 10, TODAY, reviews, dues);
        expect(cells.find(c => c.date === "2026-10-05")!.tone).toBe("past2");
        expect(cells.find(c => c.date === "2026-10-20")!.tone).toBe("future2");
        expect(cells.find(c => c.date === "2026-10-06")!.tone).toBe("empty");
    });
});

describe("dueMapFromForecast", () => {
    it("到期量 = reviews + news", () => {
        const r = buildForecast(
            [card("20261007090000"), ...Array.from({ length: 3 }, () => card("20261007090000", 0))],
            { today: TODAY, dailyNewTarget: 10 },
        );
        const m = dueMapFromForecast(r.days);
        expect(m.get(iso(0))).toBe(4);
    });
});
