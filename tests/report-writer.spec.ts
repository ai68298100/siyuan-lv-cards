import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    assembleWeeklyReportPayload,
    queryNotebookBlockIDs,
    renderExamReportMarkdown,
    resolveTargetNotebook,
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
});
