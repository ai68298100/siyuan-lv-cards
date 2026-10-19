import { describe, expect, it } from "vitest";
import {
    LEARNING_INTENTS,
    AVAILABILITY_STATUSES,
    INTENT_FEATURE_REGISTRY,
    searchIntentFeatures,
} from "../src/core/intent-navigation";

describe("intent-navigation (BL-1 统一功能搜索与目标意图导航引擎)", () => {
    it("四大学习意图与四态可用性状态在场", () => {
        expect(LEARNING_INTENTS).toEqual(["memorize", "understand", "apply", "maintain"]);
        expect(AVAILABILITY_STATUSES).toEqual([
            "available",
            "prerequisite-needed",
            "subsequent",
            "alternative",
        ]);
        expect(INTENT_FEATURE_REGISTRY.length).toBeGreaterThanOrEqual(16);
    });

    it("空查询与无意图限制时返回全量功能", () => {
        const res = searchIntentFeatures();
        expect(res.totalMatched).toBe(INTENT_FEATURE_REGISTRY.length);
        expect(res.available.length + res.prerequisiteNeeded.length + res.subsequent.length + res.alternatives.length).toBe(res.totalMatched);
    });

    it("按意图过滤：memorize 仅返回记住相关的制卡与复习功能", () => {
        const res = searchIntentFeatures("", "memorize");
        expect(res.selectedIntent).toBe("memorize");
        expect(res.totalMatched).toBeGreaterThanOrEqual(5);

        // 包含快速问答、挖空制卡、遮挡制卡、专注复习、打字默写
        const ids = [...res.available, ...res.prerequisiteNeeded, ...res.subsequent, ...res.alternatives].map(f => f.id);
        expect(ids).toContain("quick-qa-card");
        expect(ids).toContain("cloze-card-maker");
        expect(ids).toContain("occlusion-card-maker");
        expect(ids).toContain("fsrs-focus-review");
        expect(ids).toContain("type-in-drill");
    });

    it("按意图过滤：maintain 仅返回维护债务、返场模拟、审计日志与同意中心", () => {
        const res = searchIntentFeatures("", "maintain");
        expect(res.selectedIntent).toBe("maintain");
        const ids = res.available.map(f => f.id);
        expect(ids).toContain("maintenance-debt-hub");
        expect(ids).toContain("return-simulation-tool");
        expect(ids).toContain("user-audit-log");
        expect(ids).toContain("consent-permission-center");
    });

    it("关键词模糊匹配：搜索 '遮挡' 或 'occlusion'", () => {
        const resZh = searchIntentFeatures("遮挡");
        expect(resZh.available.some(f => f.id === "occlusion-card-maker")).toBe(true);

        const resEn = searchIntentFeatures("occlusion");
        expect(resEn.available.some(f => f.id === "occlusion-card-maker")).toBe(true);
    });

    it("运行时上下文感知：无到期卡片时 focus-review 转为 prerequisite-needed", () => {
        const resWithDue = searchIntentFeatures("focus-review", undefined, { dueCardsCount: 15 });
        expect(resWithDue.available.some(f => f.id === "fsrs-focus-review")).toBe(true);
        expect(resWithDue.prerequisiteNeeded.some(f => f.id === "fsrs-focus-review")).toBe(false);

        const resNoDue = searchIntentFeatures("focus-review", undefined, { dueCardsCount: 0 });
        expect(resNoDue.available.some(f => f.id === "fsrs-focus-review")).toBe(false);
        expect(resNoDue.prerequisiteNeeded.some(f => f.id === "fsrs-focus-review")).toBe(true);
    });

    it("运行时上下文感知：未配置 AI 时，AI 相关功能转为 alternative 替代打法", () => {
        const resWithAi = searchIntentFeatures("atomic-split", undefined, { aiConfigured: true });
        expect(resWithAi.available.some(f => f.id === "atomic-fact-split")).toBe(true);
        expect(resWithAi.alternatives.some(f => f.id === "atomic-fact-split")).toBe(false);

        const resNoAi = searchIntentFeatures("atomic-split", undefined, { aiConfigured: false });
        expect(resNoAi.available.some(f => f.id === "atomic-fact-split")).toBe(false);
        expect(resNoAi.alternatives.some(f => f.id === "atomic-fact-split")).toBe(true);
        expect(resNoAi.alternatives[0].alternativeFallbackKey).toBe("intentNav.alt.manualSplit");
    });

    it("每个进阶或 AI 功能均配有手工替代方案说明，绝不产生入口死锁", () => {
        const aiFeatures = INTENT_FEATURE_REGISTRY.filter(f => f.routeTarget.includes("ai-wizard"));
        for (const feat of aiFeatures) {
            expect(feat.alternativeFallbackKey).toBeDefined();
            expect(feat.alternativeFallbackKey).toMatch(/^intentNav\.alt\./);
        }
    });
});
