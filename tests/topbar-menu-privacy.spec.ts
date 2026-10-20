import { describe, expect, it, vi } from "vitest";
import { computeTopbarMenuItems } from "../src/bootstrap/topbar-menu";
import { registerPluginCommands } from "../src/bootstrap/commands";
import { createPresentationPrivacyController } from "../src/core/presentation-privacy";
import zhJson from "../public/i18n/zh-CN.json";
import enJson from "../public/i18n/en.json";

describe("Topbar Menu & Commands - Presentation Privacy Integration", () => {
    const baseConfig = {
        modules: { stats: true, review: true, manager: true, create: true },
        i18n: zhJson,
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

    it("未提供 togglePresentationPrivacy 时不生成演示私密模式菜单项（向后兼容）", () => {
        const items = computeTopbarMenuItems(baseConfig);
        const privacyItem = items.find((i) => i.id === "presentation-privacy");
        expect(privacyItem).toBeUndefined();
    });

    it("未启用私密模式时，生成正确的未激活菜单项与 iconEye 图标", () => {
        const toggleMock = vi.fn();
        const items = computeTopbarMenuItems({
            ...baseConfig,
            presentationPrivacy: { enabled: false },
            actions: {
                ...baseConfig.actions,
                togglePresentationPrivacy: toggleMock,
            },
        });

        const privacyItem = items.find((i) => i.id === "presentation-privacy");
        expect(privacyItem).toBeDefined();
        expect(privacyItem?.icon).toBe("iconEye");
        expect(privacyItem?.label).toBe("演示私密模式");

        privacyItem?.click?.();
        expect(toggleMock).toHaveBeenCalledTimes(1);
    });

    it("已启用私密模式时，展示已开启提示与 iconEyeoff 图标", () => {
        const toggleMock = vi.fn();
        const items = computeTopbarMenuItems({
            ...baseConfig,
            presentationPrivacy: { enabled: true, profile: "screen-sharing" },
            actions: {
                ...baseConfig.actions,
                togglePresentationPrivacy: toggleMock,
            },
        });

        const privacyItem = items.find((i) => i.id === "presentation-privacy");
        expect(privacyItem).toBeDefined();
        expect(privacyItem?.icon).toBe("iconEyeoff");
        expect(privacyItem?.label).toBe("演示私密模式（已开启）");

        privacyItem?.click?.();
        expect(toggleMock).toHaveBeenCalledTimes(1);
    });

    it("英文语言环境下正确展示英文文案", () => {
        const items = computeTopbarMenuItems({
            ...baseConfig,
            i18n: enJson,
            presentationPrivacy: { enabled: true },
            actions: {
                ...baseConfig.actions,
                togglePresentationPrivacy: vi.fn(),
            },
        });

        const privacyItem = items.find((i) => i.id === "presentation-privacy");
        expect(privacyItem?.label).toBe("Presentation Privacy (Active)");
    });

    it("在 registerPluginCommands 中成功注册演示私密模式快捷命令", () => {
        const addCommandMock = vi.fn();
        const toggleMock = vi.fn();

        const host = {
            addCommand: addCommandMock,
            i18n: zhJson,
            openDashboard: vi.fn(),
            openReview: vi.fn(),
            openQuickCard: vi.fn(),
            openRepairDrill: vi.fn(),
            openPalette: vi.fn(),
            copyDiagnostics: vi.fn(),
            openChallenge: vi.fn(),
            openMarkerCards: vi.fn(),
            openPairing: vi.fn(),
            openHelpDoc: vi.fn(),
            createSampleWorkspace: vi.fn(),
            togglePresentationPrivacy: toggleMock,
        };

        registerPluginCommands(host);

        const call = addCommandMock.mock.calls.find((c) => c[0].langKey === "presentationPrivacy");
        expect(call).toBeDefined();
        expect(call[0].langText).toBe("演示私密模式");

        call[0].callback();
        expect(toggleMock).toHaveBeenCalledTimes(1);
    });

    it("全链路状态机模拟：点击菜单切换进入和退出演示模式，脱敏过滤器表现正确且不影响原数据", () => {
        const controller = createPresentationPrivacyController();
        expect(controller.getState().enabled).toBe(false);

        // 模拟未开启时的菜单项与展示
        const unmaskedPath = "工作区/机密课题/医学神经解剖.sy";
        expect(controller.filterSourcePath(unmaskedPath)).toBe(unmaskedPath);

        // 模拟菜单点击切换 -> enter
        controller.enter("screen-sharing");
        expect(controller.getState().enabled).toBe(true);

        // 验证脱敏生效
        expect(controller.filterSourcePath(unmaskedPath)).toBe("••• / 医学神经解剖.sy");
        expect(controller.filterBlockId("20261020183000-abcdefg")).toBe("20261020... [ID]");
        expect(controller.filterTargetName("机密考题卡组")).toBe("机•••组");

        // 模拟再次点击切换 -> exit
        controller.exit();
        expect(controller.getState().enabled).toBe(false);

        // 验证完全恢复
        expect(controller.filterSourcePath(unmaskedPath)).toBe(unmaskedPath);
        expect(controller.filterBlockId("20261020183000-abcdefg")).toBe("20261020183000-abcdefg");
    });
});
