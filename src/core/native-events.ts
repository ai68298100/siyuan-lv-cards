/**
 * 原生复习界面评分事件（eventBus `click-flashcard-action`）的规范化与幂等（AQ-5）：
 * - rating 严格收敛为 0-4 整数（0 仅限显式 skip），非法丢弃并进诊断；
 * - 事件时间优先取内核字段，缺失时回退本地时间并标记估算；
 * - 同一事件（eventId 或 cardID+时间窗）只记账一次，native/plugin 双来源不重复。
 */

export interface NativeRatingEvent {
    cardID: string;
    deckID: string;
    blockID: string;
    /** 1-4 为评分；0 仅表示内核显式跳过 */
    rating: 0 | 1 | 2 | 3 | 4;
    /** 事件时间戳（毫秒） */
    ts: number;
    /** true = 内核未带时间，回退本地时钟（仅诊断口径，不补造评分） */
    timeEstimated: boolean;
}

/**
 * 规范化一条原生事件；返回 null 表示事件不构成一次记账（缺卡 ID、非法评分）。
 * 宽容对象形状但严格字段类型：评分必须是 1-4 整数（或显式 skip 的 0）。
 */
export function normalizeNativeCardAction(detail: unknown, now = Date.now()): NativeRatingEvent | null {
    if (!detail || typeof detail !== "object") {
        return null;
    }
    const d = detail as Record<string, unknown>;
    const cardID = typeof d.cardID === "string" && d.cardID ? d.cardID : typeof d.id === "string" ? d.id : "";
    if (!cardID) {
        return null;
    }
    const action = typeof d.action === "string" ? d.action : "";
    const explicitSkip = action === "skip" || d.rating === 0 || d.level === 0;
    // 严格类型：评分字段必须是 number（字符串 "3" 等脏类型丢弃，AQ-5）
    const rawRating = typeof (d.rating ?? d.level) === "number" ? Number(d.rating ?? d.level) : NaN;
    let rating: 0 | 1 | 2 | 3 | 4;
    if (explicitSkip) {
        rating = 0;
    } else if (Number.isInteger(rawRating) && rawRating >= 1 && rawRating <= 4) {
        rating = rawRating as 1 | 2 | 3 | 4;
    } else {
        return null; // 5、-1、2.5 等非法定义为脏事件，丢弃并交给调用方记诊断
    }
    const rawTs = Number(d.ts ?? d.time);
    const timeEstimated = !Number.isFinite(rawTs) || rawTs <= 0;
    return {
        cardID,
        deckID: typeof d.deckID === "string" ? d.deckID : "",
        blockID: typeof d.blockID === "string" ? d.blockID : "",
        rating,
        ts: timeEstimated ? now : rawTs,
        timeEstimated,
    };
}

/**
 * 幂等去重器（AQ-5）：eventId 命中即重复；无 eventId 时同卡在时间窗内只记一次。
 * 环形容量上限防止长期驻留膨胀。
 */
export class NativeEventDeduper {
    private readonly windowMs: number;
    private readonly capacity: number;
    private readonly byEvent = new Set<string>();
    private readonly byCard = new Map<string, number>();

    constructor(windowMs = 1000, capacity = 500) {
        this.windowMs = windowMs;
        this.capacity = capacity;
    }

    /** true = 重复事件，应丢弃 */
    seen(eventId?: unknown, cardID?: string, ts = Date.now()): boolean {
        this.prune(ts);
        if (typeof eventId === "string" && eventId) {
            if (this.byEvent.has(eventId)) {
                return true;
            }
            this.byEvent.add(eventId);
        }
        if (cardID) {
            const last = this.byCard.get(cardID);
            if (last !== undefined && ts - last < this.windowMs) {
                return true;
            }
            this.byCard.set(cardID, ts);
        }
        return false;
    }

    private prune(now: number) {
        if (this.byEvent.size > this.capacity) {
            this.byEvent.clear();
        }
        if (this.byCard.size > this.capacity) {
            for (const [card, ts] of this.byCard) {
                if (now - ts >= this.windowMs) {
                    this.byCard.delete(card);
                }
            }
            if (this.byCard.size > this.capacity) {
                this.byCard.clear();
            }
        }
    }
}
