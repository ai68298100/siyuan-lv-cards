import { describe, expect, it, vi } from "vitest";
import { createPersist } from "../src/libs/persist";

describe("createPersist（AQ-4 统一持久化队列）", () => {
    it("同 key 串行：第二笔等第一笔完成后写，后写覆盖先写", async () => {
        const writes: number[] = [];
        let release: (() => void) | null = null;
        const gate = new Promise<void>(r => { release = r; });
        const q = createPersist(async () => { writes.push(Date.now()); await gate; });
        const p1 = q.save("a.json", { v: 1 });
        const p2 = q.save("a.json", { v: 2 });
        expect(writes.length).toBe(0); // 第一笔未完成前第二笔不启动
        release?.();
        await Promise.all([p1, p2]);
        expect(writes.length).toBe(2);
    });

    it("失败重试后成功计入 ok", async () => {
        let calls = 0;
        const q = createPersist(async () => {
            calls += 1;
            if (calls === 1) { throw new Error("disk busy"); }
        }, { retryDelayMs: 1 });
        await q.save("r.json", {});
        expect(calls).toBe(2);
        const s = q.stats().find(x => x.key === "r.json");
        expect(s?.ok).toBe(1);
        expect(s?.fail).toBe(0);
    });

    it("重试耗尽上报 onFail 且不吞掉调用方异常", async () => {
        const onFail = vi.fn();
        const q = createPersist(async () => { throw new Error("boom"); }, { attempts: 2, retryDelayMs: 1, onFail });
        await expect(q.save("bad.json", {})).rejects.toThrow("boom");
        expect(onFail).toHaveBeenCalledTimes(1);
        expect(q.hasFailures()).toBe(true);
        const s = q.stats().find(x => x.key === "bad.json");
        expect(s?.fail).toBe(1);
        expect(s?.lastError).toBe("boom");
    });

    it("前一笔失败不阻断后一笔（链条自恢复）", async () => {
        let shouldFail = true;
        const q = createPersist(async () => {
            if (shouldFail) { throw new Error("x"); }
        }, { attempts: 1, retryDelayMs: 1 });
        await expect(q.save("k.json", 1)).rejects.toThrow("x");
        shouldFail = false;
        await q.save("k.json", 2);
        const s = q.stats().find(x => x.key === "k.json");
        expect(s?.ok).toBe(1);
        expect(s?.fail).toBe(1);
    });

    it("waitAll 等待在途写入完成", async () => {
        let done = 0;
        const q = createPersist(async () => { await new Promise(r => setTimeout(r, 5)); done += 1; });
        q.save("a.json", 1);
        q.save("b.json", 2);
        const ok = await q.waitAll(1000);
        expect(ok).toBe(true);
        expect(done).toBe(2);
    });

    it("waitAll 超时返回 false 不无限等待", async () => {
        const q = createPersist(async () => { await new Promise(r => setTimeout(r, 200)); });
        q.save("slow.json", 1);
        const ok = await q.waitAll(10);
        expect(ok).toBe(false);
    });

    it("waitAll 写入提前完成时清理截止计时器", async () => {
        vi.useFakeTimers();
        try {
            const q = createPersist(async () => undefined);
            await q.save("fast.json", 1);
            await expect(q.waitAll(1000)).resolves.toBe(true);
            // waitAll 的 deadline 仅用于兜底；写入已完成后不应残留长定时器。
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it("保存时捕获快照，后续修改不会污染排队写入", async () => {
        const payloads: unknown[] = [];
        let release: (() => void) | undefined;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const q = createPersist(async (_key, data) => { payloads.push(data); await gate; }, { retryDelayMs: 0 });
        const value = { items: ["before"] };
        const pending = q.save("snapshot.json", value);
        value.items[0] = "after";
        release?.();
        await pending;
        expect(payloads).toEqual([{ items: ["before"] }]);
    });

    it("相同幂等键只产生一次写入，失败后可显式重试", async () => {
        let calls = 0;
        let fail = true;
        const q = createPersist(async () => {
            calls += 1;
            if (fail) throw new Error("offline");
        }, { attempts: 1, retryDelayMs: 0 });
        const first = q.saveOnce("job.json", "op-1", { n: 1 });
        const duplicate = q.saveOnce("job.json", "op-1", { n: 1 });
        await expect(Promise.all([first, duplicate])).rejects.toThrow("offline");
        expect(calls).toBe(1);
        fail = false;
        await q.saveOnce("job.json", "op-1", { n: 1 });
        await q.saveOnce("job.json", "op-1", { n: 1 });
        expect(calls).toBe(2);
    });
});
