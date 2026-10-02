import { describe, expect, it } from "vitest";
import { zipLoaded, loadStore } from "../src/libs/store";
import { unwrapKernelData, dataStr } from "../src/libs/kernel-response";

describe("zipLoaded（AQ-1 回归：批量加载位置配对）", () => {
    it("按位置一一对应，键数与值数必须一致", () => {
        const keys = ["settings.json", "revlog.json", "session-state.json"] as const;
        const values = [{ a: 1 }, { entries: [] }, { date: "2026-10-02" }];
        const out = zipLoaded(keys, values);
        expect(out["settings.json"]).toEqual({ a: 1 });
        expect(out["session-state.json"]).toEqual({ date: "2026-10-02" });
    });

    it("6 键 5 值（历史缺陷形态）直接抛错，不静默错位", () => {
        const keys = ["a", "b", "c", "d", "e", "f"] as const;
        expect(() => zipLoaded(keys, [1, 2, 3, 4, 5])).toThrow(/mismatch/);
    });

    it("loadStore 复用 preloaded 原文，不再二次 loadData", async () => {
        let reads = 0;
        const plugin = { loadData: async () => { reads += 1; return { version: 1, batches: [{ id: "x", date: "2026-10-02", deckID: "", blockIDs: [] }] }; } };
        const seen = { v: undefined as unknown };
        const out = await loadStore(plugin as any, {
            key: "ai-batches.json",
            fallback: () => ({ version: 1 as const, batches: [] }),
            normalize: (raw: any) => { seen.v = raw; return raw; },
        }, { version: 1, batches: [] });
        expect(out).toEqual({ version: 1, batches: [] });
        expect(seen.v).toEqual({ version: 1, batches: [] });
        expect(reads).toBe(0);
    });

    it("loadStore 无 preloaded 时照常读取，异常落兜底", async () => {
        const plugin = { loadData: async () => { throw new Error("boom"); } };
        const out = await loadStore(plugin as any, {
            key: "x.json",
            fallback: () => ({ ok: true }),
            normalize: (raw: any) => raw,
        });
        expect(out).toEqual({ ok: true });
    });
});

describe("unwrapKernelData（AQ-20 内核响应统一校验）", () => {
    it("code=0 返回 data", () => {
        expect(unwrapKernelData({ code: 0, msg: "", data: { dom: "<p>x</p>" } })).toEqual({ dom: "<p>x</p>" });
    });

    it("非 0 抛出内核 msg", () => {
        expect(() => unwrapKernelData({ code: 404, msg: "not found", data: null })).toThrow("not found");
    });

    it("非 0 且无 msg 给出错误码", () => {
        expect(() => unwrapKernelData({ code: 500, msg: "", data: null })).toThrow(/code=500/);
    });

    it("null/缺 code 抛 unknown", () => {
        expect(() => unwrapKernelData(null)).toThrow(/unknown/);
        expect(() => unwrapKernelData({ msg: "x" })).toThrow(/unknown/);
    });

    it("dataStr：缺字段/非字符串回空串", () => {
        expect(dataStr({ dom: "x" }, "dom")).toBe("x");
        expect(dataStr({}, "dom")).toBe("");
        expect(dataStr({ dom: 123 }, "dom")).toBe("");
    });
});
