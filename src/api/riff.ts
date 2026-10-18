/**
 * 思源内核 /api/riff/* 闪卡 API 的类型化封装。
 * 端点与字段名均按内核源码 kernel/apicontract/riff.go 建模（3.8.x）。
 */
import { postJSON, type RequestOptions } from "@/libs/request";
import { unwrapKernelData } from "@/libs/kernel-response";

async function riff<T>(endpoint: string, payload: Record<string, unknown> = {}, options: RequestOptions = {}): Promise<T> {
    const resp = await postJSON<unknown>(`/api/riff/${endpoint}`, payload, options);
    return unwrapKernelData<T>(resp);
}

/** 同一前端生命周期内的写入单飞：双击/重复事件共享结果，失败后自动移除以便用户重试。 */
const writeFlights = new Map<string, Promise<unknown>>();
function riffWrite<T>(endpoint: string, payload: Record<string, unknown> = {}): Promise<T> {
    const key = `riff-write:${endpoint}:${JSON.stringify(payload)}`;
    const existing = writeFlights.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const pending = riff<T>(endpoint, payload).finally(() => {
        if (writeFlights.get(key) === pending) writeFlights.delete(key);
    });
    writeFlights.set(key, pending);
    void pending.catch(() => undefined);
    return pending;
}

/** Read-only calls may be coalesced and retried once for transient transport failures. */
function riffRead<T>(endpoint: string, payload: Record<string, unknown> = {}): Promise<T> {
    // Scope the latest-wins guard to the visible resource. Page/cursor changes
    // supersede an older response, while independent decks/scopes can load in
    // parallel during an aggregate due query.
    const scope = String(payload.deckID ?? payload.id ?? payload.rootID ?? payload.notebook ?? "");
    return riff<T>(endpoint, payload, {
        readOnly: true,
        retries: 1,
        dedupeKey: `${endpoint}:${JSON.stringify(payload)}`,
        latestKey: `riff:${endpoint}:${scope}`,
    });
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

export const getRiffDecks = () => riffRead<RiffDeck[]>("getRiffDecks");

export const createRiffDeck = (name: string) => riffWrite<RiffDeck>("createRiffDeck", { name });

export const renameRiffDeck = (deckID: string, name: string) => riffWrite<null>("renameRiffDeck", { deckID, name });

export const removeRiffDeck = (deckID: string) => riffWrite<null>("removeRiffDeck", { deckID });

// ---- 制卡 / 移除 ----

export const addRiffCards = (deckID: string, blockIDs: string[]) =>
    riffWrite<RiffDeck | null>("addRiffCards", { deckID, blockIDs });

export const removeRiffCards = (deckID: string, blockIDs: string[]) =>
    riffWrite<RiffDeck | null>("removeRiffCards", { deckID, blockIDs });

// ---- 到期队列与复习 ----

/**
 * 合并各卡组 due 查询结果：同卡多组只保留一次（内核按 (deckID,cardID) 计数，
 * 同块加入多组时逐组查询会重复返回），新/旧计数从合并后的卡面状态重算。
 */
export const mergeDeckDueResults = (parts: RiffDueCardsData[]): RiffDueCardsData => {
    const seen = new Set<string>();
    const cards: RiffDueCard[] = [];
    for (const part of parts) {
        for (const c of part?.cards ?? []) {
            if (seen.has(c.cardID)) continue;
            seen.add(c.cardID);
            cards.push(c);
        }
    }
    const newCount = cards.filter(c => c.state === CardState.New).length;
    return {
        cards,
        unreviewedCount: cards.length,
        unreviewedNewCardCount: newCount,
        unreviewedOldCardCount: cards.length - newCount,
    };
};

/**
 * 拉取到期卡。deckID 传空字符串表示全部卡包。
 * reviewedCards 传本场已复习的 cardID 列表（与官方前端一致，供内核增量计算）。
 *
 * 「全部卡包」按组遍历合并：内核 3.8.6 的 deckID="" 全局查询不返回任何到期卡
 * （宿主自带闪卡面板同样为 0；API/UI 建卡、新卡与已排期到期卡均不可见，deck 域正常，
 * 隔离靶场已复现定性）。逐组查询 + 去重合并让角标/总览/复习在全局口径下保持可用；
 * 任一非空卡组查询失败时整体拒绝，避免把不完整队列伪装成完整结果并进入共享缓存。
 * 没有非空卡组时返回空集合。
 */
export const getRiffDueCards = async (deckID = "", reviewedCardIDs: string[] = []): Promise<RiffDueCardsData> => {
    const reviewedCards = reviewedCardIDs.map(id => ({ cardID: id }));
    if (deckID) {
        return riffRead<RiffDueCardsData>("getRiffDueCards", { deckID, reviewedCards });
    }
    const decks = (await getRiffDecks()).filter(d => d.size > 0);
    const CONCURRENCY = 6;
    const parts: RiffDueCardsData[] = [];
    for (let i = 0; i < decks.length; i += CONCURRENCY) {
        const batch = await Promise.all(
            decks.slice(i, i + CONCURRENCY).map(d =>
                riffRead<RiffDueCardsData>("getRiffDueCards", { deckID: d.id, reviewedCards }),
            ),
        );
        parts.push(...batch);
    }
    return mergeDeckDueResults(parts);
};

/** 今日到期总数（全部卡包），供顶栏角标等轻量场景 */
export const getDueCount = async (): Promise<number> => {
    const data = await getRiffDueCards("");
    return data?.unreviewedCount ?? 0;
};

export const getTreeRiffDueCards = (rootID: string, reviewedCardIDs: string[] = []) =>
    riffRead<RiffDueCardsData>("getTreeRiffDueCards", { rootID, reviewedCards: reviewedCardIDs.map(id => ({ cardID: id })) });

export const getNotebookRiffDueCards = (notebook: string, reviewedCardIDs: string[] = []) =>
    riffRead<RiffDueCardsData>("getNotebookRiffDueCards", { notebook, reviewedCards: reviewedCardIDs.map(id => ({ cardID: id })) });

export type Rating = 1 | 2 | 3 | 4;

export const reviewRiffCard = (deckID: string, cardID: string, rating: Rating, reviewedCardIDs: string[] = []) =>
    riffWrite<null>("reviewRiffCard", { deckID, cardID, rating, reviewedCards: reviewedCardIDs.map(id => ({ cardID: id })) });

export const skipReviewRiffCard = (deckID: string, cardID: string) =>
    riffWrite<null>("skipReviewRiffCard", { deckID, cardID });

// ---- 浏览 / 管理 ----

/** 块去重（v0.206.10 修复 each_key_duplicate）：同一块可同时属于内置卡组与自定义卡组，内核会返回重复条目 */
function dedupBlocks(blocks: SearchBlock[]): SearchBlock[] {
    const seen = new Set<string>();
    return blocks.filter(b => {
        if (!b.id || seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
    });
}

/** 全局/文档/笔记本三种粒度的卡片浏览；id 为空时全局。块按 ID 去重（防 Svelte each 重复键）。 */
export const getRiffCards = async (id = "", page = 1, pageSize = 20): Promise<RiffCardsData> => {
    const data = await riffRead<RiffCardsData>("getRiffCards", { id, page, pageSize });
    return { ...data, blocks: dedupBlocks(data.blocks) };
};

export const getTreeRiffCards = async (id: string, page = 1, pageSize = 20): Promise<RiffCardsData> => {
    const data = await riffRead<RiffCardsData>("getTreeRiffCards", { id, page, pageSize });
    return { ...data, blocks: dedupBlocks(data.blocks) };
};

export const getNotebookRiffCards = async (id: string, page = 1, pageSize = 20): Promise<RiffCardsData> => {
    const data = await riffRead<RiffCardsData>("getNotebookRiffCards", { id, page, pageSize });
    return { ...data, blocks: dedupBlocks(data.blocks) };
};

export const getRiffCardsByBlockIDs = (blockIDs: string[]) =>
    riffRead<{ blocks: SearchBlock[] }>("getRiffCardsByBlockIDs", { blockIDs });

/** type: "0" 全部 / "1" 笔记本(id) / "2" 文档(id)；deckID 可选限定卡包 */
export const resetRiffCards = (type: "0" | "1" | "2", id: string, deckID = "", blockIDs: string[] = []) =>
    riffWrite<null>("resetRiffCards", { type, id, deckID, blockIDs });

export const batchSetRiffCardsDueTime = (cardDues: { id: string; due: string }[]) =>
    riffWrite<null>("batchSetRiffCardsDueTime", { cardDues });
