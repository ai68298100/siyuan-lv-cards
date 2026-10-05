import { describe, expect, it } from "vitest";
import {
    AI_FAILURE_CLASSES,
    classifyAiFailure,
    nextLadderStep,
    isRetryableClass,
    type FailureVerdict,
} from "../src/core/ai-degradation";

// BU-28 分层降级阶梯：网络/5xx/限流可重试或转备用；隐私/401/配额/解析/风险/取消一律中止
const v = (cls: FailureVerdict["cls"], retryAfterMs?: number): FailureVerdict => ({ cls, detail: `detail:${cls}`, retryAfterMs });

describe("ai-degradation（BU-28）", () => {
    it("类别全集在册且互不重合", () => {
        expect(new Set(AI_FAILURE_CLASSES).size).toBe(AI_FAILURE_CLASSES.length);
        expect(AI_FAILURE_CLASSES).toContain("rate-limit");
    });

    it("分类：取消优先（AbortError/AICanceledError/AI canceled 文本）", () => {
        const abort = new Error("x");
        abort.name = "AbortError";
        expect(classifyAiFailure(abort).cls).toBe("canceled");
        const c = new Error("AI canceled");
        c.name = "AICanceledError";
        expect(classifyAiFailure(c).cls).toBe("canceled");
        expect(classifyAiFailure(new Error("ai canceled by user")).cls).toBe("canceled");
    });

    it("分类：隐私拒绝与配额（429+insufficient_quota 归配额而非限流——重试有害）", () => {
        expect(classifyAiFailure(new Error("content_policy violation")).cls).toBe("privacy");
        expect(classifyAiFailure(new Error("request blocked by content filter")).cls).toBe("privacy");
        expect(classifyAiFailure(new Error("429 insufficient_quota: billing limit")).cls).toBe("quota");
        expect(classifyAiFailure(new Error("AI HTTP 402")).cls).toBe("quota");
    });

    it("分类：HTTP 状态码——401/403=auth、429=限流、5xx=server、其余 4xx=unknown", () => {
        expect(classifyAiFailure(new Error("AI HTTP 401")).cls).toBe("auth");
        expect(classifyAiFailure(new Error("AI HTTP 403")).cls).toBe("auth");
        expect(classifyAiFailure(new Error("AI HTTP 429")).cls).toBe("rate-limit");
        expect(classifyAiFailure(new Error("AI HTTP 502")).cls).toBe("server");
        expect(classifyAiFailure(new Error("AI HTTP 404")).cls).toBe("unknown");
    });

    it("分类：网络层（含 retry-after 提取）与解析失败", () => {
        const net = classifyAiFailure(new Error("Failed to fetch"));
        expect(net.cls).toBe("network");
        const rl = classifyAiFailure(new Error("429 too many requests, retry-after: 7"));
        expect(rl.cls).toBe("rate-limit");
        expect(rl.retryAfterMs).toBe(7000);
        expect(classifyAiFailure(new Error("AI parse failed")).cls).toBe("parse");
        expect(classifyAiFailure(new Error("not an array")).cls).toBe("parse");
        expect(classifyAiFailure(new Error("something odd")).cls).toBe("unknown");
    });

    it("阶梯：可重试类按预算重试主端点；预算用尽转备用；无备用中止", () => {
        const policy3 = { maxPrimaryAttempts: 3, hasFallback: false };
        const s1 = nextLadderStep(v("server"), policy3, 1);
        expect(s1.action).toBe("retry-primary");
        expect(s1.mayCost).toBe(true);
        expect(s1.usedFallback).toBe(false);
        const s3 = nextLadderStep(v("server"), policy3, 3);
        expect(s3.action).toBe("abort"); // 无备用
        const s3f = nextLadderStep(v("server"), { maxPrimaryAttempts: 3, hasFallback: true }, 3);
        expect(s3f.action).toBe("try-fallback");
        expect(s3f.usedFallback).toBe(true);
        expect(s3f.mayCost).toBe(true);
    });

    it("阶梯：限流建议等待——服务端 Retry-After 优先，缺省用策略基值", () => {
        const withRa = nextLadderStep(v("rate-limit", 7000), { maxPrimaryAttempts: 3, hasFallback: false, retryBaseMs: 2000 }, 1);
        expect(withRa.retryAfterMs).toBe(7000);
        const fallbackBase = nextLadderStep(v("rate-limit"), { maxPrimaryAttempts: 2, hasFallback: false, retryBaseMs: 4000 }, 1);
        expect(fallbackBase.retryAfterMs).toBe(4000);
        // 非限流重试不带等待
        expect(nextLadderStep(v("network"), { maxPrimaryAttempts: 2, hasFallback: false }, 1).retryAfterMs).toBeUndefined();
    });

    it("阶梯：终止类无论尝试次数与备用可用性一律中止、不产生费用（无静默回退）", () => {
        const policy = { maxPrimaryAttempts: 3, hasFallback: true };
        for (const cls of ["auth", "quota", "privacy", "parse", "risk", "canceled", "unknown"] as const) {
            const step = nextLadderStep(v(cls), policy, 1);
            expect(step.action).toBe("abort");
            expect(step.mayCost).toBe(false);
            expect(step.usedFallback).toBe(false);
            expect(step.reasonKey).toBe(`aiDegrad.class.${cls}`);
            expect(step.actionKey).toBe("aiDegrad.action.abort");
        }
    });

    it("兼容口径 isRetryableClass：仅网络/5xx/限流（AQ-15 委托事实源）", () => {
        expect(isRetryableClass("network")).toBe(true);
        expect(isRetryableClass("server")).toBe(true);
        expect(isRetryableClass("rate-limit")).toBe(true);
        for (const cls of AI_FAILURE_CLASSES.filter(c => !["network", "server", "rate-limit"].includes(c))) {
            expect(isRetryableClass(cls)).toBe(false);
        }
    });
});
