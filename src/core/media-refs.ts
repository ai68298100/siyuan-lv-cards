/**
 * 从卡片 Markdown/HTML 中提取媒体引用。
 *
 * 这个模块只做语法解析和引用归一化，不检查文件是否存在，也不调用思源
 * API。调用方可以将 `refs` 交给来源健康/维护扫描，再按宿主的媒体存储规则
 * 判断引用是否失效。
 */

export const MEDIA_REF_KINDS = ["image", "audio"] as const;
export type MediaRefKind = (typeof MEDIA_REF_KINDS)[number];

export const MEDIA_REF_SYNTAXES = ["markdown", "html", "anki"] as const;
export type MediaRefSyntax = (typeof MEDIA_REF_SYNTAXES)[number];

/** 一个已经过滤掉外链并完成路径归一化的媒体引用。 */
export interface MediaRef {
    /** 图片或音频。Anki [sound:] 固定为 audio。 */
    kind: MediaRefKind;
    /** 引用来源语法。 */
    syntax: MediaRefSyntax;
    /** 原始引用值（不含 Markdown 的括号/HTML 引号/Anki 标记）。 */
    raw: string;
    /** 可用于文件存在性检查的规范化键。 */
    normalized: string;
    /** 在输入文本中的 UTF-16 起始偏移；无法精确定位时为 -1。 */
    index: number;
}

export interface IgnoredMediaRef {
    kind: MediaRefKind;
    syntax: MediaRefSyntax;
    raw: string;
    reason: "external" | "empty";
    index: number;
}

export interface MediaRefsResult {
    /** 按首次出现顺序去重后的本地媒体引用。 */
    refs: MediaRef[];
    /** 被过滤的外链或空引用，供维护诊断解释为什么没有进入 refs。 */
    ignored: IgnoredMediaRef[];
    /** refs 的规范化键快捷列表。 */
    mediaRefs: string[];
}

interface Candidate {
    kind: MediaRefKind;
    syntax: MediaRefSyntax;
    raw: string;
    index: number;
}

const HTML_ENTITY_MAP: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
};

