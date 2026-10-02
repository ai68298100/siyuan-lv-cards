import { describe, expect, it } from "vitest";
import { normalizeAIBatches, emptyAIBatches } from "../src/core/ai-batches";

const batch = (id: string, over: Record<string, unknown> = {}) => ({ id, date: "2026-10-03", deckID: "", blockIDs: [], ...over });

describe("normalizeAIBatches（AI 批次 schema 清洗，AX·526）", () => {
    it("合法批次保留；id/date 缺失或非字符串剔除", () => {
        const r = normalizeAIBatches({
            batches: [
                batch("ok"),
                batch(""),
                { date: "2026-10-03" },          // 缺 id
                { id: 42, date: "2026-10-03" },  // id 非字符串
                null,
                "junk",
                batch("ok2", { tokens: 123 }),
            ],
        });
        expect(r.batches.map(b => b.id)).toEqual(["ok", "ok2"]);
        expect(r.batches[1].tokens).toBe(123);
    });

    it("blockIDs 过滤非字符串；deckID 非字符串回空", () => {
        const r = normalizeAIBatches({ batches: [batch("x", { blockIDs: ["b1", 5, null, "", "b2"], deckID: 7 })] });
        expect(r.batches[0].blockIDs).toEqual(["b1", "b2"]);
        expect(r.batches[0].deckID).toBe("");
    });

    it("tokens 非有限数回 undefined；上限 200 只留尾部", () => {
        const many = Array.from({ length: 250 }, (_, i) => batch(`b${i}`));
        const r = normalizeAIBatches({ batches: many });
        expect(r.batches).toHaveLength(200);
        expect(r.batches[0].id).toBe("b50");
        expect(r.batches[199].id).toBe("b249");
        const badTokens = normalizeAIBatches({ batches: [batch("t", { tokens: "x" })] });
        expect(badTokens.batches[0].tokens).toBeUndefined();
    });

    it("非对象/缺 batches 落空库；清洗幂等", () => {
        expect(normalizeAIBatches(null)).toEqual(emptyAIBatches());
        expect(normalizeAIBatches("x")).toEqual(emptyAIBatches());
        expect(normalizeAIBatches({})).toEqual(emptyAIBatches());
        const once = normalizeAIBatches({ batches: [batch("a", { blockIDs: [1, "b"] })] });
        expect(normalizeAIBatches(JSON.parse(JSON.stringify(once)))).toEqual(once);
    });
});
