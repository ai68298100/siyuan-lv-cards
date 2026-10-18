import { describe, expect, it } from "vitest";
import { buildChoiceOptions, cleanChoiceText } from "@/core/choice-options";

describe("cleanChoiceText", () => {
    it("strips zero-width characters and control codes", () => {
        expect(cleanChoiceText("答案\u200b\u200c\ufeff")).toBe("答案");
        expect(cleanChoiceText("\u200b\u2060")).toBe("");
    });

    it("normalizes non-breaking spaces and collapses whitespace", () => {
        expect(cleanChoiceText("词一\u00a0\u00a0词二")).toBe("词一 词二");
        expect(cleanChoiceText("   多重   空格   ")).toBe("多重 空格");
    });
});

describe("buildChoiceOptions", () => {
    it("uses all available reliable distractors, up to four choices", () => {
        expect(buildChoiceOptions("正确", ["甲", "乙", "丙", "丁"])).toEqual(["正确", "甲", "乙", "丙"]);
    });

    it("degrades to three or two choices when distractors are scarce", () => {
        expect(buildChoiceOptions("正确", ["甲", "甲", "乙"])).toEqual(["正确", "甲", "乙"]);
        expect(buildChoiceOptions("正确", ["甲", "正确", "  "])).toEqual(["正确", "甲"]);
    });

    it("returns null when no reliable distractor exists", () => {
        expect(buildChoiceOptions("正确", [])).toBeNull();
        expect(buildChoiceOptions("正确", ["正确", "  "])).toBeNull();
        expect(buildChoiceOptions("", ["甲"])).toBeNull();
    });

    it("strips invisible characters and prevents duplicate choices caused by zero-width spaces", () => {
        expect(buildChoiceOptions("答案\u200b", ["答案", "干扰一"])).toEqual(["答案", "干扰一"]);
        expect(buildChoiceOptions("正确", ["\u200b", "\u200c\ufeff", "有效干扰"])).toEqual(["正确", "有效干扰"]);
        expect(buildChoiceOptions("正确\ufeff", ["正确\u200b", "\u2060"])).toBeNull();
    });
});
