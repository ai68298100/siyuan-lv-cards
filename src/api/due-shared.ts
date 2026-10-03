/**
 * AT-4 due 共享缓存实例（进程级单例）：badge 心跳、总览刷新、挑战/配对进场、
 * 每日提醒等轻量读取统一走这里；复习会话的 loadQueue 带本场 reviewedIDs 且逐卡变化，
 * 保持直连不经缓存。条目按 scope key（""=全部卡包，"deck:x"，"notebook:y"，"tree:z"）隔离。
 * 失效时机（invalidate）：appendRevlog（插件/原生评分漏斗）、cards-created、改期（batchSetRiffCardsDueTime）。
 */
import { addRiffCards as kernelAddRiffCards, getRiffDueCards, type RiffDueCardsData } from "./riff";
import { createDueCache } from "../libs/due-cache";

export const dueCache = createDueCache<RiffDueCardsData>({ fetcher: key => getRiffDueCards(key) });

/** 今日到期总数（全部卡包）：badge/提醒走共享缓存，与总览等并发读取合并为一次内核请求 */
export const cachedDueCount = async (): Promise<number> => {
    const data = await dueCache.get("");
    return data?.unreviewedCount ?? 0;
};

/** 任何改变内核 due 的事实（评分/建卡/改期）发生后调用：下一次读取立即拉新 */
export const invalidateDueCache = () => dueCache.invalidate();

/** 制卡统一入口（index.ts 全部建卡路径经此）：成功后新卡即时到期，同步失效共享缓存 */
export const addRiffCards = async (deckID: string, blockIDs: string[]) => {
    const r = await kernelAddRiffCards(deckID, blockIDs);
    invalidateDueCache();
    return r;
};
