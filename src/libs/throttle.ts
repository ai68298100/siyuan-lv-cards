/**
 * 高性能事件节流、防抖与帧率对齐工具库（纯 TypeScript，无第三方依赖）。
 *
 * 适用于：
 * 1. 高频 DOM 事件：滚动 (scroll)、指针拖拽移动 (pointermove/mousemove)、视口缩放 (resize)
 * 2. 搜索输入与按键联动 (input/change)
 * 3. 避免过度布局计算 (layout thrashing) 与多余的持久化写盘
 */

export interface CancelableFunction<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): void;
    /** 取消挂起中的待执行调用，清理定时器/帧请求，防止内存泄漏 */
    cancel(): void;
    /** 立即执行挂起中的调用（若有） */
    flush(): void;
    /** 当前是否有排队中的待执行调用 */
    isPending(): boolean;
}

export interface ThrottleOptions {
    /** 是否在起始边缘立即执行（默认 true） */
    leading?: boolean;
    /** 是否在等待期结束后的尾部边缘执行（默认 true） */
    trailing?: boolean;
}

export interface DebounceOptions {
    /** 是否在起始边缘立即执行（默认 false） */
    leading?: boolean;
    /** 是否在等待期结束后的尾部边缘执行（默认 true） */
    trailing?: boolean;
    /** 最长等待时间（毫秒），防止高频输入被无限后延（默认无限制） */
    maxWait?: number;
}

/**
 * 节流函数：限制函数在指定时间窗口 waitMs 内至多执行一次。
 */
export function throttle<T extends (...args: any[]) => any>(
    fn: T,
    waitMs: number,
    options: ThrottleOptions = {},
): CancelableFunction<T> {
    const leading = options.leading !== false;
    const trailing = options.trailing !== false;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: Parameters<T> | null = null;
    let lastThis: any = null;
    let lastExecTime = 0;

    function invoke(time: number) {
        lastExecTime = time;
        const args = lastArgs!;
        const context = lastThis;
        lastArgs = null;
        lastThis = null;
        fn.apply(context, args);
    }

    function onTimer() {
        timer = null;
        if (trailing && lastArgs) {
            invoke(Date.now());
            timer = setTimeout(onTimer, waitMs);
        }
    }

    const throttled = function (this: any, ...args: Parameters<T>) {
        const now = Date.now();
        lastArgs = args;
        lastThis = this;

        if (lastExecTime === 0) {
            if (leading) {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                invoke(now);
                if (trailing) {
                    timer = setTimeout(onTimer, waitMs);
                }
            } else {
                lastExecTime = now;
                if (trailing && !timer) {
                    timer = setTimeout(onTimer, waitMs);
                }
            }
            return;
        }

        const elapsed = now - lastExecTime;

        if (elapsed >= waitMs) {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            invoke(now);
            if (trailing) {
                timer = setTimeout(onTimer, waitMs);
            }
        } else if (!timer && trailing) {
            const remaining = waitMs - elapsed;
            timer = setTimeout(onTimer, Math.max(0, remaining));
        }
    } as CancelableFunction<T>;

    throttled.cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        lastArgs = null;
        lastThis = null;
        lastExecTime = 0;
    };

    throttled.flush = () => {
        if (timer && lastArgs) {
            clearTimeout(timer);
            timer = null;
            invoke(Date.now());
        }
    };

    throttled.isPending = () => timer !== null && lastArgs !== null;

    return throttled;
}

/**
 * 防抖函数：在最后一次触发后等待 waitMs 毫秒才执行。
 */
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    waitMs: number,
    options: DebounceOptions = {},
): CancelableFunction<T> {
    const leading = options.leading === true;
    const trailing = options.trailing !== false;
    const maxWait = typeof options.maxWait === "number" && options.maxWait >= 0 ? options.maxWait : null;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: Parameters<T> | null = null;
    let lastThis: any = null;

    function invoke() {
        const args = lastArgs;
        const context = lastThis;
        clearTimers();
        if (args) {
            fn.apply(context, args);
        }
    }

    function clearTimers() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (maxTimer) {
            clearTimeout(maxTimer);
            maxTimer = null;
        }
        lastArgs = null;
        lastThis = null;
    }

    function onTimer() {
        timer = null;
        if (maxTimer) {
            clearTimeout(maxTimer);
            maxTimer = null;
        }
        if (trailing && lastArgs) {
            invoke();
        } else {
            clearTimers();
        }
    }

    function onMaxTimer() {
        maxTimer = null;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (lastArgs) {
            invoke();
        }
    }

    const debounced = function (this: any, ...args: Parameters<T>) {
        const isWaiting = timer !== null;
        lastArgs = args;
        lastThis = this;

        if (timer) {
            clearTimeout(timer);
            timer = null;
        }

        if (leading && !isWaiting) {
            fn.apply(this, args);
            lastArgs = null;
            lastThis = null;
        }

        timer = setTimeout(onTimer, waitMs);

        if (maxWait !== null && !maxTimer) {
            maxTimer = setTimeout(onMaxTimer, maxWait);
        }
    } as CancelableFunction<T>;

    debounced.cancel = () => {
        clearTimers();
    };

    debounced.flush = () => {
        if (lastArgs) {
            invoke();
        }
    };

    debounced.isPending = () => timer !== null || maxTimer !== null;

    return debounced;
}

/**
 * requestAnimationFrame 动画帧率对齐节流。
 * 将高频连续事件（如滚动、指针拖动、窗口 resize）合并在下一渲染帧内仅执行一次，
 * 彻底消除非必要的 DOM 重新计算 (Layout/Reflow) 与状态高频抖动。
 *
 * 在非浏览器或 Node 环境下自动降级为 16ms setTimeout。
 */
export function rafThrottle<T extends (...args: any[]) => any>(fn: T): CancelableFunction<T> {
    let rafId: number | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: Parameters<T> | null = null;
    let lastThis: any = null;

    const hasRaf = typeof requestAnimationFrame === "function";

    function clearScheduled() {
        if (rafId !== null) {
            if (typeof cancelAnimationFrame === "function") {
                cancelAnimationFrame(rafId);
            }
            rafId = null;
        }
        if (fallbackTimer !== null) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
        }
    }

    function invoke() {
        clearScheduled();
        if (lastArgs) {
            const args = lastArgs;
            const context = lastThis;
            lastArgs = null;
            lastThis = null;
            fn.apply(context, args);
        }
    }

    const throttled = function (this: any, ...args: Parameters<T>) {
        lastArgs = args;
        lastThis = this;

        if (rafId === null && fallbackTimer === null) {
            if (hasRaf) {
                rafId = requestAnimationFrame(() => {
                    invoke();
                });
            } else {
                fallbackTimer = setTimeout(() => {
                    invoke();
                }, 16);
            }
        }
    } as CancelableFunction<T>;

    throttled.cancel = () => {
        clearScheduled();
        lastArgs = null;
        lastThis = null;
    };

    throttled.flush = () => {
        if (lastArgs) {
            invoke();
        }
    };

    throttled.isPending = () => rafId !== null || fallbackTimer !== null;

    return throttled;
}
