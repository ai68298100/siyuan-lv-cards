// AT-4 due 请求扇出收敛：generation + 短 TTL 共享缓存（纯逻辑，node 可单测）。
// 设计：同 scope 的并发请求合并为一次（in-flight 去重）；命中未过期条目直接复用；
// invalidate() 提升 generation——旧代条目即使未过期也立即失效（评分/建卡/改期后不读旧值）；
// 失败不缓存（下次读取即重试），所有等待方一起收到错误。
// 容量有界（LRU）：超限先逐最久未命中的条目。

export interface DueCacheStats {
    entries: number;
    hits: number;
    misses: number;
    coalesced: number;
    invalidations: number;
}

interface Entry<T> {
    value: T;
    filledAt: number;
    gen: number;
}

export function createDueCache<T>(opts: {
    fetcher: (key: string) => Promise<T>;
    ttlMs?: number;
    maxEntries?: number;
    now?: () => number;
}) {
    const ttlMs = opts.ttlMs ?? 15_000;
    const maxEntries = opts.maxEntries ?? 8;
    const now = opts.now ?? (() => Date.now());
    let gen = 0;
    const entries = new Map<string, Entry<T>>();
    // 在途请求带代际标记（兜底巡检 v0.110.1）：invalidate 后新读取不合并到旧代请求，
    // 旧代结果落定时也不得按当前代写入缓存（否则「评分后即拉新」被在途旧值击穿）
    const inFlight = new Map<string, { p: Promise<T>; gen: number }>();
    const stats: DueCacheStats = { entries: 0, hits: 0, misses: 0, coalesced: 0, invalidations: 0 };

    function touch(key: string) {
        // Map 迭代按插入序：删除再插入即移到队尾（队首=最久未用）；filledAt 保持不变
        const e = entries.get(key);
        if (e) {
            entries.delete(key);
            entries.set(key, e);
        }
    }

    function evictIfNeeded() {
        while (entries.size > maxEntries) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            entries.delete(oldest);
        }
    }

    function get(key: string): Promise<T> {
        const e = entries.get(key);
        if (e && e.gen === gen && now() - e.filledAt < ttlMs) {
            stats.hits++;
            touch(key);
            return Promise.resolve(e.value);
        }
        if (e) {
            entries.delete(key); // 过期或旧代：丢弃
        }
        const pending = inFlight.get(key);
        if (pending && pending.gen === gen) {
            stats.coalesced++;
            return pending.p;
        }
        stats.misses++;
        const myGen = gen;
        const p = opts.fetcher(key)
            .then(value => {
                if (inFlight.get(key)?.p === p) {
                    inFlight.delete(key); // 只清自己的槽位（期间可能有新一代请求已注册）
                }
                if (myGen === gen) {
                    // 代际仍匹配才落缓存：fetch 途中发生过 invalidate 则结果作废
                    entries.set(key, { value, filledAt: now(), gen });
                    evictIfNeeded();
                }
                return value;
            })
            .catch(err => {
                if (inFlight.get(key)?.p === p) {
                    inFlight.delete(key); // 失败不缓存：下次读取即重试
                }
                throw err;
            });
        inFlight.set(key, { p, gen: myGen });
        return p;
    }

    /** 全部失效（generation +1）：评分/建卡/改期等任何改变 due 的事实发生后调用 */
    function invalidate() {
        gen++;
        entries.clear();
        stats.invalidations++;
    }

    return {
        get,
        invalidate,
        stats: (): DueCacheStats => ({ ...stats, entries: entries.size, }),
    };
}

export type DueCache<T> = ReturnType<typeof createDueCache<T>>;
