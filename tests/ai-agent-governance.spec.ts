import { describe, expect, it } from "vitest";
import {
    isVersionAtLeast,
    negotiateAgentCapabilities,
} from "../src/core/ai-agent-negotiator";
import {
    createAgentExecutionGuard,
} from "../src/core/ai-agent-guard";
import { createDefaultConsentState } from "../src/core/consent-center";
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

describe("BU-3: SiYuan Agent Capability Negotiator", () => {
    it("版本语义比较 (isVersionAtLeast)", () => {
        expect(isVersionAtLeast("3.9.0", "3.9.0")).toBe(true);
        expect(isVersionAtLeast("3.10.1", "3.9.0")).toBe(true);
        expect(isVersionAtLeast("3.8.12", "3.9.0")).toBe(false);
        expect(isVersionAtLeast("v4.0.0", "3.9.0")).toBe(true);
    });

    it("未配置 AI 端点时平滑降级至纯本地手工流程 (manual-local)", () => {
        const res = negotiateAgentCapabilities({
            siyuanVersion: "3.9.5",
            hasAgentRuntime: true,
            supportsFunctionCalling: true,
            aiConfigured: false,
        });

        expect(res.mode).toBe("manual-local");
        expect(res.schemaDialect).toBe("none");
        expect(res.registeredTools).toHaveLength(0);
        expect(res.neverAltersKernelSchedule).toBe(true);
        expect(res.reasonKey).toBe("agentNegotiator.reason.aiNotConfigured");
    });

    it("宿主版本低于 3.9.0 时降级为标准 AI，杜绝注册虚假工具", () => {
        const res = negotiateAgentCapabilities({
            siyuanVersion: "3.8.6",
            hasAgentRuntime: true,
            supportsFunctionCalling: true,
            aiConfigured: true,
        });

        expect(res.mode).toBe("standard-ai");
        expect(res.registeredTools).toHaveLength(0);
        expect(res.neverAltersKernelSchedule).toBe(true);
        expect(res.reasonKey).toBe("agentNegotiator.reason.versionTooLow");
    });

    it("具备运行时但无工具调用协议时降级为标准 AI", () => {
        const res = negotiateAgentCapabilities({
            siyuanVersion: "3.9.2",
            hasAgentRuntime: true,
            supportsFunctionCalling: false,
            aiConfigured: true,
        });

        expect(res.mode).toBe("standard-ai");
        expect(res.registeredTools).toHaveLength(0);
        expect(res.reasonKey).toBe("agentNegotiator.reason.toolCallingUnsupported");
    });

    it("满足全部条件时协商为原生 Agent 模式并动态绑定已授权工具", () => {
        const consent = createDefaultConsentState();
        // 默认状态下 ecosystem-bridge 已开启，因此关联工具可用
        const res = negotiateAgentCapabilities(
            {
                siyuanVersion: "3.9.2",
                hasAgentRuntime: true,
                agentProtocolVersion: 2,
                supportsFunctionCalling: true,
                supportsStreaming: true,
                supportsNativeCancellation: true,
                aiConfigured: true,
            },
            consent,
        );

        expect(res.mode).toBe("native-agent");
        expect(res.schemaDialect).toBe("json-schema-v1");
        expect(res.canStream).toBe(true);
        expect(res.canCancel).toBe(true);
        expect(res.registeredTools.length).toBeGreaterThan(0);
        expect(res.neverAltersKernelSchedule).toBe(true);
        expect(res.reasonKey).toBe("agentNegotiator.reason.ready");
    });
});

