import { describe, expect, it } from "vitest";
import { buildChoiceOptions } from "@/core/choice-options";

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
});
