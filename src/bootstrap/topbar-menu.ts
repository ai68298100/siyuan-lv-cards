/**
 * 顶栏右键功能菜单构建模块（TopbarMenu）
 * 集中管理各模块开关条件过滤、V2 迁移状态呈现与点击动作分发，
 * 采用数据描述符与 Menu 实例分离模式，便于单元测试脱机验证。
 */

import { Menu } from "siyuan";

export interface TopbarMenuItemDescriptor {
    id: string;
    icon?: string;
    label?: string;
    type?: "readonly" | "separator";
    click?: () => void;
}

export interface TopbarMenuConfig {
    v2State?: string | null;
    modules: {
        stats?: boolean;
        review?: boolean;
        manager?: boolean;
        create?: boolean;
    };
    i18n: Record<string, any>;
    actions: {
        openDashboard: () => void;
        openReview: () => void;
        openManager: () => void;
        openQuickCard: () => void;
        openOnboarding: () => void;
        openAIWizard: () => void;
        openSettingsDialog: () => void;
    };
}

/**
 * 计算顶栏菜单应包含的菜单项列表（纯逻辑计算）
 */
export function computeTopbarMenuItems(config: TopbarMenuConfig): TopbarMenuItemDescriptor[] {
    const items: TopbarMenuItemDescriptor[] = [];

    if (config.v2State) {
        items.push({
            id: "v2-badge",
            icon: "iconLvCards",
            label: `Flashcard V2 · ${config.v2State}`,
            type: "readonly",
        });
    }

    if (config.modules.stats) {
        items.push({
            id: "stats",
            icon: "iconLvCards",
            label: config.i18n.menuDashboard,
            click: config.actions.openDashboard,
        });
    }

    if (config.modules.review) {
        items.push({
            id: "review",
            icon: "iconLvCards",
            label: config.i18n.menuReview,
            click: config.actions.openReview,
        });
    }

    if (config.modules.manager) {
        items.push({
            id: "manager",
            icon: "iconLvCards",
            label: config.i18n.menuManager,
            click: config.actions.openManager,
        });
    }

    items.push({ id: "sep-1", type: "separator" });

    items.push({
        id: "quick-card",
        icon: "iconLvCards",
        label: config.i18n.menuQuickCard,
        click: config.actions.openQuickCard,
    });

    items.push({
        id: "onboarding",
        icon: "iconLvCards",
        label: config.i18n.menuOnboarding,
        click: config.actions.openOnboarding,
    });

    if (config.modules.create) {
        items.push({
            id: "ai-card",
            icon: "iconLvCards",
            label: config.i18n.menuAICard,
            click: config.actions.openAIWizard,
        });
    }

    items.push({
        id: "settings",
        icon: "iconSettings",
        label: config.i18n.menuSettings,
        click: config.actions.openSettingsDialog,
    });

    return items;
}

/**
 * 组装并打开顶栏菜单
 */
export function showPluginTopbarMenu(
    config: TopbarMenuConfig,
    evt: { clientX?: number; clientY?: number },
): Menu {
    const menu = new Menu("lvCardsMenu");
    const items = computeTopbarMenuItems(config);

    for (const item of items) {
        if (item.type === "separator") {
            menu.addSeparator();
        } else if (item.type === "readonly") {
            menu.addItem({
                icon: item.icon ?? "iconLvCards",
                label: item.label ?? "",
                type: "readonly",
            });
        } else {
            menu.addItem({
                icon: item.icon ?? "iconLvCards",
                label: item.label ?? "",
                click: item.click,
            });
        }
    }

    const x = evt.clientX || (typeof window !== "undefined" ? window.innerWidth - 60 : 100);
    const y = evt.clientY || 48;
    menu.open({ x, y });
    return menu;
}
