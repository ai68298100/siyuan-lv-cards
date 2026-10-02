import { describe, expect, it } from "vitest";
import PromiseLimitPool from "../src/libs/promise-pool";

describe("PromiseLimitPool（并发池）", () => {
    it("并发数不超过上限且全部结果按完成收集", async () => {
        let running = 0;
        let peak = 0;
        const pool = new PromiseLimitPool<number>(2);
        for (let i = 0; i < 6; i++) {
            pool.add(async () => {
                running += 1;
                peak = Math.max(peak, running);
                await new Promise(r => setTimeout(r, 5));
                running -= 1;
                return i;
            });
        }
        const results = await pool.awaitAll();
        expect(results).toHaveLength(6);
        expect(peak).toBeLessThanOrEqual(2);
    });

    it("队列排空：先来先占位，空位释放后补位", async () => {
        const order: string[] = [];
        const pool = new PromiseLimitPool<string>(1);
        pool.add(async () => { order.push("a"); return "a"; });
        pool.add(async () => { order.push("b"); return "b"; });
        pool.add(async () => { order.push("c"); return "c"; });
        await pool.awaitAll();
        expect(order).toEqual(["a", "b", "c"]); // max=1 时严格串行
    });

    it("单任务失败经 awaitAll 抛出（Promise.all 语义）", async () => {
        const pool = new PromiseLimitPool<number>(2);
        pool.add(async () => 1);
        pool.add(async () => { throw new Error("boom"); });
        await expect(pool.awaitAll()).rejects.toThrow("boom");
    });
});
