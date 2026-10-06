/**
 * Obsidian Spaced Repetition 笔记导入编排（纯逻辑，node 可单测；复用 obsidian-sr 解析器）。
 * 相比 parseSrMarkdown 的文件级解析，本模块按空行分段逐块识别（多行 ?/?? 块、单行 ::/::: 卡、
 * ==挖空== 块可混排于一文件），并产出可直接落库的导入计划：
 * - qa/qa-reversed → 单行问答「front ==back==」（riff 口径；**双向卡按正向导入，方向信息 v1 丢失**——reversed 计数诚实保留）
 * - cloze → 原挖空块原样（思源同语法渲染）
 * - 文件内指纹去重（norm(front)|norm(back)|kind）；无跨运行台账（Obsidian 无稳定 ID，诚实边界）
 * 落块对位约定：compose 后每卡恰一空行分段（顶部 # 转义防变标题），调用方按文档序对位、
 * 数量不符必须中止（防错位）。
 */

import { parseSrLine, parseSrMultiline, hasSrCloze, type SrParsedCard, type SrParseOptions } from "./obsidian-sr";

export interface ObsidianImportCard {
    kind: "qa" | "cloze";
    /** 可直接作为独立段落的 markdown（qa=front==back==；cloze=原挖空块；行首 # 已转义） */
    markdown: string;
    deckHint: string;
    fingerprint: string;
}

export interface ObsidianImportPlan {
    /** 去重后待导入（文档序） */
    cards: ObsidianImportCard[];
    /** 解析总数（去重前） */
    totalParsed: number;
    /** 文件内重复跳过数 */
    duplicates: number;
    /** 双向卡按正向导入的数量（诚实计数） */
    reversed: number;
    /** #flashcards 子路径分布（v1 全部落同一目标卡组，仅预览展示） */
    byDeckHint: Record<string, number>;
}

const norm = (s: string): string => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

function extractDeckHint(text: string, deckTag: string): string {
    const m = text.match(new RegExp(`${deckTag}(?:/([^\\s#]+(?:/[^\\s#]+)*))?`));
    return m && m[1] ? m[1] : "";
}

/** 块级解析：空行分段 → 多行 ?/?? 块优先，其次逐行 ::/:::，最后 ==挖空== 整块（front/back 已剥 deck tag） */
export function parseSrFileBlocks(md: string, opts: SrParseOptions = {}): SrParsedCard[] {
    const deckTag = opts.deckTag ?? "#flashcards";
    const out: SrParsedCard[] = [];
    const blocks = (md ?? "").split(/\r?\n\s*\r?\n/);
    for (const raw of blocks) {
        const block = raw.trim();
        if (!block) {
            continue;
        }
        const lines = block.split(/\r?\n/);
        const multi = parseSrMultiline(lines, opts);
        if (multi) {
            out.push({ ...multi, front: stripDeckTag(multi.front, deckTag), back: stripDeckTag(multi.back, deckTag) });
            continue;
        }
        let any = false;
        for (const line of lines) {
            const single = parseSrLine(line, opts);
            if (single) {
                out.push({ ...single, front: stripDeckTag(single.front, deckTag), back: stripDeckTag(single.back, deckTag) });
                any = true;
            }
        }
        if (any) {
            continue;
        }
        if (hasSrCloze(block)) {
            out.push({ kind: "cloze", front: stripDeckTag(block, deckTag), back: "", deckHint: extractDeckHint(block, deckTag) });
        }
    }
    return out;
}

/** 行首 # 转义（防导入后变标题破坏「一卡一段落」对位）；其余 markdown 原样保留 */
function escapeHeadingLines(text: string): string {
    return text.split(/\r?\n/).map(l => l.replace(/^(#+)/, "\\$1")).join("\n");
}

/** 剥 deck tag（parseSrLine 的 back/front 会残留 `#flashcards/...`，落库前必须剥掉） */
function stripDeckTag(text: string, deckTag: string): string {
    return text.replace(new RegExp(`\\s*${deckTag}(?:/[^\\s#]+)*`, "g"), "").trim();
}

function toMarkdown(card: SrParsedCard, deckTag: string): string {
    if (card.kind === "cloze") {
        return escapeHeadingLines(stripDeckTag(card.front, deckTag));
    }
    const front = stripDeckTag(card.front, deckTag);
    const back = stripDeckTag(card.back, deckTag);
    const sep = front.includes("\n") ? "\n" : " ";
    return escapeHeadingLines(`${front}${sep}==${back}==`);
}

/** 导入计划：解析 → 剥 tag → 指纹 → 文件内去重 → 可落库 markdown */
export function planObsidianImport(md: string, opts: SrParseOptions = {}): ObsidianImportPlan {
    const deckTag = opts.deckTag ?? "#flashcards";
    const parsed = parseSrFileBlocks(md, opts);
    const seen = new Set<string>();
    const cards: ObsidianImportCard[] = [];
    let duplicates = 0;
    let reversed = 0;
    const byDeckHint: Record<string, number> = {};
    for (const card of parsed) {
        const kind: "qa" | "cloze" = card.kind === "cloze" ? "cloze" : "qa";
        if (card.kind === "qa-reversed") {
            reversed += 1;
        }
        const hintKey = card.deckHint || "∅";
        byDeckHint[hintKey] = (byDeckHint[hintKey] ?? 0) + 1;
        const front = stripDeckTag(card.front, deckTag);
        const back = stripDeckTag(card.back, deckTag);
        const fingerprint = `${norm(front)}|${norm(back)}|${kind}`;
        if (seen.has(fingerprint)) {
            duplicates += 1;
            continue;
        }
        seen.add(fingerprint);
        cards.push({ kind, markdown: toMarkdown(card, deckTag), deckHint: card.deckHint, fingerprint });
    }
    return { cards, totalParsed: parsed.length, duplicates, reversed, byDeckHint };
}

/** 落库文档 markdown：每卡一个空行分段（一卡一块，调用方按序对位） */
export function composeObsidianImportMarkdown(cards: ObsidianImportCard[]): string {
    return cards.map(c => c.markdown).join("\n\n");
}
