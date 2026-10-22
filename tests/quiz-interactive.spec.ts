import { describe, expect, it } from "vitest";
import {
    extractChoiceOptionsFromText,
    parseInteractiveQuiz,
    parseJudgeAnswer,
} from "../src/core/quiz-interactive";

describe("quiz-interactive core parser", () => {
    it("extracts choice options from multiline list items", () => {
        const text = `
【单选示例】上月销量为 80 件，本月为 100 件，环比增长率是多少？
* A. 20%
* B. 25%
* C. 80%
* D. 125%
        `;
        const opts = extractChoiceOptionsFromText(text, "B");
        expect(opts).toHaveLength(4);
        expect(opts[0]).toEqual({ key: "A", text: "20%", isAnswer: false });
        expect(opts[1]).toEqual({ key: "B", text: "25%", isAnswer: true });
        expect(opts[2]).toEqual({ key: "C", text: "80%", isAnswer: false });
        expect(opts[3]).toEqual({ key: "D", text: "125%", isAnswer: false });
    });

    it("extracts choice options from SiYuan native HTML block DOM", () => {
        const dom = `
<div data-node-id="20261022-test" data-type="NodeSuperBlock">
    <div class="p" data-type="NodeParagraph">【单选示例】上月销量为 80 件，本月为 100 件，环比增长率是多少？</div>
    <div data-type="NodeList" class="list" data-subtype="u">
        <div data-type="NodeListItem" class="li"><div class="protyle-action"><svg></svg></div><div class="p" data-type="NodeParagraph">A. 20%</div></div>
        <div data-type="NodeListItem" class="li"><div class="protyle-action"><svg></svg></div><div class="p" data-type="NodeParagraph">B. 25%</div></div>
        <div data-type="NodeListItem" class="li"><div class="protyle-action"><svg></svg></div><div class="p" data-type="NodeParagraph">C. 80%</div></div>
        <div data-type="NodeListItem" class="li"><div class="protyle-action"><svg></svg></div><div class="p" data-type="NodeParagraph">D. 125%</div></div>
    </div>
</div>
        `;
        const opts = extractChoiceOptionsFromText(dom, "B");
        expect(opts).toHaveLength(4);
        expect(opts[0]).toEqual({ key: "A", text: "20%", isAnswer: false });
        expect(opts[1]).toEqual({ key: "B", text: "25%", isAnswer: true });
        expect(opts[2]).toEqual({ key: "C", text: "80%", isAnswer: false });
        expect(opts[3]).toEqual({ key: "D", text: "125%", isAnswer: false });
    });

    it("extracts inline options from a single line", () => {
        const text = "这是一道单选题 A. 选项一 B. 选项二 C. 选项三 D. 选项四";
        const opts = extractChoiceOptionsFromText(text, "C");
        expect(opts).toHaveLength(4);
        expect(opts[2]).toEqual({ key: "C", text: "选项三", isAnswer: true });
    });

    it("parses judge answer strings accurately", () => {
        expect(parseJudgeAnswer("T")).toBe(true);
        expect(parseJudgeAnswer("True")).toBe(true);
        expect(parseJudgeAnswer("对")).toBe(true);
        expect(parseJudgeAnswer("正确")).toBe(true);
        expect(parseJudgeAnswer("√")).toBe(true);

        expect(parseJudgeAnswer("F")).toBe(false);
        expect(parseJudgeAnswer("False")).toBe(false);
        expect(parseJudgeAnswer("错")).toBe(false);
        expect(parseJudgeAnswer("错误")).toBe(false);
        expect(parseJudgeAnswer("×")).toBe(false);

        expect(parseJudgeAnswer("")).toBeNull();
        expect(parseJudgeAnswer("也许")).toBeNull();
    });

    it("parses full quiz data for a single-choice question with custom-exam attrs", () => {
        const res = parseInteractiveQuiz({
            markdown: `【单选示例】测试题干\n- A. 选项A\n- B. 选项B\n- C. 选项C\n- D. 选项D`,
            attrs: {
                "custom-exam-type": "single",
                "custom-exam-answer": "B",
                "custom-exam-analysis": "解析说明",
            },
        });

        expect(res.kind).toBe("choice");
        expect(res.isMultiple).toBe(false);
        expect(res.options).toHaveLength(4);
        expect(res.options.find(o => o.key === "B")?.isAnswer).toBe(true);
        expect(res.analysis).toBe("解析说明");
        expect(res.hasInteractiveWidgets).toBe(true);
    });

    it("parses full quiz data for a judgment question", () => {
        const res = parseInteractiveQuiz({
            markdown: `【判断示例】地球是太阳系的行星之一。`,
            attrs: {
                "custom-exam-type": "judge",
                "custom-exam-answer": "T",
            },
        });

        expect(res.kind).toBe("judge");
        expect(res.judgeAnswer).toBe(true);
        expect(res.hasInteractiveWidgets).toBe(true);
    });

    it("parses fill-in-the-blank question with underscores", () => {
        const res = parseInteractiveQuiz({
            markdown: `增长率=(本期值－基期值)÷_____。`,
            expectedText: "基期值",
        });

        expect(res.kind).toBe("fill");
        expect(res.fillExpected).toBe("基期值");
        expect(res.hasInteractiveWidgets).toBe(true);
    });
});
