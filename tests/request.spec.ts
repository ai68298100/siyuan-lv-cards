import { afterEach, describe, expect, it, vi } from "vitest";
import { postJSON, RequestError } from "../src/libs/request";

function response(status: number, body: unknown = { ok: true }) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("postJSON transport", () => {
    it("distinguishes caller abort from timeout and does not retry either", async () => {
        const abortController = new AbortController();
        const abortFetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        }));
        vi.stubGlobal("fetch", abortFetch);
        const aborted = postJSON("/api/read", {}, {
            readOnly: true, retries: 2, retryDelayMs: 0, signal: abortController.signal,
        });
        abortController.abort();
        await expect(aborted).rejects.toMatchObject({ kind: "abort" });
        expect(abortFetch).toHaveBeenCalledTimes(1);

        vi.useFakeTimers();
        const timeoutFetch = vi.fn(() => new Promise<Response>(() => {}));
        vi.stubGlobal("fetch", timeoutFetch);
        const timedOut = postJSON("/api/slow", {}, { readOnly: true, retries: 2, timeoutMs: 40 });
        const result = expect(timedOut).rejects.toMatchObject({ kind: "timeout" });
        await vi.advanceTimersByTimeAsync(40);
        await result;
        expect(timeoutFetch).toHaveBeenCalledTimes(1);
    });

    it("retries only opted-in read requests for network and HTTP 5xx failures", async () => {
        let networkCalls = 0;
        vi.stubGlobal("fetch", vi.fn(async () => {
            networkCalls++;
            if (networkCalls === 1) throw new Error("offline");
            return response(200, { value: 1 });
        }));
        await expect(postJSON("/api/read", { id: 1 }, {
            readOnly: true, retries: 1, retryDelayMs: 0,
        })).resolves.toEqual({ value: 1 });
        expect(networkCalls).toBe(2);

        let serverCalls = 0;
        vi.stubGlobal("fetch", vi.fn(async () => {
            serverCalls++;
            return serverCalls === 1 ? response(503) : response(200, { recovered: true });
        }));
        await expect(postJSON("/api/read", { id: 2 }, {
            readOnly: true, retries: 1, retryDelayMs: 0,
        })).resolves.toEqual({ recovered: true });
        expect(serverCalls).toBe(2);
    });

    it("does not retry 4xx or writes, even when a retry count is supplied", async () => {
        const unauthorizedFetch = vi.fn(async () => response(401));
        vi.stubGlobal("fetch", unauthorizedFetch);
        await expect(postJSON("/api/read", {}, { readOnly: true, retries: 2, retryDelayMs: 0 }))
            .rejects.toMatchObject({ kind: "http", status: 401 });
        expect(unauthorizedFetch).toHaveBeenCalledTimes(1);

        const writeFetch = vi.fn(async () => { throw new Error("offline"); });
        vi.stubGlobal("fetch", writeFetch);
        await expect(postJSON("/api/write", {}, { retries: 2, retryDelayMs: 0 }))
            .rejects.toMatchObject({ kind: "network" });
        expect(writeFetch).toHaveBeenCalledTimes(1);
    });

    it("coalesces identical read-only requests while keeping payloads and keys isolated", async () => {
        const pending: Array<(value: Response) => void> = [];
        const fetchMock = vi.fn(() => new Promise<Response>(resolve => pending.push(resolve)));
        vi.stubGlobal("fetch", fetchMock);

        const first = postJSON("/api/cards", { page: 1 }, { readOnly: true, dedupeKey: "cards" });
        const same = postJSON("/api/cards", { page: 1 }, { readOnly: true, dedupeKey: "cards" });
        const otherPayload = postJSON("/api/cards", { page: 2 }, { readOnly: true, dedupeKey: "cards" });
        const otherKey = postJSON("/api/cards", { page: 1 }, { readOnly: true, dedupeKey: "other" });
        expect(fetchMock).toHaveBeenCalledTimes(3);

        pending[0](response(200, { page: 1 }));
        pending[1](response(200, { page: 2 }));
        pending[2](response(200, { page: 1, key: "other" }));
        await expect(Promise.all([first, same, otherPayload, otherKey])).resolves.toEqual([
            { page: 1 }, { page: 1 }, { page: 2 }, { page: 1, key: "other" },
        ]);
    });

    it("lets one consumer abort a shared read without canceling the other", async () => {
        let finish: ((value: Response) => void) | undefined;
        const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
        vi.stubGlobal("fetch", fetchMock);
        const controller = new AbortController();
        const canceled = postJSON("/api/cards", { page: 1 }, {
            readOnly: true, dedupeKey: "cards", signal: controller.signal,
        });
        const remaining = postJSON("/api/cards", { page: 1 }, { readOnly: true, dedupeKey: "cards" });
        controller.abort();
        await expect(canceled).rejects.toBeInstanceOf(RequestError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        finish?.(response(200, { page: 1 }));
        await expect(remaining).resolves.toEqual({ page: 1 });
    });
});
