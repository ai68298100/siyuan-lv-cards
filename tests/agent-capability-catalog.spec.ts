import { describe, expect, it } from "vitest";
import {
    AGENT_CAPABILITY_NAMES,
    AGENT_TOOL_REGISTRY,
    getPermittedAgentTools,
    invokeAgentCapability,
} from "../src/core/agent-capability-catalog";
import {
    createDefaultConsentState,
    grantConsent,
    revokeConsent,
} from "../src/core/consent-center";

describe("agent-capability-catalog (BL-4 Agent 工具能力目录与权限契约引擎)", () => {
    it("包含全量六大标准 Agent 能力注册", () => {
        expect(AGENT_CAPABILITY_NAMES).toEqual([
            "get_learning_stats",
            "prepare_card_candidates",
            "open_review_scope",
            "export_study_report",
            "query_system_health",
            "triage_maintenance_debt",
        ]);
        expect(AGENT_TOOL_REGISTRY).toHaveLength(6);
    });

    it("每个工具均声明了副作用类型与同意中心关联能力", () => {
        for (const tool of AGENT_TOOL_REGISTRY) {
            expect(tool.parameters.type).toBe("object");
            expect(["read-only", "state-change", "io-export"]).toContain(tool.effectType);
            expect(tool.requiredConsentCapability).toBeDefined();
        }
    });

    it("getPermittedAgentTools 依据同意中心权限状态动态过滤可用工具目录", () => {
        let consent = createDefaultConsentState();

        // 默认状态下：ai-generation 未授权 -> prepare_card_candidates 不在暴露目录中
        let tools = getPermittedAgentTools(consent);
        expect(tools.some(t => t.name === "prepare_card_candidates")).toBe(false);

        // 用户在同意中心显式授权 ai-generation
        consent = grantConsent(consent, "ai-generation");
        tools = getPermittedAgentTools(consent);
        expect(tools.some(t => t.name === "prepare_card_candidates")).toBe(true);

        // 用户撤销 ecosystem-bridge
        consent = revokeConsent(consent, "ecosystem-bridge");
        tools = getPermittedAgentTools(consent);
        expect(tools.some(t => t.name === "get_learning_stats")).toBe(false);
    });

    it("未授权调用安全拦截：未授权时调用 invokeAgentCapability 必须失败，返回 permissionDenied", async () => {
        const consent = createDefaultConsentState(); // ai-generation 为 unprompted 未授权

        const res = await invokeAgentCapability(
            "prepare_card_candidates",
            { sourceBlockId: "block-101" },
            consent,
            async () => ({ cards: [] }),
        );

        expect(res.success).toBe(false);
        expect(res.errorKey).toBe("agentCatalog.error.permissionDenied");
        expect(res.errorMessage).toContain("requires permission: ai-generation");
    });

    it("缺少必填参数校验：未传 sourceBlockId 阻断调用", async () => {
        let consent = createDefaultConsentState();
        consent = grantConsent(consent, "ai-generation");

        const res = await invokeAgentCapability(
            "prepare_card_candidates",
            {}, // 缺少必填 sourceBlockId
            consent,
            async () => ({ cards: [] }),
        );

        expect(res.success).toBe(false);
        expect(res.errorKey).toBe("agentCatalog.error.missingRequiredParam");
        expect(res.errorMessage).toContain("Missing required parameter: sourceBlockId");
    });

    it("合法调用执行成功，异常调用自动脱敏报错", async () => {
        let consent = createDefaultConsentState();
        consent = grantConsent(consent, "ecosystem-bridge");

        // 1. 成功路径
        const successRes = await invokeAgentCapability(
            "get_learning_stats",
            { timeWindowDays: 7 },
            consent,
            async (p) => ({ totalReviewed: 42, windowDays: p.timeWindowDays }),
        );
        expect(successRes.success).toBe(true);
        expect(successRes.data?.totalReviewed).toBe(42);

        // 2. 异常路径（错误信息中敏感凭据自动脱敏）
        const failRes = await invokeAgentCapability(
            "get_learning_stats",
            {},
            consent,
            async () => {
                throw new Error("Failed with internal key: sk-abcdef1234567890");
            },
        );
        expect(failRes.success).toBe(false);
        expect(failRes.errorKey).toBe("agentCatalog.error.executionFailed");
        expect(failRes.errorMessage).not.toContain("sk-abcdef1234567890");
        expect(failRes.errorMessage).toContain("sk-***7890");
    });
});
