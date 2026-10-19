/**
 * BL-6 建议解释面板与透明度引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 每个系统/AI建议必须说明：输入、来源、规则、版本、是否 AI、是否影响内核；
 * 2. 状态机：proposed（提议中）-> accepted（已采纳）| rejected（已拒绝）| modified（已修改）；
 * 3. 严格非侵入内核断言：明确标注 kernelImpact，绝不静默篡改底层原生调度；
 * 4. 解释绝不泄露 API Key、Token、个人私有绝对路径等敏感凭据。
 */

import { sanitizeSensitiveText } from "./audit-log";

export type SuggestionSourceType =
    | "rule-engine"
    | "heuristic"
    | "ai-model"
    | "user-preference"
    | "statistical-threshold";

export type KernelImpactType =
    | "none"
    | "indirect-session-only"
    | "reschedule-on-confirm";

export type SuggestionDecisionStatus = "proposed" | "accepted" | "rejected" | "modified";

/** 输入事实引用（溯源用） */
export interface ExplanationInputRef {
    type: "block" | "deck" | "revlog-window" | "goal" | "system-clock" | "user-history";
    idOrLabel: string;
    description: string;
}

/** 建议解释详情模型 */
export interface RecommendationExplanation {
    suggestionId: string;
    kind: string;
    title: string;
    summary: string;
    /** 输入事实溯源清单 */
    inputs: ExplanationInputRef[];
    /** 来源类型 */
    sourceType: SuggestionSourceType;
    /** 是否为 AI 驱动生成 */
    isAi: boolean;
    /** AI 模型元信息（若是 AI 生成，记录提供商、模型与模板；绝不记录 key） */
    aiMetadata?: {
        provider: string;
        model: string;
        templateId?: string;
    };
    /** 触发的规则标识或启发式算法名称 */
    ruleIdentifier?: string;
    /** 规则或模型版本号 */
    version: string;
    /** 是否影响内核调度 */
    kernelImpact: KernelImpactType;
    /** 内核影响的具体说明 i18n 键 */
    kernelImpactKey: string;
    /** 用户决策状态 */
    status: SuggestionDecisionStatus;
    /** 用户拒绝时的理由（可选） */
    rejectionReasonKey?: string;
    /** 用户修改建议后的调整摘要（可选） */
    modificationSummary?: string;
    createdAt: number;
    resolvedAt?: number;
}

/** 创建建议解释对象的入参 */
export interface CreateExplanationParams {
    suggestionId?: string;
    kind: string;
    title: string;
    summary: string;
    inputs: ExplanationInputRef[];
    sourceType: SuggestionSourceType;
    version?: string;
    kernelImpact: KernelImpactType;
    aiMetadata?: {
        provider: string;
        model: string;
        templateId?: string;
    };
    ruleIdentifier?: string;
    now?: number;
}

/** 创建一条结构化的建议解释记录（自动脱敏） */
export function createRecommendationExplanation(
    params: CreateExplanationParams,
): RecommendationExplanation {
    const now = params.now ?? Date.now();
    const isAi = params.sourceType === "ai-model";
    const id = params.suggestionId ?? `exp-${now}-${Math.random().toString(36).substring(2, 7)}`;

    // 确定内核影响多语言说明键
    let impactKey = "explainability.impact.none";
    if (params.kernelImpact === "indirect-session-only") {
        impactKey = "explainability.impact.sessionOnly";
    } else if (params.kernelImpact === "reschedule-on-confirm") {
        impactKey = "explainability.impact.confirmReschedule";
    }

    // 严格输入溯源脱敏
    const sanitizedInputs: ExplanationInputRef[] = params.inputs.map(input => ({
        type: input.type,
        idOrLabel: sanitizeSensitiveText(input.idOrLabel, 40),
        description: sanitizeSensitiveText(input.description, 80),
    }));

    return {
        suggestionId: id,
        kind: params.kind,
        title: sanitizeSensitiveText(params.title, 60),
        summary: sanitizeSensitiveText(params.summary, 120),
        inputs: sanitizedInputs,
        sourceType: params.sourceType,
        isAi,
        aiMetadata: isAi && params.aiMetadata ? {
            provider: sanitizeSensitiveText(params.aiMetadata.provider, 30),
            model: sanitizeSensitiveText(params.aiMetadata.model, 30),
            templateId: params.aiMetadata.templateId ? sanitizeSensitiveText(params.aiMetadata.templateId, 30) : undefined,
        } : undefined,
        ruleIdentifier: params.ruleIdentifier ? sanitizeSensitiveText(params.ruleIdentifier, 40) : undefined,
        version: params.version ?? "1.0",
        kernelImpact: params.kernelImpact,
        kernelImpactKey: impactKey,
        status: "proposed",
        createdAt: now,
    };
}

/** 用户采纳建议（纯函数转换） */
export function acceptRecommendation(
    exp: RecommendationExplanation,
    now: number = Date.now(),
): RecommendationExplanation {
    if (exp.status !== "proposed") {
        throw new Error(`Cannot accept suggestion in status: ${exp.status}`);
    }
    return {
        ...exp,
        status: "accepted",
        resolvedAt: now,
    };
}

/** 用户拒绝建议并记录理由（纯函数转换） */
export function rejectRecommendation(
    exp: RecommendationExplanation,
    reasonKey?: string,
    now: number = Date.now(),
): RecommendationExplanation {
    if (exp.status !== "proposed") {
        throw new Error(`Cannot reject suggestion in status: ${exp.status}`);
    }
    return {
        ...exp,
        status: "rejected",
        rejectionReasonKey: reasonKey ?? "explainability.reject.notHelpful",
        resolvedAt: now,
    };
}

/** 用户修改建议并采纳修改后的参数（纯函数转换） */
export function modifyRecommendation(
    exp: RecommendationExplanation,
    modificationSummary: string,
    now: number = Date.now(),
): RecommendationExplanation {
    if (exp.status !== "proposed") {
        throw new Error(`Cannot modify suggestion in status: ${exp.status}`);
    }
    return {
        ...exp,
        status: "modified",
        modificationSummary: sanitizeSensitiveText(modificationSummary, 100),
        resolvedAt: now,
    };
}

/** 格式化为用户友好的多行纯文本解释输出（供复制或展示） */
export function formatExplanationText(exp: RecommendationExplanation): string {
    const lines: string[] = [
        `【${exp.title}】`,
        `建议概要: ${exp.summary}`,
        `来源方式: ${exp.sourceType} (${exp.isAi ? "AI 生成" : "本地规则"}) [v${exp.version}]`,
    ];

    if (exp.isAi && exp.aiMetadata) {
        lines.push(`AI 模型: ${exp.aiMetadata.provider} / ${exp.aiMetadata.model}`);
    } else if (exp.ruleIdentifier) {
        lines.push(`触发规则: ${exp.ruleIdentifier}`);
    }

    lines.push(`内核影响: ${exp.kernelImpact} (确认前不修改原生调度)`);

    if (exp.inputs.length > 0) {
        lines.push("输入依据:");
        for (const input of exp.inputs) {
            lines.push(`  - [${input.type}] ${input.idOrLabel}: ${input.description}`);
        }
    }

    lines.push(`当前决策: ${exp.status}`);
    if (exp.status === "rejected" && exp.rejectionReasonKey) {
        lines.push(`拒绝理由: ${exp.rejectionReasonKey}`);
    } else if (exp.status === "modified" && exp.modificationSummary) {
        lines.push(`人工调整: ${exp.modificationSummary}`);
    }

    return lines.join("\n");
}
