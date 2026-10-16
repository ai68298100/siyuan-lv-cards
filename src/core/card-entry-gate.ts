/**
 * 闪卡入组的结构门禁。
 *
 * 这是卡型边界，不负责判断事实是否正确，也不替代 AI 评分卡：它只回答
 * “这块内容是否能在问题态安全呈现，并且有可揭示的答案/遮挡数据”。
 */
import { hasQuestionContent, hasQuestionMediaContent, validateFlashcardMarkdown } from "./flashcard-quality";
import { parseOcclusion } from "./occlusion";

export type CardEntryKind = "markdown" | "image-occlusion";
export type CardEntryIssue =
    | "missing-block"
    | "empty-card"
    | "missing-answer"
    | "invalid-markup"
    | "missing-question"
    | "invalid-occlusion";

export interface CardEntryCandidate {
    blockID: string;
    markdown: string;
    attrs?: Record<string, string>;
    exists?: boolean;
    /** Callers that already verified the occlusion payload can pass the result directly. */
    occlusionValid?: boolean;
}

export interface CardEntryDecision {
    blockID: string;
    ok: boolean;
    kind?: CardEntryKind;
    issue?: CardEntryIssue;
}

/**
 * 按卡型判定一块内容是否具备可入组的最小结构。
 * 普通 Markdown 优先；带图片且有合法 lv-occlusion 属性的块可走遮挡卡型。
 */
export function validateCardEntry(candidate: CardEntryCandidate): CardEntryDecision {
    const blockID = String(candidate.blockID ?? "");
    const markdown = String(candidate.markdown ?? "");
    if (!blockID || candidate.exists === false) return { blockID, ok: false, issue: "missing-block" };
    if (!markdown.trim()) return { blockID, ok: false, issue: "empty-card" };

    const markdownIssue = validateFlashcardMarkdown(markdown);
    if (!markdownIssue && hasQuestionContent(markdown)) {
        return { blockID, ok: true, kind: "markdown" };
    }

    // 图片遮挡是独立卡型：它不要求 ==答案==，但必须有图片和至少一个合法区域。
    // 遮挡卡可以没有答案标记，但不能借图片遮挡绕过坏的 Markdown 标记。
    // `missing-answer` 是唯一允许由遮挡数据补足答案语义的结构状态。
    if (markdownIssue !== "invalid-markup" && markdownIssue !== "empty-card"
        && hasQuestionMediaContent(markdown)
        && (candidate.occlusionValid || parseOcclusion(candidate.attrs ?? {})?.rects.length)) {
        return { blockID, ok: true, kind: "image-occlusion" };
    }

    if (markdownIssue) return { blockID, ok: false, issue: markdownIssue };
    return { blockID, ok: false, issue: hasQuestionContent(markdown) ? "invalid-occlusion" : "missing-question" };
}

/** 批量验证先完成再写入，调用方可据此保证 all-or-nothing。 */
export function validateCardEntries(candidates: CardEntryCandidate[]): CardEntryDecision[] {
    return candidates.map(validateCardEntry);
}
