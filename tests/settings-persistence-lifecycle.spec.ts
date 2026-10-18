import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings, normalizeSettings, type LvCardsSettings } from "../src/core/settings";

/**
 * 仿真 src/index.ts 中的设置持久化状态机控制器
 */
class SettingsPersistenceController {
    settings: LvCardsSettings;
    persistedSettingsSnapshot: LvCardsSettings;
    settingsMutationVersion = 0;
    settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
    timerSetupCount = 0;
    eventsEmitted: string[] = [];

    constructor(
        initial: Partial<LvCardsSettings> = {},
        private persistSave: (key: string, data: unknown) => Promise<void> = async () => {}
    ) {
        this.settings = normalizeSettings(initial);
        this.persistedSettingsSnapshot = normalizeSettings(JSON.parse(JSON.stringify(this.settings)));
    }

    setupBadgeTimer() {
        this.timerSetupCount++;
    }

    saveSettingsSoon() {
        if (this.settingsSaveTimer) clearTimeout(this.settingsSaveTimer);
        this.settingsSaveTimer = setTimeout(() => {
            this.settingsSaveTimer = null;
            void this.saveSettingsNow();
        }, 1200);
    }

    saveSettingsNow(): Promise<void> {
        this.setupBadgeTimer();
        const version = ++this.settingsMutationVersion;
        const next = normalizeSettings(JSON.parse(JSON.stringify(this.settings)));
        const done = this.persistSave("settings.json", next);

        done.then(() => {
            this.persistedSettingsSnapshot = next;
            try {
                this.eventsEmitted.push("settings-changed");
            } catch { /* 事件旁路 */ }
        }).catch(() => {
            if (version === this.settingsMutationVersion && this.persistedSettingsSnapshot) {
                this.settings = normalizeSettings(JSON.parse(JSON.stringify(this.persistedSettingsSnapshot)));
                this.setupBadgeTimer();
            }
        });

        return done;
    }

    /** 模拟跨窗口同步重载前的强制冲刷 */
    async flushBeforeReload() {
        if (this.settingsSaveTimer) {
            clearTimeout(this.settingsSaveTimer);
            this.settingsSaveTimer = null;
            await this.saveSettingsNow();
        }
    }
}

describe("settings persistence lifecycle & mutation versioning (P0 风险闭环)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("debounces rapid saveSettingsSoon calls into a single write after 1200ms", async () => {
        const persistSave = vi.fn().mockResolvedValue(undefined);
        const controller = new SettingsPersistenceController({ dailyNewTarget: 10 }, persistSave);

        // 模拟用户连续拖动滑块或调整开关
        controller.settings.dailyNewTarget = 15;
        controller.saveSettingsSoon();
        vi.advanceTimersByTime(500);

        controller.settings.dailyNewTarget = 20;
        controller.saveSettingsSoon();
        vi.advanceTimersByTime(500);

        controller.settings.dailyNewTarget = 25;
        controller.saveSettingsSoon();

        // 尚未达到 1200ms 静默窗口，不触发落盘
        expect(persistSave).not.toHaveBeenCalled();

        // 推进到达 1200ms
        await vi.advanceTimersByTimeAsync(1200);

        expect(persistSave).toHaveBeenCalledTimes(1);
        expect(persistSave).toHaveBeenCalledWith("settings.json", expect.objectContaining({
            dailyNewTarget: 25,
        }));
        expect(controller.persistedSettingsSnapshot.dailyNewTarget).toBe(25);
        expect(controller.eventsEmitted).toContain("settings-changed");
    });

    it("flushes pending debounce timer immediately before store reload", async () => {
        const persistSave = vi.fn().mockResolvedValue(undefined);
        const controller = new SettingsPersistenceController({ dailyNewTarget: 10 }, persistSave);

        controller.settings.dailyNewTarget = 30;
        controller.saveSettingsSoon();
        expect(controller.settingsSaveTimer).toBeTruthy();

        // 外部重载事件到达前冲刷
        await controller.flushBeforeReload();

        expect(controller.settingsSaveTimer).toBeNull();
        expect(persistSave).toHaveBeenCalledTimes(1);
        expect(persistSave).toHaveBeenCalledWith("settings.json", expect.objectContaining({
            dailyNewTarget: 30,
        }));
    });

    it("rolls back running settings to persisted snapshot when disk write fails", async () => {
        const persistSave = vi.fn().mockRejectedValue(new Error("EACCES: permission denied"));
        const controller = new SettingsPersistenceController({ dailyNewTarget: 10 }, persistSave);

        expect(controller.persistedSettingsSnapshot.dailyNewTarget).toBe(10);

        controller.settings.dailyNewTarget = 50;
        const initialTimerCount = controller.timerSetupCount;

        const savePromise = controller.saveSettingsNow();
        await expect(savePromise).rejects.toThrow("permission denied");

        // 失败后等待微任务完成回滚
        await Promise.resolve();

        // 运行态设置必须被精确回滚至上一次成功持久化的磁盘基线
        expect(controller.settings.dailyNewTarget).toBe(10);
        // 定时器应重新构建
        expect(controller.timerSetupCount).toBeGreaterThan(initialTimerCount);
        // 失败不触发 settings-changed 广播
        expect(controller.eventsEmitted).not.toContain("settings-changed");
    });

    it("mutation version guard: prevents old failure from rolling back newer in-flight mutation", async () => {
        let rejectFirst!: (err: Error) => void;
        let resolveSecond!: () => void;

        const firstPromise = new Promise<void>((_, rej) => { rejectFirst = rej; });
        const secondPromise = new Promise<void>(res => { resolveSecond = res; });

        const persistSave = vi.fn()
            .mockReturnValueOnce(firstPromise)
            .mockReturnValueOnce(secondPromise);

        const controller = new SettingsPersistenceController({ dailyNewTarget: 10 }, persistSave);

        // 1. 发起第 1 次修改：把 target 改为 20
        controller.settings.dailyNewTarget = 20;
        const p1 = controller.saveSettingsNow();
        expect(controller.settingsMutationVersion).toBe(1);

        // 2. 在第 1 次尚未结算时，用户发起第 2 次修改：把 target 改为 30
        controller.settings.dailyNewTarget = 30;
        const p2 = controller.saveSettingsNow();
        expect(controller.settingsMutationVersion).toBe(2);

        // 3. 第 1 次写入发生超时/失败
        rejectFirst(new Error("first write failed"));
        await expect(p1).rejects.toThrow("first write failed");
        await Promise.resolve();

        // 关键断言：因为 version(1) !== settingsMutationVersion(2)，第 1 次的失败回调绝不能把当前设置回滚为基线 10！
        expect(controller.settings.dailyNewTarget).toBe(30);

        // 4. 第 2 次写入顺利成功
        resolveSecond();
        await expect(p2).resolves.toBeUndefined();
        await Promise.resolve();

        // 磁盘基线更新为最新的 30
        expect(controller.persistedSettingsSnapshot.dailyNewTarget).toBe(30);
        expect(controller.settings.dailyNewTarget).toBe(30);
    });
});
