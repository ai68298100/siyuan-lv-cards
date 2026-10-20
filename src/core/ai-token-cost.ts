/**
 * BU-12 Token 与成本预估显示及硬上限引擎（纯逻辑，Node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 发送前预估（Pre-flight Estimation）：
 *    在请求外发前，依据输入文本长度与任务特征（制卡张数、释义类型）
 *    高保真估算输入 token、预期输出 token、参考费用 USD 与预计等待时间；
 * 2. 多模型计价与本地模型识别：
 *    结合 BU-18 模型注册表（pricePerM），对云端模型精确核算，对 Ollama 等本地模型标记零费用（0 USD）；
 * 3. 单次/单日硬上限熔断（Hard Ceilings）：
 *    支持配置单次最大 Token 上限、单日累计 Token 上限与单日费用上限；
 *    超限时在发送前硬性阻断，绝不向网络发出任何请求；
 * 4. 诚实提供本地等价备选（对齐 BU-40）：
 *    阻断信息明确配对无 AI 手工替代路径键（fallbackAltKey），
 *    绝不因为超限而静默切换到其他未经同意的付费端点（neverSilentlyFallsBack: true）。
 */

import { lookupModel, estimateCallCostUsd } from "./ai-model-registry";

export type CostCeilingViolation =
    | "single-request-cap-exceeded"
    | "daily-token-cap-exceeded"
    | "daily-cost-cap-exceeded";

export interface PreFlightCostEstimate {
    modelId: string;
    /** 输入 Token 估算 */
    inputTokens: number;
    /** 预期输出 Token 估算 */
    estimatedOutputTokens: number;
    /** 合计预估 Token */
    totalEstimatedTokens: number;
    /** 预估费用 USD（未知价格时为 null，本地模型为 0） */
    estimatedCostUsd: number | null;
    /** 预计等待耗时（毫秒） */
    estimatedLatencyMs: number;
    /** 是否为本地离线零费用模型 */
    isLocalOffline: boolean;
    /** 价格事实源分类 */
    priceSource: "registered" | "local-free" | "unknown";
}

export interface AiHardCeilings {
    /** 单次调用 Token 硬上限（0 代表不限制） */
    singleRequestTokenCap: number;
    /** 单日累计 Token 硬上限（0 代表不限制） */
    dailyTokenCap: number;
    /** 单日累计费用硬上限 USD（0 代表不限制） */
    dailyCostUsdCap: number;
}

export interface PreFlightCeilingCheck {
    allowed: boolean;
    violation?: CostCeilingViolation;
    reasonKey: string;
    /** 无 AI 等价替代流程键（对齐 BU-40） */
    fallbackAltKey: string;
    /** 当前累计用量快照 */
    accumulatedSnapshot: {
        tokens: number;
        costUsd: number;
    };
    /** 契约断言：超限绝不静默放行或自动回退至未同意端点 */
    neverSilentlyFallsBack: true;
}

export const DEFAULT_HARD_CEILINGS: Readonly<AiHardCeilings> = {
    singleRequestTokenCap: 16000,
    dailyTokenCap: 60000,
    dailyCostUsdCap: 2.0, // 默认单日不超过 2 美元
};

/**
 * 轻量计算文本的 Token 数估计（纯逻辑：中文约 1.5 chars/token，英文约 4 chars/token）
 */
export function estimateTextTokens(text: string): number {
    const raw = String(text ?? "").trim();
    if (!raw) return 0;
    // 粗粒度混合统计：非 ASCII 字符（汉字等）权重大于 ASCII 英文单词
    const nonAsciiCount = (raw.match(/[^\x00-\x7F]/g) || []).length;
    const asciiCount = raw.length - nonAsciiCount;
    const est = Math.ceil(nonAsciiCount * 0.75 + asciiCount * 0.25);
    return Math.max(1, est);
}

/**
 * 发送前预估 Token、费用与延迟（纯函数）
 */
