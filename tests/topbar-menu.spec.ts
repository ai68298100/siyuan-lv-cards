import { describe, expect, it, vi } from "vitest";
import { computeTopbarMenuItems, type TopbarMenuConfig } from "../src/bootstrap/topbar-menu";

describe("computeTopbarMenuItems 顶栏菜单计算", () => {
    const baseConfig: TopbarMenuConfig = {
        v2State: "Active",
        modules: {
            stats: true,
            review: true,
            manager: true,
            create: true,
        },
        i18n: {
            menuDashboard: "闪卡中心",
            menuReview: "专注复习",
            menuManager: "卡库管理",
            menuQuickCard: "快速制卡",
            menuOnboarding: "新手引导",
            menuAICard: "AI 制卡向导",
            menuSettings: "插件设置",
        },
        actions: {
            openDashboard: vi.fn(),
            openReview: vi.fn(),
            openManager: vi.fn(),
            openQuickCard: vi.fn(),
            openOnboarding: vi.fn(),
            openAIWizard: vi.fn(),
            openSettingsDialog: vi.fn(),
        },
    };

    it("包含 V2 状态项、各启用模块、分隔符与通用操作", () => {
        const items = computeTopbarMenuItems(baseConfig);
        const ids = items.map(i => i.id);

        expect(ids).toEqual([
            "v2-badge",
            "stats",
            "review",
            "manager",
            "sep-1",
            "quick-card",
            "onboarding",
            "ai-card",
            "settings",
        ]);

        const v2Item = items.find(i => i.id === "v2-badge");
        expect(v2Item?.type).toBe("readonly");
        expect(v2Item?.label).toContain("Flashcard V2 · Active");
    });

    it("模块关闭与无 V2 状态时，正确隐藏对应菜单项", () => {
        const partialConfig: TopbarMenuConfig = {
            ...baseConfig,
            v2State: null,
            modules: {
                stats: false,
                review: true,
                manager: false,
                create: false,
            },
        };
        const items = computeTopbarMenuItems(partialConfig);
        const ids = items.map(i => i.id);

        expect(ids).not.toContain("v2-badge");
        expect(ids).not.toContain("stats");
        expect(ids).toContain("review");
        expect(ids).not.toContain("manager");
        expect(ids).not.toContain("ai-card");
        expect(ids).toContain("settings");
    });

    it("菜单项点击回调正确绑定", () => {
        const items = computeTopbarMenuItems(baseConfig);
        const quickCardItem = items.find(i => i.id === "quick-card");
        quickCardItem?.click?.();
        expect(baseConfig.actions.openQuickCard).toHaveBeenCalledTimes(1);

        const settingsItem = items.find(i => i.id === "settings");
        settingsItem?.click?.();
        expect(baseConfig.actions.openSettingsDialog).toHaveBeenCalledTimes(1);
    });
});
