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

// BU-19 批次 pin：生成环境快照随批次落盘（指纹不含密钥/原文）；坏 pin 剔除、旧批次无 pin 兼容
describe("ai-batches pin（BU-19，v0.194.0）", () => {
    const pin = { mode: "custom", modelId: "gpt-4o-mini", templateHash: "ab12cd34", sourceHash: "ef56ab78", pinnedAt: 1700000000000 };

    it("合法 pin 保留；modelId 非字符串回 null；坏 pin（mode 非法/缺 hash）整条剔除", () => {
        const r = normalizeAIBatches({
            batches: [
                batch("p1", { pin }),
                batch("p2", { pin: { ...pin, modelId: 42 } }),
                batch("p3", { pin: { ...pin, mode: "galaxy" } }),
                batch("p4", { pin: { mode: "siyuan", modelId: null } }), // 缺 hash
                batch("p5", { pin: null }),
            ],
        });
        expect(r.batches[0].pin).toEqual(pin);
        expect(r.batches[1].pin?.modelId).toBeNull();
        expect(r.batches[2].pin).toBeUndefined();
        expect(r.batches[3].pin).toBeUndefined();
        expect(r.batches[4].pin).toBeUndefined();
    });

    it("旧批次无 pin 字段兼容不动（normalize 幂等）", () => {
        const once = normalizeAIBatches({ batches: [batch("legacy"), batch("p", { pin })] });
        expect(normalizeAIBatches(JSON.parse(JSON.stringify(once)))).toEqual(once);
        expect(once.batches[0].pin).toBeUndefined();
    });
});
