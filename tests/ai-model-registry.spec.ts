import { describe, expect, it } from "vitest";
import {
    MODEL_REGISTRY,
    normalizeModelId,
    lookupModel,
    selectableModelOptions,
    isSelectableModel,
    effectiveBudgetTokens,
    supportsInput,
    estimateCallCostUsd,
    formatModelContext,
} from "../src/core/ai-model-registry";

// BU-18 模型能力注册表：能力探测与实际请求一致、失效模型不进可选列表、预算从注册表收紧
describe("ai-model-registry（BU-18）", () => {
    it("注册表自洽：每条目 id 唯一、窗口>0、模态非空、状态合法", () => {
        const ids = MODEL_REGISTRY.map(m => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const m of MODEL_REGISTRY) {
            expect(m.contextWindow).toBeGreaterThan(0);
            expect(m.inputModalities.length).toBeGreaterThan(0);
            expect(["active", "deprecated", "retired"]).toContain(m.status);
        }
    });

    it("ID 归一：trim+小写统一在此", () => {
        expect(normalizeModelId("  GPT-4o ")).toBe("gpt-4o");
        expect(normalizeModelId("")).toBe("");
    });

    it("查找：精确 → 「/」中转后缀 → dated 变体归并；未登记=null", () => {
        expect(lookupModel("gpt-4o-mini")?.provider).toBe("openai");
        expect(lookupModel("openai/gpt-4o-mini")?.id).toBe("gpt-4o-mini");
        expect(lookupModel("deepseek-chat-20241126")?.id).toBe("deepseek-chat");
        expect(lookupModel("totally-unknown-model")).toBeNull();
        expect(lookupModel("   ")).toBeNull();
    });

    it("可选列表只含 active——deprecated/retired 永不出现（验收硬性要求）", () => {
        const options = selectableModelOptions();
        const values = options.map(o => o.value);
        expect(values).toContain("gpt-4o-mini");
        expect(values).not.toContain("gpt-4-turbo"); // deprecated
        expect(values).not.toContain("gpt-3.5-turbo-0301"); // retired
        // 全表失效条目与可选列表无交
        const stale = MODEL_REGISTRY.filter(m => m.status !== "active").map(m => m.id);
        expect(stale.length).toBeGreaterThan(0);
        for (const s of stale) {
            expect(values).not.toContain(s);
        }
        // 稳定排序（provider+id——与 selectableModelOptions 同口径）
        const expected = MODEL_REGISTRY
            .filter(m => m.status === "active")
            .sort((a, b) => (a.provider === b.provider ? a.id.localeCompare(b.id) : a.provider.localeCompare(b.provider)))
            .map(m => m.id);
        expect(values).toEqual(expected);
    });

    it("isSelectableModel：登记且 active 才 true；未登记/失效 false", () => {
        expect(isSelectableModel("gpt-4o")).toBe(true);
        expect(isSelectableModel("GPT-4O")).toBe(true);
        expect(isSelectableModel("gpt-4-turbo")).toBe(false);
        expect(isSelectableModel("gpt-3.5-turbo-0301")).toBe(false);
        expect(isSelectableModel("nope")).toBe(false);
    });

    it("生效预算：小窗口按 窗口×0.6 收紧（下限 2000）；大窗口/未登记不放大", () => {
        // moonshot-v1-8k：8192×0.6=4915 → 收紧
        const small = effectiveBudgetTokens("moonshot-v1-8k", 24000);
        expect(small.tokens).toBe(Math.floor(8192 * 0.6));
        expect(small.source).toBe("model-registry");
        // 3.5 退役模型仍按其窗口收紧（用户硬填时防溢出）
        expect(effectiveBudgetTokens("gpt-3.5-turbo-0301", 24000).tokens).toBe(Math.max(2000, Math.floor(4096 * 0.6)));
        // 大窗口：min(任务默认, 更大值)=任务默认（只收紧不放大）
        const big = effectiveBudgetTokens("gpt-4o", 24000);
        expect(big.tokens).toBe(24000);
        expect(big.source).toBe("model-registry");
        // 未登记：任务默认
        const unknown = effectiveBudgetTokens("my-private-model", 24000);
        expect(unknown).toEqual({ tokens: 24000, source: "task-default", model: null });
    });

    it("模态探测：登记模型按表回布尔；未登记=null（不判不阻断）", () => {
        expect(supportsInput("gpt-4o", "image")).toBe(true);
        expect(supportsInput("deepseek-chat", "image")).toBe(false);
        expect(supportsInput("whatever", "image")).toBeNull();
    });

    it("成本估算：价格缺失/模型未知=null（不编数字）；有价按每百万计", () => {
        expect(estimateCallCostUsd("moonshot-v1-8k", 1000, 1000)).toBeNull();
        expect(estimateCallCostUsd("nope", 1000, 1000)).toBeNull();
        // gpt-4o-mini: $0.15/M in + $0.60/M out → 1M+1M = 0.75
        expect(estimateCallCostUsd("gpt-4o-mini", 1e6, 1e6)).toBeCloseTo(0.75, 6);
    });

    it("窗口展示格式：M/K 两档", () => {
        expect(formatModelContext(1000000)).toBe("1M");
        expect(formatModelContext(128000)).toBe("128K");
        expect(formatModelContext(8192)).toBe("8K");
    });
});
