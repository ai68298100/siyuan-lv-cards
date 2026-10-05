/**
 * AI 制卡批次数据（M2·FR10 消费端）：类型 + 运行时清洗（AX·526 schema 校验）。
 * 上限 200 条，非法条目静默剔除；tokens 为估算值可选。
 * BU-19（v0.194.0）：批次 pin——生成环境快照（provider/model/templateHash/来源 hash）随批次落盘，
 * 模型/模板升级后旧批次可复现口径、可比较；**绝不存密钥**（类型层无 key 字段）。
 */

/** BU-19 批次 pin：生成环境快照（hash 为 FNV-1a 指纹，非安全摘要；不含任何明文材料/密钥） */
export interface AIBatchPin {
    mode: "siyuan" | "custom";
    /** 登记模型 ID（未登记/内置=null） */
    modelId: string | null;
    /** 生效 system 提示 hash（模板+隔离条款） */
    templateHash: string;
    /** 来源材料 hash（指纹；不回存原文） */
    sourceHash: string;
    pinnedAt: number;
}

export interface AIBatch {
    id: string;
    date: string;
    deckID: string;
    blockIDs: string[];
    tokens?: number;
    /** BU-19 生成环境快照（旧批次无此字段=未 pin，兼容不动） */
    pin?: AIBatchPin;
}

export interface AIBatchesData {
    version: 1;
    batches: AIBatch[];
}

export function emptyAIBatches(): AIBatchesData {
    return { version: 1, batches: [] };
}

function normalizePin(p: any): AIBatchPin | undefined {
    if (!p || typeof p !== "object" || typeof p.templateHash !== "string" || !p.templateHash || typeof p.sourceHash !== "string" || !p.sourceHash) {
        return undefined;
    }
    if (p.mode !== "siyuan" && p.mode !== "custom") {
        return undefined;
    }
    return {
        mode: p.mode,
        modelId: typeof p.modelId === "string" && p.modelId ? p.modelId : null,
        templateHash: p.templateHash,
        sourceHash: p.sourceHash,
        pinnedAt: Number.isFinite(p.pinnedAt) ? Number(p.pinnedAt) : 0,
    };
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
            pin: normalizePin(b.pin),
        });
    }
    return { version: 1, batches: batches.slice(-200) };
}
