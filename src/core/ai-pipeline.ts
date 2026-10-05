/**
 * BU-35 统一 AI 调用流水线（v0.171.0 骨架切片，纯逻辑 node 可单测）。
 * 目标架构：TaskRegistry → ContextPack → PromptRegistry → ProviderRouter → SchemaValidator
 * → EvidenceStore → AuditSink（验收：UI/Agent/批处理不得绕过权限、schema、来源、审计）。
 * 本切片把「卡生成」任务的提示组装收编为单一入口：模板解析（BU-5 注册表/自定义）→
 * 不可信围栏（BU-7）→ 上下文预算（BU-6）→ 审计字段产出。
 * ProviderRouter=既有 aiChat 配置（mode/fallback）、SchemaValidator=parseCards+PARSE_LIMITS、
 * EvidenceStore=ai-jobs 摘要（excerpt）、AuditSink=lvLog——均为既有机制，随更多调用点迁移逐步收编。
 */

import { estimateTokens } from "../api/ai-parse";
import { INJECTION_GUARD_DEFAULT, wrapUntrusted } from "./prompt-injection";
import { planContext, type BudgetReport, type ContextLayerKey } from "./context-budget";
import { effectiveBudgetTokens } from "./ai-model-registry";

export const AI_TASKS = ["cards-generate"] as const;
export type AiTask = (typeof AI_TASKS)[number];

/** 任务注册表：任务 → 默认模板/schema 契约/固定写入目标/保守窗口预算（单一入口的权限边界） */
export interface TaskDescriptor {
    task: AiTask;
    defaultTemplateId: string;
    output: "cards-json";
    /** 固定写入目标声明（注入隔离的验收口径；扩展任务必须在此登记） */
    writeTarget: string;
    budgetTokens: number;
}

export const TASK_REGISTRY: Record<AiTask, TaskDescriptor> = {
    "cards-generate": {
        task: "cards-generate",
        defaultTemplateId: "generic",
        output: "cards-json",
        writeTarget: "card-wizard",
        budgetTokens: 24000,
    },
};

export interface AssembleInput {
    task: AiTask;
    /** 用户自定义模板文本（占位符 ${count}/${language}/${type}）；非空则优先于默认系统提示 */
    customTemplate?: string;
    /** 默认系统提示（i18n；customTemplate 为空时使用——保持既有生成行为不变） */
    defaultSystem: string;
    /** 用户消息模板（i18n aiUserPrompt，含 ${source} 占位） */
    userTemplate: string;
    /** 原始材料（未围栏；本模块负责包裹） */
    source: string;
    cfg: { count: number; language: string; type: string };
    /** 题型提示文案（i18n） */
    typeClozeHint: string;
    typeQaHint: string;
    /** 隔离条款（i18n aiInjectionGuard；缺省用模块兜底中文） */
    guardClause?: string;
    /** 不可信数据围栏标签（i18n aiUntrustedLabel；缺省「来源材料」） */
    untrustedLabel?: string;
    /** 目标模型 ID（custom 模式；BU-18——登记模型按窗口收紧预算，未登记用任务默认） */
    modelId?: string;
}

export interface AssembleResult {
    system: string;
    user: string;
    /** BU-6 预算报告（截断层必须呈现给用户，不静默） */
    budget: BudgetReport;
    /** 材料超保守窗口预算：调用方据此抛错或走分批（不静默截断关键证据） */
    needsBatching: boolean;
    /** 审计字段（AuditSink=lvLog 由调用方落账；不含材料明文） */
    audit: {
        task: AiTask;
        templateSource: "custom" | "default";
        sourceTokens: number;
        totalTokens: number;
        truncatedLayers: ContextLayerKey[];
        needsBatching: boolean;
        writeTarget: string;
        /** BU-18：生效预算及其来源（注册表按模型收紧 / 任务默认） */
        budgetTokens: number;
        budgetSource: "model-registry" | "task-default";
        /** 登记模型 ID（未登记/未传为 null；不含密钥等敏感字段） */
        modelId: string | null;
    };
}

/** 组装「卡生成」提示：模板解析 → 围栏包裹 → 隔离条款 → 预算报告（单一入口，禁止旁路拼装） */
export function assembleGeneratePrompt(input: AssembleInput): AssembleResult {
    const desc = TASK_REGISTRY[input.task];
    const custom = (input.customTemplate ?? "").trim();
    const templateSource: "custom" | "default" = custom ? "custom" : "default";
    const systemSource = custom
        ? custom
            .replace("${count}", String(input.cfg.count))
            .replace("${language}", input.cfg.language)
            .replace("${type}", input.cfg.type)
        : input.defaultSystem;
    const guard = input.guardClause || INJECTION_GUARD_DEFAULT;
    const system = `${systemSource}\n${guard}`;

    const wrapped = wrapUntrusted(input.untrustedLabel || "来源材料", input.source);
    const user = input.userTemplate
        .replace("${source}", wrapped)
        .replace("${count}", String(input.cfg.count))
        .replace("${language}", input.cfg.language)
        .replace("${type}", input.cfg.type === "cloze" ? input.typeClozeHint : input.typeQaHint);

    const layers = [
        { key: "system" as ContextLayerKey, text: system, priority: 2 },
        { key: "material" as ContextLayerKey, text: wrapped, priority: 1 },
    ];
    // BU-18：预算从模型注册表解析（登记模型按窗口×0.6 收紧，只收紧不放大；未登记回任务默认）
    const budgetRes = effectiveBudgetTokens(input.modelId ?? "", desc.budgetTokens);
    const budget = planContext(layers, budgetRes.tokens);
    const sourceTokens = estimateTokens(input.source);
    const needsBatching = sourceTokens > budgetRes.tokens;

    return {
        system,
        user,
        budget,
        needsBatching,
        audit: {
            task: input.task,
            templateSource,
            sourceTokens,
            totalTokens: budget.totalTokens,
            truncatedLayers: budget.reports.filter(r => r.truncated || r.dropped).map(r => r.key),
            needsBatching,
            writeTarget: desc.writeTarget,
            budgetTokens: budgetRes.tokens,
            budgetSource: budgetRes.source,
            modelId: budgetRes.model?.id ?? null,
        },
    };
}
