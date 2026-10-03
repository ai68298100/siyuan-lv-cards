import { describe, expect, it } from "vitest";
import { deriveHintLevels, nextHint } from "../src/core/hint-ladder";

// BJ-2 内容推导：从卡面纯文本自动生成分级提示（无需预标注）
describe("deriveHintLevels（BJ-2 内容推导）", () => {
    it("完整句：explanation 取第一句，keyword 取前 30%", () => {
        const r = deriveHintLevels("线粒体是有氧呼吸的主要场所，为细胞提供 ATP。线粒体拥有双层膜结构。");
        expect(r.explanation).toBe("线粒体是有氧呼吸的主要场所，为细胞提供 ATP。");
        expect(r.keyword.length).toBeGreaterThan(0);
        expect(r.keyword.length).toBeLessThan(r.explanation.length);
        expect(r.full).toContain("线粒体");
    });

    it("无终止标点：explanation 取全部文本", () => {
        const r = deriveHintLevels("线粒体是细胞的能量工厂");
        expect(r.explanation).toBe("线粒体是细胞的能量工厂");
    });

    it("粗体标记：keyword 优先取标记内容", () => {
        const html = "细胞的<strong>能量工厂</strong>是什么？线粒体负责 ATP 合成。";
        const r = deriveHintLevels(html);
        expect(r.keyword).toBe("能量工厂");
    });

    it("高亮标记：keyword 取 mark 内容", () => {
        const r = deriveHintLevels("<mark>FSRS</mark> 是调度算法。FSRS 表示 Free Spaced Repetition Scheduler。");
        expect(r.keyword).toBe("FSRS");
    });

    it("空文本：full 为空字符串", () => {
        const r = deriveHintLevels("");
        expect(r.full).toBe("");
    });

    it("推导结果可直接作为 nextHint 的输入", () => {
        const input = deriveHintLevels("光合作用分为光反应和暗反应两个阶段。光反应在类囊体薄膜上进行。");
        const h1 = nextHint(input, null);
        expect(h1).not.toBeNull();
        expect(h1!.text.length).toBeGreaterThan(0);
        const h2 = nextHint(input, h1!.level);
        expect(h2).not.toBeNull();
        expect(h2!.text).not.toBe(h1!.text); // 下一级文本不同
    });
});
