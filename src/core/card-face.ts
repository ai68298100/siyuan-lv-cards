/**
 * AS-3 富内容卡面分析（纯逻辑，node 可单测）。
 * 卡面 HTML 由内核 getBlockDOM 渲染（公式 KaTeX/代码/表格原生可用）；本模块对卡面做
 * 富内容特征识别，供复习面板显示「渲染提示行」（公式/图片/嵌入/代码/表格/超长链接 +
 * 窄屏横向滚动提示）——提示只是告知特征，不改变渲染本身。
 * 降级口径：加载失败由调用方显示占位+重试（UI 态，不入本模块）；问题态遮挡沿用既有
 * CSS 掩码（lv-masked），并提供问题态 HTML 副本，避免读屏和复制时直接读到答案。
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

/**
 * Create a display-only question-side copy: marked answers remain the same
 * approximate width, while their text/media are absent from selection and the
 * accessibility tree. Keep the original HTML for answer reveal and scoring.
 */
export function maskMarkedAnswersForQuestion(html: string): string {
    if (typeof document === "undefined") return String(html ?? "");
    const template = document.createElement("template");
    template.innerHTML = String(html ?? "");
    for (const mark of Array.from(template.content.querySelectorAll(MARK_SELECTOR))) {
        const length = Math.max(1, Array.from(mark.textContent ?? "").length);
        mark.textContent = "\u00a0".repeat(length);
        mark.setAttribute("aria-hidden", "true");
    }
    return template.innerHTML;
}

export interface RenderedCardFace {
    /** 问题态 HTML（答案已安全遮蔽，公式/代码/排版正常解析，防读屏泄露） */
    questionHtml: string;
    /** 答案态 HTML（答案已高亮揭晓，与题干形成鲜明对照） */
    answerHtml: string;
    /** 卡面包含的富文本/公式/代码/图片等特征分析 */
    richness: FaceRichness;
    /** 提取出的所有答案文本片段集合 */
    extractedAnswers: string[];
}

