import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    assembleWeeklyReportPayload,
    queryNotebookBlockIDs,
    renderExamReportMarkdown,
    resolveTargetNotebook,
    renderDashboardReportMarkdown,
    computeWeekOverview,
    computeCurveSvgPaths,
} from "../src/core/report-writer";
import type { ExamPlan } from "../src/core/exam";
import type { RevlogData } from "../src/core/revlog";

describe("report-writer 考试复盘与周期报告生成引擎", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("resolveTargetNotebook 目标笔记本解析", () => {
        const notebooks = [
            { id: "nb-default", name: "默认笔记本" },
            { id: "nb-study", name: "闪卡学习" },
        ];

        it("配置指定笔记本存在时优先返回指定笔记本", () => {
            const result = resolveTargetNotebook(notebooks, "nb-study");
            expect(result).toEqual({ id: "nb-study", name: "闪卡学习" });
        });

        it("未指定或找不到对应 ID 时回退为首个笔记本", () => {
            expect(resolveTargetNotebook(notebooks, "nb-missing")).toEqual(notebooks[0]);
            expect(resolveTargetNotebook(notebooks, undefined)).toEqual(notebooks[0]);
        });

        it("列表为空时返回 null", () => {
            expect(resolveTargetNotebook([])).toBeNull();
        });
    });

    describe("queryNotebookBlockIDs 分批检索笔记本块归属", () => {
        it("分批检索并收集所有返回的块 ID", async () => {
            const sqlExecutor = vi.fn().mockImplementation((sql: string) => {
                if (sql.includes("'b-1'")) {
                    return Promise.resolve([{ id: "b-1" }]);
                }
                return Promise.resolve([{ id: "b-2" }]);
            });

            // 构造超过 400 条块 ID 测试分批分片
            const ids = Array.from({ length: 450 }, (_, i) => `b-${i}`);
            const result = await queryNotebookBlockIDs("nb-test", ids, sqlExecutor);

            // 450 条按 400 分片应触发 2 次查询
            expect(sqlExecutor).toHaveBeenCalledTimes(2);
            expect(result.has("b-1")).toBe(true);
            expect(result.has("b-2")).toBe(true);
        });
    });

    describe("renderExamReportMarkdown 考试复盘正文渲染", () => {
        const basePlan: ExamPlan = {
            id: "plan-1",
            name: "软件设计师考前冲刺",
            examDate: "2026-11-15",
            scopeKind: "deck",
            scopeId: "deck-1",
            scopeName: "计算机基础",
            cramDays: 14,
            enabled: true,
            archived: false,
            createdAt: Date.now() - 3600000,
        };

        it("完整渲染计划元信息、范围、统计窗口与保持率", () => {
            const entries = [
                { cardID: "c1", deckID: "deck-1", blockID: "b1", rating: 3, ts: Date.now() - 1000, source: "plugin" as const },
                { cardID: "c2", deckID: "deck-1", blockID: "b2", rating: 1, ts: Date.now() - 500, source: "plugin" as const },
            ];

            const md = renderExamReportMarkdown({
                plan: basePlan,
                entries,
                inScopeFilter: e => e.deckID === "deck-1",
            });

            expect(md).toContain("# 考试复盘：软件设计师考前冲刺");
            expect(md).toContain("- 考试日期：2026-11-15");
            expect(md).toContain("- 范围：计算机基础");
            expect(md).toContain("- 窗口内复习：2 次 / 遗忘：1 次 / 保持率：50%");
            expect(md).toContain("- 计划 cram 设置：考前 14 天");
            expect(md).toContain("> 由小驴闪卡（内测版）生成");
        });

        it("处理笔记本范围特有口径提示", () => {
            const nbPlan: ExamPlan = {
                ...basePlan,
                scopeKind: "notebook",
                scopeName: "408专业课",
            };

            const md = renderExamReportMarkdown({
                plan: nbPlan,
                entries: [],
            });

            expect(md).toContain("- 口径：笔记本范围按来源块归属计算");
            expect(md).toContain("⚠️ 窗口内没有可核算的本地复习记录");
        });
    });

    describe("assembleWeeklyReportPayload 学习周报决策组装", () => {
        const mockRevlog: RevlogData = {
            entries: [
                { cardID: "c1", deckID: "d1", blockID: "b1", rating: 3, ts: Date.now() - 1000, source: "plugin" },
            ],
            days: {},
        };

        const mockI18n = {
            weeklyReport_title: "小驴闪卡每周复盘",
            weeklyReport_reviewed: "复习总数",
            weeklyReport_newCards: "新学卡片",
            weeklyReport_forgotten: "遗忘次数",
            weeklyReport_streak: "连续学习",
            weeklyReport_retention: "保持率",
            weeklyReport_unknown: "—",
            weeklyReport_lastWeek: "上周",
            weeklyReport_footer: "保持节奏，坚持就是胜利",
        };

        it("开关关闭或尚未到发报周时返回 shouldWrite: false", () => {
            const payload = assembleWeeklyReportPayload({
                now: new Date(2026, 9, 14), // 周三非发报日
                lastWeekKey: "2026-W41",
                enabled: false,
                revlog: mockRevlog,
                i18n: mockI18n,
            });

            expect(payload.shouldWrite).toBe(false);
        });

        it("满足条件触发周报时生成完整 Markdown 与文档标题", () => {
            // 构造周一发报触发点
            const mondayMorning = new Date(2026, 9, 12, 9, 0); // 2026-10-12 是周一
            const payload = assembleWeeklyReportPayload({
                now: mondayMorning,
                lastWeekKey: "2026-W40",
                enabled: true,
                revlog: mockRevlog,
                i18n: mockI18n,
            });

            expect(payload.shouldWrite).toBe(true);
            expect(payload.docTitle).toContain("小驴闪卡/学习周报/");
            expect(payload.markdown).toContain("小驴闪卡每周复盘");
            expect(payload.weekKey).toBeDefined();
        });
    });

    describe("renderDashboardReportMarkdown 主仪表盘报告渲染", () => {
        it("组装完整报告（包含到期、复习集、实测遗忘曲线与 AI 批次）", () => {
            const md = renderDashboardReportMarkdown({
                todayDateStr: "2026-10-15",
                dueCount: 28,
                newCount: 8,
                oldCount: 20,
                todayReview: 35,
                targetReview: 50,
                streak: 12,
                totalCards: 640,
                decks: [
                    { name: "前端体系", size: 320, updated: "2026-10-14" },
                    { name: "算法集训", size: 320, updated: "2026-10-15" },
                ],
                curve: [
                    { days: 1, rate: 0.95, n: 120 },
                    { days: 3, rate: 0.88, n: 80 },
                    { days: 7, rate: 0.76, n: 45 },
                ],
                aiQuality: [
                    { date: "2026-10-14", cards: 15, reviews: 12, rate: 0.83 },
                ],
                generatedAt: new Date(2026, 9, 15, 14, 30),
            });

            expect(md).toContain("# 小驴闪卡（内测版） · 学习报告（2026-10-15）");
            expect(md).toContain("- 今日到期：28（新 8 / 复习 20）");
            expect(md).toContain("- 今日已复习：35 / 目标 50");
            expect(md).toContain("- 连续天数：12");
            expect(md).toContain("## 保持曲线（实测）");
            expect(md).toContain("- 间隔 1 天：95%（n=120）");
            expect(md).toContain("## AI 批次质量");
            expect(md).toContain("- 2026-10-14：15 张 / 复习 12 / 83%");
        });

        it("无曲线与无 AI 批次时生成简洁版", () => {
            const md = renderDashboardReportMarkdown({
                todayDateStr: "2026-10-15",
                dueCount: 0,
                newCount: 0,
                oldCount: 0,
                todayReview: 0,
                targetReview: 0,
                streak: 0,
                totalCards: 0,
                decks: [],
            });

            expect(md).not.toContain("## 保持曲线（实测）");
            expect(md).not.toContain("## AI 批次质量");
        });
    });

    describe("computeWeekOverview 周历复习数据计算", () => {
        it("星期一至星期日严格输出 7 天，正确标记 past / today / future", () => {
            // 2026-10-14 是周三 (weekday index = 2)
            const wednesday = new Date(2026, 9, 14, 12, 0);
            const heat = [
                { date: "2026-10-12", stat: { review: 15, new: 5 } }, // 周一
                { date: "2026-10-13", stat: { review: 10, new: 0 } }, // 周二
                { date: "2026-10-14", stat: { review: 20, new: 2 } }, // 周三（今天）
            ];

            const result = computeWeekOverview({ heat, now: wednesday });

            expect(result.days).toHaveLength(7);
            // 周一 (index=0)
            expect(result.days[0].today).toBe(false);
            expect(result.days[0].future).toBe(false);
            expect(result.days[0].reviews).toBe(15);
            expect(result.days[0].active).toBe(true);

            // 周三 (index=2)
            expect(result.days[2].today).toBe(true);
            expect(result.days[2].future).toBe(false);
            expect(result.days[2].reviews).toBe(20);

            // 周四 (index=3)
            expect(result.days[3].today).toBe(false);
            expect(result.days[3].future).toBe(true);
            expect(result.days[3].active).toBe(false);

            // 聚合
            expect(result.activeDays).toBe(3);
            expect(result.reviews).toBe(45);
        });

        it("跨月周历计算边界（例如 2026-10-01 周四，周一应落在 2026-09-28）", () => {
            const oct1 = new Date(2026, 9, 1, 10, 0); // 10月1日周四
            const result = computeWeekOverview({ heat: [], now: oct1 });

            expect(result.days[0].date.getMonth()).toBe(8); // 9月
            expect(result.days[0].date.getDate()).toBe(28); // 9月28日周一
            expect(result.days[3].date.getMonth()).toBe(9); // 10月
            expect(result.days[3].date.getDate()).toBe(1); // 10月1日周四
        });
    });

    describe("computeCurveSvgPaths SVG 曲线计算", () => {
        it("空数据点返回空字符串", () => {
            expect(computeCurveSvgPaths([])).toEqual({ empirical: "", theoretical: "" });
        });

        it("按 maxD 等比缩放计算实测与理论折线坐标", () => {
            const pts = [
                { days: 0, rate: 1 },
                { days: 5, rate: 0.5 },
            ];
            const paths = computeCurveSvgPaths(pts, { xMin: 10, xSpan: 290, yBase: 90, yAmp: 80 });

            expect(paths.empirical).toContain("10,10"); // x=10+0, y=90-80
            expect(paths.empirical).toContain("300,50"); // x=10+290, y=90-40
            expect(paths.theoretical).toBeDefined();
        });
    });
});
