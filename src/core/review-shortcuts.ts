/**
 * 专注复习全局快捷键调度解析器（纯函数，隔离 DOM 事件与组件生命周期）
 */

export type ReviewKeyAction =
    | "close-peek"
    | "toggle-help"
    | "close-help"
    | "reveal"
    | "rate-default"
    | "rate-1"
    | "rate-2"
    | "rate-3"
    | "rate-4"
    | "advance-hint"
    | "toggle-peek"
    | "skip"
    | "toggle-reschedule"
    | "suspend"
    | "undo"
    | null;

export interface ReviewShortcutContext {
    peekOpen: boolean;
    helpOpen: boolean;
    showAnswer: boolean;
    faceReady: boolean;
    hasCurrent: boolean;
    hasLastAnswered: boolean;
    ratingStyle?: "three" | "four";
    /** 事件目标是否在复习容器内部 */
    isTargetInsideRoot?: boolean;
}

export interface ReviewKeyEventLike {
    key: string;
    code?: string;
    target?: EventTarget | null;
    preventDefault?: () => void;
}

/**
 * 判定事件触发源是否属于表单或富文本可编辑元素（这些元素自身需要接收所有按键）
 */
export function isInputOrEditable(target: EventTarget | null | undefined): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    if (typeof el.tagName !== "string") return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") return true;
    if (el.isContentEditable || el.getAttribute?.("contenteditable") === "true") return true;
    return false;
}

/**
 * 判定事件触发源是否为交互控件（按钮、下拉、超链接）
 */
export function isInteractiveControl(target: EventTarget | null | undefined): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    if (typeof el.tagName !== "string") return false;
    const tag = el.tagName.toLowerCase();
    return tag === "button" || tag === "select" || tag === "a";
}

/**
 * 解析复习场景中的键盘操作
 */
export function resolveReviewKeyAction(
    e: ReviewKeyEventLike,
    ctx: ReviewShortcutContext,
): ReviewKeyAction {
    // 1. 回看弹窗打开时：只响应关闭 Peek
    if (ctx.peekOpen) {
        if (e.key === "Escape" || e.key === "[") {
            e.preventDefault?.();
            return "close-peek";
        }
        return null;
    }

    // 2. 帮助遮罩开关与拦截
    if (e.key === "?") {
        return "toggle-help";
    }
    if (ctx.helpOpen) {
        if (e.key === "Escape") {
            return "close-help";
        }
        return null;
    }

    // 3. 输入控件不抢占（输入框正常打字）
    if (isInputOrEditable(e.target)) {
        return null;
    }

    // 4. 交互控件防护（如宿主工具栏按钮不抢 Space/Enter）
    if (isInteractiveControl(e.target) && !ctx.isTargetInsideRoot) {
        return null;
    }

    // 5. Space / Enter 主动作：问题态翻面，答案态默认评分（良好 3）
    if (e.code === "Space" || e.code === "Enter" || e.key === " " || e.key === "Enter") {
        e.preventDefault?.();
        if (!ctx.showAnswer) {
            return ctx.faceReady ? "reveal" : null;
        }
        return "rate-default";
    }

    // 6. h: 推进分级提示（仅问题态）
    if (e.key === "h" && !ctx.showAnswer && ctx.hasCurrent) {
        e.preventDefault?.();
        return "advance-hint";
    }

    // 7. [: 切换回看上一张已复习卡片
    if (e.key === "[") {
        if (ctx.hasLastAnswered) {
            return "toggle-peek";
        }
        return null;
    }

    // 8. 辅助控制（问题态与答案态均可用，对齐工具栏）
    if (e.key === "x" || e.key === "0") {
        return "skip";
    }
    if (e.key === "f") {
        return "toggle-reschedule";
    }
    if (e.key === "s") {
        return "suspend";
    }

    // 9. 后续评分与撤销必须在答案揭晓后生效
    if (!ctx.showAnswer) {
        return null;
    }

    // 10. 评分按键（1~4 或 1~3）
    if (ctx.ratingStyle === "three") {
        if (e.key === "1") return "rate-1";
        if (e.key === "2") return "rate-2";
        if (e.key === "3") return "rate-3";
    } else {
        if (e.key === "1") return "rate-1";
        if (e.key === "2") return "rate-2";
        if (e.key === "3") return "rate-3";
        if (e.key === "4") return "rate-4";
    }

    // 11. p / q: 撤销上一张评分
    if (e.key === "p" || e.key === "q") {
        return "undo";
    }

    return null;
}
