export type QaDraftIssue = "empty-question" | "empty-answer" | "reserved-markup";

export function validateQaDraft(q: string, a: string): QaDraftIssue[] {
    const issues: QaDraftIssue[] = [];
    if (!q.trim()) issues.push("empty-question");
    if (!a.trim()) issues.push("empty-answer");
    if (q.includes("==") || a.includes("==")) issues.push("reserved-markup");
    return issues;
}

export function serializeQaCard(q: string, a: string): string {
    const issues = validateQaDraft(q, a);
    if (issues.length > 0) throw new Error(`invalid flashcard: ${issues.join(",")}`);
    return `${q.trim()} ==${a.trim()}==`;
}

export function hasMarkedAnswer(markdown: string): boolean {
    const text = String(markdown ?? "");
    // A marker is exactly two equals signs. Without this guard a malformed
    // run such as `==answer===` can be matched from the first two signs while
    // leaving an unmatched third sign behind.
    if (/={3,}/.test(text)) return false;
    const matches = [...text.matchAll(/==([^=]+)==/g)];
    if (matches.length === 0 || matches.some(match => !match[1]?.trim())) return false;
    return !text.replace(/==[^=]+==/g, "").includes("==");
}

/** Cloze export must hide every plain-text answer fragment, including extra fields. */
export function concealUnmarkedText(text: string): string {
    const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    if (normalized.includes("==") && !hasMarkedAnswer(normalized)) {
        throw new Error("invalid flashcard: invalid cloze markup");
    }
    return normalized
        .split(/(==[^=]+==)/g)
        .map(part => {
            if (!part) return "";
            if (part.startsWith("==") && part.endsWith("==") && part.length > 4) return part;
            const plain = part.trim().replace(/^\/\s*/, "").trim();
            return plain ? `==${plain}==` : "";
        })
        .filter(Boolean)
        .join(" ");
}

export function validateFlashcardMarkdown(markdown: string): "empty-card" | "missing-answer" | "invalid-markup" | null {
    const text = String(markdown ?? "").trim();
    if (!text) return "empty-card";
    const hasDelimiter = text.includes("==");
    if (!hasMarkedAnswer(text)) return hasDelimiter ? "invalid-markup" : "missing-answer";
    return null;
}

/**
 * 判断挖空答案之外是否仍有可呈现的问题内容。
 * 纯 `==答案==` 或只有空白/排版标记的块不能作为普通闪卡入组；图片本身
 * 可以构成问题内容，图片遮挡卡的额外区域校验由 card-entry-gate 负责。
 */
export function hasQuestionContent(markdown: string): boolean {
    const text = String(markdown ?? "");
    const withoutAnswers = text.replace(/==[^=]*==/g, " ");
    const hasMedia = hasQuestionMediaContent(text);
    const visible = withoutAnswers
        .replace(/<[^>]*>/g, " ")
        .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
        // Entity-only placeholders such as `&nbsp;` and zero-width Unicode
        // characters have no visible question content but otherwise survive
        // the punctuation cleanup below.
        .replace(/&(?:[a-z][a-z0-9]+|#\d+|#x[\da-f]+);/gi, " ")
        .replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u200b-\u200d\u2060\ufeff]/g, " ")
        .replace(/[#*_`~>\[\]()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return hasMedia || visible.length > 0;
}

/** 可见于问题态的图片；答案挖空内部的图片不算题面内容。 */
export function hasQuestionMediaContent(markdown: string): boolean {
    return hasImageContent(String(markdown ?? "").replace(/==[^=]*==/g, " "));
}

export function hasImageContent(markdown: string): boolean {
    const text = String(markdown ?? "");
    return /<img\b/i.test(text) || /!\[[^\]]*\]\([^)]+\)/.test(text);
}
