/**
 * M3·FR8 专注复习倒计时控制器与状态机（纯逻辑，Node 可单测）。
 * 
 * 核心设计规范：
 * 1. 精准单调时钟校准：基于毫秒级绝对时间戳，防休眠、防切后台、防长任务掉帧计时漂移；
 * 2. 完整状态机：idle -> running -> paused -> expired -> stopped；
 * 3. 灵活操作支持：
 *    - start(): 重新开始计时
 *    - pause(): 挂起并锁定剩余时间
 *    - resume(): 无缝恢复并重新对齐 deadline
 *    - extend(seconds): 紧急延长（应对复杂公式推导与长代码）
 *    - getProgress(): 0.0 ~ 1.0 高精度平滑进度
 *    - isExpiringSoon: 紧迫预警（<= 3s），供视觉警示与音效触发；
 * 4. 纯函数与控制器无外部副作用。
 */

export type TimeoutMode = "off" | "reveal" | "forget";
export type CountdownState = "idle" | "running" | "paused" | "expired" | "stopped";

export interface ReviewCountdownOptions {
    timeoutMode: TimeoutMode;
    timeoutSeconds: number;
    /** 预警时间阈值秒数（默认 3 秒） */
    expiringSoonThresholdSec?: number;
    onTick?: (leftSeconds: number, progress: number, expiringSoon: boolean) => void;
    onExpire?: (mode: "reveal" | "forget") => void;
    onStateChange?: (state: CountdownState) => void;
    /** 注入时钟源（默认 Date.now，支持单测时间快进） */
    now?: () => number;
    /** 轮询间隔毫秒（默认 100ms 提高平滑度） */
    tickIntervalMs?: number;
}

export interface ReviewCountdownController {
    start: (customSeconds?: number) => void;
    pause: () => number;
    resume: () => void;
    stop: () => void;
    extend: (extraSeconds: number) => number;
    isRunning: () => boolean;
    isPaused: () => boolean;
    getRemaining: () => number;
    getProgress: () => number;
    getState: () => CountdownState;
    getMode: () => TimeoutMode;
}

/**
 * 格式化倒计时为文本（>1 小时输出 H:MM:SS，否则 M:SS）
 */
export function formatCountdown(totalSeconds: number): string {
    const total = Math.max(0, Math.ceil(totalSeconds || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;

    if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * 创建全功能复习倒计时状态机控制器
 */
export function createReviewCountdown(options: ReviewCountdownOptions): ReviewCountdownController {
    const nowFn = options.now ?? Date.now;
    const intervalMs = options.tickIntervalMs ?? 100;
    const expiringSoonSec = options.expiringSoonThresholdSec ?? 3;

    let timer: ReturnType<typeof setInterval> | null = null;
    let totalDurationMs = Math.max(0, (options.timeoutSeconds || 0) * 1000);
    let remainingMs = totalDurationMs;
    let deadline = 0;
    let state: CountdownState = "idle";

    function setState(nextState: CountdownState) {
        if (state !== nextState) {
            state = nextState;
            options.onStateChange?.(state);
        }
    }

    function clearTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function notifyTick() {
        const leftSec = Math.max(0, Math.ceil(remainingMs / 1000));
        const progress = totalDurationMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / totalDurationMs)) : 1;
        const expiringSoon = leftSec > 0 && leftSec <= expiringSoonSec && (options.timeoutMode === "reveal" || options.timeoutMode === "forget");
        if (options.onTick) {
            if (options.onTick.length <= 1) {
                (options.onTick as (left: number) => void)(leftSec);
            } else {
                options.onTick(leftSec, Number(progress.toFixed(3)), expiringSoon);
            }
        }
    }

    function stop() {
        clearTimer();
        setState("stopped");
    }

    function start(customSeconds?: number) {
        clearTimer();
        if (options.timeoutMode === "off") {
            remainingMs = 0;
            totalDurationMs = 0;
            setState("stopped");
            notifyTick();
            return;
        }

        const sec = typeof customSeconds === "number" && customSeconds > 0
            ? customSeconds
            : options.timeoutSeconds;

        if (sec <= 0) {
            remainingMs = 0;
            totalDurationMs = 0;
            setState("stopped");
            notifyTick();
            return;
        }

        totalDurationMs = sec * 1000;
        remainingMs = totalDurationMs;
        deadline = nowFn() + remainingMs;
        setState("running");
        notifyTick();

        timer = setInterval(() => {
            const currentNow = nowFn();
            remainingMs = Math.max(0, deadline - currentNow);
            notifyTick();

            if (remainingMs <= 0) {
                clearTimer();
                setState("expired");
                if (options.timeoutMode === "reveal" || options.timeoutMode === "forget") {
                    options.onExpire?.(options.timeoutMode);
                }
            }
        }, intervalMs);
    }

    function pause(): number {
        if (state !== "running") {
            return Math.max(0, Math.ceil(remainingMs / 1000));
        }

        clearTimer();
        const currentNow = nowFn();
        remainingMs = Math.max(0, deadline - currentNow);
        setState("paused");
        notifyTick();
        return Math.max(0, Math.ceil(remainingMs / 1000));
    }

    function resume() {
        if (state !== "paused" || remainingMs <= 0) {
            return;
        }

        deadline = nowFn() + remainingMs;
        setState("running");
        notifyTick();

        timer = setInterval(() => {
            const currentNow = nowFn();
            remainingMs = Math.max(0, deadline - currentNow);
            notifyTick();

            if (remainingMs <= 0) {
                clearTimer();
                setState("expired");
                if (options.timeoutMode === "reveal" || options.timeoutMode === "forget") {
                    options.onExpire?.(options.timeoutMode);
                }
            }
        }, intervalMs);
    }

    function extend(extraSeconds: number): number {
        if (extraSeconds <= 0) {
            return Math.max(0, Math.ceil(remainingMs / 1000));
        }

        const addMs = extraSeconds * 1000;
        totalDurationMs += addMs;
        remainingMs += addMs;

        if (state === "running") {
            deadline += addMs;
        }

        notifyTick();
        return Math.max(0, Math.ceil(remainingMs / 1000));
    }

    return {
        start,
        pause,
        resume,
        stop,
        extend,
        isRunning: () => state === "running",
        isPaused: () => state === "paused",
        getRemaining: () => Math.max(0, Math.ceil(remainingMs / 1000)),
        getProgress: () => totalDurationMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / totalDurationMs)) : 1,
        getState: () => state,
        getMode: () => options.timeoutMode,
    };
}
