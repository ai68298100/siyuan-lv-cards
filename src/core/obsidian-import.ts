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

// ---------- W2：deckHint 分组落库 + 跨运行弱台账（幂等重导） ----------

/** 卡组命名：根 → 「Obsidian: <base>」；子路径 → 「Obsidian: <base>/<hint>」（riff 卡组名为扁平字符串） */
export function deckNameFor(base: string, hint: string): string {
    return hint ? `Obsidian: ${base}/${hint}` : `Obsidian: ${base}`;
}

/** 按 deckHint 分组（保持计划内首次出现顺序） */
export function groupByDeckHint(cards: ObsidianImportCard[]): { hint: string; cards: ObsidianImportCard[] }[] {
    const order: string[] = [];
    const map = new Map<string, ObsidianImportCard[]>();
    for (const c of cards) {
        const hint = c.deckHint;
        if (!map.has(hint)) {
            map.set(hint, []);
            order.push(hint);
        }
        map.get(hint)!.push(c);
    }
    return order.map(hint => ({ hint, cards: map.get(hint)! }));
}

/** 弱台账条目：指纹 → 落点（无 Obsidian 稳定 ID，指纹即幂等键；不含卡片原文） */
export interface ObLedgerEntry {
    fingerprint: string;
    deckID: string;
    blockID: string;
    importedAt: number;
}

const OB_LEDGER_CAP = 50000;

/** 台账清洗：fingerprint/blockID 必须非空、指纹去重（保留最新 importedAt）、限量 */
export function normalizeObLedger(raw: unknown, cap = OB_LEDGER_CAP): ObLedgerEntry[] {
    const list = Array.isArray(raw) ? raw : [];
    const byFp = new Map<string, ObLedgerEntry>();
    for (const item of list) {
        const e = item as Partial<ObLedgerEntry>;
        if (typeof e?.fingerprint !== "string" || !e.fingerprint || typeof e?.blockID !== "string" || !e.blockID) {
            continue;
        }
        const prev = byFp.get(e.fingerprint);
        const at = typeof e.importedAt === "number" && e.importedAt > 0 ? e.importedAt : 0;
        if (!prev || (prev.importedAt <= at && at > 0)) {
            byFp.set(e.fingerprint, {
                fingerprint: e.fingerprint,
                deckID: typeof e.deckID === "string" ? e.deckID : "",
                blockID: e.blockID,
                importedAt: at,
            });
        }
    }
    return [...byFp.values()].slice(-cap);
}

/** 台账合并：新条目覆盖同指纹旧条目（幂等重导更新落点） */
export function mergeObLedger(current: ObLedgerEntry[], additions: ObLedgerEntry[], cap = OB_LEDGER_CAP): ObLedgerEntry[] {
    return normalizeObLedger([...current, ...additions], cap);
}

/** 计划分区：fresh=待导入；already=台账已有指纹（幂等跳过） */
export function partitionByLedger(cards: ObsidianImportCard[], ledger: ObLedgerEntry[]): { fresh: ObsidianImportCard[]; already: ObsidianImportCard[] } {
    const known = new Set(ledger.map(e => e.fingerprint));
    const fresh: ObsidianImportCard[] = [];
    const already: ObsidianImportCard[] = [];
    for (const c of cards) {
        (known.has(c.fingerprint) ? already : fresh).push(c);
    }
    return { fresh, already };
}

// ---------- W3：导出回 Obsidian SR markdown（与导入对称闭环） ----------

export interface SrExportLine {
    kind: "qa" | "cloze";
    /** 单行 SR 卡（含 #flashcards 标签；一卡一段落由 compose 保证） */
    line: string;
}

/**
 * 块内容 → SR 导出行：
 * - 「front ==back==」（尾部闭合、front 无其他 ==）→ qa：`front :: back #flashcards`
 * - 其余（多挖空/尾部有内容/无标记）→ cloze 原样 + 标签
 * 口径：挖空多标记块在 Obsidian SR 本就是 cloze，不强行拆问答（诚实降级）。
 */
export function srExportLine(content: string, opts: { deckTag?: string; deckHint?: string } = {}): SrExportLine {
    const deckTag = opts.deckTag ?? "#flashcards";
    const tag = opts.deckHint ? `${deckTag}/${opts.deckHint.replace(/^\/+|\/+$/g, "")}` : deckTag;
    const text = (content ?? "").trim();
    // 中段惰性：back 停在第一个闭合 ==（贪婪会吞掉尾部多挖空标记，误判 qa）
    const m = text.match(/^([\s\S]*?)==([\s\S]+?)==([\s\S]*)$/);
    if (m && !m[3].trim() && !m[1].includes("==")) {
        const front = m[1].trim();
        const back = m[2].trim();
        if (front && back) {
            return { kind: "qa", line: `${front} :: ${back} ${tag}` };
        }
    }
    return { kind: "cloze", line: `${text} ${tag}` };
}

/** 导出组合：一卡一空行分段（可用我们的导入器原样回导——往返闭环） */
export function composeSrExport(lines: SrExportLine[]): string {
    return lines.map(l => l.line).join("\n\n");
}