describe("BU-4: Agent Execution Loop Guard & State Machine", () => {
    it("正常调用场景下放行并准确统计摘要", () => {
        const guard = createAgentExecutionGuard({ maxTotalCalls: 5 });
        const check = guard.checkBeforeToolCall("get_learning_stats", { windowDays: 7 });
        expect(check.allowed).toBe(true);

        const outcome = guard.recordToolCallOutcome("get_learning_stats", { windowDays: 7 }, true, 0);
        expect(outcome.quotaExceeded).toBe(false);

        const summary = guard.getExecutionSummary();
        expect(summary.totalCalls).toBe(1);
        expect(summary.successfulCalls).toBe(1);
        expect(summary.isTerminated).toBe(false);
    });

    it("拦截越权注入参数并触发安全熔断 (rawSql / system_admin)", () => {
        const guard = createAgentExecutionGuard();
        const check = guard.checkBeforeToolCall("prepare_card_candidates", {
            scope: "deck",
            rawSql: "DROP TABLE blocks;",
        });

        expect(check.allowed).toBe(false);
        expect(check.blockCategory).toBe("unauthorized-parameter");
        expect(check.reasonKey).toBe("agentGuard.error.unauthorizedParameter");

        // 熔断后后续调用直接拒绝
        const nextCheck = guard.checkBeforeToolCall("get_learning_stats", {});
        expect(nextCheck.allowed).toBe(false);
        expect(nextCheck.reasonKey).toBe("agentGuard.error.alreadyTerminated");
    });

    it("工具调用次数超限时触发熔断 (max-calls-exceeded)", () => {
        const guard = createAgentExecutionGuard({ maxTotalCalls: 2 });
        guard.recordToolCallOutcome("tool_a", {}, true);
        guard.recordToolCallOutcome("tool_b", {}, true);

        const check = guard.checkBeforeToolCall("tool_c", {});
        expect(check.allowed).toBe(false);
        expect(check.blockCategory).toBe("max-calls-exceeded");
        expect(check.reasonKey).toBe("agentGuard.error.maxCallsExceeded");
    });

    it("嵌套递归深度超标时截断 (recursion-depth-exceeded)", () => {
        const guard = createAgentExecutionGuard({ maxRecursionDepth: 2 });
        const check = guard.checkBeforeToolCall("deep_tool", {}, 3); // 深度为 3 > 2

        expect(check.allowed).toBe(false);
        expect(check.blockCategory).toBe("recursion-depth-exceeded");
        expect(check.reasonKey).toBe("agentGuard.error.depthExceeded");
    });

    it("连续相同参数死循环检测 (repetitive-loop-detected)", () => {
        const guard = createAgentExecutionGuard({ repetitiveCallThreshold: 3 });
        const params = { target: "same-card-id" };

        guard.recordToolCallOutcome("query_card", params, true);
        guard.recordToolCallOutcome("query_card", params, true);
        guard.recordToolCallOutcome("query_card", params, true);

        const check = guard.checkBeforeToolCall("query_card", params);
        expect(check.allowed).toBe(false);
        expect(check.blockCategory).toBe("repetitive-loop-detected");
        expect(check.reasonKey).toBe("agentGuard.error.loopDetected");
    });

    it("实体写入超额检测 (write-quota-exceeded)", () => {
        const guard = createAgentExecutionGuard({ maxEntitiesWritten: 10 });
        const res1 = guard.recordToolCallOutcome("write_cards", {}, true, 6);
        expect(res1.quotaExceeded).toBe(false);

        const res2 = guard.recordToolCallOutcome("write_cards", {}, true, 5); // 累计 11 > 10
        expect(res2.quotaExceeded).toBe(true);

        const summary = guard.getExecutionSummary();
        expect(summary.isTerminated).toBe(true);
        expect(summary.terminationCategory).toBe("write-quota-exceeded");
    });

    it("多语言词汇对齐: 协商器与闸门引用的 i18n 键在双语中完整存在", () => {
        const keys = [
            "agentNegotiator.reason.aiNotConfigured",
            "agentNegotiator.reason.versionTooLow",
            "agentNegotiator.reason.runtimeNotAvailable",
            "agentNegotiator.reason.toolCallingUnsupported",
            "agentNegotiator.reason.ready",
            "agentGuard.error.alreadyTerminated",
            "agentGuard.error.unauthorizedParameter",
            "agentGuard.error.maxCallsExceeded",
            "agentGuard.error.depthExceeded",
            "agentGuard.error.executionTimeout",
            "agentGuard.error.loopDetected",
        ];

        for (const k of keys) {
            const zhVal = resolveKey(zhJson, k);
            const enVal = resolveKey(enJson, k);
            expect(zhVal, `zh-CN missing key: ${k}`).toBeTruthy();
            expect(enVal, `en missing key: ${k}`).toBeTruthy();
        }
    });
});
