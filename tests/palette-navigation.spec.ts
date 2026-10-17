import { describe, expect, it } from "vitest";
import {
    buildReviewScopeKey,
    computePaletteCommands,
    parseReturnPoint,
} from "../src/core/palette-navigation";

describe("palette-navigation 命令面板与回源路由引擎", () => {
    describe("computePaletteCommands 命令列表计算", () => {
        const mockI18n = {
            dashboard: { openReview: "开始复习" },
            aiWizardTitle: "AI 制卡向导",
            cmdQuickCard: "快速制卡",
            drillTitle: "修卡演练",
            settingsTitle: "设置",
            hubTabOverview: "总览",
            hubTabManage: "管理",
            hubTabAuthoring: "制卡",
            hubTabGoals: "目标",
            hubTabInbox: "材料",
            hubTabExam: "考试",
            hubTabMaintenance: "维护",
            cmdPairing: "配对挑战",
            cmdCramNew: "考前冲刺",
        };

        it("高级模式且各模块开启时输出全量指令", () => {
            const commands = computePaletteCommands({
                modules: { inbox: true, exam: true },
                uiMode: "advanced",
                i18n: mockI18n,
            });

            const ids = commands.map(c => c.id);
            expect(ids).toContain("review");
            expect(ids).toContain("wizard");
            expect(ids).toContain("quick");
            expect(ids).toContain("pairing");
            expect(ids).toContain("drill");
            expect(ids).toContain("settings");
            expect(ids).toContain("overview");
            expect(ids).toContain("manage");
            expect(ids).toContain("authoring");
            expect(ids).toContain("goals");
            expect(ids).toContain("inbox");
            expect(ids).toContain("cram");
            expect(ids).toContain("exam");
            expect(ids).toContain("maintenance");
        });

        it("简易模式（simple）下自动隐藏考试与维护高级入口", () => {
            const commands = computePaletteCommands({
                modules: { inbox: true, exam: true },
                uiMode: "simple",
                i18n: mockI18n,
            });

            const ids = commands.map(c => c.id);
            expect(ids).toContain("inbox");
            expect(ids).toContain("pairing");
            expect(ids).not.toContain("exam");
            expect(ids).not.toContain("cram");
            expect(ids).not.toContain("maintenance");
        });

        it("收件箱关闭时隐藏 inbox 指令", () => {
            const commands = computePaletteCommands({
                modules: { inbox: false, exam: false },
                uiMode: "advanced",
                i18n: mockI18n,
            });

            const ids = commands.map(c => c.id);
            expect(ids).not.toContain("inbox");
            expect(ids).not.toContain("exam");
            expect(ids).toContain("maintenance");
        });
    });

    describe("buildReviewScopeKey 范围键生成", () => {
        it("all 范围直接输出 all", () => {
            expect(buildReviewScopeKey("all", "")).toBe("all");
            expect(buildReviewScopeKey("all", "any")).toBe("all");
        });

        it("deck 与 notebook 输出前缀+ID 形式", () => {
            expect(buildReviewScopeKey("deck", "deck-123")).toBe("deck:deck-123");
            expect(buildReviewScopeKey("notebook", "nb-456")).toBe("notebook:nb-456");
        });
    });

    describe("parseReturnPoint 入口返回点解析", () => {
        it("正确解析 doc 目标文档", () => {
            const target = parseReturnPoint("doc:20261014-doc-id");
            expect(target).toEqual({ type: "doc", docId: "20261014-doc-id" });
        });

        it("正确解析 hub 目标页签", () => {
            const target = parseReturnPoint("hub:exam");
            expect(target).toEqual({ type: "hub", tab: "exam" });
        });

        it("非标准返回点识别为 unknown", () => {
            expect(parseReturnPoint("custom:anchor")).toEqual({ type: "unknown", raw: "custom:anchor" });
            expect(parseReturnPoint("")).toEqual({ type: "unknown", raw: "" });
            expect(parseReturnPoint(null as any)).toEqual({ type: "unknown", raw: "" });
        });
    });
});
