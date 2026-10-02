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
    /** 曾有有效评分的卡 ID（AQ-21）：明细被 2 万条上限截断后，首评语义仍由此保留 */
    knownCards?: string[];
}

const EMPTY: RevlogData = { version: 1, entries: [], days: {} };

/** knownCards 与明细共用上限（AQ-21），保证存储规模同阶 */
const KNOWN_CARDS_MAX = 20000;

/** 聚合快照口径（AQ-21）：日期在明细覆盖范围内的从明细重算；
 * 早于最早保留明细日期的聚合是截断前历史快照，无法重算——结构合法则原样保留 */
function dayStatWellFormed(v: unknown): v is DayStat {
    if (!v || typeof v !== "object") {
        return false;
    }
    const d = v as Record<string, unknown>;
    return [d.new, d.review, d.forget].every(x => Number.isSafeInteger(x) && (x as number) >= 0);
}

/** 卡是否已有有效评分历史（AQ-21）：明细优先（多数命中可早退），截断卡再查 knownCards */
function cardHasHistory(entries: RevlogEntry[], knownCards: string[] | undefined, cardID: string): boolean {
    if (entries.some(e => e.cardID === cardID && e.rating > 0)) {
        return true;
    }
    return knownCards !== undefined && knownCards.includes(cardID);
}

export function emptyRevlog(): RevlogData {
    return JSON.parse(JSON.stringify(EMPTY));
}

/** ts 合法范围：非负且不超过 2100 年（同步损坏/伪造时间戳不进入统计） */
const TS_MAX = 4102444800000;

/** 单条运行时清洗（AQ-3）：非法条目剔除而非整库兜底，NaN/越界评分/非字符串 ID 一律拒绝 */
function sanitizeEntry(raw: unknown): RevlogEntry | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const o = raw as Record<string, unknown>;
    const ts = Number(o.ts);
    if (!Number.isFinite(ts) || ts < 0 || ts > TS_MAX) {
        return null;
    }
    if (typeof o.cardID !== "string" || !o.cardID) {
        return null;
    }
    const rating = Number(o.rating);
    if (!Number.isInteger(rating) || rating < 0 || rating > 4) {
        return null;
    }
    return {
        ts,
        cardID: o.cardID,
        deckID: typeof o.deckID === "string" ? o.deckID : "",
        blockID: typeof o.blockID === "string" ? o.blockID : "",
        rating,
        source: o.source === "native" ? "native" : "plugin",
    };
}

export function normalizeRevlog(raw: unknown): RevlogData {
    if (!raw || typeof raw !== "object") {
        return emptyRevlog();
    }
    const obj = raw as Partial<RevlogData>;
    const entries = Array.isArray(obj.entries)
        ? obj.entries.map(sanitizeEntry).filter((e): e is RevlogEntry => e !== null)
        : [];
    // knownCards（AQ-21）：存储值 ∪ 明细内有评分的卡，去重限量；脏类型整表丢弃
    const known = new Set<string>(
        Array.isArray(obj.knownCards) ? obj.knownCards.filter((x): x is string => typeof x === "string" && !!x) : [],
    );
    for (const e of entries) {
        if (e.rating > 0 && known.size < KNOWN_CARDS_MAX) {
            known.add(e.cardID);
        }
    }
    const data: RevlogData = {
        version: 1,
        entries,
        // 原始 days 传入 recalcDays：截断前日期按快照保留（结构校验），其余由明细重建
        days: obj.days && typeof obj.days === "object" ? (obj.days as Record<string, DayStat>) : {},
        knownCards: [...known].slice(0, KNOWN_CARDS_MAX),
    };
    recalcDays(data);
    return data;
}

export function localDate(ts: number): string {
    const d = new Date(ts);
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}

