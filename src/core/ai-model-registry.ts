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

const RAW_MODELS: [string, string, string, number, ModelModality[], ModelStatus, [number, number]?, string[]?][] = [
    ["gpt-4o", "gpt-4o", "openai", 128000, ["text", "image"], "active", [2.5, 10]],
    ["gpt-4o-mini", "gpt-4o-mini", "openai", 128000, ["text", "image"], "active", [0.15, 0.6]],
    ["gpt-4.1", "gpt-4.1", "openai", 1000000, ["text", "image"], "active", [2, 8]],
    ["gpt-4.1-mini", "gpt-4.1-mini", "openai", 1000000, ["text", "image"], "active", [0.4, 1.6]],
    ["gpt-4.1-nano", "gpt-4.1-nano", "openai", 1000000, ["text"], "active", [0.1, 0.4]],
    ["o4-mini", "o4-mini", "openai", 200000, ["text", "image"], "active", [1.1, 4.4], ["rejects-temperature", "reasoning-latency"]],
    ["gpt-4-turbo", "gpt-4-turbo", "openai", 128000, ["text", "image"], "deprecated", [10, 30], ["superseded"]],
    ["gpt-3.5-turbo-0301", "gpt-3.5-turbo-0301", "openai", 4096, ["text"], "retired", undefined, ["sunset"]],
    ["deepseek-chat", "deepseek-chat", "deepseek", 64000, ["text"], "active", [0.27, 1.1]],
    ["deepseek-reasoner", "deepseek-reasoner", "deepseek", 64000, ["text"], "active", [0.55, 2.19], ["reasoning-latency"]],
    ["moonshot-v1-8k", "moonshot-v1-8k", "moonshot", 8192, ["text"], "active"],
    ["moonshot-v1-128k", "moonshot-v1-128k", "moonshot", 131072, ["text"], "active"],
    ["glm-4-flash", "glm-4-flash", "zhipu", 128000, ["text"], "active"],
    ["gemini-2.0-flash", "gemini-2.0-flash", "google", 1000000, ["text", "image"], "active", [0.1, 0.4]],
    ["qwen2.5:7b", "qwen2.5:7b", "ollama", 32768, ["text"], "active", [0, 0], ["local-offline"]],
    ["qwen2.5:14b", "qwen2.5:14b", "ollama", 32768, ["text"], "active", [0, 0], ["local-offline"]],
    ["deepseek-r1:7b", "deepseek-r1:7b", "ollama", 64000, ["text"], "active", [0, 0], ["local-offline", "reasoning-latency"]],
    ["deepseek-r1:8b", "deepseek-r1:8b", "ollama", 64000, ["text"], "active", [0, 0], ["local-offline", "reasoning-latency"]],
    ["llama3.1:8b", "llama3.1:8b", "ollama", 128000, ["text"], "active", [0, 0], ["local-offline"]],
];

export const MODEL_REGISTRY: ModelCapability[] = RAW_MODELS.map(
    ([id, label, provider, contextWindow, inputModalities, status, price, limits]) => ({
        id,
        label,
        provider,
        contextWindow,
        inputModalities,
        status,
        ...(price ? { pricePerM: { input: price[0], output: price[1] } } : {}),
        ...(limits ? { limits } : {}),
    })
);

export interface EndpointPreset {
    id: string;
    label: string;
    apiBase: string;
    defaultModel: string;
    isLocal: boolean;
}

export const ENDPOINT_PRESETS: EndpointPreset[] = ([
    ["openai", "OpenAI", "https://api.openai.com/v1", "gpt-4o-mini", false],
    ["deepseek", "DeepSeek", "https://api.deepseek.com/v1", "deepseek-chat", false],
    ["ollama", "Ollama (本地离线 localhost:11434)", "http://localhost:11434/v1", "qwen2.5:7b", true],
    ["lmstudio", "LM Studio (本地 localhost:1234)", "http://localhost:1234/v1", "qwen2.5-7b-instruct", true],
] as const).map(([id, label, apiBase, defaultModel, isLocal]) => ({ id, label, apiBase, defaultModel, isLocal }));

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
