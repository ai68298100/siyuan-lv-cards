import { afterEach, describe, expect, it, vi } from "vitest";
import { postJSON, requestWithPolicy, StaleRequestError } from "../src/libs/request";

afterEach(() => {
    vi.useRealTimers();
});

describe("requestWithPolicy", () => {
    it("coalesces identical read-only managed requests", async () => {
        let finish: ((value: number) => void) | undefined;
        const executor = vi.fn(() => new Promise<number>(resolve => { finish = resolve; }));
        const first = requestWithPolicy(executor, { readOnly: true, dedupeKey: "cards" });
        const same = requestWithPolicy(executor, { readOnly: true, dedupeKey: "cards" });
        await Promise.resolve();
        expect(executor).toHaveBeenCalledTimes(1);
        finish?.(7);
        await expect(Promise.all([first, same])).resolves.toEqual([7, 7]);
    });

    it("coalesces identical reads even when a latest-wins scope is present", async () => {
        let finish: ((value: string) => void) | undefined;
        const executor = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
        const first = requestWithPolicy(executor, { readOnly: true, dedupeKey: "cards:p1", latestKey: "cards" });
        const same = requestWithPolicy(executor, { readOnly: true, dedupeKey: "cards:p1", latestKey: "cards" });
        expect(executor).toHaveBeenCalledTimes(1);
        finish?.("ok");
        await expect(Promise.all([first, same])).resolves.toEqual(["ok", "ok"]);
    });

    it("marks a late response stale when a newer logical request starts", async () => {
        const pending: Array<(value: string) => void> = [];
        const executor = vi.fn(() => new Promise<string>(resolve => pending.push(resolve)));
        const old = requestWithPolicy(executor, { latestKey: "search" });
        const current = requestWithPolicy(executor, { latestKey: "search" });
        await Promise.resolve();
        pending[0]?.("old");
        await expect(old).rejects.toSatisfy(error =>
            error instanceof StaleRequestError || (error && typeof error === "object" && "kind" in error && (error as { kind?: string }).kind === "abort"),
        );
        pending[1]?.("new");
        await expect(current).resolves.toBe("new");
    });

    it("bounds a non-settling executor and aborts its signal", async () => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        const result = requestWithPolicy((_signal) => {
            signal = _signal;
            return new Promise<never>(() => undefined);
        }, { timeoutMs: 25 });
        const assertion = expect(result).rejects.toMatchObject({ kind: "timeout" });
        await vi.advanceTimersByTimeAsync(25);
        await assertion;
        expect(signal?.aborted).toBe(true);
    });

    it("applies latest-wins to fetch-backed calls", async () => {
        const pending: Array<(value: Response) => void> = [];
        vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => pending.push(resolve))));
        const old = postJSON("/api/search", { q: "a" }, { latestKey: "search" });
        await Promise.resolve();
        const current = postJSON("/api/search", { q: "ab" }, { latestKey: "search" });
        await Promise.resolve();
        pending[0]?.(new Response(JSON.stringify({ value: "old" }), { status: 200 }));
        await expect(old).rejects.toSatisfy(error =>
            error instanceof StaleRequestError || (error && typeof error === "object" && "kind" in error && (error as { kind?: string }).kind === "abort"),
        );
        pending[1]?.(new Response(JSON.stringify({ value: "new" }), { status: 200 }));
        await expect(current).resolves.toEqual({ value: "new" });
    });
});
