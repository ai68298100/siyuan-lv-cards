/**
 * 插件快捷命令集中注册模块（CommandRegistry）
 * 统筹思源命令面板、快捷键（如 Ctrl+K 命令面板直达）以及动作入口，
 * 与具体的 Plugin 实例生命周期解耦，便于单测与跨端环境复核。
 */

export interface CommandHost {
    addCommand(options: {
        langKey: string;
        langText: string;
        hotkey: string;
        callback: () => void | Promise<void>;
    }): void;
    i18n: Record<string, any>;
    openDashboard: (tab?: string) => void;
    openReview: (options?: { scope?: string }) => void;
    openQuickCard: () => void;
    openRepairDrill: () => void;
    openPalette: () => void;
    copyDiagnostics: () => Promise<void>;
    openChallenge: () => Promise<void>;
    openMarkerCards: () => void;
    openPairing: () => Promise<void>;
    openHelpDoc: () => void;
    createSampleWorkspace: () => Promise<void>;
}

export const REGISTERED_COMMAND_KEYS = [
    "openDashboard",
    "startReview",
    "quickCard",
    "drill",
    "palette",
    "openExam",
    "cramNew",
    "diagnostics",
    "challenge",
    "markerCards",
    "pairing",
    "openHelp",
    "sampleWorkspace",
] as const;

export type RegisteredCommandKey = typeof REGISTERED_COMMAND_KEYS[number];

/**
 * 注册小驴闪卡所有命令面板入口与快捷键
 */
export function registerPluginCommands(host: CommandHost): void {
    host.addCommand({
        langKey: "openDashboard",
        langText: host.i18n.cmdOpenDashboard,
        hotkey: "",
        callback: () => host.openDashboard(),
    });
    host.addCommand({
        langKey: "startReview",
        langText: host.i18n.cmdStartReview,
        hotkey: "",
        callback: () => host.openReview(),
    });
    host.addCommand({
        langKey: "quickCard",
        langText: host.i18n.cmdQuickCard,
        hotkey: "",
        callback: () => host.openQuickCard(),
    });
    // T10 修卡演练（docs/13 §12）：独立样例入口
    host.addCommand({
        langKey: "drill",
        langText: host.i18n.cmdDrill,
        hotkey: "",
        callback: () => host.openRepairDrill(),
    });
    // T13 ⌘K 命令面板（docs/41 P0 · docs/42 §3.10）：动作+导航键盘直达
    host.addCommand({
        langKey: "palette",
        langText: host.i18n.cmdPalette,
        hotkey: "Ctrl+K",
        callback: () => host.openPalette(),
    });
    host.addCommand({
        langKey: "openExam",
        langText: host.i18n.cmdOpenExam,
        hotkey: "",
        callback: () => host.openDashboard("exam"),
    });
    host.addCommand({
        langKey: "cramNew",
        langText: host.i18n.cmdCramNew,
        hotkey: "",
        callback: () => host.openReview({ scope: "new" }),
    });
    host.addCommand({
        langKey: "diagnostics",
        langText: host.i18n.cmdDiagnostics,
        hotkey: "",
        callback: () => host.copyDiagnostics(),
    });
    host.addCommand({
        langKey: "challenge",
        langText: host.i18n.cmdChallenge,
        hotkey: "",
        callback: () => host.openChallenge(),
    });
    host.addCommand({
        langKey: "markerCards",
        langText: host.i18n.cmdMarkerCards,
        hotkey: "",
        callback: () => host.openMarkerCards(),
    });
    host.addCommand({
        langKey: "pairing",
        langText: host.i18n.cmdPairing,
        hotkey: "",
        callback: () => host.openPairing(),
    });
    host.addCommand({
        langKey: "openHelp",
        langText: host.i18n.cmdOpenHelp,
        hotkey: "",
        callback: () => host.openHelpDoc(),
    });
    host.addCommand({
        langKey: "sampleWorkspace",
        langText: host.i18n.cmdSampleWorkspace,
        hotkey: "",
        callback: () => host.createSampleWorkspace(),
    });
}
