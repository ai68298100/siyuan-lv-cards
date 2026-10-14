import { afterEach, describe, expect, it, vi } from "vitest";
import { getAnkiConnectVersion } from "../src/api/anki-connect";

const jsonResponse = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("AnkiConnect version probe", () => {
    it("uses the unified read-only transport and preserves the AnkiConnect request shape", async () => {
        const fetchMock = vi.fn(async () => jsonResponse({ result: 6, error: null }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(getAnkiConnectVersion("http://127.0.0.1:8765", "secret"))
            .resolves.toBe("6");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8765", expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "version", version: 6, key: "secret" }),
        }));
    });

    it("retries a transient failure once because version is a read-only action", async () => {
        let calls = 0;
        vi.stubGlobal("fetch", vi.fn(async () => {
            calls++;
            if (calls === 1) throw new Error("connection refused");
            return jsonResponse({ result: 6, error: null });
        }));

        await expect(getAnkiConnectVersion("http://127.0.0.1:8765"))
            .resolves.toBe("6");
        expect(calls).toBe(2);
    });

    it("surfaces AnkiConnect application errors without retrying them", async () => {
        const fetchMock = vi.fn(async () => jsonResponse({ result: null, error: "invalid key" }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(getAnkiConnectVersion("http://127.0.0.1:8765", "bad"))
            .rejects.toThrow("invalid key");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
