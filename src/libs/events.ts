/**
 * AX-2 事件契约单一事实源：`lv-cards:*` 生态事件的 version / payload / 时间戳精度。
 *
 * 契约规则（docs/14 §8 的代码化）：
 * - 事件名固定前缀 `lv-cards:`；v=1（破坏性变更须升 v 并保留旧监听一个过渡期）；
 * - 所有事件必带 `plugin: "lv-cards"`（来源标识）与 `ts`（毫秒精度 Unix 时间，
 *   Date.now() 语义，供消费方幂等去重与乱序容忍；同毫秒内多事件以 cardID+rating 组合幂等）；
 * - payload 字段只增不改：消费方必须宽容读取（缺失字段按旧版处理）。
 */

export const EVENT_SOURCE = "lv-cards" as const;
export const EVENT_VERSION = 1 as const;

export interface LvEventBase {
    plugin: typeof EVENT_SOURCE;
    v: typeof EVENT_VERSION;
    /** 毫秒时间戳（Date.now()），消费方幂等/排序用 */
    ts: number;
}

export type LvCardSource = "plugin" | "native";

export interface ReviewedPayload {
    cardID: string;
    deckID: string;
    blockID: string;
    rating: number;
    source: LvCardSource;
}

export interface CardsCreatedPayload {
    deckID: string;
    count: number;
    blockIDs: string[];
}

export interface GatewayChangedPayload {
    state: string;
}

/**
 * 本地插件存储因同步/其他前端写入而重新载入后的通知载荷。
 * files 仅作为诊断提示，消费方不应依赖其具体路径格式。
 */
export interface StoresChangedPayload {
    files?: string[];
}

export interface SessionFinishedSummary {
    [key: string]: unknown;
}

/** 事件名常量（emit/on 共用，杜绝裸字符串漂移） */
export const LV_EVENTS = {
    reviewed: "lv-cards:reviewed",
    streakChanged: "lv-cards:streak-changed",
    cardsCreated: "lv-cards:cards-created",
    sessionFinished: "lv-cards:session-finished",
    settingsChanged: "lv-cards:settings-changed",
    gatewayChanged: "lv-cards:gateway-changed",
    storesChanged: "lv-cards:stores-changed",
} as const;

/** 基础字段（plugin/v/ts）统一填充 */
export const lvEventBase = (now: () => number = Date.now): LvEventBase => ({
    plugin: EVENT_SOURCE,
    v: EVENT_VERSION,
    ts: now(),
});

export const reviewedEvent = (p: ReviewedPayload, now: () => number = Date.now): LvEventBase & ReviewedPayload => ({
    ...lvEventBase(now),
    ...p,
});

export const streakChangedEvent = (streak: number, now: () => number = Date.now): LvEventBase & { streak: number } => ({
    ...lvEventBase(now),
    streak,
});

export const cardsCreatedEvent = (p: CardsCreatedPayload, now: () => number = Date.now): LvEventBase & CardsCreatedPayload => ({
    ...lvEventBase(now),
    ...p,
});

export const sessionFinishedEvent = (summary: SessionFinishedSummary, now: () => number = Date.now): LvEventBase & { summary: SessionFinishedSummary } => ({
    ...lvEventBase(now),
    summary,
});

export const settingsChangedEvent = (now: () => number = Date.now): LvEventBase => lvEventBase(now);

export const gatewayChangedEvent = (state: string, now: () => number = Date.now): LvEventBase & GatewayChangedPayload => ({
    ...lvEventBase(now),
    state,
});

export const storesChangedEvent = (files?: string[], now: () => number = Date.now): LvEventBase & StoresChangedPayload => ({
    ...lvEventBase(now),
    ...(files?.length ? { files: [...files] } : {}),
});
