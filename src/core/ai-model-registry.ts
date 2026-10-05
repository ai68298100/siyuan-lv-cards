/**
 * BU-18 模型能力注册表（纯逻辑，node 可单测）。
 * 登记常用 OpenAI 兼容模型的 provider、上下文窗口、输入模态、参考价、已知限制与生命周期状态——
 * 验收硬性要求：能力探测与实际请求一致（预算从注册表读取，防小窗口模型溢出）；
 * 失效（deprecated/retired）模型不再出现在可选列表（selectableModelOptions 只回 active）。
 * 价格为快照参考值（priceSnapshot 注明），仅用于估算展示，绝不冒充账单事实；
 * 未登记模型一律回退任务默认预算——未知≠禁止，不阻断用户自配端点。
 */

export type ModelStatus = "active" | "deprecated" | "retired";
export type ModelModality = "text" | "image";

export interface ModelCapability {
    /** 规范 ID（小写；dated 变体如 gpt-4o-2024-11-20 归并到主 ID） */
    id: string;
    /** 展示名（provider + id 已可读，label 留常用简称） */
    label: string;
    provider: string;
    /** 上下文窗口（token） */
    contextWindow: number;
    inputModalities: ModelModality[];
    status: ModelStatus;
    /** 每百万 token 参考价 USD；缺省=未知（不估算、显示「未知」） */
    pricePerM?: { input: number; output: number };
    /** 已知限制（机器可读标签；UI 展示走 i18n 映射，不裸英文） */
    limits?: string[];
}

/** 价格快照日期（诚实口径：注册表价会过期，估算仅供参考） */
export const MODEL_PRICE_SNAPSHOT = "2026-10";

export const MODEL_REGISTRY: ModelCapability[] = [
    { id: "gpt-4o", label: "gpt-4o", provider: "openai", contextWindow: 128000, inputModalities: ["text", "image"], status: "active", pricePerM: { input: 2.5, output: 10 } },
    { id: "gpt-4o-mini", label: "gpt-4o-mini", provider: "openai", contextWindow: 128000, inputModalities: ["text", "image"], status: "active", pricePerM: { input: 0.15, output: 0.6 } },
    { id: "gpt-4.1", label: "gpt-4.1", provider: "openai", contextWindow: 1000000, inputModalities: ["text", "image"], status: "active", pricePerM: { input: 2, output: 8 } },
    { id: "gpt-4.1-mini", label: "gpt-4.1-mini", provider: "openai", contextWindow: 1000000, inputModalities: ["text", "image"], status: "active", pricePerM: { input: 0.4, output: 1.6 } },
    { id: "gpt-4.1-nano", label: "gpt-4.1-nano", provider: "openai", contextWindow: 1000000, inputModalities: ["text"], status: "active", pricePerM: { input: 0.1, output: 0.4 } },
    // 推理系：拒绝 temperature 参数（chatCompletions 现发 0.4）——已知限制登记，UI 提示映射见 docs
    { id: "o4-mini", label: "o4-mini", provider: "openai", contextWindow: 200000, inputModalities: ["text", "image"], status: "active", pricePerM: { input: 1.1, output: 4.4 }, limits: ["rejects-temperature", "reasoning-latency"] },
    { id: "gpt-4-turbo", label: "gpt-4-turbo", provider: "openai", contextWindow: 128000, inputModalities: ["text", "image"], status: "deprecated", pricePerM: { input: 10, output: 30 }, limits: ["superseded"] },
    { id: "gpt-3.5-turbo-0301", label: "gpt-3.5-turbo-0301", provider: "openai", contextWindow: 4096, inputModalities: ["text"], status: "retired", limits: ["sunset"] },
    { id: "deepseek-chat", label: "deepseek-chat", provider: "deepseek", contextWindow: 64000, inputModalities: ["text"], status: "active", pricePerM: { input: 0.27, output: 1.1 } },
    { id: "deepseek-reasoner", label: "deepseek-reasoner", provider: "deepseek", contextWindow: 64000, inputModalities: ["text"], status: "active", pricePerM: { input: 0.55, output: 2.19 }, limits: ["reasoning-latency"] },
    { id: "moonshot-v1-8k", label: "moonshot-v1-8k", provider: "moonshot", contextWindow: 8192, inputModalities: ["text"], status: "active" },
    { id: "moonshot-v1-128k", label: "moonshot-v1-128k", provider: "moonshot", contextWindow: 131072, inputModalities: ["text"], status: "active" },
    { id: "glm-4-flash", label: "glm-4-flash", provider: "zhipu", contextWindow: 128000, inputModalities: ["text"], status: "active" },
    { id: "gemini-2.0-flash", label: "gemini-2.0-flash", provider: "google", contextWindow: 1000000, inputModalities: ["text", "image"], status: "active", pricePerM: { input: 0.1, output: 0.4 } },
];

