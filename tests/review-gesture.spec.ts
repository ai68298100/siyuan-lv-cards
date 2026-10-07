import { describe, expect, it } from "vitest";
import { reviewSwipeAction } from "../src/core/review-gesture";

describe("review swipe semantics", () => {
    it("question side reveals only on an upward swipe and never rates horizontally", () => {
        expect(reviewSwipeAction(false, 90, 0)).toBeNull();
        expect(reviewSwipeAction(false, -90, 0)).toBeNull();
        expect(reviewSwipeAction(false, 0, -90)).toBe("reveal");
        expect(reviewSwipeAction(false, 0, 90)).toBeNull();
    });

    it("answer side maps horizontal swipes to the matching visible ratings", () => {
        expect(reviewSwipeAction(true, 90, 0)).toBe("good");
        expect(reviewSwipeAction(true, -90, 0)).toBe("again");
        expect(reviewSwipeAction(true, 0, -90)).toBeNull();
    });

    it("ignores short and diagonal gestures", () => {
        expect(reviewSwipeAction(false, 59, 0)).toBeNull();
        expect(reviewSwipeAction(true, -90, 60)).toBeNull();
        expect(reviewSwipeAction(true, 60, 0)).toBeNull();
    });
});
