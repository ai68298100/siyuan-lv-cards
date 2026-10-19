/**
 * BL-13 跨端能力降级矩阵与设备环境契约引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 跨平台多维度环境感知：平台（桌面/移动/平板/Web）、输入模式（触控/物理键盘/鼠标）、网络、屏幕宽度；
 * 2. 绝不出现假按钮：不可用或无法执行的功能坚决隐藏或显式声明降级替代，不给用户呈现点了没反应的伪控件；
 * 3. 核心复习永不阻塞：无论在何种极端设备环境（如离线纯触控手机），核心抗遗忘复习必须 100% 顺畅闭环；
 * 4. 纯函数设计，数据不可变隔离。
 */

export type PlatformType = "desktop" | "mobile" | "tablet" | "web";
export type InputMethodType = "touch-only" | "keyboard-mouse" | "hybrid";
export type ScreenClass = "phone-narrow" | "tablet-medium" | "desktop-wide";
export type NetworkStatus = "online" | "offline";

/** 目标能力标识 */
export const CAPABILITY_FEATURE_IDS = [
    "keyboard-shortcuts-rating",
    "touch-gesture-swiping",
    "occlusion-interactive-drawing",
    "ai-cloud-generation",
    "local-file-package-io",
    "audio-recording-pronounce",
    "wide-table-horizontal-drill",
] as const;

export type CapabilityFeatureId = (typeof CAPABILITY_FEATURE_IDS)[number];

export type CapabilitySupportLevel =
    | "fully-supported"
    | "degraded-fallback"
    | "unsupported-hidden";

/** 设备运行环境特征快照 */
export interface DeviceEnvironmentProfile {
    platform: PlatformType;
    inputMethod: InputMethodType;
    screen: ScreenClass;
    network: NetworkStatus;
    hasAudioOutput?: boolean;
    hasMicrophone?: boolean;
    supportsFileSystemSync?: boolean;
}

/** 单个能力在特定设备上的解析决议 */
export interface FeatureCapabilityResolution {
    featureId: CapabilityFeatureId;
    supportLevel: CapabilitySupportLevel;
    levelKey: string;
    /** 是否应该在 UI 界面中渲染按钮/入口 */
    renderVisibleButton: boolean;
    /** 降级替代方案说明（仅当 supportLevel === 'degraded-fallback' 时） */
    fallbackDescriptionKey?: string;
    /** 替代操作路由或替代交互标识 */
    fallbackActionId?: string;
}

/** 完整设备能力决议矩阵 */
export interface DeviceCapabilityMatrix {
    profile: DeviceEnvironmentProfile;
    resolutions: Record<CapabilityFeatureId, FeatureCapabilityResolution>;
    isCoreReviewSafe: boolean;
}

/**
 * 依据设备环境特征评估能力降级决议（纯函数）
 */
