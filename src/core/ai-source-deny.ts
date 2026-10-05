/**
 * BW-9 来源级 AI 禁止外发策略（纯逻辑，node 可单测）。
 * 按笔记本/文档/块三级登记禁止外发规则；查询按「块 → 文档 → 笔记本」继承判定——
 * 任何一级命中即禁止。验收硬性要求：规则一旦登记**不因来源移动、导入、队列、缓存或
 * Agent 查询而解除**——本模块只提供 add/remove 显式接口，不存在任何自动失效路径；
 * 事实采集由调用方完成（向导传来源 provenance），判定纯函数可测。
 * 接线：index.ts generate 组装前经 ai-eligibility 的 sensitive 事实源阻断（BU-33 口径）。
 */

export const DENY_SCOPES = ["notebook", "doc", "block"] as const;
export type DenyScope = (typeof DENY_SCOPES)[number];

export interface DenyRule {
    id: string;
    scope: DenyScope;
    /** 目标 ID（笔记本/文档/块 ID，原样保存——移动不改 ID，规则随 ID 事实保留） */
    target: string;
    addedAt: number;
    /** 登记时的备注（可选，如「含客户资料」；纯本地展示） */
    note?: string;
}

export interface DenyListData {
    version: 1;
    rules: DenyRule[];
}

export interface SourceProvenance {
    notebookId?: string;
    docId?: string;
    blockId?: string;
}

export interface DenyVerdict {
    denied: boolean;
    /** 命中的规则（最具体一级：block > doc > notebook）；未命中=null */
    rule: DenyRule | null;
}

export function emptyDenyList(): DenyListData {
    return { version: 1, rules: [] };
}

const RULES_CAP = 2000;

/** 台账清洗：scope/target 合法性、去重（同 scope:target 保留最早登记——规则不因重登记「续命」）、限量 */
export function normalizeDenyList(raw: unknown, cap = RULES_CAP): DenyListData {
    const d = (raw ?? {}) as Partial<DenyListData>;
    const list = Array.isArray(d.rules) ? d.rules : [];
    const byKey = new Map<string, DenyRule>();
    for (const item of list) {
        const r = item as Partial<DenyRule>;
        if (!DENY_SCOPES.includes(r.scope as DenyScope) || typeof r.target !== "string" || !r.target.trim()) {
            continue;
        }
        const key = `${r.scope}:${r.target}`;
        const prev = byKey.get(key);
        const at = typeof r.addedAt === "number" && r.addedAt > 0 ? r.addedAt : 0;
        if (!prev || (prev.addedAt > at && at > 0)) {
            byKey.set(key, {
                id: typeof r.id === "string" && r.id ? r.id : `deny-${key}`,
                scope: r.scope as DenyScope,
                target: r.target,
                addedAt: at,
                ...(typeof r.note === "string" && r.note.trim() ? { note: r.note.slice(0, 200) } : {}),
            });
        }
    }
    return { version: 1, rules: [...byKey.values()].slice(0, cap) };
}

/** 登记禁止外发（幂等：已存在同 scope:target 不重复登记、不改原 addedAt） */
export function addDenyRule(list: DenyListData, scope: DenyScope, target: string, now: number, note?: string): DenyListData {
    const clean = normalizeDenyList(list);
    const key = `${scope}:${target}`;
    if (clean.rules.some(r => `${r.scope}:${r.target}` === key)) {
        return clean;
    }
    const rule: DenyRule = {
        id: `deny-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        scope,
        target,
        addedAt: now,
        ...(note?.trim() ? { note: note.trim().slice(0, 200) } : {}),
    };
    return normalizeDenyList({ ...clean, rules: [...clean.rules, rule] });
}

/** 显式解除（唯一解除路径——无任何自动失效） */
export function removeDenyRule(list: DenyListData, scope: DenyScope, target: string): DenyListData {
    const clean = normalizeDenyList(list);
    const key = `${scope}:${target}`;
    return { ...clean, rules: clean.rules.filter(r => `${r.scope}:${r.target}` !== key) };
}

/**
 * 继承判定：块 → 文档 → 笔记本逐级检查，命中即禁止（返回最具体命中）。
 * provenance 缺失的层级自然跳过（如粘贴文本无 docId——只可能命中 notebook 级或无规则）。
 */
export function isDenied(list: DenyListData, p: SourceProvenance): DenyVerdict {
    const clean = normalizeDenyList(list);
    const chain: { scope: DenyScope; target?: string }[] = [
        { scope: "block", target: p.blockId },
        { scope: "doc", target: p.docId },
        { scope: "notebook", target: p.notebookId },
    ];
    for (const { scope, target } of chain) {
        if (!target) {
            continue;
        }
        const rule = clean.rules.find(r => r.scope === scope && r.target === target);
        if (rule) {
            return { denied: true, rule };
        }
    }
    return { denied: false, rule: null };
}
