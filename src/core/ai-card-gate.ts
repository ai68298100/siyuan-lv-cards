import { validateQaDraft } from "./flashcard-quality";

export interface AiCardDraft {
    q: string;
    a: string;
}

export type AiCardGateIssue = "duplicate-question" | "answer-in-question" | "multiple-questions" | "template-placeholder";

export interface AiCandidate extends AiCardDraft {
    keep: boolean;
    review: "pending" | "accepted" | "verified" | "needsCheck";
}

const PUNCTUATION_AND_SPACE = /[\s\p{P}]/gu;
const PLACEHOLDER = /\{\{[^}]{1,100}\}\}|\$\{[^}]{1,100}\}|\[(?:答案|问题|answer|question|todo|tbd)\]|(?:待填写|待补充|待完善|此处填写|占位符)|(?:^|\n)\s*(?:TODO|TBD|FIXME)(?:\s*:\s*.+)?\s*$/i;
const GENERIC_SHORT_ANSWERS = new Set(["是", "否", "有", "无", "对", "错", "是的", "不是", "yes", "no", "true", "false"]);
const CODE_OR_MATH = /```[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]*?\$\$|\$(?!\{)[^$\n]+\$/g;

function normalizeContent(value: string): string {
    return String(value ?? "").normalize("NFC").toLocaleLowerCase().replace(PUNCTUATION_AND_SPACE, "");
}

/**
 * High-confidence AI candidate blockers. This deliberately stays narrower than
 * the advisory scorecard: semantic similarity and fact accuracy need a human.
 */
export function findAiCardGateIssues(cards: readonly AiCardDraft[]): AiCardGateIssue[][] {
    const seenQuestions = new Set<string>();
    return cards.map(card => {
        const issues: AiCardGateIssue[] = [];
        const q = String(card.q ?? "").trim();
        const a = String(card.a ?? "").trim();
        if (validateQaDraft(q, a).length > 0) return issues;

        const normalizedQuestion = normalizeContent(q);
        if (seenQuestions.has(normalizedQuestion)) issues.push("duplicate-question");
        seenQuestions.add(normalizedQuestion);

        const normalizedAnswer = normalizeContent(a);
        if (normalizedAnswer.length >= 2 && !GENERIC_SHORT_ANSWERS.has(normalizedAnswer) && normalizedQuestion.includes(normalizedAnswer)) {
            issues.push("answer-in-question");
        }
        // Literal code/formulas may contain semicolons, question marks and ${...};
        // those tokens are material to learn, rather than unfinished AI output.
        const questionProse = q.replace(CODE_OR_MATH, " ");
        const answerProse = a.replace(CODE_OR_MATH, " ");
        if (/[;；]/.test(questionProse) || (questionProse.match(/[?？]/g)?.length ?? 0) > 1) {
            issues.push("multiple-questions");
        }
        if (PLACEHOLDER.test(questionProse) || PLACEHOLDER.test(answerProse)) issues.push("template-placeholder");
        return issues;
    });
}

/**
 * Evaluate only selected candidates so removing an earlier duplicate immediately
 * unlocks the remaining copy. Results align with the original candidate indexes.
 */
export function inspectAiCandidates(candidates: readonly AiCandidate[]): AiCardGateIssue[][] {
    const selected = candidates.map((candidate, index) => ({ candidate, index })).filter(row => row.candidate.keep);
    const selectedIssues = findAiCardGateIssues(selected.map(row => row.candidate));
    const issuesByIndex = candidates.map((): AiCardGateIssue[] => []);
    selected.forEach((row, index) => { issuesByIndex[row.index] = selectedIssues[index]; });
    return issuesByIndex;
}

/** Shared UI selection helper: a candidate is importable only if accepted, selected, structurally valid, and unblocked. */
export function selectImportableAiCandidates<T extends AiCandidate>(candidates: readonly T[]): T[] {
    const issuesByIndex = inspectAiCandidates(candidates);
    return candidates.filter((candidate, index) =>
        candidate.keep && candidate.review === "accepted" &&
        validateQaDraft(candidate.q, candidate.a).length === 0 &&
        issuesByIndex[index].length === 0,
    );
}
