/**
 * 原生小驴闪卡分享包导出纯模块（lvcards export）
 * 1. 完整分页读取：无硬编码页数上限，严格核对每一页的总数、页数与唯一 ID，分页漂移时拒绝导出；
 * 2. 原始 Markdown 完整性：分批通过 SQL 显式 LIMIT 读取 blocks.markdown 与可选 memo，绝不使用剥离 HTML 的截断文本；
 * 3. 卡型准确推断：支持 cloze、code、list、qa 等原生卡型识别；
 * 4. 往返一致性：导出的内容直接满足 lvcards.v1 规范，与 previewLvCardsImport / lvcards-import 形成无损闭环。
 */

import { serializeLvCardsPackage, type LvPackageCard } from "./lvcards-package";
import { sqlString } from "./lvcards-import";

export class LvCardsExportError extends Error {
    constructor(readonly code: "incomplete-deck" | "empty-deck" | "query-failed") {
        super(code);
        this.name = "LvCardsExportError";
    }
}

export interface DeckPageData {
    blocks: { id: string }[];
    total: number;
    pageCount: number;
}

/**
 * 根据原始 Markdown 内容推断卡片类型
 */
export function inferPackageCardKind(markdown: string): "qa" | "cloze" | "code" | "list" {
    if (!markdown || typeof markdown !== "string") return "qa";
    // 包含 ==挖空==
    if (markdown.includes("==")) return "cloze";
    // 包含多行代码块
    if (/```[\s\S]*?```/.test(markdown)) return "code";
    // 包含有序或无序列表
    if (/^(\s*[-*+]|\s*\d+\.)\s+/m.test(markdown)) return "list";
    return "qa";
}

/**
 * 完整顺序读取目标卡组的所有卡片 ID（支持大卡组无截断导出）
 */
export async function readDeckIDsForExport(
    deckID: string,
    readPage: (id: string, page: number, pageSize: number) => Promise<DeckPageData>,
    pageSize = 500,
): Promise<string[]> {
    if (!deckID?.trim()) throw new LvCardsExportError("incomplete-deck");
    const ids = new Set<string>();
    let total = -1;
    let pageCount = 1;

    for (let page = 1; page <= pageCount; page++) {
        let data: DeckPageData;
        try {
            data = await readPage(deckID, page, pageSize);
        } catch {
            throw new LvCardsExportError("incomplete-deck");
        }

        if (
            !data
            || !Array.isArray(data.blocks)
            || !Number.isSafeInteger(data.total)
            || data.total < 0
            || !Number.isSafeInteger(data.pageCount)
            || data.pageCount < 0
            || (data.total > 0 && (data.pageCount < 1 || data.pageCount > data.total))
            || (data.total === 0 && data.pageCount > 1)
        ) {
            throw new LvCardsExportError("incomplete-deck");
        }

        if (page === 1) {
            total = data.total;
            pageCount = Math.max(1, data.pageCount);
        } else if (data.total !== total || data.pageCount !== pageCount) {
            throw new LvCardsExportError("incomplete-deck");
        }

        if (total > 0 && data.blocks.length === 0) {
            throw new LvCardsExportError("incomplete-deck");
        }

        for (const block of data.blocks) {
            if (typeof block?.id !== "string" || !block.id.trim() || ids.has(block.id)) {
                throw new LvCardsExportError("incomplete-deck");
            }
            ids.add(block.id);
        }

        if (ids.size > total) {
            throw new LvCardsExportError("incomplete-deck");
        }
    }

    if (ids.size !== total) {
        throw new LvCardsExportError("incomplete-deck");
    }

    return [...ids];
}

/**
 * 分批从 blocks 表中回读真实的 Markdown 正文与助记便签
 */
export async function readCardsForExport(
    ids: string[],
    query: (sql: string) => Promise<Record<string, unknown>[]>,
    chunkSize = 400,
): Promise<LvPackageCard[]> {
    const cards: LvPackageCard[] = [];

    for (let offset = 0; offset < ids.length; offset += chunkSize) {
        const chunk = ids.slice(offset, offset + chunkSize);
        const safeChunk = chunk.map(sqlString).join(",");

        // 显式 LIMIT 规避宿主默认单次查询行数限制
        let rows: Record<string, unknown>[];
        try {
            // 优先查询 memo 字段
            rows = await query(`SELECT id, markdown, memo FROM blocks WHERE id IN (${safeChunk}) LIMIT ${chunk.length}`);
        } catch {
            // 兼容旧版 SQLite 或未包含 memo 列的轻量环境
            try {
                rows = await query(`SELECT id, markdown FROM blocks WHERE id IN (${safeChunk}) LIMIT ${chunk.length}`);
            } catch {
                throw new LvCardsExportError("query-failed");
            }
        }

        if (!Array.isArray(rows) || rows.length !== chunk.length) {
            throw new LvCardsExportError("incomplete-deck");
        }

        const rowMap = new Map<string, { markdown: string; memo?: string }>();
        for (const row of rows) {
            if (typeof row?.id !== "string" || typeof row.markdown !== "string" || !row.markdown.trim()) {
                throw new LvCardsExportError("incomplete-deck");
            }
            rowMap.set(row.id, {
                markdown: row.markdown,
                memo: typeof row.memo === "string" && row.memo.trim() ? row.memo.trim() : undefined,
            });
        }

        for (const id of chunk) {
            const item = rowMap.get(id);
            if (!item) throw new LvCardsExportError("incomplete-deck");
            cards.push({
                id,
                markdown: item.markdown,
                kind: inferPackageCardKind(item.markdown),
                memo: item.memo,
            });
        }
    }

    return cards;
}

/**
 * 完整导出单卡组小驴闪卡分享包
 */
export async function exportLvCardsDeckPackage(
    deck: { id: string; name: string; description?: string },
    readPage: (id: string, page: number, pageSize: number) => Promise<DeckPageData>,
    query: (sql: string) => Promise<Record<string, unknown>[]>,
    options?: { generator?: string; pageSize?: number; chunkSize?: number }
): Promise<{ pkgJson: string; cards: LvPackageCard[] }> {
    const ids = await readDeckIDsForExport(deck.id, readPage, options?.pageSize ?? 500);
    if (ids.length === 0) {
        throw new LvCardsExportError("empty-deck");
    }

    const cards = await readCardsForExport(ids, query, options?.chunkSize ?? 400);
    const pkgJson = serializeLvCardsPackage(deck, cards, options);
    return { pkgJson, cards };
}
