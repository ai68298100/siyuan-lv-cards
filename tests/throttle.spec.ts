import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { throttle, debounce, rafThrottle } from "@/libs/throttle";

describe("throttle / 节流工具测试", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("默认 leading=true, trailing=true：首次立即触发，后续合并至等待期结束执行最后一次参数", () => {
        const spy = vi.fn();
        const throttled = throttle(spy, 100);

        throttled("a");
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenLastCalledWith("a");

        throttled("b");
        throttled("c");
        expect(spy).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(100);
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenLastCalledWith("c");
    });

    it("leading=false：首次不立即触发，等待窗口到期后执行", () => {
        const spy = vi.fn();
        const throttled = throttle(spy, 100, { leading: false });

        throttled("x");
        expect(spy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(99);
        expect(spy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenLastCalledWith("x");
    });

    it("trailing=false：等待期内的多次调用被丢弃，不执行尾部调用", () => {
        const spy = vi.fn();
        const throttled = throttle(spy, 100, { trailing: false });

        throttled("m");
        expect(spy).toHaveBeenCalledTimes(1);

        throttled("n");
        throttled("o");
        vi.advanceTimersByTime(150);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenLastCalledWith("m");
    });

    it(".cancel() 能够安全清理定时器并丢弃尾部执行，防止内存泄漏", () => {
        const spy = vi.fn();
        const throttled = throttle(spy, 100);

        throttled(1);
        throttled(2);
        expect(throttled.isPending()).toBe(true);

        throttled.cancel();
        expect(throttled.isPending()).toBe(false);

        vi.advanceTimersByTime(150);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenLastCalledWith(1);
    });

    it(".flush() 在有挂起调用时立即执行", () => {
        const spy = vi.fn();
        const throttled = throttle(spy, 100);

        throttled("start");
        throttled("update");
        expect(spy).toHaveBeenCalledTimes(1);

        throttled.flush();
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenLastCalledWith("update");
        expect(throttled.isPending()).toBe(false);
    });
});

describe("debounce / 防抖工具测试", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("高频触发时持续延后，仅在静默期满后执行最新值", () => {
        const spy = vi.fn();
        const debounced = debounce(spy, 200);

        debounced("input-1");
        vi.advanceTimersByTime(100);
        debounced("input-2");
        vi.advanceTimersByTime(100);
        debounced("input-3");

        expect(spy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(200);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenLastCalledWith("input-3");
    });

    it("leading=true, trailing=false：首次调用立即触发，后续在等待期内被抑制", () => {
        const spy = vi.fn();
        const debounced = debounce(spy, 200, { leading: true, trailing: false });

        debounced("first");
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenLastCalledWith("first");

        debounced("second");
        vi.advanceTimersByTime(150);
        debounced("third");
        expect(spy).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(200);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it("leading=true, trailing=true：首次立即触发，并在静默期满后执行最后一次更新", () => {
        const spy = vi.fn();
        const debounced = debounce(spy, 200, { leading: true, trailing: true });

        debounced("first");
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenLastCalledWith("first");

        debounced("second");
        debounced("third");
        expect(spy).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(200);
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenLastCalledWith("third");
    });

    it("maxWait 选项支持最大上限，防止连续不断的高频调用永久饿死", () => {
        const spy = vi.fn();
        const debounced = debounce(spy, 200, { maxWait: 500 });

        // 每 100ms 触发一次，持续 600ms
        for (let i = 0; i < 6; i++) {
            debounced(`call-${i}`);
            vi.advanceTimersByTime(100);
        }

        // 到达 500ms 时必须由 maxWait 强制触发一次
        expect(spy).toHaveBeenCalled();
    });

    it(".cancel() 和 .flush() 正确处理防抖状态", () => {
        const spy = vi.fn();
        const debounced = debounce(spy, 200);

        debounced("pending");
        expect(debounced.isPending()).toBe(true);

        debounced.flush();
        expect(spy).toHaveBeenCalledWith("pending");
        expect(debounced.isPending()).toBe(false);

        debounced("another");
        debounced.cancel();
        expect(debounced.isPending()).toBe(false);
        vi.advanceTimersByTime(300);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe("rafThrottle / 帧率对齐节流测试", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("合并单帧内多次调用，仅在下一帧执行最新的实参", () => {
        const spy = vi.fn();
        const throttled = rafThrottle(spy);

        throttled({ scrollTop: 10 });
        throttled({ scrollTop: 25 });
        throttled({ scrollTop: 50 });

        expect(spy).not.toHaveBeenCalled();
        expect(throttled.isPending()).toBe(true);

        // Advance 16ms to trigger fallback/timer
        vi.advanceTimersByTime(16);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenLastCalledWith({ scrollTop: 50 });
        expect(throttled.isPending()).toBe(false);
    });

    it(".cancel() 能够安全取消帧计划并丢弃调用", () => {
        const spy = vi.fn();
        const throttled = rafThrottle(spy);

        throttled("drag-pos");
        throttled.cancel();
        expect(throttled.isPending()).toBe(false);

        vi.advanceTimersByTime(32);
        expect(spy).not.toHaveBeenCalled();
    });

    it(".flush() 在有排队调用时立即同步执行", () => {
        const spy = vi.fn();
        const throttled = rafThrottle(spy);

        throttled("immediate");
        throttled.flush();
        expect(spy).toHaveBeenCalledWith("immediate");
        expect(throttled.isPending()).toBe(false);
    });
});
