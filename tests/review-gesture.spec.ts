import { describe, expect, it, vi } from "vitest";
import { reviewSwipeAction, shouldIgnoreSwipeTarget } from "../src/core/review-gesture";

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

    describe("shouldIgnoreSwipeTarget 触控误触隔离", () => {
        it("普通非滚动容器返回 false", () => {
            const div = document.createElement("div");
            expect(shouldIgnoreSwipeTarget(div)).toBe(false);
            expect(shouldIgnoreSwipeTarget(null)).toBe(false);
        });

        it("交互控件（按钮/输入/链接/徽章）返回 true", () => {
            const btn = document.createElement("button");
            const input = document.createElement("input");
            const link = document.createElement("a");
            const kbd = document.createElement("kbd");
            const editable = document.createElement("div");
            editable.setAttribute("contenteditable", "true");

            expect(shouldIgnoreSwipeTarget(btn)).toBe(true);
            expect(shouldIgnoreSwipeTarget(input)).toBe(true);
            expect(shouldIgnoreSwipeTarget(link)).toBe(true);
            expect(shouldIgnoreSwipeTarget(kbd)).toBe(true);
            expect(shouldIgnoreSwipeTarget(editable)).toBe(true);
        });

        it("代码块、表格、SVG 矢量返回 true，防止横滑查阅时长代码误切题", () => {
            const pre = document.createElement("pre");
            const code = document.createElement("code");
            pre.appendChild(code);
            const table = document.createElement("table");
            const td = document.createElement("td");
            table.appendChild(td);
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

            expect(shouldIgnoreSwipeTarget(code)).toBe(true);
            expect(shouldIgnoreSwipeTarget(td)).toBe(true);
            expect(shouldIgnoreSwipeTarget(svg)).toBe(true);
        });

        it("祖先节点存在横向滚动（scrollWidth > clientWidth 且 overflowX 开启）时返回 true", () => {
            const parent = document.createElement("div");
            const child = document.createElement("span");
            parent.appendChild(child);

            // 模拟横向超宽容器
            Object.defineProperty(parent, "scrollWidth", { value: 500, configurable: true });
            Object.defineProperty(parent, "clientWidth", { value: 300, configurable: true });
            vi.spyOn(window, "getComputedStyle").mockReturnValue({
                overflowX: "auto",
            } as any);

            expect(shouldIgnoreSwipeTarget(child)).toBe(true);
        });
    });
});

