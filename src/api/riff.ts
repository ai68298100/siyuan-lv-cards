/**
 * 思源内核 /api/riff/* 闪卡 API 的类型化封装。
 * 端点与字段名均按内核源码 kernel/apicontract/riff.go 建模（3.8.x）。
 */
import { fetchSyncPost } from "siyuan";

async function riff<T>(endpoint: string, payload: Record<string, unknown> = {}): Promise<T> {
    const resp = await fetchSyncPost(`/api/riff/${endpoint}`, payload);
    // AJ5：统一内核响应校验，非 0 一律抛本地化错误，禁止下游渲染 undefined
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
    return resp.data as T;
}

export interface RiffDeck {
    id: string;
    name: string;
    size: number;
    created: string;
    updated: string;
}

/** 复习状态（内核 riff 模块）：0 新卡 / 1 学习中 / 2 复习 */
export enum CardState {
    New = 0,
    Learning = 1,
    Review = 2,
}

export interface RiffDueCard {
    deckID: string;
    cardID: string;
    blockID: string;
    lapses: number;
    reps: number;
    state: CardState;
    lastReview: number;
    /** 按评分（1-4）预计算的下次到期时间 */
    nextDues: Record<string, string>;
}

export interface RiffDueCardsData {
    cards: RiffDueCard[];
    unreviewedCount: number;
    unreviewedNewCardCount: number;
    unreviewedOldCardCount: number;
}

export interface SearchBlock {
    id: string;
    parentID?: string;
    rootID?: string;
    content: string;
    tag?: string;
    path?: string;
    hPath?: string;
    name?: string;
    [key: string]: unknown;
}

export interface RiffCardsData {
    blocks: SearchBlock[];
    total: number;
    pageCount: number;
}

// ---- 卡包管理 ----

export const getRiffDecks = () => riff<RiffDeck[]>("getRiffDecks");

export const createRiffDeck = (name: string) => riff<RiffDeck>("createRiffDeck", { name });

export const renameRiffDeck = (deckID: string, name: string) => riff<null>("renameRiffDeck", { deckID, name });

export const removeRiffDeck = (deckID: string) => riff<null>("removeRiffDeck", { deckID });

// ---- 制卡 / 移除 ----

export const addRiffCards = (deckID: string, blockIDs: string[]) =>
    riff<RiffDeck | null>("addRiffCards", { deckID, blockIDs });

export const removeRiffCards = (deckID: string, blockIDs: string[]) =>
    riff<RiffDeck | null>("removeRiffCards", { deckID, blockIDs });

// ---- 到期队列与复习 ----

/**
 * 拉取到期卡。deckID 传空字符串表示全部卡包。
 * reviewedCards 传本场已复习的 cardID 列表（与官方前端一致，供内核增量计算）。
 */
export const getRiffDueCards = (deckID = "", reviewedCardIDs: string[] = []) =>
    riff<RiffDueCardsData>("getRiffDueCards", { deckID, reviewedCards: reviewedCardIDs.map(id => ({ cardID: id })) });

/** 今日到期总数（全部卡包），供顶栏角标等轻量场景 */
export const getDueCount = async (): Promise<number> => {
    const data = await getRiffDueCards("");
    return data?.unreviewedCount ?? 0;
};

export const getTreeRiffDueCards = (rootID: string, reviewedCardIDs: string[] = []) =>
    riff<RiffDueCardsData>("getTreeRiffDueCards", { rootID, reviewedCards: reviewedCardIDs.map(id => ({ cardID: id })) });

export const getNotebookRiffDueCards = (notebook: string, reviewedCardIDs: string[] = []) =>
    riff<RiffDueCardsData>("getNotebookRiffDueCards", { notebook, reviewedCards: reviewedCardIDs.map(id => ({ cardID: id })) });

export type Rating = 1 | 2 | 3 | 4;

export const reviewRiffCard = (deckID: string, cardID: string, rating: Rating, reviewedCardIDs: string[] = []) =>
    riff<null>("reviewRiffCard", { deckID, cardID, rating, reviewedCards: reviewedCardIDs.map(id => ({ cardID: id })) });

export const skipReviewRiffCard = (deckID: string, cardID: string) =>
    riff<null>("skipReviewRiffCard", { deckID, cardID });

// ---- 浏览 / 管理 ----

/** 全局/文档/笔记本三种粒度的卡片浏览；id 为空时全局。 */
export const getRiffCards = (id = "", page = 1, pageSize = 20) =>
    riff<RiffCardsData>("getRiffCards", { id, page, pageSize });

export const getTreeRiffCards = (id: string, page = 1, pageSize = 20) =>
    riff<RiffCardsData>("getTreeRiffCards", { id, page, pageSize });

export const getNotebookRiffCards = (id: string, page = 1, pageSize = 20) =>
    riff<RiffCardsData>("getNotebookRiffCards", { id, page, pageSize });

export const getRiffCardsByBlockIDs = (blockIDs: string[]) =>
    riff<{ blocks: SearchBlock[] }>("getRiffCardsByBlockIDs", { blockIDs });

/** type: "0" 全部 / "1" 笔记本(id) / "2" 文档(id)；deckID 可选限定卡包 */
export const resetRiffCards = (type: "0" | "1" | "2", id: string, deckID = "", blockIDs: string[] = []) =>
    riff<null>("resetRiffCards", { type, id, deckID, blockIDs });

export const batchSetRiffCardsDueTime = (cardDues: { id: string; due: string }[]) =>
    riff<null>("batchSetRiffCardsDueTime", { cardDues });
