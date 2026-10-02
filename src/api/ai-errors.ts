/**
 * AI 错误分类（AQ-15）：纯逻辑、零依赖（可在 node/单测环境直接加载）。
 * fallback 只对可恢复错误生效；401/配额/4xx/取消/解析失败直接给原因。
 */

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
 */
export function isRecoverableAIError(e: unknown): boolean {
    if (isAICanceled(e)) {
        return false;
    }
    const msg = e instanceof Error ? e.message : String(e ?? "");
    const m = msg.match(/HTTP (\d{3})/);
    if (m) {
        const code = Number(m[1]);
        return code >= 500 || code === 429;
    }
    // 无状态码：网络层故障（Failed to fetch / NetworkError / 超时）可重试；
    // 解析类错误（not an array / JSON）换端点同样非法，不回退
    return /failed to fetch|networkerror|timeout/i.test(msg);
}
