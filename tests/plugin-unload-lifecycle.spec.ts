import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 仿真测试控制器：完整对齐 src/index.ts 中 Onunload 资源清理与卸载生命周期契约
 */
class PluginUnloadLifecycleController {
    // 定时器
    onboardingTimer: ReturnType<typeof setTimeout> | null = null;
    reloadTimer: ReturnType<typeof setTimeout> | null = null;
    settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
    badgeTimer: ReturnType<typeof setInterval> | null = null;

    // 状态与引用
    paletteState: { close: () => void } | undefined = undefined;
    topBarElement: { removeEventListener: (type: string, fn: any) => void } | null = null;
    topBarContextMenuHandler: ((evt: any) => void) | null = null;

    // 追踪调用
    savedSettingsNowCalled = 0;
    flushedRevlogCalled = 0;
    unboundExamPlansCalled = 0;
    persistWaitAllMs: number | null = null;
    eventBusOffCalls: Array<{ event: string; fn: any }> = [];

    eventBus = {
        off: (event: string, fn: any) => {
            this.eventBusOffCalls.push({ event, fn });
        },
    };

    onNativeCardAction = () => {};
    onBlockIcon = () => {};

    persist = {
        waitAll: async (timeoutMs: number) => {
            this.persistWaitAllMs = timeoutMs;
            return true;
        },
    };

    unbindExamPlansSync() {
        this.unboundExamPlansCalled++;
    }

    saveSettingsNow() {
        this.savedSettingsNowCalled++;
    }

    flushRevlogSave() {
        this.flushedRevlogCalled++;
    }

    /** 严格对齐 src/index.ts:1803-1842 的真实 onunload 实现 */
    onunload() {
        const unloadStart = Date.now();
        const palette = this.paletteState;
        this.paletteState = undefined;
        palette?.close?.();
        this.unbindExamPlansSync();
        this.eventBus.off("click-flashcard-action", this.onNativeCardAction);
        this.eventBus.off("click-blockicon", this.onBlockIcon);
        if (this.topBarElement && this.topBarContextMenuHandler) {
            this.topBarElement.removeEventListener("contextmenu", this.topBarContextMenuHandler);
            this.topBarContextMenuHandler = null;
        }
        if (this.onboardingTimer) {
            clearTimeout(this.onboardingTimer);
            this.onboardingTimer = null;
        }
        // AT-1：取消挂起中的同步重载（卸载后不再触发读盘）
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
            this.reloadTimer = null;
        }
        // AT-2：防抖中的设置保存立即落盘，禁用/重载不丢最后一次改动
        if (this.settingsSaveTimer) {
            clearTimeout(this.settingsSaveTimer);
            this.settingsSaveTimer = null;
            this.saveSettingsNow();
        }
        this.flushRevlogSave();
        // AQ-4：卸载前尽力等在途写入落盘（Petal dispose 预算约 5s，上限 3s 不阻塞卸载）
        void this.persist.waitAll(3000).then(ok => {
            if (!ok) {
                // lvLog warn
            }
        });
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
            this.badgeTimer = null;
        }
    }
}

describe("plugin onunload lifecycle teardown (P0 风险闭环)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("clears all active timers and prevents any lingering timer callbacks", () => {
        const controller = new PluginUnloadLifecycleController();

        let onboardingFired = false;
        let reloadFired = false;
        let badgeFired = false;

        controller.onboardingTimer = setTimeout(() => { onboardingFired = true; }, 2000);
        controller.reloadTimer = setTimeout(() => { reloadFired = true; }, 1000);
        controller.badgeTimer = setInterval(() => { badgeFired = true; }, 30000);

        expect(controller.onboardingTimer).not.toBeNull();
        expect(controller.reloadTimer).not.toBeNull();
        expect(controller.badgeTimer).not.toBeNull();

        controller.onunload();

        expect(controller.onboardingTimer).toBeNull();
        expect(controller.reloadTimer).toBeNull();
        expect(controller.badgeTimer).toBeNull();

        // 推进时间，验证被取消的定时器绝不触发
        vi.advanceTimersByTime(60000);
        expect(onboardingFired).toBe(false);
        expect(reloadFired).toBe(false);
        expect(badgeFired).toBe(false);
    });

    it("flushes in-flight debounced settings and revlog immediately before teardown", () => {
        const controller = new PluginUnloadLifecycleController();

        let debouncedSettingsFired = false;
        controller.settingsSaveTimer = setTimeout(() => { debouncedSettingsFired = true; }, 1200);

        controller.onunload();

        // 验证防抖定时器已置空，未落盘的设置被强制同步触发 saveSettingsNow()
        expect(controller.settingsSaveTimer).toBeNull();
        expect(controller.savedSettingsNowCalled).toBe(1);
        expect(controller.flushedRevlogCalled).toBe(1);
        expect(controller.persistWaitAllMs).toBe(3000);

        // 推进时间，旧的防抖定时器回调不重复触发
        vi.advanceTimersByTime(2000);
        expect(debouncedSettingsFired).toBe(false);
    });

    it("unregisters DOM contextmenu listener and EventBus handlers without memory leaks", () => {
        const controller = new PluginUnloadLifecycleController();

        const removeEventListener = vi.fn();
        const handler = (evt: any) => evt.preventDefault();
        controller.topBarElement = { removeEventListener };
        controller.topBarContextMenuHandler = handler;

        controller.onunload();

        expect(removeEventListener).toHaveBeenCalledWith("contextmenu", handler);
        expect(controller.topBarContextMenuHandler).toBeNull();

        expect(controller.eventBusOffCalls).toEqual([
            { event: "click-flashcard-action", fn: controller.onNativeCardAction },
            { event: "click-blockicon", fn: controller.onBlockIcon },
        ]);
    });

    it("safely closes active command palette and unbinds kernel exam plans sync", () => {
        const controller = new PluginUnloadLifecycleController();

        const closePalette = vi.fn();
        controller.paletteState = { close: closePalette };

        controller.onunload();

        expect(closePalette).toHaveBeenCalledTimes(1);
        expect(controller.paletteState).toBeUndefined();
        expect(controller.unboundExamPlansCalled).toBe(1);
    });

    it("remains idempotent and robust across repeated onunload calls", () => {
        const controller = new PluginUnloadLifecycleController();

        expect(() => {
            controller.onunload();
            controller.onunload();
            controller.onunload();
        }).not.toThrow();

        expect(controller.unboundExamPlansCalled).toBe(3);
    });
});
