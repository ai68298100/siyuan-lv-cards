import { describe, expect, it } from "vitest";
import { AIHttpError, extractAIErrorCode, isRecoverableAIError, isAICanceled, AICanceledError, parseRetryAfter } from "../src/api/ai-errors";
import { classifyAiFailure } from "../src/core/ai-degradation";

describe("AI 错误分类（AQ-15：fallback 只对可恢复错误生效）", () => {
    it("网络故障与超时可恢复", () => {
        expect(isRecoverableAIError(new TypeError("Failed to fetch"))).toBe(true);
        expect(isRecoverableAIError(new Error("NetworkError when attempting to fetch resource"))).toBe(true);
        expect(isRecoverableAIError(new Error("AI timeout after 15000ms"))).toBe(true);
    });

    it("5xx 与 429 可恢复", () => {
        expect(isRecoverableAIError(new Error("AI HTTP 502"))).toBe(true);
        expect(isRecoverableAIError(new Error("AI HTTP 429"))).toBe(true);
    });

    it("401/403/404/其余 4xx 不可恢复", () => {
        expect(isRecoverableAIError(new Error("AI HTTP 401"))).toBe(false);
        expect(isRecoverableAIError(new Error("AI HTTP 403"))).toBe(false);
        expect(isRecoverableAIError(new Error("AI HTTP 404"))).toBe(false);
        expect(isRecoverableAIError(new Error("AI HTTP 400"))).toBe(false);
    });

    it("解析失败与取消不可恢复", () => {
        expect(isRecoverableAIError(new Error("AI parse failed"))).toBe(false);
        expect(isRecoverableAIError(new Error("not an array"))).toBe(false);
        expect(isRecoverableAIError(new AICanceledError())).toBe(false);
        const abort = new Error("aborted");
        abort.name = "AbortError";
        expect(isRecoverableAIError(abort)).toBe(false);
    });

    it("isAICanceled 识别取消", () => {
        expect(isAICanceled(new AICanceledError())).toBe(true);
        const abort = new Error("aborted");
        abort.name = "AbortError";
        expect(isAICanceled(abort)).toBe(true);
        expect(isAICanceled(new Error("AI HTTP 500"))).toBe(false);
    });

    it("HTTP 错误保留机器码/Retry-After，但不携带响应正文", () => {
        const e = new AIHttpError(429, "insufficient_quota", 7000);
        expect(e.message).toBe("AI HTTP 429 (insufficient_quota)");
        expect(classifyAiFailure(e).cls).toBe("quota");
        expect(classifyAiFailure(new AIHttpError(429, "rate_limit", 7000))).toMatchObject({ cls: "rate-limit", retryAfterMs: 7000 });
        expect(e.message).not.toContain("secret material");
    });

    it("解析标准 Retry-After 秒数和 HTTP 日期", () => {
        expect(parseRetryAfter("7", 1000)).toBe(7000);
        expect(parseRetryAfter("Wed, 21 Oct 2015 07:28:00 GMT", Date.parse("Wed, 21 Oct 2015 07:27:55 GMT"))).toBe(5000);
        expect(parseRetryAfter("nope")).toBeUndefined();
    });

    it("只提取安全的错误码，不读取 message/details", () => {
        expect(extractAIErrorCode({ error: { code: "rate_limit", message: "secret material" } })).toBe("rate_limit");
        expect(extractAIErrorCode({ error: { message: "secret material" } })).toBeUndefined();
        expect(extractAIErrorCode({ code: "bad code with spaces" })).toBeUndefined();
    });
});