function escapeHtml(text: string): string {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * 轻量级安全卡面 Markdown 解析器：
 * 转换公式、代码、粗斜体、图片和段落，与思源内核卡面渲染语义保持一致。
 */
export function formatMarkdownToSafeHtml(markdown: string): string {
    let text = String(markdown ?? "");
    if (!text.trim()) return "";

    // 一次扫描保护代码、图片和公式；先开始的结构拥有内部文本，避免图片属性二次转义
    // 或把代码示例里的 Markdown 图片变成真实图片。占位前缀避开原文，保留用户的字面标记。
    let tokenPrefix = "@@LV_CARD_TOKEN_";
    while (text.includes(tokenPrefix)) tokenPrefix += "_";
    const protectedHtml: string[] = [];
    text = text.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```|`([^`\n]+?)`|!\[([^\]]*)\]\(([^)\s]+)\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g,
        (_m, lang, blockCode, inlineCode, alt, url, blockMath, math) => {
            let html: string;
            if (blockCode !== undefined) {
                const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
                html = `<pre><code${cls}>${escapeHtml(blockCode.trim())}</code></pre>`;
            } else if (inlineCode !== undefined) {
                html = `<code>${escapeHtml(inlineCode)}</code>`;
            } else if (url !== undefined) {
                html = `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" class="lv-card-img" />`;
            } else if (blockMath !== undefined) {
                html = `<div class="language-math katex-display">${escapeHtml(blockMath.trim())}</div>`;
            } else {
                html = `<span class="language-math katex-inline">${escapeHtml(math.trim())}</span>`;
            }
            return `${tokenPrefix}${protectedHtml.push(html) - 1}@@`;
        });

    // 3. 转义普通文本中的 HTML 字符
    text = escapeHtml(text);

    // 5. 粗体与斜体
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // 6. 换行与段落
    text = text.replace(/\n{2,}/g, "</p><p>");
    text = text.replace(/\n/g, "<br/>");
    text = `<p>${text}</p>`;

    // 7. 单次还原，保护结构内的字面内容不再参与 Markdown 解析。
    text = text.replace(new RegExp(`${tokenPrefix}(\\d+)@@`, "g"), (_m, idx) => protectedHtml[Number(idx)] ?? "");

    // 清理可能产生的空段落
    return text.replace(/<p>\s*<\/p>/g, "");
}

/**
 * 统一卡面解析与双态遮蔽管线（Unified Card Face Pipeline）：
 * 支持从问答题（Q & A）或带 ==答案== 挖空的 Markdown 产出标准问题态与答案态 HTML。
 * 纯逻辑函数，在 Node/Vitest 和浏览器端均可秒级运行，完全无需依赖思源在线内核。
 */
export function renderUnifiedCardFace(input: {
    markdown?: string;
    question?: string;
    answer?: string;
    template?: "qa" | "cloze";
    /** 参考答案标题，用于国际化；缺省为 "参考答案" */
    answerLabel?: string;
}): RenderedCardFace {
    const template = input.template ?? (input.markdown ? "cloze" : "qa");
    let q = (input.question ?? "").trim();
    let a = (input.answer ?? "").trim();
    let md = (input.markdown ?? "").trim();

    // 如果未传 markdown 但传了 q 和 a
    if (!md && (q || a)) {
        if (template === "cloze" && q.includes("____")) {
            md = q.split("____").join(a ? `==${a}==` : "==答案==");
        } else if (template === "cloze" && a) {
            md = `${q} ==${a}==`;
        }
    }

    const extractedAnswers: string[] = [];
    // 单个等号属于答案内容（常见于公式/代码），只有连续两个等号才是挖空边界。
    const clozePattern = /(?<!=)==((?:[^=]|=(?!=))+)==(?!=)/g;
    const answerMatches = [...md.matchAll(clozePattern)];
    const hasCloze = answerMatches.length > 0;

    let questionHtml = "";
    let answerHtml = "";

    if (hasCloze) {
        // 提取所有被 == 包裹的挖空答案
        for (const m of answerMatches) {
            const val = m[1]?.trim();
            if (val) extractedAnswers.push(val);
        }

        // 问题态：将 ==答案== 替换为语义化的遮蔽占位符
        const qMd = md.replace(clozePattern, (_m, _ans) => {
            return `@@MASKED_SLOT@@`;
        });
        const formattedQ = formatMarkdownToSafeHtml(qMd);
        questionHtml = formattedQ.replace(
            /@@MASKED_SLOT@@/g,
            `<mark class="lv-masked" data-type="mark" aria-hidden="true" title="答案遮蔽"><span class="lv-mask-slot">［ 回忆这里 ］</span></mark>`
        );

        // 答案态：将 ==答案== 替换为高亮揭晓标记
        const aMd = md.replace(clozePattern, (_m, ans) => {
            return `@@REVEALED_START@@${ans}@@REVEALED_END@@`;
        });
        const formattedA = formatMarkdownToSafeHtml(aMd);
        answerHtml = formattedA
            .replace(/@@REVEALED_START@@/g, `<mark class="lv-revealed" data-type="mark"><span class="lv-revealed-text">`)
            .replace(/@@REVEALED_END@@/g, `</span></mark>`);
    } else {
        // 普通问答模式
        const displayQ = q || md;
        if (a) extractedAnswers.push(a);

        questionHtml = `<div class="lv-card-q-section">${formatMarkdownToSafeHtml(displayQ)}</div>`;
        if (a) {
            const label = input.answerLabel ?? "参考答案";
            answerHtml = [
                `<div class="lv-card-q-section">${formatMarkdownToSafeHtml(displayQ)}</div>`,
                `<div class="lv-card-answer-divider"></div>`,
                `<div class="lv-card-a-section">`,
                `  <div class="lv-eyebrow lv-card-a-label">${escapeHtml(label)}</div>`,
                `  <div class="lv-card-a-body">${formatMarkdownToSafeHtml(a)}</div>`,
                `</div>`,
            ].join("\n");
        } else {
            answerHtml = questionHtml;
        }
    }

    const richness = analyzeFaceRichness(answerHtml || questionHtml);
    return {
        questionHtml,
        answerHtml,
        richness,
        extractedAnswers,
    };
}
