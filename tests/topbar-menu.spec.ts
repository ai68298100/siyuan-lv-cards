import { describe, expect, it, vi } from "vitest";
import {
    computeTopbarMenuItems,
    showPluginTopbarMenu,
    type TopbarMenuConfig,
} from "../src/bootstrap/topbar-menu";
import { PLUGIN_MENU_ICON_CLASS } from "../src/bootstrap/block-menu";

vi.mock("siyuan", () => {
    class MockMenu {
        id: string;
        items: any[] = [];
        separators = 0;
        openCoord: any = null;
        constructor(id: string) {
            this.id = id;
        }
        addSeparator() {
            this.separators++;
        }
        addItem(item: any) {
            this.items.push(item);
        }
        open(coord: any) {
            this.openCoord = coord;
        }
    }
    return { Menu: MockMenu };
});

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

    it("showPluginTopbarMenu ensures all menu items pass iconClass containment (#12/#13)", () => {
        const menu = showPluginTopbarMenu(baseConfig, { clientX: 200, clientY: 80 }) as any;

        expect(menu.id).toBe("lvCardsMenu");
        expect(menu.openCoord).toEqual({ x: 200, y: 80 });
        expect(menu.items.length).toBeGreaterThan(0);

        for (const item of menu.items) {
            expect(item.iconClass).toBe(PLUGIN_MENU_ICON_CLASS);
            expect(item.iconClass).toBe("lv-cards-menu-icon");
        }

        const v2Item = menu.items.find((i: any) => i.type === "readonly");
        expect(v2Item).toBeTruthy();
        expect(v2Item.iconClass).toBe(PLUGIN_MENU_ICON_CLASS);
    });
});
