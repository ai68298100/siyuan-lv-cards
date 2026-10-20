/**
 * BU-3 思源 Agent 能力协商适配器（纯逻辑，Node 可单测）。
 * 
 * 核心设计原则：
 * 1. 真实能力探测：按思源宿主内核版本、Agent API 协议支持、流式输出与取消能力进行动态协商；
 * 2. 诚实降级：未支持、低版本或权限不足时平滑降级至标准 AI 模式或纯本地手工流程（对齐 BU-40）；
 * 3. 杜绝虚假工具：降级为非 Agent 模式时坚决不向宿主注册不可用工具（Zero Fake Tools）；
 * 4. 零内核篡改：无论是原生 Agent 还是降级模式，均严格禁止改变 FSRS 核心调度。
 */

import type { AgentToolDefinition } from "./agent-capability-catalog";
import { AGENT_TOOL_REGISTRY } from "./agent-capability-catalog";
import type { ConsentCenterState } from "./consent-center";
import { isConsentGranted } from "./consent-center";

export type AgentHostProtocolMode = "native-agent" | "standard-ai" | "manual-local";

export interface HostEnvironmentFacts {
    /** 思源宿主版本字符串，如 "3.8.0", "3.9.2" */
    siyuanVersion: string;
    /** 宿主是否声明具备 Agent 运行时 */
    hasAgentRuntime: boolean;
    /** Agent 协议 Schema 版本（如 1, 2） */
    agentProtocolVersion?: number;
    /** 宿主是否支持工具调用 (Function / Tool Calling) */
    supportsFunctionCalling?: boolean;
    /** 宿主是否支持流式输出响应 */
    supportsStreaming?: boolean;
    /** 宿主是否支持真正的请求中止/取消句柄 */
    supportsNativeCancellation?: boolean;
    /** AI 提供商配置是否就绪 */
    aiConfigured: boolean;
}

export interface AgentNegotiationResult {
    /** 协商出的最终运行模式 */
    mode: AgentHostProtocolMode;
    /** 选中的工具调用 Schema 方言 */
    schemaDialect: "json-schema-v1" | "function-spec-legacy" | "none";
    /** 是否可安全执行流式响应 */
    canStream: boolean;
    /** 是否支持主动中断与取消 */
    canCancel: boolean;
    /** 允许向宿主实际注册的工具列表（降级时必须为空，不造假） */
    registeredTools: readonly AgentToolDefinition[];
    /** 降级原因说明多语言键（若未降级则为空或 ready） */
    reasonKey: string;
    /** 无 AI 等价替代路径说明键（BU-40 对齐） */
    fallbackAltKey?: string;
    /** 契约断言：任何模式下均禁止直接修改 FSRS 调度事实源 */
    neverAltersKernelSchedule: true;
}

/** 最低支持思源原生 Agent 协议的内核版本 */
export const MIN_AGENT_SIYUAN_VERSION = "3.9.0";

/**
 * 比较语义化版本号 (v1 >= v2 返回 true)
 */
export function isVersionAtLeast(actual: string, required: string): boolean {
    const parse = (v: string) => v.replace(/^v/i, "").split(".").map(n => parseInt(n, 10) || 0);
    const [a1 = 0, a2 = 0, a3 = 0] = parse(actual);
    const [r1 = 0, r2 = 0, r3 = 0] = parse(required);

    if (a1 !== r1) return a1 > r1;
    if (a2 !== r2) return a2 > r2;
    return a3 >= r3;
}

/**
 * BU-3 协商思源 Agent 能力（纯函数）
 * 根据宿主环境特征与用户同意授权，输出协商契约与合法工具清单。
 */
export function negotiateAgentCapabilities(
    facts: HostEnvironmentFacts,
    consentState?: ConsentCenterState,
): AgentNegotiationResult {
    // 1. 无 AI 配置 -> 纯本地手工模式
    if (!facts.aiConfigured) {
        return {
            mode: "manual-local",
            schemaDialect: "none",
            canStream: false,
            canCancel: false,
            registeredTools: [],
            reasonKey: "agentNegotiator.reason.aiNotConfigured",
            fallbackAltKey: "aiEquiv.alt.cards-generate.1",
            neverAltersKernelSchedule: true,
        };
    }

    // 2. 版本低于最低支持门槛或无 Agent 运行时 -> 降级为标准 AI
    const meetsVersion = isVersionAtLeast(facts.siyuanVersion, MIN_AGENT_SIYUAN_VERSION);
    if (!facts.hasAgentRuntime || !meetsVersion) {
        return {
            mode: "standard-ai",
            schemaDialect: "none",
            canStream: Boolean(facts.supportsStreaming),
            canCancel: Boolean(facts.supportsNativeCancellation),
            registeredTools: [], // 坚决不注册虚假工具
            reasonKey: !meetsVersion
                ? "agentNegotiator.reason.versionTooLow"
                : "agentNegotiator.reason.runtimeNotAvailable",
            fallbackAltKey: "aiEquiv.alt.cards-generate.2",
            neverAltersKernelSchedule: true,
        };
    }

    // 3. 具备 Agent 运行时，但缺乏工具调用机制 -> 降级为标准 AI
    if (!facts.supportsFunctionCalling) {
        return {
            mode: "standard-ai",
            schemaDialect: "none",
            canStream: Boolean(facts.supportsStreaming),
            canCancel: Boolean(facts.supportsNativeCancellation),
            registeredTools: [],
            reasonKey: "agentNegotiator.reason.toolCallingUnsupported",
            fallbackAltKey: "aiEquiv.alt.cards-generate.1",
            neverAltersKernelSchedule: true,
        };
    }

    // 4. 成功协商出原生 Agent 支持
    // 依据用户授权情况动态过滤可注册工具，未授权的工具绝不暴露
    const permittedTools = consentState
        ? AGENT_TOOL_REGISTRY.filter(tool => isConsentGranted(consentState, tool.requiredConsentCapability))
        : AGENT_TOOL_REGISTRY;

    const dialect = facts.agentProtocolVersion && facts.agentProtocolVersion >= 2
        ? "json-schema-v1"
        : "function-spec-legacy";

    return {
        mode: "native-agent",
        schemaDialect: dialect,
        canStream: Boolean(facts.supportsStreaming),
        canCancel: Boolean(facts.supportsNativeCancellation),
        registeredTools: permittedTools,
        reasonKey: "agentNegotiator.reason.ready",
        neverAltersKernelSchedule: true,
    };
}
