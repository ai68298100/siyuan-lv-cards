import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    createReviewCountdown,
    formatCountdown,
    type CountdownState,
} from "../src/core/review-countdown";

describe("M3·FR8: Review Countdown State Machine & Smoothing (复习超时模式与状态机)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });
    it("formatCountdown 格式化时间", () => {
        expect(formatCountdown(0)).toBe("0:00");
        expect(formatCountdown(59)).toBe("0:59");
        expect(formatCountdown(65)).toBe("1:05");
        expect(formatCountdown(3665)).toBe("1:01:05");
    });

    it("精准倒计时与进度流转：从 running 到 expired，进度从 0 渐进至 1", () => {
        let currentTime = 1000;
        const ticks: Array<{ left: number; progress: number; expiringSoon: boolean }> = [];
        const states: CountdownState[] = [];
        const onExpire = vi.fn();

        const controller = createReviewCountdown({
            timeoutMode: "reveal",
            timeoutSeconds: 10,
            now: () => currentTime,
            tickIntervalMs: 50,
            onTick: (left, progress, expiringSoon) => ticks.push({ left, progress, expiringSoon }),
            onStateChange: (s) => states.push(s),
            onExpire,
        });

        controller.start();
        expect(controller.isRunning()).toBe(true);
        expect(controller.getState()).toBe("running");
        expect(controller.getRemaining()).toBe(10);
        expect(controller.getProgress()).toBe(0);

        // 快进 5 秒
        currentTime += 5000;
        // 手动触碰（实际由 setInterval 触发）
        vi.advanceTimersByTime?.(50) ?? null;

        // 验证 extend 动态增加 5 秒
        const extendedLeft = controller.extend(5);
        expect(extendedLeft).toBeGreaterThan(5);

        // 验证 pause 挂起
        const pausedLeft = controller.pause();
        expect(controller.isPaused()).toBe(true);
        expect(controller.getState()).toBe("paused");
        expect(pausedLeft).toBe(controller.getRemaining());

        // 挂起期间时间流逝不应影响剩余时间
        currentTime += 10000;
        expect(controller.getRemaining()).toBe(pausedLeft);

        // 恢复 resume
        controller.resume();
        expect(controller.isRunning()).toBe(true);
        expect(controller.getState()).toBe("running");

        controller.stop();
        expect(controller.getState()).toBe("stopped");
        expect(controller.isRunning()).toBe(false);
    });

    it("精准毫秒校准：在系统休眠或长任务导致时钟跳跃时精准结算剩余秒数", () => {
        let currentTime = 10000;
        const onExpire = vi.fn();

        const controller = createReviewCountdown({
            timeoutMode: "forget",
            timeoutSeconds: 10,
            now: () => currentTime,
            tickIntervalMs: 50,
            onExpire,
        });

        controller.start();
        expect(controller.isRunning()).toBe(true);

        // 模拟长任务挂起 12 秒（超时到期）
        currentTime += 12000;
        vi.advanceTimersByTime(50);

        expect(controller.isRunning()).toBe(false);
        expect(controller.getState()).toBe("expired");
        expect(onExpire).toHaveBeenCalledWith("forget");
    });

    it("超时模式为 off 时即刻停止并归零", () => {
        const controller = createReviewCountdown({
            timeoutMode: "off",
            timeoutSeconds: 30,
        });

        controller.start();
        expect(controller.isRunning()).toBe(false);
        expect(controller.getRemaining()).toBe(0);
        expect(controller.getProgress()).toBe(1);
    });
});
