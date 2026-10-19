import { describe, expect, it } from "vitest";
import {
    GATEWAY_ERROR_CATEGORIES,
    classifyKernelError,
    executeGatewayCall,
} from "../src/core/kernel-request-gateway";

describe("kernel-request-gateway (AX-8 UI 与内核调用边界收拢网关)", () => {
    it("包含全量七大错误语义分类", () => {
        expect(GATEWAY_ERROR_CATEGORIES).toEqual([
            "auth-failed",
            "not-found",
            "timeout",
            "invalid-payload",
            "kernel-error",
            "network-error",
            "unknown",
        ]);
    });

    it("错误智能语义分类器 classifyKernelError", () => {
        expect(classifyKernelError(new Error("401 Unauthorized token invalid")).category).toBe("auth-failed");
        expect(classifyKernelError(new Error("404 endpoint not found"), "/api/foo").category).toBe("not-found");
        expect(classifyKernelError(new Error("Kernel request timeout after 5000ms")).category).toBe("timeout");
        expect(classifyKernelError(new Error("Invalid param blockId")).category).toBe("invalid-payload");
        expect(classifyKernelError(new Error("fetch failed ECONNREFUSED")).category).toBe("network-error");
        expect(classifyKernelError(new Error("Database disk write failed")).category).toBe("kernel-error");
    });

    it("成功请求：自动解包标准结构 { code: 0, data: T }", async () => {
        const mockTransport = async (endpoint: string, payload: Record<string, unknown>) => {
            expect(endpoint).toBe("/api/block/getBlockInfo");
            expect(payload.id).toBe("block-101");
            return { code: 0, data: { rootID: "doc-1", content: "笔记内容" } };
        };

        const res = await executeGatewayCall<{ rootID: string; content: string }>(
            mockTransport,
            "/api/block/getBlockInfo",
            { id: "block-101" },
        );

        expect(res.success).toBe(true);
        expect(res.data?.rootID).toBe("doc-1");
        expect(res.data?.content).toBe("笔记内容");
        expect(res.diagnostics).toBeUndefined();
    });

    it("异常请求诊断与凭据安全脱敏：载荷中的 token / apiKey / password 自动遮蔽", async () => {
        const mockTransport = async () => {
            throw new Error("401 Unauthorized API Token invalid");
        };

        const res = await executeGatewayCall(
            mockTransport,
            "/api/sync/performSync",
            {
                apiToken: "sk-super-secret-123456",
                userName: "admin",
            },
        );

        expect(res.success).toBe(false);
        expect(res.data).toBeUndefined();
        expect(res.diagnostics).toBeDefined();

        const diag = res.diagnostics!;
        expect(diag.category).toBe("auth-failed");
        expect(diag.i18nKey).toBe("kernelGateway.error.authFailed");

        // 核心安全原则：载荷中明文 token 必须被脱敏遮蔽
        expect(diag.sanitizedPayload.apiToken).toBe("***");
        expect(diag.sanitizedPayload.userName).toBe("admin");
    });

    it("超时熔断：当 transport 耗时超出 timeoutMs 时自动终止请求", async () => {
        const slowTransport = async () => {
            return new Promise(resolve => setTimeout(resolve, 200));
        };

        const res = await executeGatewayCall(
            slowTransport,
            "/api/slowEndpoint",
            {},
            { timeoutMs: 50 },
        );

        expect(res.success).toBe(false);
        expect(res.diagnostics?.category).toBe("timeout");
        expect(res.diagnostics?.rawMessage).toContain("超时");
    });

    it("只读优雅降级守卫：声明 fallbackValue 时遇错不向 UI 抛错，返回兜底默认值", async () => {
        const failingTransport = async () => {
            throw new Error("Kernel crashed or unreachable");
        };

        // UI 查询卡片统计，即便内核异常也返回 0，防止卡死
        const res = await executeGatewayCall<number>(
            failingTransport,
            "/api/query/cardCount",
            {},
            { fallbackValue: 0 },
        );

        expect(res.success).toBe(false);
        expect(res.data).toBe(0); // 安全获得兜底值
        expect(res.diagnostics).toBeDefined();
        expect(res.diagnostics?.category).toBe("kernel-error");
    });
});
