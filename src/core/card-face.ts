/**
 * AS-3 富内容卡面分析（纯逻辑，node 可单测）。
 * 卡面 HTML 由内核 getBlockDOM 渲染（公式 KaTeX/代码/表格原生可用）；本模块对卡面做
 * 富内容特征识别，供复习面板显示「渲染提示行」（公式/图片/嵌入/代码/表格/超长链接 +
 * 窄屏横向滚动提示）——提示只是告知特征，不改变渲染本身。
 * 降级口径：加载失败由调用方显示占位+重试（UI 态，不入本模块）；问题态遮挡沿用既有
 * CSS 掩码（lv-masked），本模块不参与答案隐藏。
 */

export interface FaceRichness {
    /** 公式（KaTeX/MathJax 渲染产物） */
    formula: boolean;
    image: boolean;
    /** 嵌入块/iframe */
    embed: boolean;
    code: boolean;
    table: boolean;
    /** 超长链接（≥100 字符，窄屏必横向溢出） */
    longLink: boolean;
}

const RICHNESS_RULES: { key: keyof FaceRichness; pattern: RegExp }[] = [
    { key: "formula", pattern: /class="katex"|class="MathJax"|language-math/i },
    { key: "image", pattern: /<img\b/i },
    { key: "embed", pattern: /NodeBlockQueryEmbed|<iframe\b/i },
    { key: "code", pattern: /<pre\b|<code\b/i },
    { key: "table", pattern: /<table\b/i },
    { key: "longLink", pattern: /https?:\/\/[^\s<>"]{100,}/i },
];

/** 全 false 基值 */
export function plainFace(): FaceRichness {
    return { formula: false, image: false, embed: false, code: false, table: false, longLink: false };
}

/** 富内容特征识别（空串/纯文本=全 false） */
export function analyzeFaceRichness(html: string): FaceRichness {
    const src = html ?? "";
    const out = plainFace();
    for (const { key, pattern } of RICHNESS_RULES) {
        out[key] = pattern.test(src);
    }
    return out;
}

/** 是否含任一富内容特征（提示行显示开关） */
export function hasRichContent(r: FaceRichness): boolean {
    return r.formula || r.image || r.embed || r.code || r.table || r.longLink;
}

/** 提示行条目（有序 i18n 键，aiFace.hint.<key>；稳定顺序便于读屏） */
export function faceHintKeys(r: FaceRichness): string[] {
    return RICHNESS_RULES.filter(({ key }) => r[key]).map(({ key }) => `aiFace.hint.${key}`);
}

/** 挖空（高亮）段选择器：内核 getBlockDOM 把 ==text== 渲染为 span[data-type=mark]（3.8.x 实测），
 * HTML 导出/其他来源可能是 <mark>；两态都要覆盖，否则问题态遮罩失效、答案明文泄露 */
export const MARK_SELECTOR = "mark, span[data-type='mark']";

/** 提取卡面挖空文本合集（去空白），供打字判分/干扰项采样/配对游戏 */
export function extractMarkTexts(holder: HTMLElement): string[] {
    return Array.from(holder.querySelectorAll(MARK_SELECTOR))
        .map(m => (m.textContent ?? "").trim())
        .filter(Boolean);
}
