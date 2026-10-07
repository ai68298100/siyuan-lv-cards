/**
 * 卡组仪表盘（T-卡组 · docs/41 P1 · 纯逻辑 node 可单测）。
 * 口径（docs/28 数据边界）：
 * - 复习/遗忘/保持率/顽固卡全部来自本地复习日志（revlog 条目自带 deckID）；
 * - 今日到期/新卡来自内核 getRiffDueCards(deckID)（调用方预取后传入）；
 * - 保持率样本不足（<minRetentionSamples）如实标 null；「顽固卡」= 窗口内遗忘 ≥leechForgotten 次的卡，
 *   是近窗口的近似口径，不冒充内核的全量烂卡判定。
 */

export interface DeckDashEntry {
    ts: number;
    deckID: string;
    cardID: string;
    rating: number;
}

export interface DeckDashDue {
    due: number;
    newCards: number;
}

export interface DeckDashboardRow {
    deckID: string;
    reviews7: number;
    forgotten7: number;
    dueToday: number;
    newCount: number;
    /** 近 30 天保持率（rating>1 占比）0-100；样本不足为 null */
    retention: number | null;
    /** 窗口内遗忘 ≥ leechForgotten 次的卡数（近似顽固卡） */
    leeches: number;
}

export interface DeckDashOptions {
    now?: Date;
    /** 活跃窗口（天）：复习/遗忘计数口径，默认 7 */
    activeDays?: number;
    /** 保持率窗口（天），默认 30 */
    retentionDays?: number;
    /** 保持率最小样本数，低于则 null，默认 8 */
    minRetentionSamples?: number;
    /** 顽固卡遗忘次数阈值，默认 3 */
    leechForgotten?: number;
}

const DAY = 86400000;

export function buildDeckDashboard(
    entries: DeckDashEntry[],
    deckOrder: string[],
    dueByDeck: Map<string, DeckDashDue>,
    opts: DeckDashOptions = {},
): DeckDashboardRow[] {
    const now = opts.now ?? new Date();
    const activeDays = opts.activeDays ?? 7;
    const retentionDays = opts.retentionDays ?? 30;
    const minSamples = opts.minRetentionSamples ?? 8;
    const leechForgotten = opts.leechForgotten ?? 3;

    const activeStart = now.getTime() - (activeDays - 1) * DAY;
    const retentionStart = now.getTime() - (retentionDays - 1) * DAY;

    const rows = new Map<string, DeckDashboardRow>();
    const ensure = (deckID: string): DeckDashboardRow => {
        let r = rows.get(deckID);
        if (!r) {
            const due = dueByDeck.get(deckID);
            r = {
                deckID,
                reviews7: 0,
                forgotten7: 0,
                dueToday: due?.due ?? 0,
                newCount: due?.newCards ?? 0,
                retention: null,
                leeches: 0,
            };
            rows.set(deckID, r);
        }
        return r;
    };
    for (const id of deckOrder) ensure(id);

    // 顽固卡：窗口内按 (deckID, cardID) 聚合遗忘次数
    const forgetByCard = new Map<string, number>();

    for (const e of entries) {
        const inRetention = e.ts >= retentionStart && e.ts <= now.getTime() + 1000;
        if (!inRetention) continue;
        const row = ensure(e.deckID);
        const isPass = e.rating > 1;
        if (e.ts >= activeStart) {
            if (isPass) row.reviews7 += 1;
            else row.forgotten7 += 1;
        }
        if (e.rating === 1) {
            const key = `${e.deckID}\n${e.cardID}`;
            const n = (forgetByCard.get(key) ?? 0) + 1;
            forgetByCard.set(key, n);
        }
    }

    // 保持率（近 retentionDays 全量：通过/失败样本）与顽固卡计数落地
    const passBy = new Map<string, number>();
    const failBy = new Map<string, number>();
    for (const e of entries) {
        if (e.ts < retentionStart || e.ts > now.getTime() + 1000) continue;
        const key = e.deckID;
        if (e.rating > 1) passBy.set(key, (passBy.get(key) ?? 0) + 1);
        else failBy.set(key, (failBy.get(key) ?? 0) + 1);
    }
    for (const [deckID, row] of rows) {
        const pass = passBy.get(deckID) ?? 0;
        const fail = failBy.get(deckID) ?? 0;
        row.retention = pass + fail < minSamples ? null : Math.round((pass / (pass + fail)) * 100);
    }
    for (const [key, n] of forgetByCard) {
        if (n < leechForgotten) continue;
        const deckID = key.split("\n")[0];
        if (rows.has(deckID)) rows.get(deckID)!.leeches += 1;
    }

    // 排行：今日到期多者在前，其次近 7 天复习量
    return [...rows.values()].sort((a, b) =>
        (b.dueToday - a.dueToday) || (b.reviews7 - a.reviews7));
}
