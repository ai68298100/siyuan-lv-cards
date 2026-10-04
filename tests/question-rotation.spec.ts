import { describe, expect, it } from "vitest";
import { nominateVariant, ROTATION_CYCLE } from "../src/core/question-rotation";

// 混合题型轮换：仅在已启用题型间轮换；单一启用恒翻面；展示层不动调度
describe("question-rotation（混合题型轮换）", () => {
    it("周期固定 flip→choice→typing", () => {
        expect([...ROTATION_CYCLE]).toEqual(["flip", "choice", "typing"]);
    });

    it("三题型全启用：按 turn 循环", () => {
        const e = { typing: true, choice: true };
        expect(nominateVariant(0, e)).toBe("flip");
        expect(nominateVariant(1, e)).toBe("choice");
        expect(nominateVariant(2, e)).toBe("typing");
        expect(nominateVariant(3, e)).toBe("flip");
    });

    it("只启用部分：未启用题型被跳过（连续出现已启用形态）", () => {
        const e = { typing: false, choice: true };
        expect(nominateVariant(0, e)).toBe("flip");
        expect(nominateVariant(1, e)).toBe("choice");
        expect(nominateVariant(2, e)).toBe("flip"); // typing 跳过
        // 只启用 typing：flip/typing 交替
        const e2 = { typing: true, choice: false };
        expect(nominateVariant(0, e2)).toBe("flip");
        expect(nominateVariant(1, e2)).toBe("typing");
    });

    it("单一/零启用：恒翻面（无多样性不假装轮换）", () => {
        expect(nominateVariant(1, { typing: false, choice: false })).toBe("flip");
        expect(nominateVariant(3, { typing: true, choice: false })).toBe("typing"); // 两种=轮换成立
        const odd = nominateVariant(-5, { typing: true, choice: true });
        expect(["flip", "choice", "typing"]).toContain(odd); // 异常输入归一不抛
    });
});
