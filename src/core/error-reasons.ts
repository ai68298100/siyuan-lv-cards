/**
 * BJ-4 错误原因分类（纯逻辑，node 可单测）。
 * 评分后可选标注错误原因：记忆空白、概念混淆、条件遗漏、步骤错误、题面不清、来源过时、注意力中断。
 * 设计：
 * - 标注是可选的旁路动作（不阻塞评分主流程，评分已提交后补充标注）。
 * - 可改选：同卡同日期重复标注覆盖前值。
 * - 统计口径：按原因分类计数 + 去重卡数；遗忘卡（rating=1）的错误原因最有分析价值。
 */

export const ERROR_REASONS = [
    "memory-blank",       // 记忆空白
    "concept-confusion",  // 概念混淆
    "condition-missed",   // 条件遗漏
    "step-error",         // 步骤错误
    "question-unclear",   // 题面不清
    "source-outdated",    // 来源过时
    "attention-lapse",    // 注意力中断
] as const;

export type ErrorReason = (typeof ERROR_REASONS)[number];

export function normalizeErrorReason(v: unknown): ErrorReason | null {
    return typeof v === "string" && (ERROR_REASONS as readonly string[]).includes(v)
        ? (v as ErrorReason)
        : null;
}

export interface ErrorTag {
    /** riff card id */
    cardID: string;
    reason: ErrorReason;
    /** 本地日期 YYYY-MM-DD（同卡同日覆盖前值） */
    date: string;
}

export interface ErrorTagsData {
    version: 1;
    tags: ErrorTag[];
}

export function emptyErrorTags(): ErrorTagsData {
    return { version: 1, tags: [] };
}

/** 标注错误原因：同卡同日覆盖前值（可改选）；返回是否发生变更 */
export function tagError(data: ErrorTagsData, cardID: string, reason: ErrorReason, date: string): boolean {
    if (!cardID) return false;
    const existing = data.tags.find(t => t.cardID === cardID && t.date === date);
    if (existing) {
        if (existing.reason === reason) return false;
        existing.reason = reason;
        return true;
    }
    data.tags.push({ cardID, reason, date });
    return true;
}

/** 按原因分类计数（指定日期范围或全量） */
export function errorReasonStats(tags: ErrorTag[], date?: string): Record<ErrorReason | "untagged", number> {
    const out = Object.fromEntries(ERROR_REASONS.map(r => [r, 0])) as Record<ErrorReason | "untagged", number>;
    out.untagged = 0;
    for (const t of tags) {
        if (date && t.date !== date) continue;
        out[t.reason] = (out[t.reason] ?? 0) + 1;
    }
    return out;
}

/** 遗忘卡中已标注错误原因的比率（分析覆盖率） */
export function errorTagCoverage(forgetCount: number, tags: ErrorTag[], date?: string): number {
    if (forgetCount <= 0) return 0;
    const tagged = date ? tags.filter(t => t.date === date).length : tags.length;
    return Math.round((tagged / forgetCount) * 100);
}
