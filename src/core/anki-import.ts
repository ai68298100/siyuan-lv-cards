/**
 * Anki M3：导入执行编排（纯模块，docs/39 §3）。
 * 职责：预览卡 → SR 约定 markdown 文档（一块一卡）→ 已建块配对 → 幂等台账。
 * 内核 API（createDocWithMd/addRiffCards）由调用方注入；媒体二进制迁入另列（当前占位文本）。
 * 幂等口径：guid 台账——重导时已导入的 guid 直接跳过，绝不重复建卡。
 */
import type { PreviewCard } from "./anki-preview";

/** 单卡 → SR 单行（与 core/obsidian-sr 导出约定一致：`q :: a`；换行折叠为 " / "） */
export function composeCardLine(card: PreviewCard): string {
    const q = card.question.replace(/\s*\n+\s*/g, " / ").trim();
    const a = (card.answer || "—").replace(/\s*\n+\s*/g, " / ").trim();
    return `${q} :: ${a}`;
}

/** 批次 → 单个导入文档 markdown：每行一卡（顺序即 cards 顺序，配对以此为准） */
export function composeImportMarkdown(cards: PreviewCard[]): string {
    return cards.map((c) => composeCardLine(c)).join("\n\n");
}

/** 已建块（按 sort 升序）与卡配对：整行内容精确匹配（composeCardLine 的产物） */
export function pairImportedBlocks(
    blocks: { id: string; content: string }[],
    cards: PreviewCard[],
): { byGuid: Map<string, string>; unmatchedGuids: string[] } {
    const byGuid = new Map<string, string>();
    const byLine = new Map<string, string>();
    for (const b of blocks) {
        const key = String(b.content ?? "").trim();
        // 同文档重复行（理论不应发生）：保留首个，其余在 unmatched 里如实呈现
        if (!byLine.has(key)) byLine.set(key, b.id);
    }
    const unmatchedGuids: string[] = [];
    for (const c of cards) {
        const blockId = byLine.get(composeCardLine(c));
        if (blockId) byGuid.set(c.guid, blockId);
        else unmatchedGuids.push(c.guid);
    }
    return { byGuid, unmatchedGuids };
}

// ---------- 幂等台账 ----------

export interface LedgerEntry {
    guid: string;
    deckID: string;
    blockID: string;
    importedAt: number;
}

/** 台账清洗：坏条目剔除、guid 去重（保留最新 importedAt）、限量（防无限膨胀） */
export function normalizeLedger(raw: unknown, cap = 50000): LedgerEntry[] {
    const list = Array.isArray(raw) ? raw : [];
    const byGuid = new Map<string, LedgerEntry>();
    for (const item of list) {
        const e = item as Partial<LedgerEntry>;
        if (typeof e?.guid !== "string" || !e.guid || typeof e?.blockID !== "string" || !e.blockID) continue;
        const prev = byGuid.get(e.guid);
        const at = typeof e.importedAt === "number" ? e.importedAt : 0;
        if (!prev || at > (prev.importedAt ?? 0)) {
            byGuid.set(e.guid, { guid: e.guid, deckID: String(e.deckID ?? ""), blockID: e.blockID, importedAt: at });
        }
    }
    const out = [...byGuid.values()].sort((a, b) => a.importedAt - b.importedAt);
    return out.length > cap ? out.slice(out.length - cap) : out;
}

/** 重导过滤：台账内 guid 视为已导入（不重复建卡） */
export function partitionNew(cards: PreviewCard[], ledger: LedgerEntry[]): { fresh: PreviewCard[]; already: string[] } {
    const known = new Set(ledger.map((e) => e.guid));
    const freshCards = cards.filter((c) => !known.has(c.guid));
    const already = cards.filter((c) => known.has(c.guid)).map((c) => c.guid);
    return { fresh: freshCards, already };
}

/** 合并台账（导入成功后调用）：新条目优先（同 guid 覆盖），返回清洗后的新台账 */
export function mergeLedger(raw: unknown, entries: LedgerEntry[]): LedgerEntry[] {
    return normalizeLedger([...(Array.isArray(raw) ? raw : []), ...entries]);
}