/** ID 归一：trim + 小写（匹配口径统一在此，调用方不做自有变换） */
export function normalizeModelId(raw: string): string {
    return (raw ?? "").trim().toLowerCase();
}

/** 查找：精确 → 「/」后缀（openrouter 等中转 ID）→ dated 变体归并（gpt-4o-2024-11-20 → gpt-4o）；未登记=null */
export function lookupModel(raw: string): ModelCapability | null {
    const id = normalizeModelId(raw);
    if (!id) {
        return null;
    }
    const exact = MODEL_REGISTRY.find(m => m.id === id);
    if (exact) {
        return exact;
    }
    const slash = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : "";
    const viaSlash = slash ? MODEL_REGISTRY.find(m => m.id === slash) : undefined;
    if (viaSlash) {
        return viaSlash;
    }
    const dated = MODEL_REGISTRY.find(m => id.startsWith(`${m.id}-20`));
    return dated ?? null;
}

/** 可选列表：只回 active（验收：失效模型不再出现在可选列表）；按 provider+id 稳定排序 */
export function selectableModelOptions(): { value: string; label: string }[] {
    return MODEL_REGISTRY
        .filter(m => m.status === "active")
        .sort((a, b) => (a.provider === b.provider ? a.id.localeCompare(b.id) : a.provider.localeCompare(b.provider)))
        .map(m => ({ value: m.id, label: `${m.label}（${m.provider} · ${formatContext(m.contextWindow)}）` }));
}

/** 是否可选用（登记且 active） */
export function isSelectableModel(raw: string): boolean {
    const m = lookupModel(raw);
    return m !== null && m.status === "active";
}

const BUDGET_SHARE = 0.6;
const BUDGET_FLOOR = 2000;

export interface BudgetResolution {
    tokens: number;
    /** 预算来源：注册表按模型窗口收紧 / 任务默认（未登记模型） */
    source: "model-registry" | "task-default";
    model: ModelCapability | null;
}

/**
 * 生效预算：登记模型 → min(任务默认, 窗口×0.6，下限 2000)——只收紧不放大
 * （任务默认 24000 面向 ≥40k 窗口校准；小窗口模型按窗口收口防溢出）；未登记 → 任务默认。
 */
export function effectiveBudgetTokens(raw: string, taskDefaultTokens: number): BudgetResolution {
    const m = lookupModel(raw);
    if (!m) {
        return { tokens: taskDefaultTokens, source: "task-default", model: null };
    }
    const byModel = Math.max(BUDGET_FLOOR, Math.floor(m.contextWindow * BUDGET_SHARE));
    return { tokens: Math.min(taskDefaultTokens, byModel), source: "model-registry", model: m };
}

/** 输入模态探测：未登记模型=null（不判，不阻断） */
export function supportsInput(raw: string, modality: ModelModality): boolean | null {
    const m = lookupModel(raw);
    return m ? m.inputModalities.includes(modality) : null;
}

/** 估算调用成本 USD；模型或价格未知=null（界面显示「未知」，不编数字） */
export function estimateCallCostUsd(raw: string, tokensIn: number, tokensOut: number): number | null {
    const m = lookupModel(raw);
    if (!m?.pricePerM) {
        return null;
    }
    return (tokensIn / 1e6) * m.pricePerM.input + (tokensOut / 1e6) * m.pricePerM.output;
}

function formatContext(n: number): string {
    return n >= 1000000 ? `${Math.round(n / 100000) / 10}M` : `${Math.round(n / 1000)}K`;
}

/** 窗口规模的展示格式（1M/512K/8K；设置快选与状态提示共用） */
export function formatModelContext(n: number): string {
    return formatContext(n);
}
