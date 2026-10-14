export interface ExamPlanValidationMessages {
    needName: string;
    needDate: string;
    longName: string;
    invalidDate: string;
    invalidTotalCards: string;
    invalidCramDays: string;
}

export interface ExamPlanValidationInput {
    name: unknown;
    examDate: unknown;
    totalCards?: unknown;
    cramDays?: unknown;
}

export interface ValidExamPlanFields {
    name: string;
    examDate: string;
    totalCards?: number;
    cramDays: number;
}

export interface ExamPlanValidationResult {
    value: ValidExamPlanFields | null;
    errors: Record<string, string>;
}

export function validExamDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    return year >= 1900 && year <= 9999
        && date.getFullYear() === year
        && date.getMonth() === month - 1
        && date.getDate() === day;
}

export function validateExamPlanInput(input: ExamPlanValidationInput, messages: ExamPlanValidationMessages): ExamPlanValidationResult {
    const errors: Record<string, string> = {};
    const name = String(input.name ?? "").trim();
    const examDate = String(input.examDate ?? "").trim();
    const totalRaw = input.totalCards;
    const cramRaw = input.cramDays;
    if (!name) errors.name = messages.needName;
    else if (name.length > 120) errors.name = messages.longName;
    if (!examDate) errors.examDate = messages.needDate;
    else if (!validExamDate(examDate)) errors.examDate = messages.invalidDate;

    let totalCards: number | undefined;
    if (totalRaw !== undefined && String(totalRaw).trim() !== "") {
        totalCards = Number(totalRaw);
        if (!Number.isSafeInteger(totalCards) || totalCards < 1 || totalCards > 1_000_000) {
            errors.totalCards = messages.invalidTotalCards;
        }
    }
    const cramDays = Number(cramRaw);
    if (cramRaw === undefined || String(cramRaw).trim() === "" || !Number.isSafeInteger(cramDays) || cramDays < 0 || cramDays > 365) {
        errors.cramDays = messages.invalidCramDays;
    }

    return {
        value: Object.keys(errors).length === 0 ? { name, examDate, totalCards, cramDays } : null,
        errors,
    };
}
