import { describe, expect, it, vi } from "vitest";
import {
    DataReloadCoordinator,
    isPluginDataChanged,
} from "../src/core/data-reload-coordinator";

describe("data-reload-coordinator (AT-1 跨前端数据同步重载协调器)", () => {
    describe("路径过滤与载荷兼容性 (isPluginDataChanged)", () => {
        it("空载荷默认返回 true（保守策略）", () => {
            expect(isPluginDataChanged(null)).toBe(true);
            expect(isPluginDataChanged(undefined)).toBe(true);
            expect(isPluginDataChanged([])).toBe(true);
            expect(isPluginDataChanged({})).toBe(true);
        });

        it("数组载荷：包含本插件目录片段或关键存储文件名返回 true", () => {
            expect(isPluginDataChanged(["/data/plugins/siyuan-lv-cards/settings.json"])).toBe(true);
            expect(isPluginDataChanged(["revlog.json"])).toBe(true);
            expect(isPluginDataChanged(["/data/20261019120000.sy"])).toBe(false); // 普通笔记变动忽略
        });

        it("对象载荷：{ files: string[] } 结构兼容", () => {
            expect(isPluginDataChanged({ files: ["siyuan-lv-cards/exam-plans.json"] })).toBe(true);
            expect(isPluginDataChanged({ files: ["other-plugin/data.json"] })).toBe(false);
        });
    });

    describe("防抖折叠与单飞串行生命周期", () => {
        it("高频触发在 debounceMs 时间窗口内折叠合并为 1 次", async () => {
            vi.useFakeTimers();
            const reloads: number[] = [];
            const flushes: number[] = [];

            const coordinator = new DataReloadCoordinator({
                debounceMs: 500,
                flushPendingWrites: async () => {
                    flushes.push(Date.now());
                },
                onReload: async (gen) => {
                    reloads.push(gen);
                },
            });

            // 连续快速触发 5 次
            coordinator.onDataChanged(["siyuan-lv-cards/settings.json"]);
            coordinator.onDataChanged(["siyuan-lv-cards/settings.json"]);
            coordinator.onDataChanged(["siyuan-lv-cards/settings.json"]);
            coordinator.onDataChanged(["siyuan-lv-cards/settings.json"]);
            coordinator.onDataChanged(["siyuan-lv-cards/settings.json"]);

            expect(coordinator.getState().status).toBe("scheduled");
            expect(reloads).toHaveLength(0);

            // 快进时间
            await vi.advanceTimersByTimeAsync(600);

            // 核心断言：仅触发 1 次重载，且先冲刷本地写
            expect(reloads).toEqual([1]);
            expect(flushes).toHaveLength(1);
            expect(coordinator.getState().status).toBe("idle");
            expect(coordinator.getState().totalReloadsTriggered).toBe(1);

            vi.useRealTimers();
        });

        it("重读前必须优先等待并冲刷本地写（写优先安全守卫）", async () => {
            const executionOrder: string[] = [];

            const coordinator = new DataReloadCoordinator({
                debounceMs: 50,
                flushPendingWrites: async () => {
                    executionOrder.push("flush-pending");
                },
                onReload: async () => {
                    executionOrder.push("reload-disk");
                },
            });

            await coordinator.forceReloadNow();

            expect(executionOrder).toEqual(["flush-pending", "reload-disk"]);
        });

        it("执行重载期间若收到新事件，排队下一轮单飞串行，严禁并发重叠", async () => {
            vi.useFakeTimers();
            const reloads: number[] = [];
            let slowResolve: () => void = () => {};

            const coordinator = new DataReloadCoordinator({
                debounceMs: 100,
                onReload: async (gen) => {
                    reloads.push(gen);
                    // 模拟慢速加载
                    await new Promise<void>(resolve => {
                        slowResolve = resolve;
                    });
                },
            });

            // 触发第 1 次
            coordinator.onDataChanged(["siyuan-lv-cards/settings.json"]);
            await vi.advanceTimersByTimeAsync(150);

            expect(coordinator.getState().status).toBe("reloading");
            expect(reloads).toEqual([1]);

            // 在 reloading 期间再次触发变更
            coordinator.onDataChanged(["siyuan-lv-cards/settings.json"]);

            // 完成第 1 次
            slowResolve();
            await Promise.resolve();

            // 检查自动排队触发第 2 次
            await vi.advanceTimersByTimeAsync(200);
            expect(reloads).toEqual([1, 2]);

            // 完成第 2 次
            slowResolve();
            await vi.advanceTimersByTimeAsync(50);

            expect(coordinator.getState().status).toBe("idle");
            vi.useRealTimers();
        });

        it("cancelPending 能够准确取消未决的防抖定时器，状态恢复为 idle", async () => {
            vi.useFakeTimers();
            const reloads: number[] = [];

            const coordinator = new DataReloadCoordinator({
                debounceMs: 500,
                onReload: async (gen) => {
                    reloads.push(gen);
                },
            });

            coordinator.onDataChanged(["siyuan-lv-cards/settings.json"]);
            expect(coordinator.getState().status).toBe("scheduled");

            // 卸载或关闭窗口：取消挂起
            coordinator.cancelPending();
            expect(coordinator.getState().status).toBe("idle");

            await vi.advanceTimersByTimeAsync(1000);
            expect(reloads).toHaveLength(0); // 绝对不触发

            vi.useRealTimers();
        });
    });
});
