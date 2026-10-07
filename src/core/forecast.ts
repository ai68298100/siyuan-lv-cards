/**
 * 学习日历与负载预测（T14 · docs/41 P0 · docs/42 §3.11/§4，纯逻辑 node 可单测）。
 * 数据口径（docs/40 数据边界）：
 * - 过去着色 = 本地 revlog 按日复习量（调用方传入）；
 * - 未来负载 = 内核 riff 卡片的 due 时间（getRiffCards blocks[].riffCard.due，"YYYYMMDDHHmmss"）；
 * - 新卡（state=0）按每日新卡上限（dailyNewTarget）摊到未来，不做无限堆积的假预测。
 */

export interface ForecastCardInput {
    /** 内核 due："YYYYMMDDHHmmss" 或 ISO；缺省按 now 处理 */
    due: string;
    /** riff state：0=新卡 */
    state: number;
}

export interface ForecastDay {
    /** 本地 YYYY-MM-DD */
    date: string;
    /** 该日到期（含积压顺延到今天）的复习卡 */
    reviews: number;
    /** 该日摊入的新卡 */
    news: number;
}

export interface ForecastResult {
    days: ForecastDay[];
    /** 预测窗口之外的到期量 */
    laterCount: number;
    /** 参与统计的卡片数 */
    coveredTotal: number;
    /** 因缺 due 未参与统计的卡片数 */
    skippedTotal: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 本地时区 YYYY-MM-DD */
export function localDateISO(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 解析内核 due（"YYYYMMDDHHmmss" 或 ISO）；失败返回 null */
export function parseCardDue(due: string): Date | null {
    if (!due) return null;
    const compact = due.replace(/[-: T]/g, "").slice(0, 14);
    if (/^\d{14}$/.test(compact)) {
        const d = new Date(
            Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8)),
            Number(compact.slice(8, 10)), Number(compact.slice(10, 12)), Number(compact.slice(12, 14)),
        );
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(due);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 未来负载预测：复习卡按 due 落日（今天的积压计入今天），新卡按每日上限摊入。
 * 独立于调度器（ADR-3）：预测只读，不改变任何卡的到期。
 */
export function buildForecast(
    cards: ForecastCardInput[],
    opts: { today?: Date; horizonDays?: number; dailyNewTarget?: number } = {},
): ForecastResult {
    const today = opts.today ?? new Date();
    const horizon = Math.max(1, opts.horizonDays ?? 14);
    const newTarget = Math.max(0, opts.dailyNewTarget ?? 0);

    const days: ForecastDay[] = [];
    for (let i = 0; i < horizon; i++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
        days.push({ date: localDateISO(d), reviews: 0, news: 0 });
    }
    const index = new Map(days.map((d, i) => [d.date, i]));

    let laterCount = 0;
    let newTotal = 0;
    let coveredTotal = 0;
    let skippedTotal = 0;

    for (const card of cards) {
        const due = parseCardDue(card.due ?? "");
        if (!due) {
            skippedTotal += 1;
            continue;
        }
        coveredTotal += 1;
        if (card.state === 0) {
            newTotal += 1;
            continue;
        }
        const key = localDateISO(due);
        const i = index.get(key);
        if (i === undefined) {
            const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            if (due < dayStart) {
                days[0].reviews += 1; // 积压计入今天，不藏负数
            } else {
                laterCount += 1;
            }
        } else {
            days[i].reviews += 1;
        }
    }

    // 新卡摊入：今天起逐日灌上限，剩余留 0（如实——没有排期就不预测）
    let news = newTotal;
    for (const day of days) {
        if (news <= 0) break;
        const take = Math.min(news, newTarget);
        day.news += take;
        news -= take;
    }

    return { days, laterCount, coveredTotal, skippedTotal };
}

// ---- 月历格子 ----

export type CalendarTone =
    | "empty" | "today"
    | "past1" | "past2" | "past3"
    | "future1" | "future2" | "future3";

export interface CalendarCell {
    /** 本地 YYYY-MM-DD；null = 月首/尾补位 */
    date: string | null;
    day: number;
    tone: CalendarTone;
}

const heatLevel = (n: number): 0 | 1 | 2 | 3 => (n <= 0 ? 0 : n <= 5 ? 1 : n <= 15 ? 2 : 3);
const loadLevel = (n: number): 0 | 1 | 2 | 3 => (n <= 0 ? 0 : n <= 5 ? 1 : n <= 15 ? 2 : 3);

/**
 * 月历格子（周一开头）；过去按复习量着色（1-3 档热力），未来按到期量着色（1-3 档负载），今日单独标示。
 * reviewsByDate/dueByDate：YYYY-MM-DD → 数量；缺日期按 0。
 */
export function buildMonthGrid(
    year: number,
    month: number,
    today: Date,
    reviewsByDate: Map<string, number>,
    dueByDate: Map<string, number>,
): CalendarCell[] {
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // 周一=0
    const todayISO = localDateISO(today);

    const cells: CalendarCell[] = [];
    for (let i = 0; i < offset; i++) cells.push({ date: null, day: 0, tone: "empty" });
    for (let d = 1; d <= daysInMonth; d++) {
        const date = `${year}-${pad(month)}-${pad(d)}`;
        let tone: CalendarTone;
        if (date === todayISO) {
            tone = "today";
        } else if (date < todayISO) {
            const lvl = heatLevel(reviewsByDate.get(date) ?? 0);
            tone = lvl === 0 ? "empty" : (`past${lvl}` as CalendarTone);
        } else {
            const lvl = loadLevel(dueByDate.get(date) ?? 0);
            tone = lvl === 0 ? "empty" : (`future${lvl}` as CalendarTone);
        }
        cells.push({ date, day: d, tone });
    }
    return cells;
}

/** 从预测结果取「date → 到期量」映射（月历未来着色用） */
export function dueMapFromForecast(days: ForecastDay[]): Map<string, number> {
    return new Map(days.map(d => [d.date, d.reviews + d.news]));
}
