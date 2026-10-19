/**
 * 导入台账纯数据结构与清洗函数（轻量零依赖模块，防主包膨胀）
 */

// ---------- Anki 导入台账 ----------

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

// ---------- Obsidian 导入台账 ----------

export interface ObLedgerEntry {
    fingerprint: string;
    deckID: string;
    blockID: string;
    importedAt: number;
}

export const OB_LEDGER_CAP = 50000;

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
    return [...byFp.values()]
        .sort((a, b) => b.importedAt - a.importedAt)
        .slice(0, Math.max(0, cap))
        .sort((a, b) => a.importedAt - b.importedAt);
}

/** 台账合并：新条目覆盖同指纹旧条目（幂等重导更新落点） */
export function mergeObLedger(current: ObLedgerEntry[], additions: ObLedgerEntry[], cap = OB_LEDGER_CAP): ObLedgerEntry[] {
    return normalizeObLedger([...current, ...additions], cap);
}
