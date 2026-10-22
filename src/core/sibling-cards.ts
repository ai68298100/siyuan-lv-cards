/**
 * 同源兄弟卡防剧透与分散机制（对标 Anki Bury Siblings 机制）。
 * 当一个原笔记块包含多个挖空或正反双向卡时，同一会话中同日出现会产生即时语境剧透。
 * 本模块提供纯函数，用于同源兄弟卡识别、安全分散与推迟，确保每一次提取努力（Desirable Difficulty）真实有效。
 */

export interface SiblingCardLike {
    blockID: string;
    cardID: string;
    [key: string]: unknown;
}

/**
 * 依据 blockID 过滤同源兄弟卡：
 * 同一会话队列中，每个源块优先仅保留 1 张卡片进行测试，其余兄弟卡推迟到后续复习，杜绝虚假熟练感。
 */
export function filterBurySiblings<T extends SiblingCardLike>(cards: readonly T[]): {
    retained: T[];
    buriedCount: number;
    buriedBlockIDs: string[];
} {
    const seen = new Set<string>();
    const retained: T[] = [];
    const buriedBlockIDs: string[] = [];

    for (const card of cards) {
        const bid = String(card.blockID ?? "");
        if (!bid) {
            retained.push(card);
            continue;
        }
        if (!seen.has(bid)) {
            seen.add(bid);
            retained.push(card);
        } else {
            buriedBlockIDs.push(bid);
        }
    }

    return {
        retained,
        buriedCount: cards.length - retained.length,
        buriedBlockIDs,
    };
}

/**
 * 同源卡片最大间距分散（Disperse Siblings）：
 * 若用户希望在同一长会话中完成所有卡片，将相同 blockID 的兄弟卡均匀打散到队列前后两端，拉长间隔。
 */
export function disperseSiblings<T extends SiblingCardLike>(cards: readonly T[]): T[] {
    if (cards.length <= 2) return [...cards];

    const buckets = new Map<string, T[]>();
    const noBlock: T[] = [];

    for (const card of cards) {
        const bid = String(card.blockID ?? "");
        if (!bid) {
            noBlock.push(card);
            continue;
        }
        const b = buckets.get(bid) ?? [];
        b.push(card);
        buckets.set(bid, b);
    }

    const dispersed: T[] = [];
    let hasMore = true;
    let round = 0;

    while (hasMore) {
        hasMore = false;
        for (const bucket of buckets.values()) {
            if (round < bucket.length) {
                dispersed.push(bucket[round]);
                if (round + 1 < bucket.length) {
                    hasMore = true;
                }
            }
        }
        round++;
    }

    return [...dispersed, ...noBlock];
}
