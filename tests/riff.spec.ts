import { afterEach, describe, expect, it, vi } from "vitest";

// riff.ts → libs/request.postJSON → global fetch：stub 全局 fetch 即可在 node 下验证
// 「端点/payload 形状/错误映射」三层内核契约（AJ5）
const jsonResponse = (envelope: unknown) => ({
    ok: true,
    json: async () => envelope,
});

let calls: { url: string; init: any }[] = [];
function mockKernel(envelope?: unknown) {
    calls = [];
    const fn = vi.fn(async (url: string, init?: any) => {
        calls.push({ url, init });
        return jsonResponse(envelope ?? { code: 0, msg: "", data: null });
    });
    vi.stubGlobal("fetch", fn);
    return fn;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

import {
    getRiffDueCards, getRiffDecks, getDueCount, reviewRiffCard, skipReviewRiffCard, addRiffCards, batchSetRiffCardsDueTime,
} from "../src/api/riff";

describe("riff API 契约（内核 /api/riff/*）", () => {
    it("getRiffDueCards：payload 映射 reviewedCards→[{cardID}]（内核契约）", async () => {
        mockKernel({ code: 0, msg: "", data: { cards: [], unreviewedCount: 3, unreviewedNewCardCount: 1, unreviewedOldCardCount: 2 } });
        const data = await getRiffDueCards("deck-1", ["c1", "c2"]);
        expect(calls[0].url).toBe("/api/riff/getRiffDueCards");
        const body = JSON.parse(calls[0].init.body);
        expect(body).toEqual({ deckID: "deck-1", reviewedCards: [{ cardID: "c1" }, { cardID: "c2" }] });
        expect(data.unreviewedCount).toBe(3);
    });

    it("reviewRiffCard / skipReviewRiffCard payload 形状", async () => {
        mockKernel();
        await reviewRiffCard("d", "c", 3, ["x"]);
        expect(JSON.parse(calls[0].init.body)).toEqual({
            deckID: "d", cardID: "c", rating: 3, reviewedCards: [{ cardID: "x" }],
        });
        await skipReviewRiffCard("d", "c");
        expect(JSON.parse(calls[1].init.body)).toEqual({ deckID: "d", cardID: "c" });
    });

    it("addRiffCards / batchSetRiffCardsDueTime payload 形状", async () => {
        mockKernel();
        await addRiffCards("d", ["b1", "b2"]);
        expect(JSON.parse(calls[0].init.body)).toEqual({ deckID: "d", blockIDs: ["b1", "b2"] });
        await batchSetRiffCardsDueTime([{ id: "c", due: "20261101" }]);
        expect(JSON.parse(calls[1].init.body)).toEqual({ cardDues: [{ id: "c", due: "20261101" }] });
    });

    it("getDueCount：全部卡包=按组遍历合并（跳过空组），计数从合并卡面重算", async () => {
        // 内核 3.8.6 的 deckID="" 全局查询不返回到期卡 → 插件侧逐组查询后合并（mergeDeckDueResults）
        calls = [];
        vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
            calls.push({ url, init });
            const body = JSON.parse(init?.body ?? "{}");
            let data: unknown = null;
            if (url.includes("getRiffDecks")) {
                data = [
                    { id: "d1", name: "a", size: 2, created: "", updated: "" },
                    { id: "d0", name: "empty", size: 0, created: "", updated: "" },
                ];
            } else if (body.deckID === "d1") {
                data = {
                    cards: [{ deckID: "d1", cardID: "c1", blockID: "b1", lapses: 0, reps: 0, state: 0, lastReview: 0, nextDues: {} }],
                    unreviewedCount: 1, unreviewedNewCardCount: 1, unreviewedOldCardCount: 0,
                };
            } else {
                data = { cards: [], unreviewedCount: 0, unreviewedNewCardCount: 0, unreviewedOldCardCount: 0 };
            }
            return jsonResponse({ code: 0, msg: "", data });
        }));
        expect(await getDueCount()).toBe(1);
        // size=0 的卡组被跳过：只有 d1 发生了 due 查询
        const dueCalls = calls.filter(c => c.url.includes("getRiffDueCards"));
        expect(dueCalls).toHaveLength(1);
        expect(JSON.parse(dueCalls[0].init.body).deckID).toBe("d1");
        // 空数据 → 0（合并后重算，缺失字段不再透传 undefined）
        calls = [];
        vi.stubGlobal("fetch", vi.fn(async (url: string) => {
            if (url.includes("getRiffDecks")) return jsonResponse({ code: 0, msg: "", data: [] });
            return jsonResponse({ code: 0, msg: "", data: { cards: [] } });
        }));
        expect(await getDueCount()).toBe(0);
    });

    it("code≠0 抛内核 msg；无 msg 带错误码", async () => {
        mockKernel({ code: 404, msg: "deck not found", data: null });
        await expect(getRiffDecks()).rejects.toThrow("deck not found");
        mockKernel({ code: -1, msg: "", data: null });
        await expect(getRiffDecks()).rejects.toThrow(/code=-1/);
    });

    it("请求头 JSON、超时 AbortError 映射 code=504", async () => {
        mockKernel({ code: 0, msg: "", data: null });
        await getRiffDecks();
        expect(calls[0].init.method).toBe("POST");
        expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
        vi.stubGlobal("fetch", vi.fn(async () => {
            const e = new Error("aborted");
            (e as any).name = "AbortError";
            throw e;
        }));
        await expect(getRiffDecks()).rejects.toThrow(/kernel timeout.*code=504/);
    });
});
