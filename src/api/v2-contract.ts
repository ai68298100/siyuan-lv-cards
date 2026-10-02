/**
 * 内核闪卡 V2 契约纯逻辑（零依赖，可单测；AQ-6）：
 * 状态白名单、report 字段清洗、统计摘要宽容提取。
 * 端点封装见 flashcardV2.ts（import siyuan，不可在 node 单测环境加载）。
 */

/** 迁移状态机：Legacy（纯旧数据）/ Preparing / Active（V2 生效）/ LegacyDiverged（迁移后旧侧又有写入）/ Unknown（端点在但状态不可识别） */
export type FlashcardV2State = "Legacy" | "Preparing" | "Active" | "LegacyDiverged" | "Unknown";

export const V2_STATES: readonly FlashcardV2State[] = ["Legacy", "Preparing", "Active", "LegacyDiverged"];

export interface MigrationStatus {
    state: FlashcardV2State;
    report?: {
        Complete?: boolean;
        MigratedCards?: number;
        ArchivedCards?: number;
        ReviewSets?: number;
        ReviewEvents?: number;
        InvalidCards?: number;
        UnmappedLogs?: number;
    };
}

/** report 字段白名单清洗（AQ-6）：非数值/缺字段一律丢弃，不渲染 undefined */
export function sanitizeV2Report(raw: unknown): MigrationStatus["report"] | undefined {
    if (!raw || typeof raw !== "object") {
        return undefined;
    }
    const r = raw as Record<string, unknown>;
    const num = (v: unknown): number | undefined => (Number.isFinite(Number(v)) ? Number(v) : undefined);
    const out: NonNullable<MigrationStatus["report"]> = {};
    if (typeof r.Complete === "boolean") {
        out.Complete = r.Complete;
    }
    for (const k of ["MigratedCards", "ArchivedCards", "ReviewSets", "ReviewEvents", "InvalidCards", "UnmappedLogs"] as const) {
        const v = num(r[k]);
        if (v !== undefined) {
            out[k] = v;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * 迁移状态白名单归一（AQ-6）：state 必须命中已知状态，否则视为 Unknown
 * （端点存在但契约变动/暂不可达——与「无端点=未升级」区分，两者都走 riff 兜底）。
 */
export function normalizeMigrationStatus(data: unknown): MigrationStatus {
    const s = data && typeof data === "object" ? (data as Record<string, unknown>).state : null;
    if (typeof s === "string" && (V2_STATES as readonly string[]).includes(s)) {
        return { state: s as FlashcardV2State, report: sanitizeV2Report((data as Record<string, unknown>).report) };
    }
    return { state: "Unknown" };
}

/**
 * 从 getStatistics 的宽容返回中提取顶层标量摘要（契约未冻结，未知结构不渲染）。
 */
export function summarizeStatistics(data: unknown): { key: string; value: string }[] {
    if (!data || typeof data !== "object") {
        return [];
    }
    const out: { key: string; value: string }[] = [];
    const overview = ((data as Record<string, unknown>).overview ?? (data as Record<string, unknown>).result ?? data) as Record<string, unknown>;
    for (const [k, v] of Object.entries(overview)) {
        if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
            out.push({ key: k, value: String(v) });
        }
    }
    return out;
}
