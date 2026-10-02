/**
 * AI 候选卡预览 lint（AQ-16 离线子集，零依赖纯模块）：
 * 批内重复 / 过长 / 过短三类可静态判定的质量问题——每卡返回提示数组，
 * 只提示不删除（正式取舍由用户勾选；多事实/歧义等语义级 lint 属 AQ-16 语义子集，后置）。
 */

export interface LintCard {
    q: string;
    a: string;
}

/** 归一化：去空白/小写——批内重复判定口径（与打字判分宽松口径一致） */
function normText(s: string): string {
    return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** 单卡静态阈值 */
export const LINT_LIMITS = {
    /** 超过此长度提示过长 */
    overlong: 300,
    /** 低于此长度提示过短 */
    tooShort: 4,
} as const;

/** 单卡 lint：返回提示列表；无问题返回空数组 */
export function lintCard(card: LintCard, seenKeys: Set<string>): string[] {
    const warnings: string[] = [];
    const key = `${normText(card.q)}|${normText(card.a)}`;
    if (seenKeys.has(key)) {
        warnings.push("duplicate");
    }
    seenKeys.add(key);
    if (card.q.length > LINT_LIMITS.overlong || card.a.length > LINT_LIMITS.overlong) {
        warnings.push("overlong");
    }
    if (card.q.trim().length < LINT_LIMITS.tooShort) {
        warnings.push("short-q");
    }
    return warnings;
}

/** 批量 lint：按序扫描，批内重复以先前出现为准 */
export function lintAICards(cards: LintCard[]): string[][] {
    const seen = new Set<string>();
    return cards.map(card => lintCard(card, seen));
}
