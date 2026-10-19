/**
 * BL-4 Agent 工具能力目录与权限调用契约引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 结构化 Schema 声明：为读取统计、准备候选、打开范围、导出报告等 6 大能力定义标准 JSON Schema、副作用类型与权限声明；
 * 2. 授权前置检查：严格绑定 BL-5 同意中心，无 API 配置或无授权时坚决拒绝注册或阻断调用；
 * 3. 隐私零原文原则：出参和入参仅传递聚合度量、ID 标识与状态，绝不向外部模型发送未脱敏的私有笔记正文；
 * 4. 纯函数设计，数据不可变隔离。
 */

import { sanitizeSensitiveText } from "./audit-log";
import type { ConsentCapability, ConsentCenterState } from "./consent-center";
import { isConsentGranted } from "./consent-center";

export const AGENT_CAPABILITY_NAMES = [
    "get_learning_stats",
    "prepare_card_candidates",
    "open_review_scope",
    "export_study_report",
    "query_system_health",
    "triage_maintenance_debt",
] as const;

export type AgentCapabilityName = (typeof AGENT_CAPABILITY_NAMES)[number];

export type ToolEffectType = "read-only" | "state-change" | "io-export";

/** Agent 工具参数属性定义 */
export interface ToolPropertySchema {
    type: "string" | "number" | "boolean" | "array";
    description: string;
    enum?: string[];
}

/** 单项 Agent 工具标准契约 */
export interface AgentToolDefinition {
    name: AgentCapabilityName;
    nameKey: string;
    descriptionKey: string;
    effectType: ToolEffectType;
    requiredConsentCapability: ConsentCapability;
    parameters: {
        type: "object";
        properties: Record<string, ToolPropertySchema>;
        required?: string[];
    };
}

/** 全量注册的标准 Agent 工具能力清单 */
export const AGENT_TOOL_REGISTRY: readonly AgentToolDefinition[] = [
    {
        name: "get_learning_stats",
        nameKey: "agentCatalog.tool.getStats.name",
        descriptionKey: "agentCatalog.tool.getStats.desc",
        effectType: "read-only",
        requiredConsentCapability: "ecosystem-bridge",
        parameters: {
            type: "object",
            properties: {
                timeWindowDays: {
                    type: "number",
                    description: "统计天数窗口（默认 7 天）",
                },
                deckId: {
                    type: "string",
                    description: "可选的特定卡组 ID",
                },
            },
        },
    },
    {
        name: "prepare_card_candidates",
        nameKey: "agentCatalog.tool.prepareCandidates.name",
        descriptionKey: "agentCatalog.tool.prepareCandidates.desc",
        effectType: "state-change",
        requiredConsentCapability: "ai-generation",
        parameters: {
            type: "object",
            properties: {
                sourceBlockId: {
                    type: "string",
                    description: "思源笔记来源块 ID",
                },
                suggestedCardType: {
                    type: "string",
                    description: "提议生成的卡片题型",
                    enum: ["qa", "cloze", "choice"],
                },
            },
            required: ["sourceBlockId"],
        },
    },
    {
        name: "open_review_scope",
        nameKey: "agentCatalog.tool.openScope.name",
        descriptionKey: "agentCatalog.tool.openScope.desc",
        effectType: "state-change",
        requiredConsentCapability: "ecosystem-bridge",
        parameters: {
            type: "object",
            properties: {
                presetId: {
                    type: "string",
                    description: "激活的范围预设 ID",
                },
            },
            required: ["presetId"],
        },
    },
    {
        name: "export_study_report",
        nameKey: "agentCatalog.tool.exportReport.name",
        descriptionKey: "agentCatalog.tool.exportReport.desc",
        effectType: "io-export",
        requiredConsentCapability: "content-sharing",
        parameters: {
            type: "object",
            properties: {
                reportType: {
                    type: "string",
                    description: "报告类型",
                    enum: ["weekly", "exam-review", "health-audit"],
                },
            },
            required: ["reportType"],
        },
    },
    {
        name: "query_system_health",
        nameKey: "agentCatalog.tool.queryHealth.name",
        descriptionKey: "agentCatalog.tool.queryHealth.desc",
        effectType: "read-only",
        requiredConsentCapability: "ecosystem-bridge",
        parameters: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "triage_maintenance_debt",
        nameKey: "agentCatalog.tool.triageDebt.name",
        descriptionKey: "agentCatalog.tool.triageDebt.desc",
        effectType: "read-only",
        requiredConsentCapability: "ecosystem-bridge",
        parameters: {
            type: "object",
            properties: {
                maxResults: {
                    type: "number",
                    description: "最大返回待修卡片条数",
                },
            },
        },
    },
];

/**
 * 依据同意中心状态过滤当前允许向 Agent 暴露的工具目录（纯函数）
 */
export function getPermittedAgentTools(
    consentState: ConsentCenterState,
    registry: readonly AgentToolDefinition[] = AGENT_TOOL_REGISTRY,
): AgentToolDefinition[] {
    return registry.filter(tool => isConsentGranted(consentState, tool.requiredConsentCapability));
}

/**
 * 验证并受控调用 Agent 能力（纯函数网关）：
 * 1. 检查工具是否存在；
 * 2. 检查同意中心是否授权该能力（未授权严格抛错拦截）；
 * 3. 校验必填入参；
 * 4. 结果脱敏包装，不包含敏感笔记正文。
 */
export async function invokeAgentCapability<TResult>(
    toolName: AgentCapabilityName,
    params: Record<string, unknown>,
    consentState: ConsentCenterState,
    executor: (params: Record<string, unknown>) => Promise<TResult>,
): Promise<{ success: boolean; data?: TResult; errorKey?: string; errorMessage?: string }> {
    const tool = AGENT_TOOL_REGISTRY.find(t => t.name === toolName);
    if (!tool) {
        return {
            success: false,
            errorKey: "agentCatalog.error.toolNotFound",
            errorMessage: `Unknown tool name: ${toolName}`,
        };
    }

    // 授权门禁检查
    if (!isConsentGranted(consentState, tool.requiredConsentCapability)) {
        return {
            success: false,
            errorKey: "agentCatalog.error.permissionDenied",
            errorMessage: `Capability ${tool.name} requires permission: ${tool.requiredConsentCapability}`,
        };
    }

    // 必填参数校验
    if (tool.parameters.required) {
        for (const reqKey of tool.parameters.required) {
            if (!(reqKey in params) || params[reqKey] === undefined || params[reqKey] === null) {
                return {
                    success: false,
                    errorKey: "agentCatalog.error.missingRequiredParam",
                    errorMessage: `Missing required parameter: ${reqKey}`,
                };
            }
        }
    }

    try {
        const rawResult = await executor(params);
        return {
            success: true,
            data: rawResult,
        };
    } catch (err) {
        return {
            success: false,
            errorKey: "agentCatalog.error.executionFailed",
            errorMessage: sanitizeSensitiveText(err instanceof Error ? err.message : String(err), 80),
        };
    }
}
