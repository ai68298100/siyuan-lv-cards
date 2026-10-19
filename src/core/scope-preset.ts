/**
 * BX-3 范围预设三层合成与复习进度无损切换引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 三层合成模型：基础层（Base） -> 场景层（Context） -> 会话临时层（Session Override）；
 * 2. 优先级从高到低：Session Override > Context Layer > Base Layer；
 * 3. 跨预设进度保护：切换预设时，本场已评分/跳过的卡片集合严格保留，绝不重新弹出已学卡片；
 * 4. 空集安全降级：过滤条件过于苛刻导致结果为 0 时，自动提供安全回退方案，防止复习界面卡死。
 */

export interface ScopeFilterRule {
    /** 选中的卡组 ID 集合（空数组表示不限卡组/全库） */
    deckIds?: string[];
    /** 包含的标签集合（AND 交集） */
    includeTags?: string[];
    /** 排除的标签集合（NOT 过滤） */
    excludeTags?: string[];
    /** 限定卡型（问答/挖空/遮挡等） */
    cardTypes?: string[];
    /** 来源笔记本 ID */
    notebookId?: string;
    /** 来源文档 ID */
    docId?: string;
}

/** 具名范围预设 */
export interface NamedScopePreset {
    id: string;
    nameKey: string;
    customName?: string;
    rule: ScopeFilterRule;
    isBuiltin: boolean;
    createdAt: number;
}

/** 三层输入事实 */
export interface ScopeCompositionInput {
    /** 基础层：全局默认规则 */
    baseRule: ScopeFilterRule;
    /** 场景层：随当前活动文档/笔记本动态派生的规则 */
    contextRule?: ScopeFilterRule;
    /** 会话层：本场复习临时的手动调整（优先级最高） */
    sessionOverrideRule?: ScopeFilterRule;
}

/** 最终合成生效的有效范围 */
export interface EffectiveScope {
    effectiveRule: ScopeFilterRule;
    activeLayer: "session" | "context" | "base";
    isFallback: boolean;
    fallbackReasonKey?: string;
}

/** 预置内置具名预设 */
export const BUILTIN_SCOPE_PRESETS: readonly NamedScopePreset[] = [
    {
        id: "preset-all",
        nameKey: "scopePreset.builtin.all",
        rule: {}, // 全库
        isBuiltin: true,
        createdAt: 0,
    },
    {
        id: "preset-quick-due",
        nameKey: "scopePreset.builtin.quickDue",
        rule: { cardTypes: ["qa", "cloze"] }, // 快速文本卡
        isBuiltin: true,
        createdAt: 0,
    },
    {
        id: "preset-occlusion-focus",
        nameKey: "scopePreset.builtin.occlusionFocus",
        rule: { cardTypes: ["image-occlusion"] },
        isBuiltin: true,
        createdAt: 0,
    },
    {
        id: "preset-exam-core",
        nameKey: "scopePreset.builtin.examCore",
        rule: { includeTags: ["重要", "考点"] },
        isBuiltin: true,
        createdAt: 0,
    },
];

/**
 * 三层范围合成计算（纯函数）：
 * 优先采用 sessionOverrideRule；若无则采用 contextRule；若无则回退 baseRule。
 */
export function composeEffectiveScope(input: ScopeCompositionInput): EffectiveScope {
    if (input.sessionOverrideRule && hasActiveFilter(input.sessionOverrideRule)) {
        return {
            effectiveRule: sanitizeFilterRule(input.sessionOverrideRule),
            activeLayer: "session",
            isFallback: false,
        };
    }

    if (input.contextRule && hasActiveFilter(input.contextRule)) {
        return {
            effectiveRule: sanitizeFilterRule(input.contextRule),
            activeLayer: "context",
            isFallback: false,
        };
    }

    return {
        effectiveRule: sanitizeFilterRule(input.baseRule),
        activeLayer: "base",
        isFallback: false,
    };
}

