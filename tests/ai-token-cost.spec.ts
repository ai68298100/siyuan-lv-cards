import { describe, expect, it } from "vitest";
import {
    checkHardCeilings,
    estimatePreFlightCost,
    estimateTextTokens,
    type AiHardCeilings,
} from "../src/core/ai-token-cost";
import enJson from "../public/i18n/en.json";
import zhJson from "../public/i18n/zh-CN.json";

function resolveKey(obj: any, path: string): string | undefined {
    const parts = path.split(".");
    let curr = obj;
    for (const p of parts) {
        if (!curr || typeof curr !== "object") return undefined;
        curr = curr[p];
    }
    return typeof curr === "string" ? curr : undefined;
}

describe("BU-12: Token & Cost Pre-flight Estimation and Hard Ceilings", () => {
    it("轻量 Token 估算：空串为 0，英文约 4 chars/token，中文约 1.3 chars/token", () => {
        expect(estimateTextTokens("")).toBe(0);
        expect(estimateTextTokens("   ")).toBe(0);

        const englishText = "Hello world from vitest test suite";
        const engTokens = estimateTextTokens(englishText);
        expect(engTokens).toBeGreaterThan(0);
        expect(engTokens).toBeLessThan(englishText.length);

        const chineseText = "光合作用是绿色植物利用叶绿素捕获太阳光能的生物化学过程。";
        const zhTokens = estimateTextTokens(chineseText);
        expect(zhTokens).toBeGreaterThan(20);
    });

    it("发送前预估：制卡张数自适应缩放输出 Token 与费用计算", () => {
        const prompt = "请分析以下生物学教材段落并提炼 10 张核心知识卡片：细胞结构与能量代谢...";
        const estimate = estimatePreFlightCost({
            modelId: "gpt-4o-mini",
            promptText: prompt,
            taskType: "cards-generate",
            cardCount: 10,
        });

        expect(estimate.modelId).toBe("gpt-4o-mini");
        expect(estimate.inputTokens).toBeGreaterThan(0);
        expect(estimate.estimatedOutputTokens).toBe(1200); // 10 张 * 120
        expect(estimate.totalEstimatedTokens).toBe(estimate.inputTokens + 1200);
        expect(estimate.isLocalOffline).toBe(false);
        expect(estimate.priceSource).toBe("registered");
        expect(estimate.estimatedCostUsd).not.toBeNull();
        expect(estimate.estimatedCostUsd!).toBeGreaterThan(0);
    });

    it("本地离线模型（Ollama / Qwen / LLaMA）标记为零费用 (0 USD)", () => {
        const estimate = estimatePreFlightCost({
            modelId: "qwen2.5:7b",
            promptText: "解释什么是快速排序算法",
            taskType: "concept-explain",
        });

        expect(estimate.isLocalOffline).toBe(true);
        expect(estimate.priceSource).toBe("local-free");
        expect(estimate.estimatedCostUsd).toBe(0);
    });

    it("深度推理模型（R1 / Reasoner）施加推理延迟补偿", () => {
        const estNormal = estimatePreFlightCost({
            modelId: "deepseek-chat",
            promptText: "测试延迟",
            taskType: "concept-explain",
        });

        const estReasoner = estimatePreFlightCost({
            modelId: "deepseek-reasoner",
            promptText: "测试延迟",
            taskType: "concept-explain",
        });

        expect(estReasoner.estimatedLatencyMs).toBeGreaterThan(estNormal.estimatedLatencyMs);
    });

    it("硬上限门禁：单次请求 Token 超限前置阻断 (single-request-cap-exceeded)", () => {
        const estimate = estimatePreFlightCost({
            modelId: "deepseek-chat",
            promptText: "极长文本...".repeat(2000), // 大量输入
            taskType: "cards-generate",
            cardCount: 50,
        });

        const ceilings: AiHardCeilings = {
            singleRequestTokenCap: 1000,
            dailyTokenCap: 50000,
            dailyCostUsdCap: 5.0,
        };

        const res = checkHardCeilings(estimate, ceilings);
        expect(res.allowed).toBe(false);
        expect(res.violation).toBe("single-request-cap-exceeded");
        expect(res.reasonKey).toBe("aiTokenCost.error.singleCapExceeded");
        expect(res.fallbackAltKey).toBeTruthy();
        expect(res.neverSilentlyFallsBack).toBe(true);
    });

    it("硬上限门禁：单日累计 Token 额度超标阻断 (daily-token-cap-exceeded)", () => {
        const estimate = estimatePreFlightCost({
            modelId: "deepseek-chat",
            promptText: "普通简短问题",
            taskType: "concept-explain",
        });

        const ceilings: AiHardCeilings = {
            singleRequestTokenCap: 5000,
            dailyTokenCap: 10000,
            dailyCostUsdCap: 5.0,
        };

        const dailyUsage = { tokens: 9900, costUsd: 0.1 }; // 离 10000 仅剩 100 tokens

        const res = checkHardCeilings(estimate, ceilings, dailyUsage);
        expect(res.allowed).toBe(false);
        expect(res.violation).toBe("daily-token-cap-exceeded");
        expect(res.reasonKey).toBe("aiTokenCost.error.dailyTokensExceeded");
    });

    it("硬上限门禁：单日累计费用 USD 超标阻断 (daily-cost-cap-exceeded)", () => {
        const estimate = estimatePreFlightCost({
            modelId: "gpt-4o",
            promptText: "比较两篇论文的结构...",
            taskType: "cards-generate",
            cardCount: 20,
        });

        const ceilings: AiHardCeilings = {
            singleRequestTokenCap: 20000,
            dailyTokenCap: 100000,
            dailyCostUsdCap: 1.0, // 单日 1 美元上限
        };

        const dailyUsage = { tokens: 10000, costUsd: 0.99 }; // 已接近 1 美元

        const res = checkHardCeilings(estimate, ceilings, dailyUsage);
        expect(res.allowed).toBe(false);
        expect(res.violation).toBe("daily-cost-cap-exceeded");
        expect(res.reasonKey).toBe("aiTokenCost.error.dailyCostExceeded");
    });

    it("多语言词汇对齐：所有涉及的 i18n 键在双语中完整可解析", () => {
        const keys = [
            "aiTokenCost.error.singleCapExceeded",
            "aiTokenCost.error.dailyTokensExceeded",
            "aiTokenCost.error.dailyCostExceeded",
            "aiTokenCost.allowed.withinBudget",
        ];

        for (const k of keys) {
            const zh = resolveKey(zhJson, k);
            const en = resolveKey(enJson, k);
            expect(zh, `zh-CN missing key: ${k}`).toBeTruthy();
            expect(en, `en missing key: ${k}`).toBeTruthy();
        }
    });
});
