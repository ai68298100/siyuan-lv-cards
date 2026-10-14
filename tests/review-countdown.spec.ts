import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReviewCountdown, formatCountdown } from "../src/core/review-countdown";

describe("review-countdown 复习倒计时控制器（AR-7 壁钟校准）", () => {
    describe("formatCountdown 文本格式化", () => {
        it("小于 1 小时输出 M:SS 格式", () => {
            expect(formatCountdown(0)).toBe("0:00");
            expect(formatCountdown(5)).toBe("0:05");
            expect(formatCountdown(59)).toBe("0:59");
            expect(formatCountdown(60)).toBe("1:00");
            expect(formatCountdown(125)).toBe("2:05");
        });

        it("大于或等于 1 小时输出 H:MM:SS 格式", () => {
            expect(formatCountdown(3600)).toBe("1:00:00");
            expect(formatCountdown(3661)).toBe("1:01:01");
            expect(formatCountdown(7325)).toBe("2:02:05");
        });

        it("负数或非法值安全回退到 0:00", () => {
            expect(formatCountdown(-10)).toBe("0:00");
            expect(formatCountdown(NaN as any)).toBe("0:00");
        });
    });

    describe("createReviewCountdown 控制器行为", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it("mode 为 off 时不开启计时器，初始直接置 0", () => {
            const onTick = vi.fn();
            const onExpire = vi.fn();
            const cd = createReviewCountdown({
                timeoutMode: "off",
                timeoutSeconds: 30,
                onTick,
                onExpire,
            });

            cd.start();
            expect(cd.isRunning()).toBe(false);
            expect(cd.getRemaining()).toBe(0);
            expect(onTick).toHaveBeenCalledWith(0);
            expect(onExpire).not.toHaveBeenCalled();
        });

        it("正常倒计时按步进递减并触发 onTick", () => {
            let fakeNow = 10000;
            const now = () => fakeNow;
            const onTick = vi.fn();
            const cd = createReviewCountdown({
                timeoutMode: "reveal",
                timeoutSeconds: 10,
                now,
                onTick,
                tickIntervalMs: 200,
            });

            cd.start();
            expect(cd.isRunning()).toBe(true);
            expect(cd.getRemaining()).toBe(10);
            expect(onTick).toHaveBeenLastCalledWith(10);

            // 前进 2 秒
            fakeNow += 2000;
            vi.advanceTimersByTime(2000);
            expect(cd.getRemaining()).toBe(8);
            expect(onTick).toHaveBeenLastCalledWith(8);

            cd.stop();
            expect(cd.isRunning()).toBe(false);
        });

        it("壁钟校准：后台休眠或标签页被节流后跳跃前进，能精准恢复当前真实剩余时长", () => {
            let fakeNow = 10000;
            const now = () => fakeNow;
            const onTick = vi.fn();
            const cd = createReviewCountdown({
                timeoutMode: "forget",
                timeoutSeconds: 20,
                now,
                onTick,
                tickIntervalMs: 250,
            });

            cd.start();
            expect(cd.getRemaining()).toBe(20);

            // 模拟休眠/切后台 15 秒（定时器只触发了一次唤醒）
            fakeNow += 15000;
            vi.advanceTimersByTime(250);
            expect(cd.getRemaining()).toBe(5);
            expect(onTick).toHaveBeenLastCalledWith(5);

            cd.stop();
        });

        it("超时到点时自动停止并触发 onExpire 回调且仅触发一次", () => {
            let fakeNow = 10000;
            const now = () => fakeNow;
            const onExpire = vi.fn();
            const cd = createReviewCountdown({
                timeoutMode: "reveal",
                timeoutSeconds: 5,
                now,
                onExpire,
                tickIntervalMs: 200,
            });

            cd.start();
            fakeNow += 6000;
            vi.advanceTimersByTime(6000);

            expect(cd.isRunning()).toBe(false);
            expect(cd.getRemaining()).toBe(0);
            expect(onExpire).toHaveBeenCalledTimes(1);
            expect(onExpire).toHaveBeenCalledWith("reveal");

            // 继续前进时间不重复触发
            fakeNow += 5000;
            vi.advanceTimersByTime(5000);
            expect(onExpire).toHaveBeenCalledTimes(1);
        });
    });
});