/** 判定规则是否包含实质过滤条件 */
export function hasActiveFilter(rule?: ScopeFilterRule): boolean {
    if (!rule) return false;
    return !!(
        (rule.deckIds && rule.deckIds.length > 0) ||
        (rule.includeTags && rule.includeTags.length > 0) ||
        (rule.excludeTags && rule.excludeTags.length > 0) ||
        (rule.cardTypes && rule.cardTypes.length > 0) ||
        rule.notebookId ||
        rule.docId
    );
}

/** 规范化过滤规则（剔除空项，数组去重） */
export function sanitizeFilterRule(rule: ScopeFilterRule): ScopeFilterRule {
    return {
        deckIds: rule.deckIds ? Array.from(new Set(rule.deckIds.filter(Boolean))) : undefined,
        includeTags: rule.includeTags ? Array.from(new Set(rule.includeTags.filter(Boolean))) : undefined,
        excludeTags: rule.excludeTags ? Array.from(new Set(rule.excludeTags.filter(Boolean))) : undefined,
        cardTypes: rule.cardTypes ? Array.from(new Set(rule.cardTypes.filter(Boolean))) : undefined,
        notebookId: rule.notebookId?.trim() || undefined,
        docId: rule.docId?.trim() || undefined,
    };
}

/** 待匹配的轻量卡片摘要 */
export interface CardFilterCandidate {
    cardId: string;
    deckId: string;
    cardType?: string;
    tags?: string[];
    notebookId?: string;
    docId?: string;
}

/**
 * 依据合成规则对候选卡片列表进行精确过滤（纯函数）
 */
export function filterCardsByScope(
    candidates: readonly CardFilterCandidate[],
    scope: EffectiveScope,
    alreadyReviewedIds: ReadonlySet<string> = new Set(),
): {
    matchedCards: CardFilterCandidate[];
    effectiveScope: EffectiveScope;
    isDegradedFallback: boolean;
} {
    const r = scope.effectiveRule;

    let filtered = candidates.filter(card => {
        // 核心铁律：本场已评分的卡片绝对不重新弹出（进度无损）
        if (alreadyReviewedIds.has(card.cardId)) {
            return false;
        }

        // 1. 卡组过滤
        if (r.deckIds && r.deckIds.length > 0 && !r.deckIds.includes(card.deckId)) {
            return false;
        }

        // 2. 卡型过滤
        if (r.cardTypes && r.cardTypes.length > 0 && card.cardType && !r.cardTypes.includes(card.cardType)) {
            return false;
        }

        // 3. 笔记本过滤
        if (r.notebookId && card.notebookId && card.notebookId !== r.notebookId) {
            return false;
        }

        // 4. 文档过滤
        if (r.docId && card.docId && card.docId !== r.docId) {
            return false;
        }

        // 5. 包含标签
        if (r.includeTags && r.includeTags.length > 0) {
            const cardTagSet = new Set(card.tags ?? []);
            if (!r.includeTags.every(t => cardTagSet.has(t))) {
                return false;
            }
        }

        // 6. 排除标签
        if (r.excludeTags && r.excludeTags.length > 0) {
            const cardTagSet = new Set(card.tags ?? []);
            if (r.excludeTags.some(t => cardTagSet.has(t))) {
                return false;
            }
        }

        return true;
    });

    // 空集安全降级：若筛选结果为 0，且当前处于 session 或 context 层，自动标记降级
    if (filtered.length === 0 && (scope.activeLayer === "session" || scope.activeLayer === "context")) {
        // 尝试退回基础全量无过滤匹配（保留进度排除）
        const fallbackCandidates = candidates.filter(card => !alreadyReviewedIds.has(card.cardId));
        return {
            matchedCards: fallbackCandidates,
            effectiveScope: {
                ...scope,
                isFallback: true,
                fallbackReasonKey: "scopePreset.fallback.emptyFiltered",
            },
            isDegradedFallback: true,
        };
    }

    return {
        matchedCards: filtered,
        effectiveScope: scope,
        isDegradedFallback: false,
    };
}
