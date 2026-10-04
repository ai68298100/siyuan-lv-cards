/**
 * BU-6 提示词组合与上下文预算器（纯逻辑，node 可单测）。
 * 分层拼接（固定顺序：system → instruction → preference → material → tool），
 * 按模型上下文窗口裁剪并保留来源位置（材料从头保留、截断处打标记）。
 * 验收硬性要求：超长材料先给出裁剪/分批预览——报告逐层列明截断，不静默截断关键证据；
 * 「不把答案带入题面」是模板层（BV 家族）的职责，本模块只保证层级完整不重排不合并。
 * 消费方=BU-35 调用流水线注册（当前纯模块先行，未接线不进主包）。
 */

import { estimateTokens } from "../api/ai-parse";

export const CONTEXT_LAYER_KEYS = ["system", "instruction", "preference", "material", "tool"] as const;
export type ContextLayerKey = (typeof CONTEXT_LAYER_KEYS)[number];

export interface ContextLayer {
    key: ContextLayerKey;
    text: string;
    /**
     * 保留优先级：1=最后才裁（material 证据层默认 1），数字越大越先被裁。
     * 裁剪顺序：priority 降序 → 同级按 key 固定序（可复现）。
     */
    priority?: number;
}

export interface LayerReport {
    key: ContextLayerKey;
    originalTokens: number;
    keptTokens: number;
    /** true=被截断（报告必须呈现给用户，禁止静默） */
    truncated: boolean;
    /** true=整层被丢弃（预算连标记都放不下时） */
    dropped: boolean;
}

export interface BudgetReport {
    /** 拼接结果：固定层序（与输入顺序无关），截断层带尾标记 */
    prompts: { key: ContextLayerKey; text: string }[];
    reports: LayerReport[];
    totalTokens: number;
    /** 材料层单独就超预算：应分批生成而非硬截断（建议批次数） */
    needsBatching: boolean;
    batches: number;
}

/** 截断尾标记（占位计入预算；用户可见，满足「不静默」） */
export const TRUNCATION_MARKER = "\n…[材料因上下文窗口截断，开头已保留；可分批生成获取完整覆盖]";

const DEFAULT_PRIORITY: Record<ContextLayerKey, number> = {
    system: 2,
    instruction: 3,
    preference: 4,
    material: 1, // 证据层最后才裁
    tool: 5,
};

/** 建议分批数：材料预算装不下时 ceil(材料/可用)，至少 2 */
export function suggestBatches(materialTokens: number, budgetTokens: number): number {
    if (materialTokens <= budgetTokens || budgetTokens <= 0) return 0;
    return Math.max(2, Math.ceil(materialTokens / budgetTokens));
}

/**
 * 预算编排：固定层序拼接；超预算时从低优先级层开始裁（从头保留=来源位置不变），
 * 每次裁剪都进 reports；材料层独木难支时给出分批建议且不再硬截（needsBatching=true）。
 */
export function planContext(layers: ContextLayer[], totalTokens: number): BudgetReport {
    const byKey = new Map(layers.map(l => [l.key, l.text] as const));
    const prio = (k: ContextLayerKey) => layers.find(l => l.key === k)?.priority ?? DEFAULT_PRIORITY[k];
    const present = CONTEXT_LAYER_KEYS.filter(k => (byKey.get(k)?.length ?? 0) > 0);

    const originals = new Map(present.map(k => [k, estimateTokens(byKey.get(k) ?? "")] as const));
    const rawTotal = [...originals.values()].reduce((a, b) => a + b, 0);
    const needsBatching = rawTotal > totalTokens && estimateTokens(byKey.get("material") ?? "") > totalTokens;

    // 可用额度分配：高优先级层先占预算（材料层最先保全），剩下的给低优先级层（先被裁）
    const kept = new Map<ContextLayerKey, number>();
    let remaining = totalTokens;
    const order = [...present].sort((a, b) => prio(a) - prio(b) || CONTEXT_LAYER_KEYS.indexOf(a) - CONTEXT_LAYER_KEYS.indexOf(b));
    for (const k of order) {
        const want = originals.get(k) ?? 0;
        const give = Math.min(want, Math.max(0, remaining));
        kept.set(k, give);
        remaining -= give;
    }

    const reports: LayerReport[] = [];
    const prompts: { key: ContextLayerKey; text: string }[] = [];
    for (const k of CONTEXT_LAYER_KEYS) {
        if (!present.includes(k)) continue;
        const text = byKey.get(k) ?? "";
        const originalTokens = originals.get(k) ?? 0;
        const keptTokens = kept.get(k) ?? 0;
        const dropped = keptTokens <= 0;
        const truncated = !dropped && keptTokens < originalTokens;
        let outText = text;
        if (dropped) {
            outText = "";
        } else if (truncated) {
            // 保留来源位置：从头截取至预算字符数（estimateTokens≈len/4 的逆运算），尾部打可见标记
            const keepChars = Math.max(0, keptTokens * 4 - TRUNCATION_MARKER.length);
            outText = text.slice(0, keepChars) + TRUNCATION_MARKER;
        }
        reports.push({ key: k, originalTokens, keptTokens, truncated, dropped });
        if (outText) prompts.push({ key: k, text: outText });
    }

    const totalTokensOut = prompts.reduce((sum, p) => sum + estimateTokens(p.text), 0);
    const materialBudget = Math.max(0, totalTokens - present.filter(k => k !== "material").reduce((s, k) => s + (originals.get(k) ?? 0), 0));
    return {
        prompts,
        reports,
        totalTokens: totalTokensOut,
        needsBatching,
        batches: needsBatching ? suggestBatches(originals.get("material") ?? 0, materialBudget) : 0,
    };
}
