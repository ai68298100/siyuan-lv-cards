/** Review-card swipe semantics shared by the touch handler and unit tests. */
export type ReviewSwipeAction = "good" | "again" | "reveal" | null;

const SWIPE_THRESHOLD = 60;

export function reviewSwipeAction(showAnswer: boolean, dx: number, dy: number): ReviewSwipeAction {
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return null;

    // Question-side horizontal swipes never create a formal rating. Only the
    // answer side maps horizontal gestures to the visible rating controls.
    if (showAnswer) {
        if (dx > SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return "good";
        if (dx < -SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return "again";
        return null;
    }

    // Revealing is a question-side action; vertical scrolling remains inert.
    if (dy < -SWIPE_THRESHOLD && Math.abs(dx) < SWIPE_THRESHOLD) return "reveal";
    return null;
}
