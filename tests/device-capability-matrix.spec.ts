import { describe, expect, it } from "vitest";
import {
    CAPABILITY_FEATURE_IDS,
    resolveDeviceCapabilityMatrix,
} from "../src/core/device-capability-matrix";
import type { DeviceEnvironmentProfile } from "../src/core/device-capability-matrix";

describe("device-capability-matrix (BL-13 跨端能力降级矩阵与设备契约引擎)", () => {
    it("包含七大核心跨端能力标识", () => {
        expect(CAPABILITY_FEATURE_IDS).toEqual([
            "keyboard-shortcuts-rating",
            "touch-gesture-swiping",
            "occlusion-interactive-drawing",
            "ai-cloud-generation",
            "local-file-package-io",
            "audio-recording-pronounce",
            "wide-table-horizontal-drill",
        ]);
    });

    it("移动纯触控环境（手机+触控+窄屏+离线）：隐藏快捷键与AI假按钮，手势全支持，核心复习完全安全", () => {
        const mobileProfile: DeviceEnvironmentProfile = {
            platform: "mobile",
            inputMethod: "touch-only",
            screen: "phone-narrow",
            network: "offline",
            hasAudioOutput: true,
            hasMicrophone: false,
        };

        const matrix = resolveDeviceCapabilityMatrix(mobileProfile);

        // 1. 快捷键：降级且不渲染快捷键假提示
        const kb = matrix.resolutions["keyboard-shortcuts-rating"];
        expect(kb.supportLevel).toBe("degraded-fallback");
        expect(kb.renderVisibleButton).toBe(false); // 绝不出现点了没反应的快捷键假按钮
        expect(kb.fallbackDescriptionKey).toBe("deviceMatrix.fallback.useTouchButtons");

        // 2. 触控手势滑卡：完全支持
        const touch = matrix.resolutions["touch-gesture-swiping"];
        expect(touch.supportLevel).toBe("fully-supported");
        expect(touch.renderVisibleButton).toBe(true);

        // 3. 离线断网：云端 AI 严格隐藏
        const ai = matrix.resolutions["ai-cloud-generation"];
        expect(ai.supportLevel).toBe("unsupported-hidden");
        expect(ai.renderVisibleButton).toBe(false);

        // 4. 无麦克风：录音按钮隐藏
        const mic = matrix.resolutions["audio-recording-pronounce"];
        expect(mic.supportLevel).toBe("unsupported-hidden");
        expect(mic.renderVisibleButton).toBe(false);

        // 5. 核心复习永不阻塞铁律！
        expect(matrix.isCoreReviewSafe).toBe(true);
    });

    it("桌面标准键鼠环境（PC+键鼠+宽屏+在线）：快捷键全支持，手势降级为点击", () => {
        const desktopProfile: DeviceEnvironmentProfile = {
            platform: "desktop",
            inputMethod: "keyboard-mouse",
            screen: "desktop-wide",
            network: "online",
            hasAudioOutput: true,
            hasMicrophone: true,
        };

        const matrix = resolveDeviceCapabilityMatrix(desktopProfile);

        // 快捷键完全支持
        expect(matrix.resolutions["keyboard-shortcuts-rating"].supportLevel).toBe("fully-supported");
        expect(matrix.resolutions["keyboard-shortcuts-rating"].renderVisibleButton).toBe(true);

        // AI 生成完全支持
        expect(matrix.resolutions["ai-cloud-generation"].supportLevel).toBe("fully-supported");
        expect(matrix.resolutions["ai-cloud-generation"].renderVisibleButton).toBe(true);

        // 手势滑卡降级为点击
        expect(matrix.resolutions["touch-gesture-swiping"].supportLevel).toBe("degraded-fallback");
        expect(matrix.resolutions["touch-gesture-swiping"].renderVisibleButton).toBe(false);

        // 核心复习安全
        expect(matrix.isCoreReviewSafe).toBe(true);
    });

    it("Web 浏览器平台环境：文件 IO 降级为浏览器标准 Blob 下载", () => {
        const webProfile: DeviceEnvironmentProfile = {
            platform: "web",
            inputMethod: "keyboard-mouse",
            screen: "desktop-wide",
            network: "online",
        };

        const matrix = resolveDeviceCapabilityMatrix(webProfile);
        const fileIo = matrix.resolutions["local-file-package-io"];
        expect(fileIo.supportLevel).toBe("degraded-fallback");
        expect(fileIo.fallbackDescriptionKey).toBe("deviceMatrix.fallback.browserBlobDownload");
        expect(fileIo.renderVisibleButton).toBe(true);
    });
});
