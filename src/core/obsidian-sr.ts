/**
 * Obsidian Spaced Repetition Markdown 互通（AQ-11）：
 * 解析与导出上游 obsidian-spaced-repetition 的语法（`::` / `:::` / `?` / `??` /
 * `==挖空==` / `#flashcards/...` tag deck），供标记制卡扫描与后续导入导出复用。
 * 边界（诚实口径）：思源内核 riff 卡为「一块一卡」单向卡，`:::` 双向语法解析后按
 * 正向制卡（方向信息保留在类型上，fixture 记录该边界）；媒体 `![[...]]` 原样透传；
 * 复习与调度仍走内核队列，本模块不做任何调度。
 */

export type SrCardKind = "qa" | "qa-reversed" | "cloze";

export interface SrParsedCard {
    kind: SrCardKind;
    front: string;
    /** qa/qa-reversed = 答案；cloze = ""（整块即卡面，内核渲染 ==挖空==） */
    back: string;
    /** `#flashcards/sub/deck` 的子路径（"sub/deck"）；裸 `#flashcards` 或无 tag 为 "" */
    deckHint: string;
}

export interface SrParseOptions {
    /** 识别为闪卡 deck 的根 tag，默认 "#flashcards"（与上游默认一致） */
    deckTag?: string;
}

const DEFAULT_DECK_TAG = "#flashcards";

function extractDeckHint(text: string, deckTag: string): string {
    const m = text.match(new RegExp(`${deckTag}(?:/([^\\s#]+(?:/[^\\s#]+)*))?`));
    return m && m[1] ? m[1] : "";
}

/** 剥掉 Obsidian 高亮/加粗/斜体/行内代码标记（制卡展示用；挖空标记保留在 cloze 原文里） */
export function stripSrMarkers(text: string): string {
    return text.replace(/==([^=]+)==/g, "$1").replace(/[*`]/g, "").trim();
}

/** 含非空 ==挖空== 的块视为 cloze 卡（与上游一致； ours：makeClozeCard 同语法） */
export function hasSrCloze(text: string): boolean {
    return /==[^=\s][^=]*==/.test(text);
}

/** 单行 `question :: answer` / `question ::: answer`；不匹配或歧义返回 null */
export function parseSrLine(line: string, opts: SrParseOptions = {}): SrParsedCard | null {
    const deckTag = opts.deckTag ?? DEFAULT_DECK_TAG;
    const trimmed = line.trim();
    if (!trimmed) {
        return null;
    }
    // ::: 必须先于 :: 判定（::: 包含 ::）
    const idx3 = trimmed.indexOf(":::");
    if (idx3 > 0 && trimmed.indexOf(":::", idx3 + 3) < 0) {
        const front = trimmed.slice(0, idx3).trim();
        const back = trimmed.slice(idx3 + 3).trim();
        if (front && back) {
            return { kind: "qa-reversed", front, back, deckHint: extractDeckHint(trimmed, deckTag) };
        }
        return null;
    }
    const idx2 = trimmed.indexOf("::");
    if (idx2 > 0 && trimmed.indexOf("::", idx2 + 2) < 0) {
        const front = trimmed.slice(0, idx2).trim();
        const back = trimmed.slice(idx2 + 2).trim();
        if (front && back) {
            return { kind: "qa", front, back, deckHint: extractDeckHint(trimmed, deckTag) };
        }
    }
    return null;
}

/** 多行块：question 行… + 单独一行 `?`（单向）或 `??`（双向）+ answer 行… */
export function parseSrMultiline(lines: string[], opts: SrParseOptions = {}): SrParsedCard | null {
    const deckTag = opts.deckTag ?? DEFAULT_DECK_TAG;
    const sep = lines.findIndex(l => l.trim() === "?" || l.trim() === "??");
    if (sep <= 0 || sep >= lines.length - 1) {
        return null;
    }
    const front = lines.slice(0, sep).join("\n").trim();
    const back = lines.slice(sep + 1).join("\n").trim();
    if (!front || !back) {
        return null;
    }
    const reversed = lines[sep].trim() === "??";
    const deckHint = extractDeckHint(lines.join("\n"), deckTag);
    return { kind: reversed ? "qa-reversed" : "qa", front, back, deckHint };
}

/** 一段 markdown → 卡片数组：逐行找 `::`/`:::`，其余按整块尝试 `?`/`??` 多行与 cloze */
export function parseSrMarkdown(md: string, opts: SrParseOptions = {}): SrParsedCard[] {
    const out: SrParsedCard[] = [];
    const lines = md.split(/\r?\n/);
    const deckTag = opts.deckTag ?? DEFAULT_DECK_TAG;
    for (const line of lines) {
        const single = parseSrLine(line, opts);
        if (single) {
            out.push(single);
        }
    }
    if (out.length === 0) {
        const multi = parseSrMultiline(lines, opts);
        if (multi) {
            out.push(multi);
        }
    }
    if (out.length === 0 && hasSrCloze(md)) {
        out.push({ kind: "cloze", front: md.trim(), back: "", deckHint: extractDeckHint(md, deckTag) });
    }
    return out;
}

/** 导出为 Obsidian SR 兼容单行（reversed=true 用 `:::`） */
export function toSrLine(front: string, back: string, reversed = false): string {
    const f = front.replace(/\s*\n+\s*/g, " ").trim();
    const b = back.replace(/\s*\n+\s*/g, " ").trim();
    if (!f || !b) {
        throw new Error("sr export needs non-empty front and back");
    }
    return `${f} ${reversed ? ":::" : "::"} ${b}`;
}

/** 导出多行形式（front/back 保留换行；reversed=true 用 `??`） */
export function toSrMultiline(front: string, back: string, reversed = false): string {
    if (!front.trim() || !back.trim()) {
        throw new Error("sr export needs non-empty front and back");
    }
    return `${front.trim()}\n${reversed ? "??" : "?"}\n${back.trim()}`;
}
