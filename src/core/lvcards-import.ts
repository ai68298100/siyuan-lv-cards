/** Share-package import guards. No host writes: callers stop before adding cards on any mismatch. */
import { normalizeCardFingerprint, type LvPackageCard } from "./lvcards-package";

export class LvCardsImportError extends Error {
    constructor(readonly code: "incomplete-deck" | "block-mismatch" | "enrollment-mismatch") {
        super(code);
        this.name = "LvCardsImportError";
    }
}

interface DeckPage {
    blocks: { id: string }[];
    total: number;
    pageCount: number;
}

export async function readLvCardsDeckIDs(
    deckID: string,
    readPage: (id: string, page: number, pageSize: number) => Promise<DeckPage>,
): Promise<string[]> {
    if (!deckID.trim()) throw new LvCardsImportError("incomplete-deck");
    const ids = new Set<string>();
    let total = -1;
    let pageCount = 1;
    for (let page = 1; page <= pageCount; page++) {
        const data = await readPage(deckID, page, 500);
        if (!data || !Array.isArray(data.blocks) || !Number.isSafeInteger(data.total) || data.total < 0
            || !Number.isSafeInteger(data.pageCount) || data.pageCount < 0
            || (data.total > 0 && (data.pageCount < 1 || data.pageCount > data.total))
            || (data.total === 0 && data.pageCount > 1)) throw new LvCardsImportError("incomplete-deck");
        if (page === 1) { total = data.total; pageCount = Math.max(1, data.pageCount); }
        else if (data.total !== total || data.pageCount !== pageCount) throw new LvCardsImportError("incomplete-deck");
        if (total > 0 && data.blocks.length === 0) throw new LvCardsImportError("incomplete-deck");
        for (const block of data.blocks) {
            if (typeof block?.id !== "string" || !block.id.trim() || ids.has(block.id)) throw new LvCardsImportError("incomplete-deck");
            ids.add(block.id);
        }
        if (ids.size > total) throw new LvCardsImportError("incomplete-deck");
    }
    if (ids.size !== total) throw new LvCardsImportError("incomplete-deck");
    return [...ids];
}

/** Read every page, then read source Markdown; rendered riff content is not a source fingerprint. */
export async function readLvCardsExisting(
    deckID: string,
    readPage: (id: string, page: number, pageSize: number) => Promise<DeckPage>,
    query: (sql: string) => Promise<Record<string, unknown>[]>,
): Promise<{ id: string; markdown: string }[]> {
    const allIDs = await readLvCardsDeckIDs(deckID, readPage);
    const existing: { id: string; markdown: string }[] = [];
    // Explicit LIMIT bypasses the user's default SQL result cap. Every requested row must exist.
    for (let offset = 0; offset < allIDs.length; offset += 400) {
        const chunk = allIDs.slice(offset, offset + 400);
        const rows = await query(`SELECT id, markdown FROM blocks WHERE id IN (${chunk.map(sqlString).join(",")}) LIMIT ${chunk.length}`);
        const expected = new Set(chunk);
        if (!Array.isArray(rows) || rows.length !== chunk.length) throw new LvCardsImportError("incomplete-deck");
        for (const row of rows) {
            if (typeof row?.id !== "string" || !expected.delete(row.id) || typeof row.markdown !== "string" || !row.markdown.trim()) {
                throw new LvCardsImportError("incomplete-deck");
            }
            existing.push({ id: row.id, markdown: row.markdown });
        }
    }
    return existing;
}

export function sqlString(value: string): string { return `'${value.replace(/'/g, "''")}'`; }

/** Match block identity and source content, without relying on SQL sort order or count alone. */
export function pairLvCardsBlocks(
    cards: LvPackageCard[],
    rows: Record<string, unknown>[],
    rootID: string,
): string[] {
    if (!rootID?.trim() || !Array.isArray(rows) || rows.length !== cards.length) throw new LvCardsImportError("block-mismatch");
    const byFingerprint = new Map<string, string>();
    const ids = new Set<string>();
    for (const row of rows) {
        if (typeof row?.id !== "string" || !row.id.trim() || ids.has(row.id) || row.root_id !== rootID
            || row.parent_id !== rootID || typeof row.type !== "string" || !row.type || row.type === "d" || typeof row.markdown !== "string") {
            throw new LvCardsImportError("block-mismatch");
        }
        const fingerprint = normalizeCardFingerprint(row.markdown);
        if (!fingerprint || byFingerprint.has(fingerprint)) throw new LvCardsImportError("block-mismatch");
        ids.add(row.id);
        byFingerprint.set(fingerprint, row.id);
    }
    return cards.map(card => {
        const fingerprint = normalizeCardFingerprint(card.markdown);
        const id = byFingerprint.get(fingerprint);
        if (!id) throw new LvCardsImportError("block-mismatch");
        byFingerprint.delete(fingerprint);
        return id;
    });
}

/**
 * 将分享包卡片的可选元数据（如助记便签 memo、标签 tags）恢复至对应思源块属性
 * 1. 严格对齐：cards 与 blockIDs 必须一一对应且长度一致；
 * 2. 差异化设置：仅当存在 memo 或 tags 时才发起请求，避免无谓网络开销；
 * 3. 错误隔离与韧性：单块属性设置失败不阻断整包导入（旁路增强），返回实际成功写入元数据的块数量；
 * 4. 有界并发：分批（如每批 5 个）并发调用 setAttrs，避免瞬间冲击思源内核请求队列。
 */
export async function applyPackageCardMetadata(
    cards: LvPackageCard[],
    blockIDs: string[],
    setAttrs: (id: string, attrs: Record<string, string>) => Promise<void>,
    options?: { batchSize?: number; onError?: (blockID: string, err: unknown) => void },
): Promise<number> {
    if (!Array.isArray(cards) || !Array.isArray(blockIDs) || cards.length !== blockIDs.length) {
        return 0;
    }

    const tasks: { id: string; attrs: Record<string, string> }[] = [];
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const blockID = blockIDs[i];
        if (!card || !blockID?.trim()) continue;

        const attrs: Record<string, string> = {};
        if (typeof card.memo === "string" && card.memo.trim()) {
            attrs.memo = card.memo.trim();
        }
        if (Array.isArray(card.tags) && card.tags.length > 0) {
            const cleanTags = card.tags
                .filter(t => typeof t === "string" && t.trim())
                .map(t => t.trim());
            if (cleanTags.length > 0) {
                const joined = cleanTags.join(",");
                attrs.tags = joined;
                attrs["custom-card-tags"] = joined;
            }
        }

        if (Object.keys(attrs).length > 0) {
            tasks.push({ id: blockID, attrs });
        }
    }

    if (tasks.length === 0) return 0;

    let appliedCount = 0;
    const batchSize = Math.max(1, Math.min(options?.batchSize ?? 5, 20));

    for (let offset = 0; offset < tasks.length; offset += batchSize) {
        const chunk = tasks.slice(offset, offset + batchSize);
        await Promise.all(
            chunk.map(async task => {
                try {
                    await setAttrs(task.id, task.attrs);
                    appliedCount++;
                } catch (err) {
                    options?.onError?.(task.id, err);
                }
            })
        );
    }

    return appliedCount;
}
