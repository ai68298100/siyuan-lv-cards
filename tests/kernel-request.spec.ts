import { afterEach, describe, expect, it, vi } from "vitest";
import { requestKernelData } from "../src/libs/kernel-request";
import { RequestError, StaleRequestError } from "../src/libs/request";

describe("requestKernelData", () => {
    afterEach(() => vi.useRealTimers());

    it("returns validated data and forwards endpoint/payload", async () => {
        const request = vi.fn(async () => ({ code: 0, msg: "", data: { id: "doc-1" } }));
        await expect(requestKernelData(request, "/api/filetree/get", { id: "doc-1" }))
            .resolves.toEqual({ id: "doc-1" });
        expect(request).toHaveBeenCalledWith("/api/filetree/get", { id: "doc-1" });
    });

    it("surfaces kernel errors and malformed envelopes", async () => {
        await expect(requestKernelData(async () => ({ code: -1, msg: "blocked", data: null }), "/api/test", {}))
            .rejects.toThrow("blocked");
        await expect(requestKernelData(async () => ({ data: null }), "/api/test", {}))
            .rejects.toThrow(/code=unknown/);
    });

    it("bounds a request that never settles", async () => {
        vi.useFakeTimers();
        const pending = requestKernelData(() => new Promise(() => {}), "/api/slow", {}, 50);
        const assertion = expect(pending).rejects.toThrow("timeout after 50ms: /api/slow");
        await vi.advanceTimersByTimeAsync(50);
        await assertion;
    });

    it("retries a transient host transport failure only for opted-in reads", async () => {
        let attempts = 0;
        const request = vi.fn(async () => {
            attempts++;
            if (attempts === 1) throw new Error("offline");
            return { code: 0, data: { ok: true } };
        });
        await expect(requestKernelData(request, "/api/read", {}, 100, {
            readOnly: true,
            retries: 1,
            retryDelayMs: 0,
            dedupeKey: "read-once",
        })).resolves.toEqual({ ok: true });
        expect(attempts).toBe(2);
    });

    it("cancels caller wait immediately when caller aborts signal, without waiting for host promise", async () => {
        const controller = new AbortController();
        const request = vi.fn(() => new Promise(() => {})); // 模拟底层未settle的请求

        const pending = requestKernelData(request, "/api/block/get", { id: "b1" }, 10000, {
            signal: controller.signal,
        });

        controller.abort();

        await expect(pending).rejects.toSatisfy((err: unknown) => {
            return err instanceof RequestError && err.kind === "abort";
        });
    });

    it("supersedes older request when a newer request with the same latestKey starts", async () => {
        const pendingResolvers: Array<(value: unknown) => void> = [];
        const request = vi.fn(() => new Promise(resolve => pendingResolvers.push(resolve)));

        const oldRequest = requestKernelData(request, "/api/search", { query: "first" }, 10000, {
            latestKey: "search-input",
        });

        const newRequest = requestKernelData(request, "/api/search", { query: "second" }, 10000, {
            latestKey: "search-input",
        });

        await Promise.resolve();

        // 旧请求返回
        pendingResolvers[0]?.({ code: 0, msg: "", data: "old-data" });
        await expect(oldRequest).rejects.toSatisfy((err: unknown) => {
            return err instanceof StaleRequestError || (err instanceof RequestError && (err.kind === "abort" || err.kind === "stale"));
        });

        // 新请求返回
        pendingResolvers[1]?.({ code: 0, msg: "", data: "new-data" });
        await expect(newRequest).resolves.toBe("new-data");
    });

    it("coalesces identical in-flight read requests sharing the same dedupeKey", async () => {
        let finish!: (val: unknown) => void;
        const request = vi.fn(() => new Promise(resolve => { finish = resolve; }));

        const p1 = requestKernelData(request, "/api/doc", { id: "d1" }, 10000, {
            readOnly: true,
            dedupeKey: "doc:d1",
        });
        const p2 = requestKernelData(request, "/api/doc", { id: "d1" }, 10000, {
            readOnly: true,
            dedupeKey: "doc:d1",
        });

        expect(request).toHaveBeenCalledTimes(1);

        finish({ code: 0, msg: "", data: { title: "Hello Doc" } });

        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).toEqual({ title: "Hello Doc" });
        expect(r2).toEqual({ title: "Hello Doc" });
    });

    it("never retries a write/mutation request even if retries count is specified", async () => {
        let attempts = 0;
        const request = vi.fn(async () => {
            attempts++;
            throw new Error("network glitch during write");
        });

        // readOnly 未配置 (默认为写入)
        await expect(requestKernelData(request, "/api/block/insertBlock", { data: "test" }, 1000, {
            retries: 2,
        })).rejects.toThrow("network glitch during write");

        // 写入操作坚决不发生重试
        expect(attempts).toBe(1);
    });
});
