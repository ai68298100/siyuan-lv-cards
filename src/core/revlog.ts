/**
 * 本地复习日志（revlog）与每日统计。
 * 内核不向插件暴露复习历史，因此从启用日起自行记录：
 * - 原生复习界面：监听 eventBus `click-flashcard-action` 事件
 * - 本插件复习面板：评分时直接 append()
 * 统计页据此绘制热力图/连击；数据随 saveData 走思源同步。
 */

export interface RevlogEntry {
    /** 评分时间戳（毫秒） */
    ts: number;
    cardID: string;
    deckID: string;
    blockID: string;
    /** 1-4；原生界面的 skip 记为 0 */
    rating: number;
    /** 来源：native=官方复习界面 / plugin=本插件面板 */
    source: "native" | "plugin";
}

export interface DayStat {
    new: number;
    review: number;
    forget: number;
}

export interface RevlogData {
    version: 1;
    entries: RevlogEntry[];
    /** 按本地日期聚合的每日统计，key = YYYY-MM-DD */
    days: Record<string, DayStat>;
}

const EMPTY: RevlogData = { version: 1, entries: [], days: {} };

export function emptyRevlog(): RevlogData {
    return JSON.parse(JSON.stringify(EMPTY));
}

export function normalizeRevlog(raw: unknown): RevlogData {
    if (!raw || typeof raw !== "object") {
        return emptyRevlog();
    }
    const obj = raw as Partial<RevlogData>;
    return {
        version: 1,
        entries: Array.isArray(obj.entries) ? obj.entries : [],
        days: obj.days && typeof obj.days === "object" ? obj.days : {},
    };
}

export function localDate(ts: number): string {
    const d = new Date(ts);
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}

export function appendRevlog(data: RevlogData, entry: RevlogEntry): void {
    if (entry.rating > 0) {
        // 首次有效评分计为"新"，此后计为"复习"（AJ1 修复：day.new 不再永远为 0）
        const seen = data.entries.some(e => e.cardID === entry.cardID && e.rating > 0);
        const date = localDate(entry.ts);
        const day = data.days[date] ?? { new: 0, review: 0, forget: 0 };
        if (seen) {
            day.review += 1;
        } else {
            day.new += 1;
        }
        if (entry.rating === 1) {
            day.forget += 1;
        }
        data.days[date] = day;
    }
    data.entries.push(entry);
    // 日志上限保护：仅保留最近 2 万条明细，聚合数据永久保留
    if (data.entries.length > 20000) {
        data.entries = data.entries.slice(-20000);
    }
}

/** 由明细重算每日聚合（幂等）。升级/修数后调用一次即可。 */
export function recalcDays(data: RevlogData): void {
    const seen = new Set<string>();
    data.days = {};
    for (const e of data.entries) {
        if (e.rating <= 0) {
            continue;
        }
        const date = localDate(e.ts);
        const day = data.days[date] ?? { new: 0, review: 0, forget: 0 };
        if (seen.has(e.cardID)) {
            day.review += 1;
        } else {
            day.new += 1;
            seen.add(e.cardID);
        }
        if (e.rating === 1) {
            day.forget += 1;
        }
        data.days[date] = day;
    }
}

export interface MergeResult {
    added: number;
    skipped: number;
}

/** 导入合并（M10·FR1）：按 ts+cardID+rating+source 去重，带结构/数值清洗与批量上限（AK 组要求） */
export function mergeRevlog(data: RevlogData, imported: unknown): MergeResult {
    if (!imported || typeof imported !== "object" || !Array.isArray((imported as any).entries)) {
        throw new Error("invalid revlog file");
    }
    const key = (e: RevlogEntry) => `${e.ts}|${e.cardID}|${e.rating}|${e.source}`;
    const seen = new Set(data.entries.map(key));
    const incoming = (imported as any).entries as any[];
    if (incoming.length > 50000) {
        throw new Error("file too large");
    }
    let added = 0;
    let skipped = 0;
    for (const raw of incoming) {
        const ts = Number(raw?.ts);
        const rating = Number(raw?.rating);
        if (!Number.isFinite(ts) || typeof raw?.cardID !== "string" || !raw.cardID ||
            !Number.isInteger(rating) || rating < 0 || rating > 4) {
            skipped += 1;
            continue;
        }
        const entry: RevlogEntry = {
            ts,
            cardID: raw.cardID,
            deckID: String(raw.deckID ?? ""),
            blockID: String(raw.blockID ?? ""),
            rating,
            source: raw.source === "native" ? "native" : "plugin",
        };
        const k = key(entry);
        if (seen.has(k)) {
            skipped += 1;
            continue;
        }
        seen.add(k);
        data.entries.push(entry);
        added += 1;
    }
    if (data.entries.length > 20000) {
        data.entries = data.entries.slice(-20000);
    }
    recalcDays(data);
    return { added, skipped };
}

/** CSV 导出行（M10·FR1）：date,ts,cardID,deckID,blockID,rating,source */
export function revlogToCsv(data: RevlogData): string {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = ["date,ts,cardID,deckID,blockID,rating,source"];
    for (const e of data.entries) {
        rows.push(`${localDate(e.ts)},${e.ts},${esc(e.cardID)},${esc(e.deckID)},${esc(e.blockID)},${e.rating},${e.source}`);
    }
    return rows.join("\n");
}

export function isCardNew(data: RevlogData, cardID: string): boolean {
    return !data.entries.some(e => e.cardID === cardID && e.rating > 0);
}

/** 连续学习天数（截止今天或昨天均算连续） */
export function calcStreak(data: RevlogData): number {
    let streak = 0;
    const d = new Date();
    for (;;) {
        const key = localDate(d.getTime());
        const stat = data.days[key];
        if (stat && (stat.review > 0 || stat.new > 0)) {
            streak += 1;
        } else if (streak === 0 && key === localDate(Date.now())) {
            // 今天还没学：从昨天继续判断
        } else {
            break;
        }
        d.setDate(d.getDate() - 1);
    }
    return streak;
}

/** 最近 N 天的每日统计序列（旧→新），用于热力图 */
export function lastNDays(data: RevlogData, n: number): { date: string; stat: DayStat }[] {
    const out: { date: string; stat: DayStat }[] = [];
    const d = new Date();
    d.setDate(d.getDate() - (n - 1));
    for (let i = 0; i < n; i++) {
        const key = localDate(d.getTime());
        out.push({ date: key, stat: data.days[key] ?? { new: 0, review: 0, forget: 0 } });
        d.setDate(d.getDate() + 1);
    }
    return out;
}
