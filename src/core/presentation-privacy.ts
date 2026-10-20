/**
 * BX-6 临时演示与投屏的私密展示模式引擎（Presentation Privacy Mode Engine）
 *
 * 核心目标：
 * 按用户选择临时遮蔽界面的个人信息、来源路径、文档标题、卡包名、绝对日期、
 * 缩略图多媒体以及旁路通知，防止在录屏、课堂投屏、公开演示或会议共享时泄露隐私。
 *
 * 严格契约：
 * 1. 纯展示层运行时过滤，绝对不修改任何底层的思源块、闪卡属性或持久化数据。
 * 2. 随时支持一键即时退出与状态预览，恢复无痕。
 * 3. 读屏无障碍文本与插件通知同样遵守遮蔽策略。
 */

export interface PresentationPrivacyOptions {
    readonly maskSourcePaths: boolean; // 遮蔽文档来源层级路径
    readonly maskTargetNames: boolean; // 遮蔽卡包名/目标名
    readonly maskDates: boolean; // 遮蔽绝对日期时间
    readonly maskThumbnails: boolean; // 遮蔽图片缩略图及多媒体预览
    readonly maskUserNames: boolean; // 遮蔽用户名与账号信息
    readonly maskBlockIds: boolean; // 遮蔽思源底层块 ID
    readonly suppressNotifications: boolean; // 临时抑制非致命旁路通知
}

export type PresentationProfile = "screen-sharing" | "recording" | "teaching" | "custom";

export interface PresentationPrivacyState {
    readonly enabled: boolean;
    readonly profile: PresentationProfile;
    readonly startedAt: number | null;
    readonly options: PresentationPrivacyOptions;
}

// 默认预设配置
export const PRESENTATION_PRESETS: Readonly<Record<Exclude<PresentationProfile, "custom">, PresentationPrivacyOptions>> = {
    // 投屏模式：全量严格遮蔽
    "screen-sharing": {
        maskSourcePaths: true,
        maskTargetNames: true,
        maskDates: true,
        maskThumbnails: true,
        maskUserNames: true,
        maskBlockIds: true,
        suppressNotifications: true,
    },
    // 录屏制作模式：遮蔽路径、日期、块 ID 与通知，保留卡包名与多媒体
    recording: {
        maskSourcePaths: true,
        maskTargetNames: false,
        maskDates: true,
        maskThumbnails: false,
        maskUserNames: true,
        maskBlockIds: true,
        suppressNotifications: true,
    },
    // 课堂教学模式：遮蔽个人用户名、深层私密路径，保留卡包与日期
    teaching: {
        maskSourcePaths: true,
        maskTargetNames: false,
        maskDates: false,
        maskThumbnails: false,
        maskUserNames: true,
        maskBlockIds: true,
        suppressNotifications: false,
    },
};

export const DEFAULT_PRESENTATION_STATE: PresentationPrivacyState = {
    enabled: false,
    profile: "screen-sharing",
    startedAt: null,
    options: PRESENTATION_PRESETS["screen-sharing"],
};

/**
 * 遮蔽文本中的块 ID（例如 20230512143000-abcdefg -> 20230512... [ID]）
 */
export function maskBlockId(blockId: string): string {
    if (!blockId) return "";
    const trimmed = blockId.trim();
    if (trimmed.length <= 8) return "••••••••";
    return `${trimmed.slice(0, 8)}... [ID]`;
}

/**
 * 遮蔽来源笔记路径（例如 "工作笔记/2026计划/项目A/文档.sy" -> "•••/文档"）
 */
export function maskSourcePath(path: string): string {
    if (!path) return "";
    const normalized = path.replace(/\\/g, "/");
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length <= 1) {
        return "••• [私密来源]";
    }
    const last = segments[segments.length - 1];
    return `••• / ${last}`;
}

/**
 * 遮蔽文档标题或卡组/目标名称
 */
export function maskTargetName(name: string): string {
    if (!name) return "";
    const trimmed = name.trim();
    if (trimmed.length <= 2) return "••";
    // 保留首末字符，中间遮蔽
    return `${trimmed[0]}•••${trimmed[trimmed.length - 1]}`;
}