export function appendRevlog(data: RevlogData, entry: RevlogEntry): void {
    if (entry.rating > 0) {
        // 首次有效评分计为"新"，此后计为"复习"（AJ1）；knownCards 兜住截断卡（AQ-21）
        const seen = cardHasHistory(data.entries, data.knownCards, entry.cardID);
        const date = localDate(entry.ts);
        const day = data.days[date] ?? { new: 0, review: 0, forget: 0 };
        if (seen) {
            day.review += 1;
        } else {
            day.new += 1;
            if (!data.knownCards) {
                data.knownCards = [];
            }
            if (data.knownCards.length < KNOWN_CARDS_MAX && !data.knownCards.includes(entry.cardID)) {
                data.knownCards.push(entry.cardID);
            }
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

/** 由明细重算每日聚合（幂等）。升级/修数后调用一次即可。
 * AQ-21 快照策略：早于最早保留明细日期的旧聚合原样保留（明细已截断无法重算），其余重建。 */
export function recalcDays(data: RevlogData): void {
    const oldDays = data.days;
    const seen = new Set<string>();
    let minDate: string | null = null;
    const rebuilt: Record<string, DayStat> = {};
    for (const e of data.entries) {
        if (e.rating <= 0) {
            continue;
        }
        const date = localDate(e.ts);
        if (minDate === null || date < minDate) {
            minDate = date;
        }
        const day = rebuilt[date] ?? { new: 0, review: 0, forget: 0 };
        if (seen.has(e.cardID)) {
            day.review += 1;
        } else {
            day.new += 1;
            seen.add(e.cardID);
        }
        if (e.rating === 1) {
            day.forget += 1;
        }
        rebuilt[date] = day;
    }
    const out: Record<string, DayStat> = {};
    if (minDate !== null) {
        for (const [date, stat] of Object.entries(oldDays)) {
            if (date < minDate && dayStatWellFormed(stat)) {
                out[date] = stat;
            }
        }
    }
    Object.assign(out, rebuilt);
    data.days = out;
}

export interface MergeResult {
    added: number;
    skipped: number;
    /** 分叉数（M10·FR3）：同 ts+cardID 但评分不同——多设备对同一时刻的不同记录，默认跳过并计数 */
    forks: number;
    /** 分叉明细（同 ts+cardID 的 导入评分 vs 本地评分），供合并预览展示 */
    forkSamples: { ts: number; cardID: string; imported: number; local: number }[];
}

export interface MergeOptions {
    /** 分叉处理：skip=跳过导入侧（默认，保守）；preferImport=以导入为准覆盖本地同刻记录 */
    onFork?: "skip" | "preferImport";
}

/** 导入合并（M10·FR1）：按 ts+cardID+rating+source 去重，带结构/数值清洗与批量上限（AK 组要求）；
 * 分叉检测（M10·FR3）：同 ts+cardID 评分冲突时按 onFork 策略处理并回报明细 */
export function mergeRevlog(data: RevlogData, imported: unknown, opts: MergeOptions = {}): MergeResult {
    if (!imported || typeof imported !== "object" || !Array.isArray((imported as any).entries)) {
        throw new Error("invalid revlog file");
    }
    const key = (e: RevlogEntry) => `${e.ts}|${e.cardID}|${e.rating}|${e.source}`;
    const pairKey = (ts: number, cardID: string) => `${ts}|${cardID}`;
    const seen = new Set(data.entries.map(key));
    const localPairs = new Map<string, number>();
    for (const e of data.entries) {
        const pk = pairKey(e.ts, e.cardID);
        if (!localPairs.has(pk)) {
            localPairs.set(pk, e.rating);
        }
    }
    const incoming = (imported as any).entries as any[];
    if (incoming.length > 50000) {
        throw new Error("file too large");
    }
    let added = 0;
    let skipped = 0;
    let forks = 0;
    const forkSamples: MergeResult["forkSamples"] = [];
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
        // 分叉：同 ts+cardID 本地已有不同评分记录
        const pk = pairKey(ts, entry.cardID);
        const localRating = localPairs.get(pk);
        if (localRating !== undefined && localRating !== rating) {
            forks += 1;
            if (forkSamples.length < 20) {
                forkSamples.push({ ts, cardID: entry.cardID, imported: rating, local: localRating });
            }
            if ((opts.onFork ?? "skip") === "skip") {
                skipped += 1;
                continue;
            }
            // preferImport：移除本地同刻记录后按导入写入（recalcDays 由调用方尾部统一执行）
            const before = data.entries.length;
            data.entries = data.entries.filter(e => !(e.ts === ts && e.cardID === entry.cardID));
            seen.clear();
            for (const e of data.entries) {
                seen.add(key(e));
            }
            skipped += before - data.entries.length;
        }
        seen.add(k);
        localPairs.set(pk, rating);
        data.entries.push(entry);
        added += 1;
    }
    if (data.entries.length > 20000) {
        data.entries = data.entries.slice(-20000);
    }
    // knownCards 并集（AQ-21）：导入的卡同样保留首评语义
    const known = new Set(data.knownCards ?? []);
    for (const e of data.entries) {
        if (e.rating > 0) {
            known.add(e.cardID);
        }
    }
    data.knownCards = [...known].slice(0, KNOWN_CARDS_MAX);
    recalcDays(data);
    return { added, skipped, forks, forkSamples };
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

export interface CurvePoint {
    days: number;
    /** 0-1，成功率 */
    rate: number;
    n: number;
}

/** 遗忘曲线实测点（M5）：相邻复习对按间隔天数落入桶，统计存活率 */
export function computeRetentionCurve(data: RevlogData, buckets: number[] = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60]): CurvePoint[] {
    const byCard = new Map<string, RevlogEntry[]>();
    for (const e of data.entries) {
        if (e.rating <= 0) {
            continue;
        }
        const arr = byCard.get(e.cardID) ?? [];
        arr.push(e);
        byCard.set(e.cardID, arr);
    }
    const stats = buckets.map(days => ({ days, n: 0, fails: 0 }));
    const bucketOf = (gap: number) => {
        let idx = -1;
        for (let i = 0; i < buckets.length; i++) {
            if (gap >= buckets[i]) {
                idx = i;
            }
        }
        return idx;
    };
    for (const [, entries] of byCard) {
        entries.sort((a, b) => a.ts - b.ts);
        for (let i = 1; i < entries.length; i++) {
            const gap = (entries[i].ts - entries[i - 1].ts) / 86400000;
            const idx = bucketOf(gap);
            if (idx < 0) {
                continue;
            }
            stats[idx].n += 1;
            if (entries[i].rating === 1) {
                stats[idx].fails += 1;
            }
        }
    }
    return stats
        .filter(s => s.n >= 3)
        .map(s => ({ days: s.days, rate: 1 - s.fails / s.n, n: s.n }));
}

export interface BatchStat {
    reviews: number;
    fails: number;
    /** 0-1，无样本返回 null */
    rate: number | null;
}

/** 指定 block 集合的复习保持率（M2·FR11 批次质量反哺 / M6·FR5 leech 共用） */
export function reviewStatsFor(data: RevlogData, blockIDs: string[]): BatchStat {
    const ids = new Set(blockIDs);
    const byCard = new Map<string, RevlogEntry[]>();
    for (const e of data.entries) {
        if (e.rating <= 0 || !ids.has(e.blockID)) {
            continue;
        }
        const arr = byCard.get(e.cardID) ?? [];
        arr.push(e);
        byCard.set(e.cardID, arr);
    }
    let reviews = 0;
    let fails = 0;
    for (const [, entries] of byCard) {
        entries.sort((a, b) => a.ts - b.ts);
        for (let i = 1; i < entries.length; i++) {
            reviews += 1;
            if (entries[i].rating === 1) {
                fails += 1;
            }
        }
    }
    return { reviews, fails, rate: reviews > 0 ? 1 - fails / reviews : null };
}

export interface LeechItem {
    cardID: string;
    blockID: string;
    lapses: number;
}

/** leech 烂卡：revlog 中遗忘次数 ≥ 阈值的卡（M6·FR5，起点=插件启用日） */
export function leechCards(data: RevlogData, threshold: number): LeechItem[] {
    const acc = new Map<string, LeechItem>();
    for (const e of data.entries) {
        if (e.rating !== 1) {
            continue;
        }
        const item = acc.get(e.cardID) ?? { cardID: e.cardID, blockID: e.blockID, lapses: 0 };
        item.lapses += 1;
        if (e.blockID) {
            item.blockID = e.blockID;
        }
        acc.set(e.cardID, item);
    }
    return [...acc.values()].filter(i => i.lapses >= threshold).sort((a, b) => b.lapses - a.lapses);
}

export interface RetentionTier {
    reviews: number;
    fails: number;
    /** 1 - fails/reviews，无样本返回 null */
    rate: number | null;
}

export interface RetentionResult {
    /** 新卡首次复审 */
    new: RetentionTier;
    /** 幼卡：距上次复习 <21 天 */
    young: RetentionTier;
    /** 成熟卡：距上次复习 ≥21 天 */
    mature: RetentionTier;
}

function emptyTier(): RetentionTier {
    return { reviews: 0, fails: 0, rate: null };
}

/** True Retention 分层保持率（M5·FR7 简版，revlog 推导）：相邻两次复习构成一次"回忆测试" */
export function computeRetention(data: RevlogData): RetentionResult {
    const byCard = new Map<string, RevlogEntry[]>();
    for (const e of data.entries) {
        if (e.rating <= 0) {
            continue;
        }
        const arr = byCard.get(e.cardID) ?? [];
        arr.push(e);
        byCard.set(e.cardID, arr);
    }
    const result: RetentionResult = { new: emptyTier(), young: emptyTier(), mature: emptyTier() };
    const bump = (gapDays: number, success: boolean, isFirstReview: boolean) => {
        const t = isFirstReview ? result.new : gapDays >= 21 ? result.mature : result.young;
        t.reviews += 1;
        if (!success) {
            t.fails += 1;
        }
        t.rate = t.reviews > 0 ? 1 - t.fails / t.reviews : null;
    };
    for (const [, entries] of byCard) {
        entries.sort((a, b) => a.ts - b.ts);
        let firstDone = false;
        let prev: RevlogEntry | null = null;
        for (const cur of entries) {
            if (!prev) {
                prev = cur;
                continue;
            }
            const gapDays = (cur.ts - prev.ts) / 86400000;
            bump(gapDays, cur.rating > 1, !firstDone);
            firstDone = true;
            prev = cur;
        }
    }
    return result;
}

export function isCardNew(data: RevlogData, cardID: string): boolean {
    return !cardHasHistory(data.entries, data.knownCards, cardID);
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

export interface WeekDelta {
    thisWeek: DayStat;
    lastWeek: DayStat;
    delta: DayStat;
}

/** 周期对比（M5）：本周（近 7 天）vs 上周（其前 7 天），含三项 delta */
export function weekCompare(data: RevlogData): WeekDelta {
    const sum = (arr: { stat: DayStat }[]): DayStat =>
        arr.reduce<DayStat>(
            (acc, d) => ({
                new: acc.new + d.stat.new,
                review: acc.review + d.stat.review,
                forget: acc.forget + d.stat.forget,
            }),
            { new: 0, review: 0, forget: 0 },
        );
    const thisWeek = sum(lastNDays(data, 7));
    const lastWeek = sum(lastNDays(data, 14).slice(0, 7));
    return {
        thisWeek,
        lastWeek,
        delta: {
            new: thisWeek.new - lastWeek.new,
            review: thisWeek.review - lastWeek.review,
            forget: thisWeek.forget - lastWeek.forget,
        },
    };
}

export interface Milestones {
    /** 有效复习总次数（不含 skip） */
    totalReviews: number;
    /** 活跃天数 */
    daysActive: number;
    /** 最长连续天数 */
    longestStreak: number;
    /** 当前连续天数 */
    currentStreak: number;
    /** 单日之最（新学+复习合计最高的一天） */
    bestDay: { date: string; count: number } | null;
    /** 下一里程碑（1000/5000/20000 阶梯）还差多少次 */
    nextGoal: { at: number; remaining: number } | null;
}

/** 里程碑统计（M5·FR7）：趣味数字聚合，纯本地 revlog 推导 */
export function calcMilestones(data: RevlogData): Milestones {
    const totalReviews = data.entries.filter(e => e.rating > 0).length;
    const activeDays = Object.entries(data.days)
        .filter(([, s]) => s.new + s.review > 0)
        .sort(([a], [b]) => a.localeCompare(b));
    // 最长/当前连续：按日期键扫描，缺口 >1 天即断
    let longest = 0;
    let run = 0;
    let prev: Date | null = null;
    for (const [key] of activeDays) {
        const cur = new Date(`${key}T00:00:00`);
        if (prev && cur.getTime() - prev.getTime() <= 2 * 86400000) {
            run += 1;
        } else {
            run = 1;
        }
        longest = Math.max(longest, run);
        prev = cur;
    }
    const best = activeDays.reduce<{ date: string; count: number } | null>((acc, [key, s]) => {
        const count = s.new + s.review;
        return !acc || count > acc.count ? { date: key, count } : acc;
    }, null);
    const goalAt = [1000, 5000, 20000, 100000].find(g => g > totalReviews);
    return {
        totalReviews,
        daysActive: activeDays.length,
        longestStreak: longest,
        currentStreak: calcStreak(data),
        bestDay: best,
        nextGoal: goalAt ? { at: goalAt, remaining: goalAt - totalReviews } : null,
    };
}

export interface XpResult {
    xp: number;
    level: number;
    /** 距下一级还差多少 XP */
    toNext: number;
}

/** XP/等级（M8·FR3，默认关）：xp = 复习×2 + 最长连击×15 + 活跃天×5；等级 = √(xp/50)+1 */
export function calcXp(data: RevlogData): XpResult {
    const m = calcMilestones(data);
    const xp = m.totalReviews * 2 + m.longestStreak * 15 + m.daysActive * 5;
    const level = Math.floor(Math.sqrt(xp / 50)) + 1;
    const nextLevelXp = 50 * level * level;
    return { xp, level, toNext: nextLevelXp - xp };
}
