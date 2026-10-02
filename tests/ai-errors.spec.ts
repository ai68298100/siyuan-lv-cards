import { describe, expect, it } from "vitest";
import { isRecoverableAIError, isAICanceled, AICanceledError } from "../src/api/ai-errors";

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
});
