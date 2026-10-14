import { describe, expect, it, vi } from "vitest";
import { registerPluginCommands, REGISTERED_COMMAND_KEYS, type CommandHost } from "../src/bootstrap/commands";

describe("registerPluginCommands 命令注册", () => {
    it("正确注册全部 13 个命令且无遗漏", () => {
        const registered: any[] = [];
        const mockHost: CommandHost = {
            addCommand: vi.fn(cmd => registered.push(cmd)),
            i18n: {
                cmdOpenDashboard: "打开闪卡中心",
                cmdStartReview: "开始复习",
                cmdQuickCard: "快速制卡",
                cmdDrill: "修卡演练",
                cmdPalette: "命令面板",
                cmdOpenExam: "考试计划",
                cmdCramNew: "仅复习新卡",
                cmdDiagnostics: "复制诊断信息",
                cmdChallenge: "限时挑战",
                cmdMarkerCards: "标记制卡",
                cmdPairing: "配对练习",
                cmdOpenHelp: "帮助文档",
                cmdSampleWorkspace: "生成示例工作区",
            },
            openDashboard: vi.fn(),
            openReview: vi.fn(),
            openQuickCard: vi.fn(),
            openRepairDrill: vi.fn(),
            openPalette: vi.fn(),
            copyDiagnostics: vi.fn().mockResolvedValue(undefined),
            openChallenge: vi.fn().mockResolvedValue(undefined),
            openMarkerCards: vi.fn(),
            openPairing: vi.fn().mockResolvedValue(undefined),
            openHelpDoc: vi.fn(),
            createSampleWorkspace: vi.fn().mockResolvedValue(undefined),
        };

        registerPluginCommands(mockHost);

        expect(mockHost.addCommand).toHaveBeenCalledTimes(13);
        const keys = registered.map(c => c.langKey);
        expect(keys).toEqual([...REGISTERED_COMMAND_KEYS]);

        // 验证特定快捷键绑定（Ctrl+K）
        const paletteCmd = registered.find(c => c.langKey === "palette");
        expect(paletteCmd?.hotkey).toBe("Ctrl+K");

        // 验证各回调的准确路由
        const openExamCmd = registered.find(c => c.langKey === "openExam");
        openExamCmd?.callback();
        expect(mockHost.openDashboard).toHaveBeenCalledWith("exam");

        const cramNewCmd = registered.find(c => c.langKey === "cramNew");
        cramNewCmd?.callback();
        expect(mockHost.openReview).toHaveBeenCalledWith({ scope: "new" });

        const quickCardCmd = registered.find(c => c.langKey === "quickCard");
        quickCardCmd?.callback();
        expect(mockHost.openQuickCard).toHaveBeenCalledTimes(1);
    });
});
