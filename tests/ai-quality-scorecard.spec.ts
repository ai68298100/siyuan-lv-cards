import { describe, expect, it } from "vitest";
import {
    SCORECARD_DIMENSIONS,
    DIMENSION_WEIGHTS,
    scoreCard,
    scoreBatch,
    type Scorecard,
} from "../src/core/ai-quality-scorecard";

// BU-13 质量评分卡：八维度独立打分+可解释 note+修复建议；综合分恒 advisory 不绕人工闸门
describe("ai-quality-scorecard（BU-13）", () => {
    it("八维度全部在册、每卡都有八维报告；权重表与扣分维度一致", () => {
        const s = scoreCard({ q: "线粒体的功能是什么？", a: "细胞的能量工厂" });
        expect(s.dimensions.map(d => d.key)).toEqual([...SCORECARD_DIMENSIONS]);
        expect(Object.keys(DIMENSION_WEIGHTS).length).toBe(SCORECARD_DIMENSIONS.length - 2); // difficulty/cognitive 不扣分
        expect(s.composite).toBe(100);
        expect(s.advisoryOnly).toBe(true);
    });

    it("答案泄漏：答案主体出现在题面 → 2 分+建议；干净卡 0 分", () => {
        const leak = scoreCard({ q: "细胞的能量工厂是什么的别称？", a: "线粒体" });
        // a=线粒体 不在题面 → 不泄漏；反向：
        const leak2 = scoreCard({ q: "线粒体是什么？", a: "线粒体是细胞的能量工厂" });
        expect(leak2.dimensions.find(d => d.key === "answer-leak")!.score).toBe(2);
        expect(leak2.dimensions.find(d => d.key === "answer-leak")!.suggestKey).toBe("aiScore.fix.answer-leak");
        expect(leak.dimensions.find(d => d.key === "answer-leak")!.score).toBe(0);
    });

    it("原子性：分号=2 分；「以及」=1 分；单一事实=0", () => {
        expect(scoreCard({ q: "TCP 的握手是什么；挥手又是什么", a: "三/四次" }).dimensions.find(d => d.key === "atomicity")!.score).toBe(2);
        expect(scoreCard({ q: "HTTP 以及 HTTPS 的区别", a: "加密" }).dimensions.find(d => d.key === "atomicity")!.score).toBe(1);
        expect(scoreCard({ q: "光速是多少", a: "每秒 30 万公里" }).dimensions.find(d => d.key === "atomicity")!.score).toBe(0);
    });

    it("重复：批量内同文第二张记 2 分；单卡无上下文不判", () => {
        const card = { q: "什么是 RSS？", a: "真正简单聚合" };
        const [a, b] = scoreBatch([card, { ...card }]);
        expect(a.dimensions.find(d => d.key === "duplicate")!.score).toBe(0);
        expect(b.dimensions.find(d => d.key === "duplicate")!.score).toBe(2);
        expect(scoreCard(card).dimensions.find(d => d.key === "duplicate")!.score).toBe(0);
    });

    it("来源覆盖：答案在来源中无依据 → 1 分提示；未提供 source=0 不判", () => {
        const withSrc = scoreCard({ q: "Q", a: "完全不在来源里的词组内容", source: "来源材料讲的是完全别的事情" });
        expect(withSrc.dimensions.find(d => d.key === "source-coverage")!.score).toBe(1);
        const noSrc = scoreCard({ q: "Q", a: "完全不在来源里的词组内容" });
        expect(noSrc.dimensions.find(d => d.key === "source-coverage")!.score).toBe(0);
    });

    it("歧义：代词开头 → 1 分提示", () => {
        expect(scoreCard({ q: "它的作用是什么", a: "供能" }).dimensions.find(d => d.key === "ambiguity")!.score).toBe(1);
        expect(scoreCard({ q: "线粒体的作用是什么", a: "供能" }).dimensions.find(d => d.key === "ambiguity")!.score).toBe(0);
    });

    it("认知层级：apply/understand/remember 三档判定；不扣综合分", () => {
        expect(scoreCard({ q: "用栈实现括号匹配", a: "…" }).dimensions.find(d => d.key === "cognitive")!.level).toBe("apply");
        expect(scoreCard({ q: "为什么天空是蓝色的", a: "…" }).dimensions.find(d => d.key === "cognitive")!.level).toBe("understand");
        expect(scoreCard({ q: "DNA 的全称是什么", a: "…" }).dimensions.find(d => d.key === "cognitive")!.level).toBe("remember");
        const s = scoreCard({ q: "为什么天空是蓝色的", a: "x".repeat(200) });
        expect(s.composite).toBe(100); // difficulty/cognitive 不扣分
    });

    it("综合分：加权扣分、下限 0；权重排序 leak>duplicate>atomicity=coverage>ambiguity>naturalness", () => {
        const dup = scoreBatch([
            { q: "重复卡", a: "答案" },
            { q: "重复卡", a: "答案" },
        ])[1];
        expect(dup.composite).toBe(100 - DIMENSION_WEIGHTS.duplicate * 2);
        const worst = scoreCard({ q: "它的作用；以及它是什么", a: "它的作用；以及它是什么（答案原文复述）" });
        expect(worst.composite).toBeLessThan(50);
        const floor: Scorecard = scoreCard({ q: "什么是；以及", a: "" });
        expect(floor.composite).toBeGreaterThanOrEqual(0);
    });

    it("问题维度都带 noteKey，修复建议都带 suggestKey（可解释性验收）", () => {
        const s = scoreBatch([
            { q: "它的作用；残留 ==高亮==", a: "答案很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长" },
            { q: "它的作用；残留 ==高亮==", a: "答案很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长" },
        ])[1];
        for (const d of s.dimensions) {
            if (d.score > 0 && d.key !== "difficulty" && d.key !== "cognitive") {
                expect(d.noteKey).toBeTruthy();
                expect(d.suggestKey).toBeTruthy();
            }
        }
    });
});
