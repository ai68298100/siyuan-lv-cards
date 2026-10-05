/**
 * Anki M2：字段 HTML → 思源块友好文本清洗（docs/39 §3 M2）。
 * 纯模块：保守转换，宁多记损失不可静默篡改——
 *   块级标签换行、b/strong→粗体、i/em→斜体、img/[sound:]→媒体引用、
 *   Anki 完形 {{cN::答案::提示}} 剥壳（提示丢弃记损失）、LaTeX 定界符归一为 $/$$、
 *   实体解码、其余标签剥离、空白收敛。所有不可逆处记入 losses。
 */

export interface CleanResult {
    text: string;
    /** 引用到的媒体文件名（图片 src / [sound:] 目标） */
    mediaRefs: string[];
    /** 不可逆转换清单（损失报告素材） */
    losses: string[];
    /** 是否含完形填空语法 */
    cloze: boolean;
}

const ENTITIES: Record<string, string> = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
};

function decodeEntities(s: string): string {
    return s
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

/** 完形填空：{{cN::答案(:提示)?}} → 答案；提示丢弃记损失 */
function stripCloze(html: string, losses: string[]): { text: string; cloze: boolean } {
    let cloze = false;
    const text = html.replace(/\{\{c(\d+)::([^:{}]*?)(?::([^{}]*?))?\}\}/g, (_m, _n, answer, hint) => {
        cloze = true;
        if (hint) losses.push(`完形提示「${hint}」无法迁入普通问答，已丢弃`);
        return answer;
    });
    return { text, cloze };
}

export function cleanAnkiField(html: string): CleanResult {
    const losses: string[] = [];
    const mediaRefs: string[] = [];
    let s = String(html ?? "");

    // 1) 完形填空
    const clozeR = stripCloze(s, losses);
    s = clozeR.text;

    // 2) Anki 音频/媒体标记：[sound:xxx]
    s = s.replace(/\[sound:([^\]]+)\]/g, (_m, name) => {
        mediaRefs.push(String(name).trim());
        return `\n[音频: ${String(name).trim()}]\n`;
    });

    // 3) 图片：<img ... src="xxx" ...> → 媒体引用（src 引号单双都认）
    s = s.replace(/<img\b[^>]*?src\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi, (_m, _q, dq, sq) => {
        const name = String(dq ?? sq ?? "").trim();
        if (name) mediaRefs.push(name);
        return `\n[图片: ${name}]\n`;
    });

    // 4) LaTeX 定界符归一（思源公式语法）
    s = s.replace(/\\\((.+?)\\\)/gs, (_m, body) => `$${body}$`);
    s = s.replace(/\\\[(.+?)\\\]/gs, (_m, body) => `$$${body}$$`);

    // 5) 块级标签 → 换行
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/(div|p|li|tr|h[1-6]|table|ul|ol|blockquote)>/gi, "\n");
    s = s.replace(/<li\b[^>]*>/gi, "- ");

    // 6) 行内样式标签 → markdown 标记
    s = s.replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, (_m, _t, body) => `**${body}**`);
    s = s.replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, (_m, _t, body) => `*${body}*`);

    // 7) 其余标签剥离（style/script 整段丢弃并记损失）
    if (/<(style|script)\b/i.test(s)) {
        losses.push("内嵌 style/script 已丢弃");
        s = s.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, "");
    }
    const leftoverTags = s.match(/<[a-z!/][^>]*>/gi);
    if (leftoverTags?.length) {
        losses.push(`${leftoverTags.length} 个 HTML 标签被剥离（如 ${leftoverTags[0].slice(0, 30)}）`);
    }
    s = s.replace(/<[a-z!/][^>]*>/gi, "");

    // 8) 实体解码 + 空白收敛
    s = decodeEntities(s);
    s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    return { text: s, mediaRefs, losses, cloze: clozeR.cloze };
}
