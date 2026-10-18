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

    it("falls back to secondary endpoint on recoverable server error (500) and notifies callbacks (AQ-15)", async () => {
        let attempts = 0;
        const fetchMock = vi.fn(async (url: string) => {
            attempts++;
            if (url.startsWith("https://primary.example")) {
                return new Response(JSON.stringify({ error: { message: "internal error" } }), { status: 500 });
            }
            if (url.startsWith("https://fallback.example")) {
                return new Response(JSON.stringify({ choices: [{ message: { content: "fallback answer" } }] }), { status: 200 });
            }
            throw new Error("unexpected url");
        });
        vi.stubGlobal("fetch", fetchMock);

        const onProvider = vi.fn();
        const onDegradation = vi.fn();

        const config = {
            ...cfg("https://primary.example/v1"),
            fallbackEndpoint: "https://fallback.example/v1",
            fallbackApiKey: "fb-key",
            fallbackModel: "fb-model",
        };

        const res = await aiChat(config, "sys", "user", { onProvider, onDegradation });

        expect(res).toBe("fallback answer");
        expect(attempts).toBe(2);
        expect(onProvider).toHaveBeenCalledWith("fallback");
        expect(onDegradation).toHaveBeenCalledWith(expect.objectContaining({ action: "try-fallback" }));
    });

    it("refuses to fallback on non-recoverable client/auth error (401) and fails fast (AQ-15)", async () => {
        let attempts = 0;
        const fetchMock = vi.fn(async () => {
            attempts++;
            return new Response(JSON.stringify({ error: { code: "invalid_api_key" } }), { status: 401 });
        });
        vi.stubGlobal("fetch", fetchMock);

        const onProvider = vi.fn();
        const config = {
            ...cfg("https://primary.example/v1"),
            fallbackEndpoint: "https://fallback.example/v1",
        };

        await expect(aiChat(config, "sys", "user", { onProvider })).rejects.toThrow("AI HTTP 401");

        // 401 属于不可恢复认证错误，坚决不向备用端点重放，fetch 仅调用 1 次且只通知 primary
        expect(attempts).toBe(1);
        expect(onProvider).toHaveBeenCalledWith("primary");
        expect(onProvider).not.toHaveBeenCalledWith("fallback");
    });

    it("normalizes endpoints and refuses to fallback if secondary is identical modulo trailing slashes (AQ-15)", async () => {
        let attempts = 0;
        const fetchMock = vi.fn(async () => {
            attempts++;
            return new Response(JSON.stringify({ error: { message: "server down" } }), { status: 503 });
        });
        vi.stubGlobal("fetch", fetchMock);

        // 主端点无尾斜杠，备用端点有多余尾斜杠，实际上指向相同端点
        const config = {
            ...cfg("https://same-host.example/v1"),
            fallbackEndpoint: "https://same-host.example/v1///",
        };

        await expect(aiChat(config, "sys", "user")).rejects.toThrow("AI HTTP 503");

        // 规范化识别出相同端点后不发起第 2 次重复请求
        expect(attempts).toBe(1);
    });

    it("combines both errors into descriptive message when both endpoints fail (AQ-15)", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.startsWith("https://primary.example")) {
                return new Response(JSON.stringify({ error: { message: "primary unavailable" } }), { status: 502 });
            }
            if (url.startsWith("https://fallback.example")) {
                return new Response(JSON.stringify({ error: { message: "fallback overloaded" } }), { status: 503 });
            }
            throw new Error("unexpected url");
        });
        vi.stubGlobal("fetch", fetchMock);

        const config = {
            ...cfg("https://primary.example/v1"),
            fallbackEndpoint: "https://fallback.example/v1",
        };

        const error = await aiChat(config, "sys", "user").catch(e => e);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain("AI fail: primary (AI HTTP 502) | fallback (AI HTTP 503)");
    });
});
