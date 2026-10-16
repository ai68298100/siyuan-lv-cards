import { describe, expect, it } from "vitest";
import {
    concealUnmarkedText,
    hasMarkedAnswer,
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

    it("preserves marked answers and hides every unmarked cloze answer fragment", () => {
        expect(concealUnmarkedText("==answer==\n\nExtra: detail")).toBe("==answer== ==Extra: detail==");
        expect(concealUnmarkedText("plain answer")).toBe("==plain answer==");
        expect(() => concealUnmarkedText("==broken")).toThrow("invalid cloze markup");
    });
});
