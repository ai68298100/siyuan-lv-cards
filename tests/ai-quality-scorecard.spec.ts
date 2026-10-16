import { describe, expect, it } from "vitest";
import {
    SCORECARD_DIMENSIONS,
    DIMENSION_WEIGHTS,
    scoreCard,
    scoreBatch,
    extractAssertions,
    alignAssertionsWithSource,
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

    it("正确抽取原子断言并与来源材料进行滑动窗口对齐", () => {
        const answer = "TCP 经过三次握手建立连接。每次握手双方交换序列号；并且确认收发能力。";
        const assertions = extractAssertions(answer);
        expect(assertions).toHaveLength(3);
        expect(assertions[0]).toContain("TCP 经过三次握手建立连接");

        const source = "计算机网络传输层中，TCP 经过三次握手建立连接。在握手过程中，双方交换序列号并确认彼此的收发能力。";
        const report = alignAssertionsWithSource(assertions, source);

        expect(report.allSupported).toBe(false);
        expect(report.unsupportedCount).toBe(0);
        expect(report.assertions.some(a => a.status === "partial")).toBe(true);
        expect(report.assertions[0].status).toBe("supported");
        expect(report.assertions[0].matchedSourceExcerpt).toBeTruthy();

        // 当来源缺少部分断言时，标记为 unsupported
        const partialSource = "只包含第一句：TCP 经过三次握手建立连接。其他都没说。";
        const partialReport = alignAssertionsWithSource(assertions, partialSource);
        expect(partialReport.allSupported).toBe(false);
        expect(partialReport.unsupportedCount).toBeGreaterThan(0);
        expect(partialReport.assertions.some(a => a.status === "unsupported")).toBe(true);
    });

    it("scoreCard 集成断言分析并挂载 assertionReport", () => {
        const card = scoreCard({
            q: "什么是 TCP 握手？",
            a: "双方交换初始序列号，确认彼此收发能力。",
            source: "TCP 建立连接时，双方交换初始序列号，确认彼此收发能力。",
        });

        expect(card.assertionReport).toBeTruthy();
        expect(card.assertionReport!.allSupported).toBe(true);
        expect(card.dimensions.find(d => d.key === "source-coverage")!.score).toBe(0);

        const ungroundedCard = scoreCard({
            q: "什么是量子纠缠？",
            a: "这是一种科幻小说里的瞬间超时空通信技术，没有任何物理限制。",
            source: "物理学中的量子力学基本原理与测量理论。",
        });
        expect(ungroundedCard.assertionReport!.unsupportedCount).toBeGreaterThan(0);
        expect(ungroundedCard.dimensions.find(d => d.key === "source-coverage")!.score).toBeGreaterThan(0);
    });

    it("treats approximate wording and changed numeric facts as partial evidence rather than verified support", () => {
        const report = alignAssertionsWithSource(["此药每天服用100毫克"], "此药每天服用10毫克，具体剂量请核对说明书。");
        expect(report.allSupported).toBe(false);
        expect(report.assertions[0].status).toBe("partial");
        expect(report.assertions[0].matchedSourceExcerpt).toBeUndefined();
        expect(extractAssertions("3")).toEqual(["3"]);
        expect(alignAssertionsWithSource(["3"], "3 次握手").allSupported).toBe(true);
    });

    it("uses actual source excerpts after normalization and never combines unrelated sentences into support", () => {
        const exact = alignAssertionsWithSource(["tcp交换序列号"], "TCP 交换序列号。");
        expect(exact.assertions[0].matchedSourceExcerpt).toBe("TCP 交换序列号");
        const fragments = alignAssertionsWithSource(["北京是法国首都"], "北京是中国首都。法国首都是巴黎。");
        expect(fragments.assertions[0].status).not.toBe("supported");
        expect(fragments.allSupported).toBe(false);
    });
});
