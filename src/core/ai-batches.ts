/**
 * AI 制卡批次数据（M2·FR10 消费端）：类型 + 运行时清洗（AX·526 schema 校验）。
 * 上限 200 条，非法条目静默剔除；tokens 为估算值可选。
 */

export interface AIBatch {
    id: string;
    date: string;
    deckID: string;
    blockIDs: string[];
    tokens?: number;
}

export interface AIBatchesData {
    version: 1;
    batches: AIBatch[];
}

export function emptyAIBatches(): AIBatchesData {
    return { version: 1, batches: [] };
}

export function normalizeAIBatches(raw: unknown): AIBatchesData {
    if (!raw || typeof raw !== "object") {
        return emptyAIBatches();
    }
    const arr = Array.isArray((raw as any).batches) ? (raw as any).batches : [];
    const batches: AIBatch[] = [];
    for (const b of arr) {
        if (!b || typeof b !== "object") { continue; }
        if (typeof b.id !== "string" || !b.id || typeof b.date !== "string" || !b.date) { continue; }
        batches.push({
            id: b.id,
            date: b.date,
            deckID: typeof b.deckID === "string" ? b.deckID : "",
            blockIDs: Array.isArray(b.blockIDs) ? b.blockIDs.filter((x: unknown) => typeof x === "string" && x) : [],
            tokens: Number.isFinite(b.tokens) ? Number(b.tokens) : undefined,
        });
    }
    return { version: 1, batches: batches.slice(-200) };
}
