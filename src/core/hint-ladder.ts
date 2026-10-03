/**
 * BJ-2 分级提示阶梯（纯逻辑，node 可单测）。
 * 五级阶梯：recall-target（回忆目标）→ keyword（关键词）→ context（上下文）→ explanation（解释）→ full（完整答案即翻面）。
 * 设计：
 * - 提示不自动提交评分：revealHint 仅返回下一级文本，调用方决定是否展示与记录。
 * - 每次提示可记录：hintLog 纯数组追加（调用方映射到 revlog entry 扩展字段或独立存储）。
 * - 阶梯内容来源：知识对象/卡片提供 levels 数组（可选），缺失级别自动跳过（稀疏阶梯）；
 *   full 级始终兜底存在（即翻面）。
 */

export const HINT_LEVELS = [
    "recall-target",
    "keyword",
    "context",
    "explanation",
    "full",
] as const;

export type HintLevel = (typeof HINT_LEVELS)[number];

export interface HintLevelsInput {
    /** 回忆目标（题面本身要你回忆什么，如"回答：XX 的定义"） */
    "recall-target"?: string;
    /** 关键词（答案中最核心的 1-3 个词） */
    keyword?: string;
    /** 上下文（材料出处/语境提示） */
    context?: string;
    /** 解释（答案的完整解释） */
    explanation?: string;
    /** 完整答案 */
    full: string;
}

/** 稀疏阶梯解析：按 HINT_LEVELS 顺序返回可用级别 id 列表（full 兜底） */
export function availableLevels(input: HintLevelsInput): HintLevel[] {
    return HINT_LEVELS.filter(l => {
        if (l === "full") return true;
        const v = input[l];
        return typeof v === "string" && v.trim().length > 0;
    });
}

/** 取下一级提示：从 current 开始向后找第一个可用级别；current 不在阶梯中从头开始 */
export function nextHint(
    input: HintLevelsInput,
    current: HintLevel | null,
): { level: HintLevel; text: string } | null {
    const avail = availableLevels(input);
    if (avail.length === 0) return null;
    const curIdx = current ? avail.indexOf(current) : -1;
    const next = avail[curIdx + 1] ?? avail[0];
    return { level: next, text: input[next] };
}

/** 提示记录条目（追加式日志；调用方映射持久化） */
export interface HintLogEntry {
    cardID: string;
    level: HintLevel;
    ts: number;
}

export function logHint(cardID: string, level: HintLevel, now: number = Date.now()): HintLogEntry {
    return { cardID, level, ts: now };
}

/** 提示使用统计（离线可分析口径：每卡提示次数/最深级别） */
export function hintStats(log: HintLogEntry[]): { totalHints: number; cardsWithHints: number; deepest: HintLevel | null } {
    if (log.length === 0) return { totalHints: 0, cardsWithHints: 0, deepest: null };
    const cards = new Set(log.map(l => l.cardID));
    const depthOrder = new Map(HINT_LEVELS.map((l, i) => [l, i]));
    let deepest: HintLevel = log[0].level;
    for (const l of log) {
        if ((depthOrder.get(l.level) ?? -1) > (depthOrder.get(deepest) ?? -1)) {
            deepest = l.level;
        }
    }
    return { totalHints: log.length, cardsWithHints: cards.size, deepest };
}
