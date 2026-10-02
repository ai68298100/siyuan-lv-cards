import { describe, expect, it } from "vitest";
import { lintCard, lintAICards, LINT_LIMITS } from "../src/core/ai-lint";

describe("lintCard（AQ-16 预览 lint 离线子集）", () => {
    it("正常卡无提示", () => {
        expect(lintCard({ q: "什么是FSRS", a: "自适应间隔重复调度算法" }, new Set())).toEqual([]);
    });

    it("批内重复：与已出现卡 q+a 相同（忽略大小写/空白差异）", () => {
        const seen = new Set<string>();
        lintCard({ q: "What is FSRS", a: "An adaptive scheduler" }, seen);
        expect(lintCard({ q: "what is fsrs", a: "an adaptive  scheduler" }, seen)).toContain("duplicate");
    });

    it("过长：q 或 a 超 300 字符提示", () => {
        const long = "x".repeat(301);
        expect(lintCard({ q: long, a: "a" }, new Set())).toContain("overlong");
        expect(lintCard({ q: "q", a: long }, new Set())).toContain("overlong");
    });

    it("过短：问题不足 4 字符提示", () => {
        expect(lintCard({ q: "ab", a: "答案" }, new Set())).toContain("short-q");
        expect(lintCard({ q: "什么是光", a: "波粒二象性" }, new Set())).not.toContain("short-q");
    });
});

describe("lintAICards（批量按序扫描）", () => {
    it("重复以先前出现为准：第二张起标记", () => {
        const out = lintAICards([
            { q: "什么是间隔重复", a: "利用间隔效应安排复习的方法" },
            { q: "什么是间隔重复", a: "利用间隔效应安排复习的方法" },
            { q: "什么是间隔重复", a: "利用间隔效应安排复习的方法" },
        ]);
        expect(out[0]).toEqual([]);
        expect(out[1]).toContain("duplicate");
        expect(out[2]).toContain("duplicate");
    });

    it("阈值常量可查（防魔法数漂移）", () => {
        expect(LINT_LIMITS.overlong).toBe(300);
        expect(LINT_LIMITS.tooShort).toBe(4);
    });
});
