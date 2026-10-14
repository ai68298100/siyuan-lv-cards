/**
 * 专注复习倒计时控制器（纯逻辑，基于壁钟校准 AR-7，防切后台/休眠计时漂移）
 */

export type TimeoutMode = "off" | "reveal" | "forget";

export interface ReviewCountdownOptions {
    timeoutMode: TimeoutMode;
    timeoutSeconds: number;
    onTick?: (leftSeconds: number) => void;
    onExpire?: (mode: "reveal" | "forget") => void;
    /** 注入时钟源（默认 Date.now，支持单测时间快进） */
    now?: () => number;
    /** 轮询间隔毫秒（默认 250ms） */
    tickIntervalMs?: number;
}

export interface ReviewCountdownController {
    start: () => void;
    stop: () => void;
    isRunning: () => boolean;
    getRemaining: () => number;
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
 * 创建倒计时控制器实例
 */
export function createReviewCountdown(options: ReviewCountdownOptions): ReviewCountdownController {
    const nowFn = options.now ?? Date.now;
    const intervalMs = options.tickIntervalMs ?? 250;

    let timer: ReturnType<typeof setInterval> | null = null;
    let remaining = Math.max(0, options.timeoutSeconds || 0);
    let deadline = 0;
    let running = false;

    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        running = false;
    }

    function start() {
        stop();
        if (options.timeoutMode === "off" || options.timeoutSeconds <= 0) {
            remaining = 0;
            options.onTick?.(0);
            return;
        }

        remaining = options.timeoutSeconds;
        deadline = nowFn() + options.timeoutSeconds * 1000;
        running = true;
        options.onTick?.(remaining);

        timer = setInterval(() => {
            const currentNow = nowFn();
            const left = Math.max(0, Math.ceil((deadline - currentNow) / 1000));
            remaining = left;
            options.onTick?.(remaining);

            if (left <= 0) {
                stop();
                if (options.timeoutMode === "reveal" || options.timeoutMode === "forget") {
                    options.onExpire?.(options.timeoutMode);
                }
            }
        }, intervalMs);
    }

    return {
        start,
        stop,
        isRunning: () => running,
        getRemaining: () => remaining,
        getMode: () => options.timeoutMode,
    };
}
