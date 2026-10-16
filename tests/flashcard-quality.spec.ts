import { describe, expect, it } from "vitest";
import {
    concealUnmarkedText,
    hasImageContent,
    hasMarkedAnswer,
    hasMeaningfulPrompt,
    hasQuestionContent,
    serializeQaCard,
    validateFlashcardMarkdown,
    validateQaDraft,
} from "../src/core/flashcard-quality";

describe("flashcard-quality", () => {
    it("requires a non-empty prompt and answer and reserves == for serialization", () => {
        expect(validateQaDraft("", "answer")).toContain("empty-question");
        expect(validateQaDraft("question", " ")).toContain("empty-answer");
        expect(validateQaDraft("question ==x==", "answer")).toContain("reserved-markup");
        expect(serializeQaCard(" question ", " answer ")).toBe("question ==answer==");
    });

    it("rejects punctuation-only and placeholder prompts in validateQaDraft", () => {
        expect(validateQaDraft("???", "answer")).toContain("empty-question");
        expect(validateQaDraft("？？？", "answer")).toContain("empty-question");
        expect(validateQaDraft("...", "answer")).toContain("empty-question");
        expect(validateQaDraft("——", "answer")).toContain("empty-question");
        expect(validateQaDraft("，。！？", "answer")).toContain("empty-question");
        expect(validateQaDraft("&nbsp;", "answer")).toContain("empty-question");
        expect(validateQaDraft("   ", "answer")).toContain("empty-question");
        expect(validateQaDraft("`   `", "answer")).toContain("empty-question");
        expect(validateQaDraft("$$   $$", "answer")).toContain("empty-question");
        expect(validateQaDraft("![empty]()", "answer")).toContain("empty-question");
    });

    it("protects legitimate short terms, formulas, and code in validateQaDraft", () => {
        expect(validateQaDraft("DNA", "脱氧核糖核酸")).toEqual([]);
        expect(validateQaDraft("CPU", "中央处理器")).toEqual([]);
        expect(validateQaDraft("Go", "编程语言")).toEqual([]);
        expect(validateQaDraft("3", "数字三")).toEqual([]);
        expect(validateQaDraft("$E=mc^2$", "质能方程")).toEqual([]);
        expect(validateQaDraft("`a = 1;`", "变量赋值")).toEqual([]);
        expect(validateQaDraft("![图](assets/img.png)", "有效图片")).toEqual([]);
    });

    it("accepts only non-empty, balanced answer markers", () => {
        expect(hasMarkedAnswer("question ==answer==")).toBe(true);
        expect(validateFlashcardMarkdown("question ==answer==")).toBeNull();
        expect(validateFlashcardMarkdown("==answer==")).toBeNull();
        expect(validateFlashcardMarkdown("![diagram](diagram.png) ==label==")).toBeNull();
        expect(validateFlashcardMarkdown("question == ==")).toBe("invalid-markup");
        expect(validateFlashcardMarkdown("question ==answer")).toBe("invalid-markup");
        expect(hasMarkedAnswer("question ==answer===")).toBe(false);
        expect(validateFlashcardMarkdown("question ==answer===")).toBe("invalid-markup");
        expect(validateFlashcardMarkdown("question ===answer==")).toBe("invalid-markup");
        expect(validateFlashcardMarkdown("question ====answer====")).toBe("invalid-markup");
        expect(validateFlashcardMarkdown("ordinary text")).toBe("missing-answer");
        expect(validateFlashcardMarkdown("  ")).toBe("empty-card");
    });

    it("detects valid images and rejects invalid/empty image markup", () => {
        expect(hasImageContent("![valid](assets/arch.png)")).toBe(true);
        expect(hasImageContent('<img src="https://example.com/pic.jpg">')).toBe(true);
        expect(hasImageContent("![]()")).toBe(false);
        expect(hasImageContent("![](   )")).toBe(false);
        expect(hasImageContent("![](#)")).toBe(false);
        expect(hasImageContent('<img src="">')).toBe(false);
        expect(hasImageContent('<img src="   ">')).toBe(false);
        expect(hasImageContent("plain text without images")).toBe(false);
    });

    it("distinguishes meaningful question content from placeholders and punctuation", () => {
        // Bad cards: punctuation only, whitespace or empty media
        expect(hasQuestionContent("??? ==答案==")).toBe(false);
        expect(hasQuestionContent("？？？ ==答案==")).toBe(false);
        expect(hasQuestionContent("... ==答案==")).toBe(false);
        expect(hasQuestionContent("—— ==答案==")).toBe(false);
        expect(hasQuestionContent("--- ==答案==")).toBe(false);
        expect(hasQuestionContent("*** ==答案==")).toBe(false);
        expect(hasQuestionContent("==纯答案==")).toBe(false);
        expect(hasQuestionContent("![]() ==空图片==")).toBe(false);

        // Good cards: short terms, formulas, code, and valid media
        expect(hasQuestionContent("DNA ==脱氧核糖核酸==")).toBe(true);
        expect(hasQuestionContent("CPU ==中央处理器==")).toBe(true);
        expect(hasQuestionContent("3 ==数字三==")).toBe(true);
        expect(hasQuestionContent("$E=mc^2$ ==质能方程==")).toBe(true);
        expect(hasQuestionContent("$$\\int_0^1 x dx$$ ==1/2==")).toBe(true);
        expect(hasQuestionContent("`i++` ==自增运算符==")).toBe(true);
        expect(hasQuestionContent("![架构图](assets/arch.png) ==系统架构==")).toBe(true);
        expect(hasQuestionContent("TCP 三次握手的作用是什么？ ==建立可靠连接==")).toBe(true);
    });

    it("preserves marked answers and hides every unmarked cloze answer fragment", () => {
        expect(concealUnmarkedText("==answer==\n\nExtra: detail")).toBe("==answer== ==Extra: detail==");
        expect(concealUnmarkedText("plain answer")).toBe("==plain answer==");
        expect(() => concealUnmarkedText("==broken")).toThrow("invalid cloze markup");
    });

    it("accepts single equals signs inside answers and conceals them completely", () => {
        const formula = "解方程 ==x=1==";
        expect(hasMarkedAnswer(formula)).toBe(true);
        expect(validateFlashcardMarkdown(formula)).toBeNull();
        expect(concealUnmarkedText("==x=1==\nExtra: y=2")).toBe("==x=1== ==Extra: y=2==");
        expect(hasQuestionContent("==x=1==")).toBe(false);
        expect(hasQuestionContent(formula)).toBe(true);
        expect(hasQuestionContent('==<img src="assets/answer.png"> x=1==')).toBe(false);
    });
});
