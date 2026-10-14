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

/**
 * 校验触控目标是否应被手势判定忽略（移动端手势防冲突与触控冒泡保护，docs/34 W-5/W-8）
 * 1. 忽略表单输入、按钮、链接、可编辑元素、键位徽章；
 * 2. 忽略代码块（pre/code）、表格（table/th/td）、矢量遮罩与图表；
 * 3. 忽略父级存在横向 overflow 滚动区域的元素，避免横滑查表/看长代码时误触卡片切题/评分。
 */
export function shouldIgnoreSwipeTarget(target: EventTarget | null): boolean {
    if (!target || typeof (target as Element).closest !== "function") return false;
    const el = target as HTMLElement;

    // 交互控件与可输入区域
    if (el.closest("input,textarea,select,button,a,[contenteditable],kbd,[role='button'],[role='tab']")) {
        return true;
    }

    // 代码块、表格、公式、SVG 矢量
    if (el.closest("pre,code,table,thead,tbody,tr,td,th,svg")) {
        return true;
    }

    // 检测祖先节点中是否存在实际处于可横向滚动状态的容器
    if (typeof window !== "undefined") {
        let cur: HTMLElement | null = el;
        while (cur && cur !== document.body) {
            if (cur.scrollWidth > cur.clientWidth + 4) {
                const style = window.getComputedStyle(cur);
                if (style.overflowX === "auto" || style.overflowX === "scroll") {
                    return true;
                }
            }
            cur = cur.parentElement;
        }
    }

    return false;
}

