import { describe, expect, it } from "vitest";
import {
    buildCardFaceFallback,
    stripAnswersForQuestionSafety,
    detectFallbackReasonFromError,
} from "../src/core/card-face-fallback";

describe("card-face-fallback (AS-3 富内容卡面降级与防白屏容错引擎)", () => {
    it("问题态答案强力剥离防泄露：无论是 Markdown ==挖空== 还是内核 span[data-type='mark']，均彻底替换为占位符", () => {
        const rawWithMd = "请问光速在真空中是多少？答案是 ==299792458 m/s==。";
        const safeMd = stripAnswersForQuestionSafety(rawWithMd);
        expect(safeMd).not.toContain("299792458");
        expect(safeMd).toContain("[……]");
        expect(safeMd).toContain("请问光速在真空中是多少？");

        const rawWithKernelHtml = '光合作用产生 <span data-type="mark">氧气和葡萄糖</span>，消耗二氧化碳。';
        const safeHtml = stripAnswersForQuestionSafety(rawWithKernelHtml);
        expect(safeHtml).not.toContain("氧气和葡萄糖");
        expect(safeHtml).toContain("[……]");
        expect(safeHtml).toContain("光合作用产生");
    });

    it("构建 LaTeX 数学公式错误降级：绑定报告问题与打开来源动作", () => {
        const fallback = buildCardFaceFallback({
            reason: "formula-error",
            stage: "question",
            rawContent: "解方程：$$\\int_{0}^{\\infty} x^2 dx$$，答案是 ==发散极限不存在==。",
            sourceBlockId: "block-math-1",
        });

        expect(fallback.reason).toBe("formula-error");
        expect(fallback.titleKey).toBe("cardFaceFallback.formula.title");
        expect(fallback.stage).toBe("question");
        expect(fallback.safeExcerpt).not.toContain("发散极限不存在"); // 答案已剥离
        expect(fallback.safeExcerpt).toContain("[……]");
        expect(fallback.actions).toContain("report-issue");
        expect(fallback.actions).toContain("open-source");
        expect(fallback.actions).toContain("skip-card");
    });

    it("构建超宽表格降级：声明横向滚动无障碍提示键与操作动作", () => {
        const fallback = buildCardFaceFallback({
            reason: "overflow-table",
            stage: "answer",
            rawContent: "<table><thead><tr><th>非常宽的列1</th><th>列2</th></tr></thead></table>",
            sourceBlockId: "block-table-1",
        });

        expect(fallback.reason).toBe("overflow-table");
        expect(fallback.titleKey).toBe("cardFaceFallback.table.title");
        expect(fallback.scrollAriaHintKey).toBe("cardFaceFallback.scroll.table");
        expect(fallback.safeExcerpt).toContain("非常宽的列1");
        expect(fallback.actions).toContain("open-source");
    });

    it("构建缺失媒体降级：置顶重试加载动作", () => {
        const fallback = buildCardFaceFallback({
            reason: "missing-media",
            stage: "question",
            rawContent: "查看这张心脏结构图：<img src='assets/heart.png'/>，识别 ==左心室==",
            sourceBlockId: "block-media-1",
        });

        expect(fallback.reason).toBe("missing-media");
        expect(fallback.actions[0]).toBe("retry-load");
        expect(fallback.safeExcerpt).not.toContain("左心室");
    });

    it("异常诊断器 detectFallbackReasonFromError：自动推断公式错误、媒体404与超时", () => {
        expect(detectFallbackReasonFromError(new Error("KaTeX parse error: Expected 'EOF'"))).toBe("formula-error");
        expect(detectFallbackReasonFromError(new Error("Failed to load resource: 404 image not found"))).toBe("missing-media");
        expect(detectFallbackReasonFromError(new Error("NodeBlockQueryEmbed render failed"))).toBe("broken-embed");
        expect(detectFallbackReasonFromError(new Error("load block timed out"))).toBe("load-failure");
        expect(detectFallbackReasonFromError(new Error("layout overflow"), "|---|---|---|")).toBe("overflow-table");
        expect(detectFallbackReasonFromError(new Error("unknown exception"))).toBe("generic-render-error");
    });
});
