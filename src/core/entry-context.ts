/**
 * BI-3 入口上下文连续性（纯逻辑，node 可单测）。
 * 从块/文档/卡片/题目/通知/报告进入学习流时，保留「来源、范围、目标、返回点」；
 * 取消/重开不丢上下文（验收硬性要求）——序列化往返（toJSON→normalize）字段无损。
 */

export const ENTRY_KINDS = ["block", "doc", "card", "quiz", "notification", "report"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export interface EntryContext {
    entryKind: EntryKind;
    /** 来源：块或文档 ID（block/doc 入口必有） */
    sourceID: string;
    /** 学习范围键（复用复习面板 scopeKey 语义，可空） */
    scopeKey: string;
    /** 关联目标 ID（BI-1，可空） */
    goalID: string;
    /** 返回点：目标 tab/路由标识（如 lv-cards-dashboard） */
    returnPoint: string;
    createdAt: number;
}

export interface EntryContextData {
    version: 1;
    contexts: EntryContext[];
}

export function emptyEntryContexts(): EntryContextData {
    return { version: 1, contexts: [] };
}

function asKind(v: unknown): EntryKind {
    return typeof v === "string" && (ENTRY_KINDS as readonly string[]).includes(v) ? (v as EntryKind) : "block";
}

/** 白名单清洗：无来源 ID 的上下文无意义，剔除；同 sourceID+kind 去重保最新 */
export function normalizeEntryContexts(raw: unknown): EntryContextData {
    const arr = (raw as any)?.contexts;
    if (!Array.isArray(arr)) return emptyEntryContexts();
    const byKey = new Map<string, EntryContext>();
    for (const c of arr) {
        if (!c || typeof c !== "object" || typeof c.sourceID !== "string" || !c.sourceID) continue;
        const createdAt = Number.isFinite(Number(c.createdAt)) ? Number(c.createdAt) : Date.now();
        const ctx: EntryContext = {
            entryKind: asKind(c.entryKind),
            sourceID: c.sourceID,
            scopeKey: typeof c.scopeKey === "string" ? c.scopeKey : "",
            goalID: typeof c.goalID === "string" ? c.goalID : "",
            returnPoint: typeof c.returnPoint === "string" ? c.returnPoint : "",
            createdAt,
        };
        byKey.set(`${ctx.entryKind}:${ctx.sourceID}`, ctx);
    }
    const contexts = [...byKey.values()].sort((a, b) => a.createdAt - b.createdAt);
    return { version: 1, contexts };
}

/** 记录/刷新入口上下文（同 kind+source 刷新为最新，保留其余字段由调用方传入） */
export function upsertContext(data: EntryContextData, ctx: EntryContext): EntryContextData {
    const key = `${ctx.entryKind}:${ctx.sourceID}`;
    const contexts = data.contexts.filter(c => `${c.entryKind}:${c.sourceID}` !== key);
    contexts.push(ctx);
    return { version: 1, contexts };
}

/** 取回入口上下文（重开恢复用）；不存在返回 null */
export function findContext(data: EntryContextData, entryKind: EntryKind, sourceID: string): EntryContext | null {
    return data.contexts.find(c => c.entryKind === entryKind && c.sourceID === sourceID) ?? null;
}

/** 清除入口上下文（完成/放弃时调用；返回是否删除） */
export function removeContext(data: EntryContextData, entryKind: EntryKind, sourceID: string): boolean {
    const before = data.contexts.length;
    data.contexts = data.contexts.filter(c => !(c.entryKind === entryKind && c.sourceID === sourceID));
    return data.contexts.length !== before;
}

/** 上下文有效期（默认 7 天）：过期上下文恢复时视为失效 */
export function isContextFresh(ctx: EntryContext, now: number, ttlMs: number = 7 * 86400000): boolean {
    return now - ctx.createdAt <= ttlMs;
}
