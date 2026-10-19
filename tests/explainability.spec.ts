import { describe, expect, it } from "vitest";
import {
    createRecommendationExplanation,
    acceptRecommendation,
    rejectRecommendation,
    modifyRecommendation,
    formatExplanationText,
} from "../src/core/explainability";
import type { CreateExplanationParams } from "../src/core/explainability";

describe("explainability (BL-6 建议解释面板与透明度引擎)", () => {
    const baseParams: CreateExplanationParams = {
        kind: "today-action-decision",
        title: "建议今日先修卡",
        summary: "检测到今日到期中有 3 张结构破损卡片，建议先修复避免影响 FSRS 评判",
        inputs: [
            { type: "block", idOrLabel: "20261019120000-abcdef1", description: "破损卡片来源块" },
            { type: "revlog-window", idOrLabel: "last-7-days", description: "近 7 天学习日志" },
        ],
        sourceType: "heuristic",
        ruleIdentifier: "today-decision-fix-broken",
        version: "1.2",
        kernelImpact: "none",
        now: 1700000000000,
    };

    it("创建结构化建议解释对象，初始状态为 proposed，影响说明键正确映射", () => {
        const exp = createRecommendationExplanation(baseParams);

        expect(exp.suggestionId).toMatch(/^exp-\d+-[a-z0-9]+$/);
        expect(exp.kind).toBe("today-action-decision");
        expect(exp.title).toBe("建议今日先修卡");
        expect(exp.status).toBe("proposed");
        expect(exp.sourceType).toBe("heuristic");
        expect(exp.isAi).toBe(false);
        expect(exp.kernelImpact).toBe("none");
        expect(exp.kernelImpactKey).toBe("explainability.impact.none");
        expect(exp.inputs).toHaveLength(2);
        expect(exp.inputs[0].idOrLabel).toBe("20261019120000-abcdef1");
    });

    it("AI 驱动建议正确记录模型信息且绝不记录/泄露密钥", () => {
        const aiParams: CreateExplanationParams = {
            kind: "ai-card-candidate",
            title: "AI 生成候选卡片",
            summary: "从材料提炼 5 张原子问答卡",
            inputs: [
                { type: "block", idOrLabel: "block-source-999", description: '材料包含 sk-1234567890abcdef 和 Bearer token-abcdef12345678' },
            ],
            sourceType: "ai-model",
            aiMetadata: {
                provider: "deepseek",
                model: "deepseek-chat",
                templateId: "atomic-split",
            },
            version: "2.0",
            kernelImpact: "indirect-session-only",
        };

        const exp = createRecommendationExplanation(aiParams);
        expect(exp.isAi).toBe(true);
        expect(exp.aiMetadata).toBeDefined();
        expect(exp.aiMetadata?.provider).toBe("deepseek");
        expect(exp.aiMetadata?.model).toBe("deepseek-chat");
        expect(exp.aiMetadata?.templateId).toBe("atomic-split");
        expect(exp.kernelImpactKey).toBe("explainability.impact.sessionOnly");

        // 绝不包含明文密钥，已被脱敏遮蔽
        const inputDesc = exp.inputs[0].description;
        expect(inputDesc).not.toContain("sk-1234567890abcdef");
        expect(inputDesc).toContain("sk-***cdef");
        expect(inputDesc).not.toContain("token-abcdef12345678");
    });

    it("用户采纳建议：acceptRecommendation 转换状态为 accepted 并记录 resolvedAt", () => {
        const exp = createRecommendationExplanation(baseParams);
        const resolved = acceptRecommendation(exp, 1700000010000);

        expect(resolved.status).toBe("accepted");
        expect(resolved.resolvedAt).toBe(1700000010000);

        // 无法重复采纳
        expect(() => acceptRecommendation(resolved)).toThrowError(/Cannot accept suggestion in status: accepted/);
    });

    it("用户拒绝建议：rejectRecommendation 转换状态为 rejected 并记录拒绝理由", () => {
        const exp = createRecommendationExplanation(baseParams);
        const rejected = rejectRecommendation(exp, "explainability.reject.preferManual", 1700000020000);

        expect(rejected.status).toBe("rejected");
        expect(rejected.rejectionReasonKey).toBe("explainability.reject.preferManual");
        expect(rejected.resolvedAt).toBe(1700000020000);

        // 无法重复拒绝
        expect(() => rejectRecommendation(rejected)).toThrowError(/Cannot reject suggestion in status: rejected/);
    });

    it("用户修改建议：modifyRecommendation 转换状态为 modified 并记录修改要点", () => {
        const exp = createRecommendationExplanation(baseParams);
        const modified = modifyRecommendation(exp, "将修卡数量调整为 1 张，其余留在今日队列", 1700000030000);

        expect(modified.status).toBe("modified");
        expect(modified.modificationSummary).toBe("将修卡数量调整为 1 张，其余留在今日队列");
        expect(modified.resolvedAt).toBe(1700000030000);

        // 无法再次修改已解决的建议
        expect(() => modifyRecommendation(modified, "再次修改")).toThrowError(/Cannot modify suggestion in status: modified/);
    });

    it("formatExplanationText 输出结构完整且对用户友好的多行报告", () => {
        const exp = createRecommendationExplanation(baseParams);
        const text = formatExplanationText(exp);

        expect(text).toContain("【建议今日先修卡】");
        expect(text).toContain("建议概要: 检测到今日到期中有 3 张结构破损卡片");
        expect(text).toContain("来源方式: heuristic (本地规则) [v1.2]");
        expect(text).toContain("触发规则: today-decision-fix-broken");
        expect(text).toContain("内核影响: none (确认前不修改原生调度)");
        expect(text).toContain("输入依据:");
        expect(text).toContain("20261019120000-abcdef1");
        expect(text).toContain("当前决策: proposed");
    });
});