export function estimatePreFlightCost(params: {
    modelId?: string;
    promptText: string;
    taskType: "cards-generate" | "concept-explain" | "leech-rewrite";
    cardCount?: number;
}): PreFlightCostEstimate {
    const modelId = params.modelId || "deepseek-chat";
    const model = lookupModel(modelId);

    const inputTokens = estimateTextTokens(params.promptText);

    // 依据任务类型预估输出 Token
    let estimatedOutputTokens = 150;
    if (params.taskType === "cards-generate") {
        const count = Math.max(1, params.cardCount ?? 5);
        estimatedOutputTokens = count * 120; // 假定平均每张问答卡耗费 120 tokens 结构化输出
    } else if (params.taskType === "concept-explain") {
        estimatedOutputTokens = 250;
    } else if (params.taskType === "leech-rewrite") {
        estimatedOutputTokens = 180;
    }

    const totalEstimatedTokens = inputTokens + estimatedOutputTokens;

    // 判断是否为本地模型
    const isLocalOffline = Boolean(
        model?.limits?.includes("local-offline") ||
        model?.provider === "ollama" ||
        modelId.startsWith("qwen") ||
        modelId.startsWith("llama")
    );

    let estimatedCostUsd: number | null = null;
    let priceSource: "registered" | "local-free" | "unknown" = "unknown";

    if (isLocalOffline) {
        estimatedCostUsd = 0;
        priceSource = "local-free";
    } else if (model?.pricePerM) {
        estimatedCostUsd = estimateCallCostUsd(modelId, inputTokens, estimatedOutputTokens);
        priceSource = "registered";
    }

    // 预估耗时：基础网络建立 1000ms + 推理延迟 + Token 输出速度
    const isReasoning = Boolean(model?.limits?.includes("reasoning-latency") || modelId.includes("reasoner") || modelId.includes("r1"));
    const baseLatency = isReasoning ? 6000 : 1200;
    const tokenSpeedFactor = isLocalOffline ? 35 : 55; // 本地推理速度稍慢于云端
    const estimatedLatencyMs = Math.round(baseLatency + (estimatedOutputTokens / tokenSpeedFactor) * 1000);

    return {
        modelId,
        inputTokens,
        estimatedOutputTokens,
        totalEstimatedTokens,
        estimatedCostUsd,
        estimatedLatencyMs,
        isLocalOffline,
        priceSource,
    };
}

/**
 * 发送前检查单次与单日硬上限（纯函数）
 */
export function checkHardCeilings(
    estimate: PreFlightCostEstimate,
    ceilings: AiHardCeilings = DEFAULT_HARD_CEILINGS,
    dailyAccumulated: { tokens: number; costUsd: number } = { tokens: 0, costUsd: 0 },
): PreFlightCeilingCheck {
    const fallbackAltKey = "aiEquiv.alt.cards-generate.1";

    // 1. 单次请求 Token 硬上限拦截
    if (ceilings.singleRequestTokenCap > 0 && estimate.totalEstimatedTokens > ceilings.singleRequestTokenCap) {
        return {
            allowed: false,
            violation: "single-request-cap-exceeded",
            reasonKey: "aiTokenCost.error.singleCapExceeded",
            fallbackAltKey,
            accumulatedSnapshot: { ...dailyAccumulated },
            neverSilentlyFallsBack: true,
        };
    }

    // 2. 单日累计 Token 硬上限拦截
    const nextDailyTokens = dailyAccumulated.tokens + estimate.totalEstimatedTokens;
    if (ceilings.dailyTokenCap > 0 && nextDailyTokens > ceilings.dailyTokenCap) {
        return {
            allowed: false,
            violation: "daily-token-cap-exceeded",
            reasonKey: "aiTokenCost.error.dailyTokensExceeded",
            fallbackAltKey,
            accumulatedSnapshot: { ...dailyAccumulated },
            neverSilentlyFallsBack: true,
        };
    }

    // 3. 单日累计费用硬上限拦截
    if (ceilings.dailyCostUsdCap > 0 && estimate.estimatedCostUsd !== null) {
        const nextDailyCost = dailyAccumulated.costUsd + estimate.estimatedCostUsd;
        if (nextDailyCost > ceilings.dailyCostUsdCap) {
            return {
                allowed: false,
                violation: "daily-cost-cap-exceeded",
                reasonKey: "aiTokenCost.error.dailyCostExceeded",
                fallbackAltKey,
                accumulatedSnapshot: { ...dailyAccumulated },
                neverSilentlyFallsBack: true,
            };
        }
    }

    return {
        allowed: true,
        reasonKey: "aiTokenCost.allowed.withinBudget",
        fallbackAltKey,
        accumulatedSnapshot: { ...dailyAccumulated },
        neverSilentlyFallsBack: true,
    };
}
