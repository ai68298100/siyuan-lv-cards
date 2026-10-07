import { afterEach, describe, expect, it, vi } from "vitest";
import { requestKernelData } from "../src/libs/kernel-request";

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
});
