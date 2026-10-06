import { describe, expect, it } from "vitest";
import { AI_ENTRY_IDS, AI_EQUIVALENTS, equivalentFor, aiPoweredEntries } from "../src/core/ai-equivalents";

// BU-40 无 AI 等价登记：每个 AI 入口有替代路径与损失说明；drill/no-ai 本身零 AI
describe("ai-equivalents（BU-40）", () => {
    it("每个 AI 入口都有入口键+损失键，替代路径键格式统一", () => {
        for (const id of AI_ENTRY_IDS) {
            const e = AI_EQUIVALENTS[id];
            expect(e.entryKey).toBe(`aiEquiv.entry.${id}`);
            expect(e.lossKey).toBe(`aiEquiv.loss.${id}`);
            for (const k of e.altKeys) {
                expect(k.startsWith(`aiEquiv.alt.${id}.`)).toBe(true);
            }
        }
    });

    it("有 AI 的入口（制卡/烂卡改写）必须至少一条替代路径；零 AI 入口无替代（自身即路径）", () => {
        expect(aiPoweredEntries().map(e => e.entry)).toEqual(["cards-generate", "leech-rewrite"]);
        expect(AI_EQUIVALENTS["cards-generate"].altKeys.length).toBeGreaterThanOrEqual(3);
        expect(AI_EQUIVALENTS["leech-rewrite"].altKeys.length).toBeGreaterThanOrEqual(2);
        expect(AI_EQUIVALENTS["repair-drill"].altKeys).toEqual([]);
        expect(AI_EQUIVALENTS["no-ai"].altKeys).toEqual([]);
    });

    it("查询：未登记 ID 回 null（防静默漏登记）；在册正常返回", () => {
        expect(equivalentFor("cards-generate")?.entryKey).toContain("cards-generate");
        expect(equivalentFor("unknown-entry")).toBeNull();
    });
});