function decodeBasicEntities(value: string): string {
    return value
        .replace(/&#(\d+);/g, (_match, code: string) => {
            const n = Number(code);
            return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : _match;
        })
        .replace(/&(?:amp|lt|gt|quot|#39|apos);/gi, match => HTML_ENTITY_MAP[match.toLowerCase()] ?? match);
}

/**
 * 将本地引用转为稳定的比较键。
 *
 * 只移除不会改变文件身份的装饰（空白、`./`、渲染查询串/片段、反斜杠）；
 * 思源加密笔记本使用的 `?box=<notebookID>` 查询会被保留，作为资源身份的一部分。
 * 不做 URL 解码或 `..` 折叠，避免把宿主中的合法文件名误改成另一个键。
 */
export function normalizeMediaRef(value: string): string | null {
    let ref = decodeBasicEntities(String(value ?? "")).trim();
    if (!ref) return null;
    // Markdown 的 <url> 形式在进入这里前通常已经剥壳，仍兼容直接调用。
    if (ref.startsWith("<") && ref.endsWith(">")) ref = ref.slice(1, -1).trim();
    if (!ref) return null;

    // 外链不进入媒体事实扫描：它们不受笔记库文件生命周期管理。
    if (isExternalMediaRef(ref)) return null;

    // Markdown 图片可带 query/hash；渲染参数不是媒体文件名，但思源的
    // `?box=<notebookID>` 决定资源所属笔记本，不能被静默丢掉。
    let box = "";
    const queryIndex = ref.indexOf("?");
    if (queryIndex >= 0) {
        const query = ref.slice(queryIndex + 1).split("#", 1)[0];
        try { box = new URLSearchParams(query).get("box")?.trim() ?? ""; } catch { box = ""; }
        ref = ref.slice(0, queryIndex);
    }
    ref = ref.replace(/#.*$/, "");
    ref = ref.replace(/\\/g, "/").replace(/^\.\//, "");
    ref = ref.replace(/\/{2,}/g, "/");
    ref = ref.trim();
    if (!ref) return null;
    return box ? `${ref}?box=${encodeURIComponent(box)}` : ref;
}

function looksExternal(value: string): boolean {
    const ref = decodeBasicEntities(value).trim();
    return isExternalMediaRef(ref);
}

function isExternalMediaRef(ref: string): boolean {
    // 协议相对 URL（//cdn/...）和 URI scheme 都不受笔记库文件生命周期管理。
    // Windows 盘符（C:/...）是本地路径例外，保留为可诊断的引用。
    const windowsDrive = /^[a-z]:[\\/]/i.test(ref);
    return /^\/\//.test(ref) || (!windowsDrive && /^[a-z][a-z0-9+.-]*:/i.test(ref));
}

function pushCandidate(out: Candidate[], kind: MediaRefKind, syntax: MediaRefSyntax, raw: string, index: number): void {
    out.push({ kind, syntax, raw, index });
}

function findCandidates(input: string): Candidate[] {
    const out: Candidate[] = [];

    // Markdown 图片：支持 ![alt](url "title") 及 ![alt](<url with spaces>)。
    // 仅抓图片，避免把普通链接当成媒体。
    const markdown = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
    for (const match of input.matchAll(markdown)) {
        const raw = (match[1] ?? match[2] ?? "").trim();
        const rawStart = (match.index ?? 0) + match[0].indexOf(raw);
        pushCandidate(out, "image", "markdown", raw, rawStart);
    }

    // HTML img/audio 的 src 属性。属性顺序任意，单双引号和无引号均可。
    const tags = /<(img|audio)\b[^>]*>/gi;
    // 要求 src 是独立属性，避免把 data-src / x-src 误当作媒体引用。
    const src = /(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
    for (const match of input.matchAll(tags)) {
        const tag = match[0];
        const srcMatch = tag.match(src);
        if (!srcMatch) continue;
        const raw = (srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? "").trim();
        const rawOffset = srcMatch[1] !== undefined
            ? tag.indexOf(`"${srcMatch[1]}"`) + 1
            : srcMatch[2] !== undefined
                ? tag.indexOf(`'${srcMatch[2]}'`) + 1
                : tag.indexOf(srcMatch[3] ?? "");
        pushCandidate(out, match[1].toLowerCase() === "audio" ? "audio" : "image", "html", raw, (match.index ?? 0) + Math.max(0, rawOffset));
    }

    // Anki 音频标记；文件名可包含空格，直到右方括号为止。
    const anki = /\[sound\s*:\s*([^\]]+)\]/gi;
    for (const match of input.matchAll(anki)) {
        const raw = (match[1] ?? "").trim();
        const rawStart = (match.index ?? 0) + match[0].indexOf(match[1] ?? "");
        pushCandidate(out, "audio", "anki", raw, rawStart);
    }

    return out.sort((a, b) => a.index - b.index);
}

function inspectMediaRefs(input: string): MediaRefsResult {
    const source = String(input ?? "");
    const refs: MediaRef[] = [];
    const ignored: IgnoredMediaRef[] = [];
    const seen = new Set<string>();

    for (const candidate of findCandidates(source)) {
        const raw = decodeBasicEntities(candidate.raw).trim();
        const normalized = normalizeMediaRef(raw);
        if (!normalized) {
            ignored.push({
                kind: candidate.kind,
                syntax: candidate.syntax,
                raw,
                reason: !raw ? "empty" : looksExternal(raw) ? "external" : "empty",
                index: candidate.index,
            });
            continue;
        }
        // 同一文件被多次引用时只保留一个事实键；图片和音频共用文件键。
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        refs.push({ ...candidate, raw, normalized });
    }

    return { refs, ignored, mediaRefs: refs.map(ref => ref.normalized) };
}

/** 返回引用及被忽略引用的完整诊断结果。 */
export function parseMediaRefs(input: string): MediaRefsResult {
    return inspectMediaRefs(input);
}

/** 只取去重后的本地媒体引用对象，适合维护扫描直接消费。 */
export function extractMediaRefs(input: string): MediaRef[] {
    return inspectMediaRefs(input).refs;
}

/** `extractMediaRefs` 的语义别名，便于调用方按 collect 命名。 */
export const collectMediaRefs = extractMediaRefs;
