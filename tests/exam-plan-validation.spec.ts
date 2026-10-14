import { describe, expect, it } from "vitest";
import { validExamDate, validateExamPlanInput } from "../src/core/exam-plan-validation";

const messages = {
    needName: "请填写计划名称", needDate: "请选择考试日期", longName: "名称过长", invalidDate: "日期无效",
    invalidTotalCards: "卡量无效", invalidCramDays: "天数无效",
};

describe("exam plan boundary validation", () => {
    it("accepts real calendar dates and rejects impossible dates", () => {
        expect(validExamDate("2030-02-28")).toBe(true);
        expect(validExamDate("2030-02-30")).toBe(false);
        expect(validExamDate("2030/02/28")).toBe(false);
    });

    it("reports each missing or invalid field instead of silently dropping the draft", () => {
        const result = validateExamPlanInput({ name: " ", examDate: "", totalCards: Number.NaN, cramDays: undefined }, messages);
        expect(result.value).toBeNull();
        expect(result.errors).toMatchObject({ name: messages.needName, examDate: messages.needDate });
        expect(result.errors.totalCards).toBe(messages.invalidTotalCards);
        expect(result.errors.cramDays).toBe(messages.invalidCramDays);
    });

    it.each([
        [0, "totalCards"], [1_000_001, "totalCards"], [1.5, "totalCards"], [Infinity, "totalCards"],
        [-1, "cramDays"], [366, "cramDays"], [1.5, "cramDays"], [Number.NaN, "cramDays"],
    ])("rejects out-of-range numeric value %s for %s", (value, field) => {
        const input = { name: "计划", examDate: "2030-05-01", totalCards: 10, cramDays: 7, [field]: value };
        expect(validateExamPlanInput(input, messages).errors[field]).toBeTruthy();
    });

    it("allows optional total cards to be blank and normalizes valid values", () => {
        const result = validateExamPlanInput({ name: "  计划  ", examDate: "2030-05-01", totalCards: "", cramDays: "14" }, messages);
        expect(result.errors).toEqual({});
        expect(result.value).toEqual({ name: "计划", examDate: "2030-05-01", totalCards: undefined, cramDays: 14 });
    });
});
