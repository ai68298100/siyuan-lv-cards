import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "../src/libs/timeout";

// AT-3 可取消超时层：调用方在 ms 内必然得到确定结果（成功/原始错误/超时），
// 计时器在任一方先落定时清除。慢核/断核 fixture 在单测层以「永不落定的 Promise」模拟，
// flashcardV2.ts 的接线（siyuan 包模块）按 vitest.config.ts 既定策略不进 node 测试。
describe("withTimeout（AT-3 有界等待）", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("先落定：值原样透传", async () => {
        await expect(withTimeout(Promise.resolve(42), 1000, "fast")).resolves.toBe(42);
    });

    it("先拒绝：原始错误原样透传（不被超时错误覆盖）", async () => {
        const boom = new Error("kernel down");
        await expect(withTimeout(Promise.reject(boom), 1000, "broken")).rejects.toBe(boom);
    });

    it("慢响应：ms 内以 TimeoutError 拒绝，label 与时长可读", async () => {
        vi.useFakeTimers();
        const slow = new Promise<string>(() => {}); // 永不落定 = 慢核 fixture
        const p = withTimeout(slow, 3000, "/api/flashcard/getMigrationStatus");
        const assertion = expect(p).rejects.toSatisfy((e: unknown) => {
            return e instanceof TimeoutError
                && e.name === "TimeoutError"
                && (e as TimeoutError).message.includes("3000ms")
                && (e as TimeoutError).message.includes("getMigrationStatus");
        });
        vi.advanceTimersByTime(3000);
        await assertion;
    });

    it("先落定后计时器清除：快进不再产生迟到超时拒绝", async () => {
        vi.useFakeTimers();
        const p = withTimeout(Promise.resolve("ok"), 50, "quick");
        await p;
        vi.advanceTimersByTime(60_000);
        expect(await p).toBe("ok");
    });

    it("先拒绝后计时器清除：快进不产生第二个拒绝", async () => {
        vi.useFakeTimers();
        const p = withTimeout(Promise.reject(new Error("early")), 50, "early-fail");
        await expect(p).rejects.toThrow("early");
        vi.advanceTimersByTime(60_000); // 若计时器未清，这里会抛未处理拒绝
    });

    it("TimeoutError 是 Error 实例（friendlyError 可归类）", () => {
        expect(new TimeoutError("x", 1)).toBeInstanceOf(Error);
    });
});
