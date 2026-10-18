const INVISIBLE_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g;

/**
 * Clean and normalize a choice option string:
 * - strips zero-width / control characters
 * - normalizes non-breaking spaces (\u00a0) and collapses redundant whitespace
 * - trims leading and trailing whitespace
 */
export function cleanChoiceText(raw: string): string {
    if (!raw) return "";
    return String(raw)
        .replace(INVISIBLE_RE, "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Build multiple-choice options from one answer and candidate distractors.
 *
 * The UI can only present as many choices as there are reliable, distinct
 * distractors.  Returning the answer plus 0..3 candidates lets the caller
 * degrade to free recall when no distractor is available instead of showing
 * fabricated placeholder text.
 */
export function buildChoiceOptions(answer: string, candidates: readonly string[]): string[] | null {
    const normalizedAnswer = cleanChoiceText(answer);
    if (!normalizedAnswer) {
        return null;
    }
    const seen = new Set<string>([normalizedAnswer]);
    const distractors: string[] = [];
    for (const candidate of candidates) {
        const value = cleanChoiceText(candidate);
        if (!value || seen.has(value)) {
            continue;
        }
        seen.add(value);
        distractors.push(value);
        if (distractors.length >= 3) {
            break;
        }
    }
    // No reliable distractor: the caller should use the normal free-recall
    // flow. One or two distractors intentionally produce a 2/3-choice quiz.
    return distractors.length > 0 ? [normalizedAnswer, ...distractors] : null;
}
