import { describe, expect, it } from "vitest";
import {
    executeAiPipelineTask,
    type PipelineExecutionOptions,
    type PipelineStage,
} from "../src/core/ai-pipeline-runtime";
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

const BASE_OPTIONS: Omit<PipelineExecutionOptions, "onStageChange"> = {
    task: "cards-generate",
    sourceText: "细胞是生物体结构和功能的基本单位。细胞膜控制物质进出，线粒体是有氧呼吸的主要场所。",
    cfg: { count: 3, language: "zh-CN", type: "qa" },
    modelId: "gpt-4o-mini",
    defaultSystem: "你是一个专业的闪卡生成专家。",
    userTemplate: "材料：${source}\n请生成 ${count} 张 ${language} 的 ${type} 卡片。",
    typeClozeHint: "填空题",
    typeQaHint: "问答题",
    timeoutMs: 1000,
};

describe("BU-11: 统一 AI 调用流水线运行时 (AI Pipeline Runtime)", () => {
    it("全链路成功执行：完整走通阶段流转、提示词围栏组装、分发与数据解析", async () => {
        const stages: PipelineStage[] = [];
        const mockRawResponse = JSON.stringify([
            { front: "细胞的基本单位是什么？", back: "细胞是生物体结构和功能的基本单位。" },
            { front: "线粒体的功能是什么？", back: "线粒体是有氧呼吸的主要场所。" },
        ]);

        const result = await executeAiPipelineTask(
            {
                ...BASE_OPTIONS,
                onStageChange: (s) => stages.push(s),
            },
            async (prompts) => {
                expect(prompts.system).toContain("你是一个专业的闪卡生成专家");
                expect(prompts.user).toContain("线粒体");
                return mockRawResponse;
            },
            (raw) => JSON.parse(raw),
        );

        expect(result.success).toBe(true);
        expect(result.stage).toBe("completed");
        expect(result.data).toHaveLength(2);
        expect(result.neverModifiesKernelSchedule).toBe(true);
        expect(result.audit.success).toBe(true);
        expect(result.audit.stageReached).toBe("completed");
        expect(result.audit.tokensEstimated).toBeGreaterThan(0);

        // 验证生命周期阶段顺序
        expect(stages).toEqual([
            "validating-eligibility",
            "checking-ceilings",
            "assembling-prompts",
            "dispatching",
            "validating-schema",
            "completed",
        ]);
    });

    it("调用前主动取消：AbortSignal 预先中止，零网络外发", async () => {
        const abortController = new AbortController();
        abortController.abort(); // 立即取消

        let dispatcherCalled = false;
        const result = await executeAiPipelineTask(
            {
                ...BASE_OPTIONS,
                signal: abortController.signal,
            },
            async () => {
                dispatcherCalled = true;
                return "{}";
            },
            () => ({}),
        );

        expect(dispatcherCalled).toBe(false);
        expect(result.success).toBe(false);
        expect(result.stage).toBe("aborted");
        expect(result.errorKey).toBe("aiPipeline.error.canceled");
        expect(result.neverModifiesKernelSchedule).toBe(true);
        expect(result.audit.tokensEstimated).toBe(0);
    });

    it("执行中主动取消：分发中途触发 abort，优雅熔断并不执行解析", async () => {
        const abortController = new AbortController();
        let parserCalled = false;

        const result = await executeAiPipelineTask(
            {
                ...BASE_OPTIONS,
                signal: abortController.signal,
            },
            async () => {
                // 模拟异步请求中途收到取消信号
                abortController.abort();
                const err = new Error("AICanceledError");
                err.name = "AICanceledError";
                throw err;
            },
            () => {
                parserCalled = true;
                return {};
            },
        );

        expect(parserCalled).toBe(false);
        expect(result.success).toBe(false);
        expect(result.stage).toBe("aborted");
        expect(result.errorKey).toBe("aiPipeline.error.canceled");
        expect(result.neverModifiesKernelSchedule).toBe(true);
    });

    it("成本硬上限熔断拦截：超限时直接在 checking-ceilings 阶段拦截，零网络外发", async () => {
        let dispatcherCalled = false;
        const result = await executeAiPipelineTask(
            {
                ...BASE_OPTIONS,
                ceilings: {
                    singleRequestTokenCap: 10, // 故意设置极小上限
                    dailyTokenCap: 50000,
                    dailyCostUsdCap: 2.0,
                },
            },
            async () => {
                dispatcherCalled = true;
                return "{}";
            },
            () => ({}),
        );

        expect(dispatcherCalled).toBe(false);
        expect(result.success).toBe(false);
        expect(result.stage).toBe("checking-ceilings");
        expect(result.errorKey).toBe("aiTokenCost.error.singleCapExceeded");
        expect(result.ceilingCheck?.neverSilentlyFallsBack).toBe(true);
        expect(result.neverModifiesKernelSchedule).toBe(true);
    });

    it("请求超时熔断：分发耗时超出 timeoutMs 自动熔断与清理定时器", async () => {
        const result = await executeAiPipelineTask(
            {
                ...BASE_OPTIONS,
                timeoutMs: 50, // 50ms 超时
            },
            async () => {
                // 挂起 200ms
                await new Promise((resolve) => setTimeout(resolve, 200));
                return "{}";
            },
            () => ({}),
        );

        expect(result.success).toBe(false);
        expect(result.stage).toBe("dispatching");
        expect(result.errorKey).toBe("aiDegrad.class.network");
        expect(result.neverModifiesKernelSchedule).toBe(true);
        expect(result.audit.errorSummary).toBe("network");
    });

    it("主端点可重试故障：在 policy 允许下自动重试主端点并成功恢复", async () => {
        let attempts = 0;
        const result = await executeAiPipelineTask(
            {
                ...BASE_OPTIONS,
                ladderPolicy: {
                    maxPrimaryAttempts: 2,
                    hasFallback: false,
                    retryBaseMs: 10,
                },
                sleepFn: async () => {}, // 快速跳过延迟
            },
            async () => {
                attempts++;
                if (attempts === 1) {
                    throw new Error("HTTP 502 Bad Gateway");
                }
                return JSON.stringify({ ok: true });
            },
            (raw) => JSON.parse(raw),
        );

        expect(attempts).toBe(2);
        expect(result.success).toBe(true);
        expect(result.stage).toBe("completed");
        expect(result.data).toEqual({ ok: true });
        expect(result.neverModifiesKernelSchedule).toBe(true);
    });

    it("备用端点路由：主端点失败后根据阶梯转入已授权 fallbackDispatcher 并明确记账", async () => {
        let primaryCalled = false;
        let fallbackCalled = false;

        const result = await executeAiPipelineTask(
            {
                ...BASE_OPTIONS,
                ladderPolicy: {
                    maxPrimaryAttempts: 1,
                    hasFallback: true,
                },
                fallbackDispatcher: async () => {
                    fallbackCalled = true;
                    return JSON.stringify({ source: "fallback" });
                },
            },
            async () => {
                primaryCalled = true;
                throw new Error("HTTP 500 Internal Server Error");
            },
            (raw) => JSON.parse(raw),
        );

        expect(primaryCalled).toBe(true);
        expect(fallbackCalled).toBe(true);
        expect(result.success).toBe(true);
        expect(result.stage).toBe("completed");
        expect(result.data).toEqual({ source: "fallback" });
        expect(result.audit.degradationStep?.usedFallback).toBe(true);
        expect(result.audit.degradationStep?.action).toBe("try-fallback");
    });

    it("权限错误终止保护：401/403 认证错误绝不盲目转备用端点重发", async () => {
        let fallbackCalled = false;
        const result = await executeAiPipelineTask(
            {
                ...BASE_OPTIONS,
                ladderPolicy: {
                    maxPrimaryAttempts: 1,
                    hasFallback: true,
                },
                fallbackDispatcher: async () => {
                    fallbackCalled = true;
                    return "{}";
                },
            },
            async () => {
                throw new Error("HTTP 401 Unauthorized: Invalid API key");
            },
            () => ({}),
        );

        expect(fallbackCalled).toBe(false);
        expect(result.success).toBe(false);
        expect(result.stage).toBe("dispatching");
        expect(result.errorKey).toBe("aiDegrad.class.auth");
        expect(result.audit.degradationStep?.action).toBe("abort");
        expect(result.audit.degradationStep?.usedFallback).toBe(false);
    });

    it("Schema 解析失败安全捕获：响应内容损坏时标记为 parseFailed 且提示词审计完备", async () => {
        const result = await executeAiPipelineTask(
            BASE_OPTIONS,
            async () => "invalid json {[[",
            (raw) => JSON.parse(raw),
        );

        expect(result.success).toBe(false);
        expect(result.stage).toBe("validating-schema");
        expect(result.errorKey).toBe("aiPipeline.error.parseFailed");
        expect(result.neverModifiesKernelSchedule).toBe(true);
        expect(result.audit.errorSummary).toBe("schema-parse-failure");
    });

    it("中英双语 i18n 覆盖：所有阶段名与错误键在双语字典中均合法存在", () => {
        const stages: PipelineStage[] = [
            "idle",
            "validating-eligibility",
            "checking-ceilings",
            "assembling-prompts",
            "dispatching",
            "validating-schema",
            "completed",
            "aborted",
        ];

        for (const stage of stages) {
            const zh = resolveKey(zhJson, `aiPipeline.stage.${stage}`);
            const en = resolveKey(enJson, `aiPipeline.stage.${stage}`);
            expect(zh, `Missing zh translation for stage ${stage}`).toBeDefined();
            expect(en, `Missing en translation for stage ${stage}`).toBeDefined();
        }

        const errors = ["canceled", "assemblyFailed", "parseFailed"];
        for (const err of errors) {
            const zh = resolveKey(zhJson, `aiPipeline.error.${err}`);
            const en = resolveKey(enJson, `aiPipeline.error.${err}`);
            expect(zh, `Missing zh translation for error ${err}`).toBeDefined();
            expect(en, `Missing en translation for error ${err}`).toBeDefined();
        }
    });
});
