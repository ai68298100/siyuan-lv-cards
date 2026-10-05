/**
 * AI 错误分类（AQ-15）：纯逻辑、零依赖（可在 node/单测环境直接加载）。
 * fallback 只对可恢复错误生效；401/配额/4xx/取消/解析失败直接给原因。
 * BU-28（v0.189.0）起判定事实源收敛到 core/ai-degradation 阶梯分类器，本模块保留为兼容口径。
 */
import { classifyAiFailure, isRetryableClass } from "../core/ai-degradation";

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
