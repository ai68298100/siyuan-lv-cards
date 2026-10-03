import { describe, expect, it, vi } from "vitest";
import { createDueCache } from "../src/libs/due-cache";

// AT-4 due 扇出收敛：同 scope 合并 + 短 TTL 复用 + generation 失效 + 失败不缓存 + LRU 有界
function makeCache(overrides: Partial<{ ttlMs: number; maxEntries: number; now: () => number; fetcher: (k: string) => Promise<number> }> = {}) {
    const calls: string[] = [];
    let clock = 0;
    const cache = createDueCache<number>({
        fetcher: async (key: string) => {
            if (overrides.fetcher) {
                return overrides.fetcher(key);
            }
            calls.push(key);
            return calls.length;
        },
        ttlMs: overrides.ttlMs ?? 15_000,
        maxEntries: overrides.maxEntries,
        now: overrides.now ?? (() => clock),
    });
    return {
        cache,
        calls,
        advance: (ms: number) => { clock += ms; },
    };
}

describe("due-cache（AT-4 generation + 短 TTL 共享缓存）", () => {
    it("并发合并：同 key 并发 get 只打一次 fetcher，结果共享", async () => {
        const { cache, calls } = makeCache();
        const [a, b] = await Promise.all([cache.get(""), cache.get("")]);
        expect(calls).toEqual([""]);
        expect(a).toBe(b);
        expect(cache.stats().coalesced).toBe(1);
    });

    it("TTL 内复用缓存（hits），过期后重拉（misses）", async () => {
        const { cache, calls, advance } = makeCache({ ttlMs: 1000 });
        await cache.get("");
        await cache.get("");
        expect(calls).toEqual([""]);
        expect(cache.stats().hits).toBe(1);
        advance(1001);
        await cache.get("");
        expect(calls).toEqual(["", ""]);
    });

    it("invalidate 提升 generation：未过期条目也立即失效", async () => {
        const { cache, calls } = makeCache({ ttlMs: 60_000 });
        await cache.get("");
        cache.invalidate();
        await cache.get("");
        expect(calls).toEqual(["", ""]);
        expect(cache.stats().invalidations).toBe(1);
    });

    it("失败不缓存：等待方全部收到错误，下次读取即重试", async () => {
        let fail = true;
        const { cache, calls } = makeCache({
            fetcher: async () => {
                calls.push("x");
                if (fail) {
                    throw new Error("kernel down");
                }
                return 7;
            },
        });
        await expect(Promise.all([cache.get(""), cache.get("")])).rejects.toThrow("kernel down");
        fail = false;
        await expect(cache.get("")).resolves.toBe(7);
        expect(calls).toEqual(["x", "x"]);
    });

    it("LRU 有界：超过 maxEntries 逐最久未用条目", async () => {
        const { cache } = makeCache({ maxEntries: 2 });
        await cache.get("a");
        await cache.get("b");
        await cache.get("a"); // a 移到队尾
        await cache.get("c"); // 淘汰 b
        expect(cache.stats().entries).toBe(2);
        // b 已被淘汰：重拉并插入；此插入会把当前最旧的 a 挤出（LRU 边界语义）
        const s1 = cache.stats();
        await cache.get("b");
        expect(cache.stats().misses).toBe(s1.misses + 1);
        await cache.get("b");
        expect(cache.stats().hits).toBe(s1.hits + 1);
        // a 已被上一步挤出：再次读取必然重拉
        await cache.get("a");
        expect(cache.stats().misses).toBe(s1.misses + 2);
    });

    it("多 scope 互相独立：单缓存承载不同 key", async () => {
        const { cache, calls } = makeCache();
        const [g, deck] = await Promise.all([cache.get(""), cache.get("deck:x")]);
        expect(calls.sort()).toEqual(["", "deck:x"].sort());
        expect(g).not.toBe(deck);
    });

    it("invalidate 期间在途请求：跨代不合并、旧结果不落缓存（v0.110.1 巡检修复）", async () => {
        // 受控 fetcher：两次调用分别用手动放行的 deferred
        const gates: Array<(v: number) => void> = [];
        let calls = 0;
        let clock = 0;
        const cache = createDueCache<number>({
            fetcher: () => new Promise<number>(resolve => {
                calls++;
                gates.push(resolve);
            }),
            ttlMs: 60_000,
            now: () => clock,
        });
        const first = cache.get("a");          // 旧代在途
        cache.invalidate();                     // 评分事实发生
        const second = cache.get("a");          // 不得合并到旧代 → 必须重拉
        expect(calls).toBe(2);
        gates[0](99);                           // 旧代结果落定：作废，不得缓存
        await expect(first).resolves.toBe(99);  // 旧调用方仍拿到自己的结果
        gates[1](7);
        await expect(second).resolves.toBe(7);
        // 新代结果已缓存：第三次读取命中，不再打 fetcher
        const s = cache.stats();
        await expect(cache.get("a")).resolves.toBe(7);
        expect(cache.stats().hits).toBe(s.hits + 1);
        expect(calls).toBe(2);
    });
});
