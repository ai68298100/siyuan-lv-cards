import { describe, expect, it } from "vitest";
import {
    analyzeFaceRichness,
    hasRichContent,
    faceHintKeys,
    plainFace,
    maskMarkedAnswersForQuestion,
    formatMarkdownToSafeHtml,
    renderUnifiedCardFace,
} from "../src/core/card-face";

// AS-3 富内容卡面分析：六特征识别 + 提示键派生；纯文本全 false
describe("card-face（AS-3 富内容分析）", () => {
    it("空串/纯文本卡面全 false（提示行不显示）", () => {
        expect(analyzeFaceRichness("")).toEqual(plainFace());
        const plain = analyzeFaceRichness("<div>线粒体是细胞的能量工厂</div>");
        expect(hasRichContent(plain)).toBe(false);
        expect(faceHintKeys(plain)).toEqual([]);
    });

    it("六特征各自识别（内核 DOM 产物口径）", () => {
        const html = [
            '<span class="katex">E=mc²</span>',                       // 公式
            '<img src="assets/fig.png" alt="图"/>',                    // 图片
            '<div data-type="NodeBlockQueryEmbed">嵌入</div>',         // 嵌入块
            "<pre><code>const x = 1;</code></pre>",                    // 代码
            "<table><tr><td>1</td></tr></table>",                      // 表格
            '<a href="https://example.com/' + "x".repeat(120) + '">长链</a>', // 超长链接
        ].join("");
        const r = analyzeFaceRichness(html);
        expect(r).toEqual({ formula: true, image: true, embed: true, code: true, table: true, longLink: true });
        expect(hasRichContent(r)).toBe(true);
    });

    it("普通短链接不触发 longLink；MathJax/language-math 亦识别为公式", () => {
        const r = analyzeFaceRichness('<a href="https://example.com/page">短链</a>');
        expect(r.longLink).toBe(false);
        expect(analyzeFaceRichness('<span class="MathJax">x</span>').formula).toBe(true);
        expect(analyzeFaceRichness('<span class="language-math">x</span>').formula).toBe(true);
    });

    it("提示键有序且与特征一一对应", () => {
        const r = analyzeFaceRichness("<table></table><img src='x'/>");
        expect(faceHintKeys(r)).toEqual(["aiFace.hint.image", "aiFace.hint.table"]);
    });
});

describe("问题态答案副本", () => {
    it("清空挖空文本与富内容并从读屏树隐藏，保留近似空白长度", () => {
        const holder = document.createElement("div");
        holder.innerHTML = maskMarkedAnswersForQuestion('<p>线粒体的功能是 <span data-type="mark"><b>产生 ATP</b><img alt="答案图" src="x.png" /></span></p>');
        const mark = holder.querySelector("span[data-type='mark']")!;
        expect(mark.textContent).toBe("\u00a0".repeat(6));
        expect(mark.getAttribute("aria-hidden")).toBe("true");
        expect(mark.querySelector("img")).toBeNull();
        expect(holder.textContent).not.toContain("产生 ATP");
    });
});