/**
 * 遮蔽绝对日期时间（例如 "2026-10-20 18:30:00" -> "••••-••-••"）
 */
export function maskDateString(dateStr: string): string {
    if (!dateStr) return "";
    // 将四位年份和两位月份/日期转为点或遮罩
    return dateStr.replace(/\d{4}-\d{2}-\d{2}/g, "••••-••-••").replace(/\d{2}:\d{2}(?::\d{2})?/g, "••:••");
}

/**
 * 遮蔽用户名或邮箱
 */
export function maskUserName(userName: string): string {
    if (!userName) return "";
    if (userName.includes("@")) {
        const parts = userName.split("@");
        const namePart = parts[0];
        const masked = namePart.length > 2 ? `${namePart.slice(0, 2)}***` : `${namePart[0]}***`;
        return `${masked}@${parts[1]}`;
    }
    if (userName.length <= 2) return "用户••";
    return `${userName[0]}•••${userName[userName.length - 1]}`;
}

/**
 * 状态管理器工厂函数
 */
export function createPresentationPrivacyController(
    initialState: PresentationPrivacyState = DEFAULT_PRESENTATION_STATE,
    onChange?: (state: PresentationPrivacyState) => void
) {
    let current = { ...initialState };

    const getState = (): PresentationPrivacyState => current;

    const enter = (profile: PresentationProfile = "screen-sharing", customOptions?: Partial<PresentationPrivacyOptions>) => {
        const baseOptions = profile === "custom"
            ? (customOptions ? { ...PRESENTATION_PRESETS["screen-sharing"], ...customOptions } : current.options)
            : PRESENTATION_PRESETS[profile];

        current = {
            enabled: true,
            profile,
            startedAt: Date.now(),
            options: customOptions ? { ...baseOptions, ...customOptions } : baseOptions,
        };
        onChange?.(current);
        return current;
    };

    const exit = () => {
        current = {
            ...current,
            enabled: false,
            startedAt: null,
        };
        onChange?.(current);
        return current;
    };

    const updateOptions = (patch: Partial<PresentationPrivacyOptions>) => {
        current = {
            ...current,
            options: {
                ...current.options,
                ...patch,
            },
        };
        onChange?.(current);
        return current;
    };

    /**
     * 包装器：按当前私密模式状态智能遮蔽来源路径
     */
    const filterSourcePath = (rawPath: string): string => {
        if (!current.enabled || !current.options.maskSourcePaths) return rawPath;
        return maskSourcePath(rawPath);
    };

    /**
     * 包装器：按当前私密模式状态智能遮蔽卡组或目标名称
     */
    const filterTargetName = (rawName: string): string => {
        if (!current.enabled || !current.options.maskTargetNames) return rawName;
        return maskTargetName(rawName);
    };

    /**
     * 包装器：按当前私密模式状态智能遮蔽日期时间
     */
    const filterDate = (rawDate: string): string => {
        if (!current.enabled || !current.options.maskDates) return rawDate;
        return maskDateString(rawDate);
    };

    /**
     * 包装器：按当前私密模式状态智能遮蔽思源块 ID
     */
    const filterBlockId = (rawId: string): string => {
        if (!current.enabled || !current.options.maskBlockIds) return rawId;
        return maskBlockId(rawId);
    };

    /**
     * 包装器：按当前私密模式状态智能遮蔽用户名
     */
    const filterUserName = (rawUser: string): string => {
        if (!current.enabled || !current.options.maskUserNames) return rawUser;
        return maskUserName(rawUser);
    };

    /**
     * 检查多媒体缩略图是否应被遮蔽
     */
    const shouldMaskThumbnail = (): boolean => {
        return current.enabled && current.options.maskThumbnails;
    };

    /**
     * 检查非致命通知是否应被抑制
     */
    const shouldSuppressNotification = (): boolean => {
        return current.enabled && current.options.suppressNotifications;
    };

    return {
        getState,
        enter,
        exit,
        updateOptions,
        filterSourcePath,
        filterTargetName,
        filterDate,
        filterBlockId,
        filterUserName,
        shouldMaskThumbnail,
        shouldSuppressNotification,
    };
}
