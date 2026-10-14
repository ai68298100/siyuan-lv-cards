import { afterEach, describe, expect, it, vi } from "vitest";
import { aiChat, AICanceledError, AIHttpError } from "../src/api/ai";

const cfg = (endpoint = "https://primary.example/v1") => ({
    mode: "custom" as const,
    endpoint,
    apiKey: "test-key",
    model: "test-model",
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("aiChat custom transport", () => {
    it("uses the shared request policy and parses a successful completion", async () => {
        const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
            expect(url).toBe("https://primary.example/v1/chat/completions");
            expect(init.method).toBe("POST");
            expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
            return new Response(JSON.stringify({ choices: [{ message: { content: "answer" } }] }), { status: 200 });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(aiChat(cfg(), "system", "user")).resolves.toBe("answer");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("keeps safe HTTP classification and does not expose response details", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(
            JSON.stringify({ error: { code: "invalid_api_key", message: "secret material" } }),
            { status: 401 },
        )));

        const error = await aiChat(cfg(), "system", "user").catch(e => e);
        expect(error).toBeInstanceOf(AIHttpError);
        expect(error.status).toBe(401);
        expect(error.message).toBe("AI HTTP 401 (invalid_api_key)");
        expect(error.message).not.toContain("secret material");
    });

    it("aborts the underlying fetch when the shared deadline expires", async () => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
            signal = init.signal as AbortSignal;
            return new Promise<Response>(() => undefined);
        }));

        const result = aiChat(cfg(), "system", "user", { timeoutMs: 25 });
        const assertion = expect(result).rejects.toThrow("AI timeout after 25ms");
        await vi.advanceTimersByTimeAsync(25);
        await assertion;
        expect(signal?.aborted).toBe(true);
    });

    it("turns caller cancellation into AICanceledError and does not fallback", async () => {
        const controller = new AbortController();
        const fetchMock = vi.fn((_url: string, init: RequestInit) => {
            (init.signal as AbortSignal).addEventListener("abort", () => undefined);
            return new Promise<Response>(() => undefined);
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = aiChat({ ...cfg(), fallbackEndpoint: "https://fallback.example/v1" }, "system", "user", { signal: controller.signal });
        await Promise.resolve();
        controller.abort();
        await expect(result).rejects.toBeInstanceOf(AICanceledError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
