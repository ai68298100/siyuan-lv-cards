/**
 * Anki M3：导入执行编排（纯模块，docs/39 §3）。
 * 职责：预览卡 → SR 约定 markdown 文档（一块一卡）→ 已建块配对 → 幂等台账。
 * 内核 API（createDocWithMd/addRiffCards）由调用方注入；媒体二进制迁入另列（当前占位文本）。
 * 幂等口径：guid 台账——重导时已导入的 guid 直接跳过，绝不重复建卡。
 */
import type { PreviewCard } from "./anki-preview";
import { concealUnmarkedText, hasMarkedAnswer, serializeQaCard } from "./flashcard-quality";

/** 单卡 → 思源挖空单行；换行折叠为 " / "，确保答案在问题态被遮挡。 */
export function composeCardLine(card: PreviewCard): string {
    const q = card.question.replace(/\s*\n+\s*/g, " / ").trim();
    const a = card.answer.replace(/\s*\n+\s*/g, " / ").trim();
    if (!card.cloze) return serializeQaCard(q, a);
    const markedAnswer = a ? concealUnmarkedText(a) : "";
    if (!hasMarkedAnswer(q) && !markedAnswer) throw new Error("invalid flashcard: missing cloze answer");
    return [q, markedAnswer].filter(Boolean).join(" ");
}

/** 批次 → 单个导入文档 markdown：每行一卡（顺序即 cards 顺序，配对以此为准） */
export function composeImportMarkdown(cards: PreviewCard[]): string {
    return cards.map((c) => composeCardLine(c)).join("\n\n");
}

/** 已建块（按 sort 升序）与卡配对：整行精确匹配为主；markdown 往返可能微调内容，
 *  开启 orderFallback 时未配对卡按出现顺序补齐剩余 p 块 */
export function pairImportedBlocks(
    blocks: { id: string; content: string }[],
    cards: PreviewCard[],
    opts: { orderFallback?: boolean } = {},
): { byGuid: Map<string, string>; unmatchedGuids: string[] } {
    const byGuid = new Map<string, string>();
    const byLine = new Map<string, string>();
    for (const b of blocks) {
        const key = String(b.content ?? "").trim();
        // 同文档重复行（理论不应发生）：保留首个
        if (!byLine.has(key)) byLine.set(key, b.id);
    }
    const unmatched: PreviewCard[] = [];
    for (const c of cards) {
        const blockId = byLine.get(composeCardLine(c));
        if (blockId) byGuid.set(c.guid, blockId);
        else unmatched.push(c);
    }
    if (opts.orderFallback) {
        // 剩余块按文档顺序补齐剩余卡（markdown 往返改写内容时的兜底）
        const used = new Set(byGuid.values());
        const free = blocks.filter((b) => !used.has(b.id));
        for (let i = 0; i < unmatched.length && i < free.length; i++) {
            byGuid.set(unmatched[i].guid, free[i].id);
        }
        unmatched.splice(0, Math.min(unmatched.length, free.length));
    }
    return { byGuid, unmatchedGuids: unmatched.map((c) => c.guid) };
}

// ---------- 幂等台账 ----------

export { normalizeLedger, type LedgerEntry } from "./import-ledgers";
import { normalizeLedger, type LedgerEntry } from "./import-ledgers";

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
