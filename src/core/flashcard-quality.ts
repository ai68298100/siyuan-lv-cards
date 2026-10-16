export type QaDraftIssue = "empty-question" | "empty-answer" | "reserved-markup";

const INLINE_OR_BLOCK_CODE = /```([\s\S]*?)```|`([^`\n]+)`/g;
const LATEX_MATH = /\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g;
const UNICODE_WORD_OR_NUM = /[\p{L}\p{N}]/u;

/**
 * 校验文本是否具备实质题面内容。
 * 阻断纯标点占位符（如 ???、。。。、—— 等），同时保护：
 * 1. 行内代码与代码块
 * 2. LaTeX 数学公式
 * 3. 任何语言的实质文字字符（汉字、字母等）与数字（如 DNA、CPU、3）
 */
export function hasMeaningfulPrompt(markdownOrText: string): boolean {
    const raw = String(markdownOrText ?? "").trim();
    if (!raw) return false;

    // 1. 如果包含非空行内代码或代码块，视为有内容
    if ([...raw.matchAll(INLINE_OR_BLOCK_CODE)].some(match => (match[1] ?? match[2] ?? "").trim())) return true;

    // 2. 如果包含非空 LaTeX 公式，视为有内容
    if ([...raw.matchAll(LATEX_MATH)].some(match => (match[1] ?? match[2] ?? "").trim())) return true;

    // 3. 清理 HTML 标签、实体和零宽字符
    const cleaned = raw
        // 图像地址和替代文字不能让无效图像冒充可见题面；有效图片由 hasImageContent 单独判定。
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&(?:[a-z][a-z0-9]+|#\d+|#x[\da-f]+);/gi, " ")
        .replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u200b-\u200d\u2060\ufeff]/g, " ")
        .replace(/[#*_`~>\[\]()]/g, " ")
        .trim();

    if (!cleaned) return false;

    // 4. 必须包含至少一个实质文字（字母、汉字、假名等）或数字
    return UNICODE_WORD_OR_NUM.test(cleaned);
}

export function validateQaDraft(q: string, a: string): QaDraftIssue[] {
    const issues: QaDraftIssue[] = [];
    const trimmedQ = String(q ?? "").trim();
    const trimmedA = String(a ?? "").trim();
    if (!trimmedQ || (!hasMeaningfulPrompt(trimmedQ) && !hasImageContent(trimmedQ))) {
        issues.push("empty-question");
    }
    if (!trimmedA) issues.push("empty-answer");
    if (trimmedQ.includes("==") || trimmedA.includes("==")) issues.push("reserved-markup");
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
    const matches = [...text.matchAll(/==([\s\S]*?)==/g)];
    if (matches.length === 0 || matches.some(match => !match[1]?.trim())) return false;
    return !text.replace(/==[\s\S]*?==/g, "").includes("==");
}

/** Cloze export must hide every plain-text answer fragment, including extra fields. */
export function concealUnmarkedText(text: string): string {
    const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    if (normalized.includes("==") && !hasMarkedAnswer(normalized)) {
        throw new Error("invalid flashcard: invalid cloze markup");
    }
    return normalized
        .split(/(==[\s\S]*?==)/g)
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
 * 纯 `==答案==` 或只有空白/排版标记、纯标点符号占位的块不能作为普通闪卡入组；
 * 保护合法公式、代码与短术语；图片卡要求有效资源地址。
 */
export function hasQuestionContent(markdown: string): boolean {
    const text = String(markdown ?? "");
    const withoutAnswers = text.replace(/==[\s\S]*?==/g, " ");
    const hasMedia = hasQuestionMediaContent(text);
    return hasMedia || hasMeaningfulPrompt(withoutAnswers);
}

/** 可见于问题态的图片；答案挖空内部的图片不算题面内容。 */
export function hasQuestionMediaContent(markdown: string): boolean {
    return hasImageContent(String(markdown ?? "").replace(/==[\s\S]*?==/g, " "));
}

export function hasImageContent(markdown: string): boolean {
    const text = String(markdown ?? "");
    // Markdown 图像：!\[...\](url)，url 必须包含非空白有效地址
    const mdMatches = [...text.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)\s*\)/g)];
    for (const m of mdMatches) {
        const src = m[1]?.trim();
        if (src && src !== "#" && !/^javascript:/i.test(src)) return true;
    }

    // HTML 图像：<img ... src="..." ...>，src 必须包含非空白有效地址
    const htmlMatches = [...text.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"'\s]+)["'][^>]*>/gi)];
    for (const m of htmlMatches) {
        const src = m[1]?.trim();
        if (src && src !== "#" && !/^javascript:/i.test(src)) return true;
    }

    return false;
}
