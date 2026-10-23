import { describe, expect, it, vi } from "vitest";
import {
    resolveReviewKeyAction,
    isInputOrEditable,
    isInteractiveControl,
    type ReviewShortcutContext,
} from "../src/core/review-shortcuts";

function baseContext(overrides: Partial<ReviewShortcutContext> = {}): ReviewShortcutContext {
    return {
        peekOpen: false,
        helpOpen: false,
        showAnswer: false,
        faceReady: true,
        hasCurrent: true,
        hasLastAnswered: false,
        ratingStyle: "four",
        isTargetInsideRoot: true,
        ...overrides,
    };
}

describe("review-shortcuts 键盘调度解析器", () => {
    describe("元素类型辅助检测", () => {
        it("isInputOrEditable 检测输入框与可编辑区域", () => {
            const input = document.createElement("input");
            const textarea = document.createElement("textarea");
            const editable = document.createElement("div");
            editable.setAttribute("contenteditable", "true");
            const span = document.createElement("span");

            expect(isInputOrEditable(input)).toBe(true);
            expect(isInputOrEditable(textarea)).toBe(true);
            expect(isInputOrEditable(editable)).toBe(true);
            expect(isInputOrEditable(span)).toBe(false);
            expect(isInputOrEditable(null)).toBe(false);
        });

        it("isInteractiveControl 检测按钮、下拉与链接", () => {
            const button = document.createElement("button");
            const select = document.createElement("select");
            const a = document.createElement("a");
            const div = document.createElement("div");

            expect(isInteractiveControl(button)).toBe(true);
            expect(isInteractiveControl(select)).toBe(true);
            expect(isInteractiveControl(a)).toBe(true);
            expect(isInteractiveControl(div)).toBe(false);
            expect(isInteractiveControl(null)).toBe(false);
        });
    });

    describe("模态与浮层拦截优先级", () => {
        it("peekOpen=true 时只响应 Escape 与 [，并调用 preventDefault", () => {
            const prevent = vi.fn();
            const ctx = baseContext({ peekOpen: true });

            expect(resolveReviewKeyAction({ key: "Escape", preventDefault: prevent }, ctx)).toBe("close-peek");
            expect(prevent).toHaveBeenCalled();

            expect(resolveReviewKeyAction({ key: "[", preventDefault: prevent }, ctx)).toBe("close-peek");
            expect(resolveReviewKeyAction({ key: " ", code: "Space" }, ctx)).toBeNull();
            expect(resolveReviewKeyAction({ key: "1" }, ctx)).toBeNull();
        });

        it("? 切换帮助，helpOpen=true 时只响应 Escape 关闭帮助", () => {
            const ctx = baseContext({ helpOpen: true });
            expect(resolveReviewKeyAction({ key: "Escape" }, ctx)).toBe("close-help");
            expect(resolveReviewKeyAction({ key: "1" }, ctx)).toBeNull();

            const closedCtx = baseContext({ helpOpen: false });
            expect(resolveReviewKeyAction({ key: "?" }, closedCtx)).toBe("toggle-help");
        });
    });

    describe("交互控件与输入区防抢占", () => {
        it("焦点在输入框或富文本元素内时不触发快捷键", () => {
            const input = document.createElement("input");
            const ctx = baseContext();

            expect(resolveReviewKeyAction({ key: " ", code: "Space", target: input }, ctx)).toBeNull();
            expect(resolveReviewKeyAction({ key: "h", target: input }, ctx)).toBeNull();
            expect(resolveReviewKeyAction({ key: "x", target: input }, ctx)).toBeNull();
        });

        it("焦点在面板外交互控件上时，不抢占 Space/Enter", () => {
            const extButton = document.createElement("button");
            const ctx = baseContext({ isTargetInsideRoot: false });

            expect(resolveReviewKeyAction({ key: " ", code: "Space", target: extButton }, ctx)).toBeNull();
        });
    });

    describe("核心复习流转（Space / Enter / h）", () => {
        it("问题态且面已就绪：Space/Enter 触发 reveal", () => {
            const prevent = vi.fn();
            const ctx = baseContext({ showAnswer: false, faceReady: true });
            expect(resolveReviewKeyAction({ key: " ", code: "Space", preventDefault: prevent }, ctx)).toBe("reveal");
            expect(prevent).toHaveBeenCalled();
        });

        it("问题态但面未就绪：Space/Enter 不触发翻面", () => {
            const ctx = baseContext({ showAnswer: false, faceReady: false });
            expect(resolveReviewKeyAction({ key: " ", code: "Space" }, ctx)).toBeNull();
        });

        it("答案态：Space/Enter 触发 rate-default（良好 3）", () => {
            const ctx = baseContext({ showAnswer: true });
            expect(resolveReviewKeyAction({ key: "Enter", code: "Enter" }, ctx)).toBe("rate-default");
        });

        it("h 推进提示：仅在问题态且有卡片时生效", () => {
            const ctx = baseContext({ showAnswer: false, hasCurrent: true });
            expect(resolveReviewKeyAction({ key: "h" }, ctx)).toBe("advance-hint");

            const ansCtx = baseContext({ showAnswer: true, hasCurrent: true });
            expect(resolveReviewKeyAction({ key: "h" }, ansCtx)).toBeNull();
        });
    });

    describe("辅助控制键（x / 0 / f / s / [）", () => {
        it("x 或 0 触发 skip，问题态与答案态均可用", () => {
            expect(resolveReviewKeyAction({ key: "x" }, baseContext({ showAnswer: false }))).toBe("skip");
            expect(resolveReviewKeyAction({ key: "0" }, baseContext({ showAnswer: true }))).toBe("skip");
        });

        it("f 切换改期面板，s 暂停复习，m 切换助记便签", () => {
            expect(resolveReviewKeyAction({ key: "f" }, baseContext())).toBe("toggle-reschedule");
            expect(resolveReviewKeyAction({ key: "s" }, baseContext())).toBe("suspend");
            expect(resolveReviewKeyAction({ key: "m" }, baseContext({ hasCurrent: true }))).toBe("toggle-memo");
            expect(resolveReviewKeyAction({ key: "m" }, baseContext({ hasCurrent: false }))).toBeNull();
        });

        it("[ 仅在有上一张卡片（hasLastAnswered）时切换 peek", () => {
            expect(resolveReviewKeyAction({ key: "[" }, baseContext({ hasLastAnswered: true }))).toBe("toggle-peek");
            expect(resolveReviewKeyAction({ key: "[" }, baseContext({ hasLastAnswered: false }))).toBeNull();
        });
    });

    describe("四档与三档评分（1~4）与撤销（p / q）", () => {
        it("问题态下数字键与撤销键一律忽略", () => {
            const ctx = baseContext({ showAnswer: false });
            expect(resolveReviewKeyAction({ key: "1" }, ctx)).toBeNull();
            expect(resolveReviewKeyAction({ key: "p" }, ctx)).toBeNull();
        });

        it("四档模式：1~4 与方向键映射对应评分", () => {
            const ctx = baseContext({ showAnswer: true, ratingStyle: "four" });
            expect(resolveReviewKeyAction({ key: "1" }, ctx)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: "ArrowLeft" }, ctx)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: "2" }, ctx)).toBe("rate-2");
            expect(resolveReviewKeyAction({ key: "ArrowDown" }, ctx)).toBe("rate-2");
            expect(resolveReviewKeyAction({ key: "3" }, ctx)).toBe("rate-3");
            expect(resolveReviewKeyAction({ key: "ArrowRight" }, ctx)).toBe("rate-3");
            expect(resolveReviewKeyAction({ key: "4" }, ctx)).toBe("rate-4");
            expect(resolveReviewKeyAction({ key: "ArrowUp" }, ctx)).toBe("rate-4");
            expect(resolveReviewKeyAction({ key: "5" }, ctx)).toBeNull();
        });

        it("三档模式：1~3 映射评分，4 被忽略", () => {
            const ctx = baseContext({ showAnswer: true, ratingStyle: "three" });
            expect(resolveReviewKeyAction({ key: "1" }, ctx)).toBe("rate-1");
            expect(resolveReviewKeyAction({ key: "2" }, ctx)).toBe("rate-2");
            expect(resolveReviewKeyAction({ key: "3" }, ctx)).toBe("rate-3");
            expect(resolveReviewKeyAction({ key: "4" }, ctx)).toBeNull();
        });

        it("p 或 q 触发撤销操作", () => {
            const ctx = baseContext({ showAnswer: true });
            expect(resolveReviewKeyAction({ key: "p" }, ctx)).toBe("undo");
            expect(resolveReviewKeyAction({ key: "q" }, ctx)).toBe("undo");
        });
    });
});
