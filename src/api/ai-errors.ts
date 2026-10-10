/**
 * AI 错误分类（AQ-15）：纯逻辑、零依赖（可在 node/单测环境直接加载）。
 * fallback 只对可恢复错误生效；401/配额/4xx/取消/解析失败直接给原因。
 * BU-28（v0.189.0）起判定事实源收敛到 core/ai-degradation 阶梯分类器，本模块保留为兼容口径。
 */
import { classifyAiFailure, isRetryableClass } from "../core/ai-degradation";

/**
 * HTTP 层错误：保留状态码和服务端机器码，避免把响应正文（可能包含用户材料）
 * 原样拼进错误消息。机器码足够让降级分类器区分 429 限流与配额耗尽。
 */
export class AIHttpError extends Error {
    readonly status: number;
    readonly reasonCode?: string;
    readonly retryAfterMs?: number;

    constructor(status: number, reasonCode?: string, retryAfterMs?: number) {
        const code = reasonCode ? ` (${reasonCode})` : "";
        super(`AI HTTP ${status}${code}`);
        this.name = "AIHttpError";
        this.status = status;
        this.reasonCode = reasonCode;
        this.retryAfterMs = retryAfterMs;
    }
}

/** Retry-After 支持秒数和 HTTP-date 两种标准格式。 */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
    if (!value) {
        return undefined;
    }
    const raw = value.trim();
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
        return Math.max(0, Math.round(Number(raw) * 1000));
    }
    const at = Date.parse(raw);
    return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

/** 从错误响应中只提取安全的机器码，不泄漏 message/details 原文。 */
export function extractAIErrorCode(payload: unknown): string | undefined {
    const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
    const nested = root?.error && typeof root.error === "object" ? root.error as Record<string, unknown> : null;
    const candidates = [nested?.code, nested?.type, root?.code, root?.type];
    const code = candidates.find(v => typeof v === "string" && /^[a-z0-9_.-]{2,80}$/i.test(v as string));
    return typeof code === "string" ? code : undefined;
}

/** 用户/调用方主动取消（区别于超时）：向导静默处理，不当作错误展示 */
export class AICanceledError extends Error {
    constructor() {
        super("AI canceled");
        this.name = "AICanceledError";
    }
}

export function isAICanceled(e: unknown): boolean {
    return e instanceof AICanceledError
        || (e instanceof Error && e.name === "AICanceledError")
        || (e instanceof Error && e.name === "AbortError");
}

/**
 * 是否可用备用端点重试（AQ-15）：仅网络故障/超时/5xx/429；
 * 401/403/配额/其余 4xx/响应解析失败/取消均直接失败并给原因。
 * 判定委托 BU-28 阶梯分类器（单一事实源，防两处口径漂移）。
 */
export function isRecoverableAIError(e: unknown): boolean {
    return isRetryableClass(classifyAiFailure(e).cls);
}
