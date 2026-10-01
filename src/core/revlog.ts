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
    data.entries.push(entry);
    // 日志上限保护：仅保留最近 2 万条明细，聚合数据永久保留
    if (data.entries.length > 20000) {
        data.entries = data.entries.slice(-20000);
    }
    const date = localDate(entry.ts);
    const day = data.days[date] ?? { new: 0, review: 0, forget: 0 };
    if (entry.rating <= 0) {
        return; // skip 不计入统计
    }
    day.review += 1;
    if (entry.rating === 1) {
        day.forget += 1;
    }
    data.days[date] = day;
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
