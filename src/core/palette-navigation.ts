/**
 * ⌘K 命令面板指令集与复习入口回源导航引擎（Palette & Navigation Routing）
 * 集中管理命令面板的动态可用项过滤（根据模块开关与简易/高级模式）、
 * 复习范围键值生成与上下文返回点（doc/hub）解析路由。
 */

import type { PaletteCommand } from "./palette";

export interface PaletteCommandConfig {
    modules: {
        inbox?: boolean;
        exam?: boolean;
    };
    uiMode?: "simple" | "advanced";
    i18n: Record<string, any>;
}

/**
 * 计算当前环境下命令面板应呈现的动作与导航项
 */
export function computePaletteCommands(config: PaletteCommandConfig): PaletteCommand[] {
    const { modules, uiMode, i18n } = config;
    const isAdvanced = uiMode !== "simple";

    const commands: PaletteCommand[] = [
        { id: "review", group: "actions", label: (i18n as any).dashboard?.openReview ?? i18n.menuReview ?? "开始复习" },
        { id: "wizard", group: "actions", label: i18n.aiWizardTitle ?? "AI 制卡向导" },
        { id: "quick", group: "actions", label: i18n.cmdQuickCard ?? "快速制卡" },
        { id: "pairing", group: "actions", label: i18n.cmdPairing ?? "配对挑战" },
        { id: "drill", group: "actions", label: i18n.drillTitle ?? "修卡演练" },
        { id: "settings", group: "actions", label: i18n.settingsTitle ?? "设置" },
        { id: "overview", group: "nav", label: i18n.hubTabOverview ?? "总览" },
        { id: "manage", group: "nav", label: i18n.hubTabManage ?? "管理" },
        { id: "authoring", group: "nav", label: i18n.hubTabAuthoring ?? "制卡" },
        { id: "goals", group: "nav", label: i18n.hubTabGoals ?? "目标" },
    ];

    if (modules.inbox) {
        commands.push({ id: "inbox", group: "nav", label: i18n.hubTabInbox ?? "材料" });
    }

    if (modules.exam && isAdvanced) {
        commands.push({ id: "cram", group: "actions", label: (i18n as any).exam?.cramOn ?? i18n.cmdCramNew ?? "考前冲刺" });
        commands.push({ id: "exam", group: "nav", label: i18n.hubTabExam ?? "考试" });
    }

    if (isAdvanced) {
        commands.push({ id: "maintenance", group: "nav", label: i18n.hubTabMaintenance ?? "维护" });
    }

    return commands;
}

/**
 * 组装复习范围键名
 */
export function buildReviewScopeKey(scopeKind: "all" | "deck" | "notebook", scopeId: string): string {
    return scopeKind === "all" ? "all" : `${scopeKind}:${scopeId}`;
}

export type ReturnTarget =
    | { type: "doc"; docId: string }
    | { type: "hub"; tab: string }
    | { type: "unknown"; raw: string };

/**
 * 解析会话入口返回点字符串（形如 doc:<id> 或 hub:<tab>）
 */
export function parseReturnPoint(returnPoint: string): ReturnTarget {
    if (typeof returnPoint !== "string") {
        return { type: "unknown", raw: "" };
    }
    if (returnPoint.startsWith("doc:")) {
        return { type: "doc", docId: returnPoint.slice(4) };
    }
    if (returnPoint.startsWith("hub:")) {
        return { type: "hub", tab: returnPoint.slice(4) };
    }
    return { type: "unknown", raw: returnPoint };
}