describe("统一卡面渲染管线（renderUnifiedCardFace & formatMarkdownToSafeHtml）", () => {
    it("安全转义 HTML 特殊字符，防止 XSS 注入", () => {
        const raw = '<script>alert("xss")</script> **加粗**';
        const html = formatMarkdownToSafeHtml(raw);
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
        expect(html).toContain("<strong>加粗</strong>");
    });

    it("正确渲染行内代码、代码块与 LaTeX 公式", () => {
        const md = "计算 $E=mc^2$，代码为 `let x = 1;`\n\n```ts\nconst y = 2;\n```";
        const html = formatMarkdownToSafeHtml(md);
        expect(html).toContain('<span class="language-math katex-inline">E=mc^2</span>');
        expect(html).toContain("<code>let x = 1;</code>");
        expect(html).toContain('<pre><code class="language-ts">const y = 2;</code></pre>');
    });

    it("正确处理多挖空卡片的问题态遮蔽与答案态揭晓", () => {
        const card = renderUnifiedCardFace({
            markdown: "HTTP 是 ==无状态== 协议，默认端口是 ==80==。",
        });

        expect(card.extractedAnswers).toEqual(["无状态", "80"]);
        expect(card.questionHtml).toContain('class="lv-masked"');
        expect(card.questionHtml).toContain('data-type="mark"');
        expect(card.questionHtml).toContain('aria-hidden="true"');
        expect(card.questionHtml).toContain("［ 回忆这里 ］");
        expect(card.questionHtml).not.toContain("无状态");
        expect(card.questionHtml).not.toContain("80");

        expect(card.answerHtml).toContain('class="lv-revealed"');
        expect(card.answerHtml).toContain("无状态");
        expect(card.answerHtml).toContain("80");
        expect(card.richness.formula).toBe(false);
    });

    it("正确处理普通问答题的题干与参考答案分区", () => {
        const card = renderUnifiedCardFace({
            question: "什么是 TCP 三次握手？",
            answer: "双方交换初始序列号，确认彼此收发能力。",
            template: "qa",
        });

        expect(card.extractedAnswers).toEqual(["双方交换初始序列号，确认彼此收发能力。"]);
        expect(card.questionHtml).toContain("什么是 TCP 三次握手？");
        expect(card.questionHtml).not.toContain("参考答案");

        expect(card.answerHtml).toContain("什么是 TCP 三次握手？");
        expect(card.answerHtml).toContain("参考答案");
        expect(card.answerHtml).toContain("双方交换初始序列号，确认彼此收发能力。");

        // 支持自定义多语言标签
        const cardEn = renderUnifiedCardFace({
            question: "What is latency?",
            answer: "Time taken for data to travel.",
            template: "qa",
            answerLabel: "Reference Answer",
        });
        expect(cardEn.answerHtml).toContain("Reference Answer");
        expect(cardEn.answerHtml).not.toContain("参考答案");
    });

    it("支持下划线挖空输入自动转为标准挖空卡面", () => {
        const card = renderUnifiedCardFace({
            question: "机会成本是选择一种方案时，放弃的____的价值。",
            answer: "最佳替代方案",
            template: "cloze",
        });

        expect(card.extractedAnswers).toEqual(["最佳替代方案"]);
        expect(card.questionHtml).toContain("［ 回忆这里 ］");
        expect(card.questionHtml).not.toContain("最佳替代方案");
        expect(card.answerHtml).toContain("最佳替代方案");
        expect(card.answerHtml).toContain('class="lv-revealed"');
    });

    it("正确识别图片并绑定特征分析", () => {
        const card = renderUnifiedCardFace({
            markdown: "![网络拓扑](https://example.com/net.png) ==环形拓扑==",
        });

        expect(card.richness.image).toBe(true);
        expect(card.questionHtml).toContain('<img src="https://example.com/net.png"');
        expect(card.answerHtml).toContain('<img src="https://example.com/net.png"');
        expect(card.answerHtml).toContain("环形拓扑");
    });

    it("preserves image URLs and literal alt text while escaping markup once", () => {
        const holder = document.createElement("div");
        holder.innerHTML = formatMarkdownToSafeHtml('![**示意图** & "引用"](assets/diagram.png?width=320&height=180)');
        const image = holder.querySelector("img")!;
        expect(image.getAttribute("src")).toBe("assets/diagram.png?width=320&height=180");
        expect(image.getAttribute("alt")).toBe('**示意图** & "引用"');
        expect(holder.querySelector("strong")).toBeNull();
    });

    it("conceals cloze answers containing mathematical equals signs", () => {
        const card = renderUnifiedCardFace({ markdown: "求解 ==$x=1$==。" });
        expect(card.extractedAnswers).toEqual(["$x=1$"]);
        expect(card.questionHtml).not.toContain("x=1");
        expect(card.questionHtml).toContain("lv-masked");
        expect(card.answerHtml).toContain("x=1");
    });

    it("keeps Markdown examples inside code and token-like source text literal", () => {
        const holder = document.createElement("div");
        holder.innerHTML = formatMarkdownToSafeHtml('`![example](assets/code.png)` @@CODE_INLINE_0@@ @@LV_CARD_TOKEN_0@@');
        expect(holder.querySelector("img")).toBeNull();
        expect(holder.querySelector("code")?.textContent).toBe("![example](assets/code.png)");
        expect(holder.textContent).toContain("@@CODE_INLINE_0@@ @@LV_CARD_TOKEN_0@@");
    });
});
