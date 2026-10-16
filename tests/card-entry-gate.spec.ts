import { describe, expect, it } from "vitest";
import { validateCardEntries } from "../src/core/card-entry-gate";
import { partitionReviewCardsByQuality } from "../src/core/review-queue-quality";

describe("card-entry-gate", () => {
    it("accepts cloze cards only when question text or media remains visible", () => {
        expect(validateCardEntries([
            { blockID: "qa", markdown: "What? ==Answer==" },
            { blockID: "image", markdown: "![diagram](diagram.png) ==label==" },
            { blockID: "answer-only", markdown: "==Answer==" },
        ])).toEqual([
            { blockID: "qa", ok: true, kind: "markdown" },
            { blockID: "image", ok: true, kind: "markdown" },
            { blockID: "answer-only", ok: false, issue: "missing-question" },
        ]);
    });

    it("accepts image occlusion only with a visible image and at least one valid rectangle", () => {
        const attrs = { "lv-occlusion": JSON.stringify({ v: 1, rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] }) };
        expect(validateCardEntries([
            { blockID: "valid", markdown: "![diagram](diagram.png)", attrs },
            { blockID: "empty", markdown: "![diagram](diagram.png)", attrs: { "lv-occlusion": JSON.stringify({ v: 1, rects: [] }) } },
            { blockID: "image-hidden-in-answer", markdown: "==![diagram](diagram.png)==", attrs },
        ])).toEqual([
            { blockID: "valid", ok: true, kind: "image-occlusion" },
            { blockID: "empty", ok: false, issue: "missing-answer" },
            { blockID: "image-hidden-in-answer", ok: false, issue: "missing-question" },
        ]);
    });

    it("does not let image occlusion bypass malformed answer markup", () => {
        const attrs = { "lv-occlusion": JSON.stringify({ v: 1, rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] }) };
        expect(validateCardEntries([
            { blockID: "bad-markup", markdown: "![diagram](diagram.png) ==answer=", attrs },
        ])).toEqual([{ blockID: "bad-markup", ok: false, issue: "invalid-markup" }]);
    });

    it("rejects extra equals signs instead of extracting an inner marker", () => {
        expect(validateCardEntries([
            { blockID: "trailing", markdown: "题面 ==答案===" },
            { blockID: "leading", markdown: "题面 ===答案==" },
        ])).toEqual([
            { blockID: "trailing", ok: false, issue: "invalid-markup" },
            { blockID: "leading", ok: false, issue: "invalid-markup" },
        ]);
    });

    it("rejects entity-only and zero-width question placeholders", () => {
        expect(validateCardEntries([
            { blockID: "nbsp", markdown: "&nbsp; ==答案==" },
            { blockID: "zero-width", markdown: "\u200b\u200d ==答案==" },
        ])).toEqual([
            { blockID: "nbsp", ok: false, issue: "missing-question" },
            { blockID: "zero-width", ok: false, issue: "missing-question" },
        ]);
    });

    it("filters invalid legacy cards without changing the original card objects", () => {
        const cards = [{ blockID: "good", cardID: "c1" }, { blockID: "bad", cardID: "c2" }, { blockID: "lost", cardID: "c3" }];
        const result = partitionReviewCardsByQuality(cards, [
            { id: "good", markdown: "Question ==Answer==" },
            { id: "bad", markdown: "plain text without answer" },
        ]);
        expect(result.valid).toEqual([cards[0]]);
        expect(result.invalid).toEqual([
            { blockID: "bad", cardID: "c2", issue: "missing-answer" },
            { blockID: "lost", cardID: "c3", issue: "missing-block" },
        ]);
        expect(cards).toHaveLength(3);
    });
});
