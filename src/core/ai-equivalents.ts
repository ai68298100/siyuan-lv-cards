/**
 * BU-40 无 AI 等价流程登记表（纯逻辑，node 可单测）。
 * 每个 AI 入口登记手工/规则替代路径与损失说明——验收：每个 AI 入口都有等价或不等价
 * 的本地路径说明，且**诚实标注不可替代的部分**（不谎称「完全等价」）。
 * 登记表是单一事实源：eligibility 阻断信息（aiElig.alt.*）、设置帮助与用户文档都引用这里的键，
 * 新增 AI 入口必须先在此登记（tests 防漏登记）。
 */

export const AI_ENTRY_IDS = ["cards-generate", "leech-rewrite", "repair-drill", "no-ai"] as const;
export type AiEntryId = (typeof AI_ENTRY_IDS)[number];

export interface AiEquivalent {
    entry: AiEntryId;
    /** 该入口是否使用 AI（零 AI 入口显式声明 false——它自身就是等价路径的落点） */
    usesAI: boolean;
    /** 入口说明 i18n 键（aiEquiv.entry.<id>） */
    entryKey: string;
    /** 手工/规则替代路径（有序 i18n 键，aiEquiv.alt.<id>.<n>） */
    altKeys: string[];
    /** 损失说明 i18n 键（aiEquiv.loss.<id>）——诚实标注用 AI 与不用的差异 */
    lossKey: string;
}

export const AI_EQUIVALENTS: Record<AiEntryId, AiEquivalent> = {
    "cards-generate": {
        entry: "cards-generate",
        usesAI: true,
        entryKey: "aiEquiv.entry.cards-generate",
        altKeys: ["aiEquiv.alt.cards-generate.1", "aiEquiv.alt.cards-generate.2", "aiEquiv.alt.cards-generate.3"],
        lossKey: "aiEquiv.loss.cards-generate",
    },
    "leech-rewrite": {
        entry: "leech-rewrite",
        usesAI: true,
        entryKey: "aiEquiv.entry.leech-rewrite",
        altKeys: ["aiEquiv.alt.leech-rewrite.1", "aiEquiv.alt.leech-rewrite.2"],
        lossKey: "aiEquiv.loss.leech-rewrite",
    },
    "repair-drill": {
        entry: "repair-drill",
        usesAI: false,
        entryKey: "aiEquiv.entry.repair-drill",
        altKeys: [],
        lossKey: "aiEquiv.loss.repair-drill",
    },
    "no-ai": {
        entry: "no-ai",
        usesAI: false,
        entryKey: "aiEquiv.entry.no-ai",
        altKeys: [],
        lossKey: "aiEquiv.loss.no-ai",
    },
};

/** 查询入口的等价路径；未登记 ID 返回 null（调用方应视为登记缺失并报错，而非静默） */
export function equivalentFor(entry: string): AiEquivalent | null {
    return (AI_EQUIVALENTS as Record<string, AiEquivalent>)[entry] ?? null;
}

/** 有 AI 参与的入口清单（usesAI 声明驱动） */
export function aiPoweredEntries(): AiEquivalent[] {
    return AI_ENTRY_IDS.map(id => AI_EQUIVALENTS[id]).filter(e => e.usesAI);
}
