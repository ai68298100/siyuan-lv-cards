import { describe, expect, it } from "vitest";
import { buildWeeklyReport, decideWeeklyReport, mondayOf } from "../src/core/weekly-report";

const d = (s: string) => {
    const [y, m, day] = s.split("-").map(Number);
    return new Date(y, m - 1, day);
};

describe("mondayOf", () => {
    it("任意日回退到本周一", () => {
        expect(localOf(mondayOf(d("2026-10-07")))).toBe("2026-10-05"); // 周三
        expect(localOf(mondayOf(d("2026-10-05")))).toBe("2026-10-05"); // 周一
        expect(localOf(mondayOf(d("2026-10-11")))).toBe("2026-10-05"); // 周日
    });
    const localOf = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
});

describe("decideWeeklyReport", () => {
    it("关闭时不写", () => {
        const r = decideWeeklyReport(d("2026-10-07"), "", false);
        expect(r.write).toBe(false);
    });
    it("本周首次加载：写上周（weekKey=上周一），范围=上周一~周日", () => {
        const r = decideWeeklyReport(d("2026-10-07"), "", true);
        expect(r.write).toBe(true);
        expect(r.weekKey).toBe("2026-09-28");
        expect(r.rangeStart).toBe("2026-09-28");
        expect(r.rangeEnd).toBe("2026-10-04");
    });
    it("同周重复加载：幂等不重写", () => {
        const r = decideWeeklyReport(d("2026-10-07"), "2026-09-28", true);
        expect(r.write).toBe(false);
    });
    it("上周报告过、进入下下周后：写新的上一周", () => {
        // 上周(9/28~10/4)已写过；今天 10-14 → 上一周变 10-05~10-11
        const r = decideWeeklyReport(d("2026-10-14"), "2026-09-28", true);
        expect(r.write).toBe(true);
        expect(r.weekKey).toBe("2026-10-05");
        expect(r.rangeEnd).toBe("2026-10-11");
    });
});

describe("buildWeeklyReport", () => {
    const labels = {
        title: "学习周报",
        reviewed: "正式复习",
        newCards: "新卡",
        forgotten: "遗忘",
        streak: "连击",
        retention: "保持率",
        unknown: "未知",
        lastWeek: "上周",
        footer: "数据来自本地复习日志",
    };
    it("排版事实与对比基准", () => {
        const md = buildWeeklyReport(
            { reviewed: 42, reviewedPrev: 30, newCards: 5, forgotten: 2, streak: 6, retention: 88 },
            labels,
        );
        expect(md).toContain("## 学习周报");
        expect(md).toContain("正式复习：42（上周 30）");
        expect(md).toContain("新卡：5");
        expect(md).toContain("遗忘：2");
        expect(md).toContain("连击：6");
        expect(md).toContain("保持率：88%");
        expect(md).toContain("数据来自本地复习日志");
    });
    it("无历史/样本不足如实标未知", () => {
        const md = buildWeeklyReport(
            { reviewed: 0, reviewedPrev: null, newCards: 0, forgotten: 0, streak: 0, retention: null },
            labels,
        );
        expect(md).toContain("正式复习：0");
        expect(md).not.toContain("上周");
        expect(md).toContain("保持率：未知");
    });
});
