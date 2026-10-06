import { describe, expect, it } from "vitest";
import { analyzeFaceRichness, hasRichContent, faceHintKeys, plainFace } from "../src/core/card-face";

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