export function resolveDeviceCapabilityMatrix(
    profile: DeviceEnvironmentProfile,
): DeviceCapabilityMatrix {
    const resolutions: Record<CapabilityFeatureId, FeatureCapabilityResolution> = {
        // 1. 键盘数字快捷键（1/2/3/4）
        "keyboard-shortcuts-rating": (() => {
            if (profile.inputMethod === "keyboard-mouse" || profile.inputMethod === "hybrid") {
                return {
                    featureId: "keyboard-shortcuts-rating",
                    supportLevel: "fully-supported",
                    levelKey: "deviceMatrix.support.full",
                    renderVisibleButton: true,
                };
            }
            // 纯触控移动设备：隐藏快捷键提示，降级为触控大按钮
            return {
                featureId: "keyboard-shortcuts-rating",
                supportLevel: "degraded-fallback",
                levelKey: "deviceMatrix.support.degraded",
                renderVisibleButton: false, // 不出现键盘快捷键伪提示
                fallbackDescriptionKey: "deviceMatrix.fallback.useTouchButtons",
                fallbackActionId: "use-large-touch-buttons",
            };
        })(),

        // 2. 触控手势滑卡（左滑重来/右滑良好）
        "touch-gesture-swiping": (() => {
            if (profile.inputMethod === "touch-only" || profile.inputMethod === "hybrid" || profile.platform === "mobile") {
                return {
                    featureId: "touch-gesture-swiping",
                    supportLevel: "fully-supported",
                    levelKey: "deviceMatrix.support.full",
                    renderVisibleButton: true,
                };
            }
            // 纯键鼠桌面端：降级为点击或快捷键操作
            return {
                featureId: "touch-gesture-swiping",
                supportLevel: "degraded-fallback",
                levelKey: "deviceMatrix.support.degraded",
                renderVisibleButton: false,
                fallbackDescriptionKey: "deviceMatrix.fallback.useKeyboardOrClick",
                fallbackActionId: "use-click-or-shortcuts",
            };
        })(),

        // 3. 复杂图片遮挡多边形交互绘制
        "occlusion-interactive-drawing": (() => {
            if (profile.screen === "phone-narrow") {
                // 窄屏手机：小屏幕难以精准绘制多边形，降级为只读复习，隐藏复杂绘制假按钮
                return {
                    featureId: "occlusion-interactive-drawing",
                    supportLevel: "degraded-fallback",
                    levelKey: "deviceMatrix.support.degraded",
                    renderVisibleButton: false,
                    fallbackDescriptionKey: "deviceMatrix.fallback.editOcclusionOnDesktop",
                    fallbackActionId: "view-only-review",
                };
            }
            return {
                featureId: "occlusion-interactive-drawing",
                supportLevel: "fully-supported",
                levelKey: "deviceMatrix.support.full",
                renderVisibleButton: true,
            };
        })(),

        // 4. AI 远端云端生成调用
        "ai-cloud-generation": (() => {
            if (profile.network === "offline") {
                // 离线断网环境：严格隐藏 AI 生成假按钮，降级为手工模板
                return {
                    featureId: "ai-cloud-generation",
                    supportLevel: "unsupported-hidden",
                    levelKey: "deviceMatrix.support.unsupported",
                    renderVisibleButton: false,
                    fallbackDescriptionKey: "deviceMatrix.fallback.useManualTemplates",
                    fallbackActionId: "route-manual-templates",
                };
            }
            return {
                featureId: "ai-cloud-generation",
                supportLevel: "fully-supported",
                levelKey: "deviceMatrix.support.full",
                renderVisibleButton: true,
            };
        })(),

        // 5. 本地私有文件包导入导出 (.lvcards)
        "local-file-package-io": (() => {
            if (profile.platform === "web") {
                // Web 端无本地私有路径，降级为浏览器标准 Blob 下载
                return {
                    featureId: "local-file-package-io",
                    supportLevel: "degraded-fallback",
                    levelKey: "deviceMatrix.support.degraded",
                    renderVisibleButton: true,
                    fallbackDescriptionKey: "deviceMatrix.fallback.browserBlobDownload",
                    fallbackActionId: "trigger-browser-download",
                };
            }
            return {
                featureId: "local-file-package-io",
                supportLevel: "fully-supported",
                levelKey: "deviceMatrix.support.full",
                renderVisibleButton: true,
            };
        })(),

        // 6. 音频跟读与发音录制
        "audio-recording-pronounce": (() => {
            if (!profile.hasMicrophone) {
                // 无麦克风设备：隐藏录音按钮，防止报错
                return {
                    featureId: "audio-recording-pronounce",
                    supportLevel: "unsupported-hidden",
                    levelKey: "deviceMatrix.support.unsupported",
                    renderVisibleButton: false,
                    fallbackDescriptionKey: "deviceMatrix.fallback.noMicrophone",
                };
            }
            return {
                featureId: "audio-recording-pronounce",
                supportLevel: "fully-supported",
                levelKey: "deviceMatrix.support.full",
                renderVisibleButton: true,
            };
        })(),

        // 7. 超宽表格与复杂代码块全览
        "wide-table-horizontal-drill": (() => {
            if (profile.screen === "phone-narrow") {
                return {
                    featureId: "wide-table-horizontal-drill",
                    supportLevel: "degraded-fallback",
                    levelKey: "deviceMatrix.support.degraded",
                    renderVisibleButton: true,
                    fallbackDescriptionKey: "deviceMatrix.fallback.horizontalKeyboardScroll",
                    fallbackActionId: "enable-horizontal-scroll-container",
                };
            }
            return {
                featureId: "wide-table-horizontal-drill",
                supportLevel: "fully-supported",
                levelKey: "deviceMatrix.support.full",
                renderVisibleButton: true,
            };
        })(),
    };

    // 验证核心复习是否在当前设备上 100% 安全闭环
    const hasValidRatingMethod =
        resolutions["keyboard-shortcuts-rating"].supportLevel === "fully-supported" ||
        resolutions["keyboard-shortcuts-rating"].supportLevel === "degraded-fallback" ||
        resolutions["touch-gesture-swiping"].supportLevel === "fully-supported";

    return {
        profile,
        resolutions,
        isCoreReviewSafe: hasValidRatingMethod,
    };
}
