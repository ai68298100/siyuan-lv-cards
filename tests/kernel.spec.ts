import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createExamPlansChangedNotice,
    EXAM_PLANS_CHANGED_EVENT,
    EXAM_PLANS_PUBLISH_RPC,
} from "../src/core/exam-plan-sync";

describe("kernel plugin lifecycle & exam plans RPC contract", () => {
    let mockApi: any;
    let rpcHandlers: Map<string, Function>;
    let broadcastCalls: Array<{ event: string; data: unknown }>;
    let unbindCalls: string[];

    beforeEach(async () => {
        rpcHandlers = new Map();
        broadcastCalls = [];
        unbindCalls = [];

        mockApi = {
            plugin: {
                name: "siyuan-lv-cards",
                platform: "desktop-windows",
                lifecycle: {
                    onload: null,
                    onunload: null,
                },
            },
            logger: {
                info: vi.fn().mockResolvedValue(undefined),
            },
            rpc: {
                bind: vi.fn().mockImplementation(async (name: string, handler: Function) => {
                    rpcHandlers.set(name, handler);
                }),
                broadcast: vi.fn().mockImplementation(async (event: string, data: unknown) => {
                    broadcastCalls.push({ event, data });
                }),
                unbind: vi.fn().mockImplementation(async (name: string) => {
                    unbindCalls.push(name);
                    rpcHandlers.delete(name);
                }),
            },
        };

        // 注入全局 siyuan 对象（模拟 Goja 内核注入环境）
        (globalThis as any).siyuan = mockApi;

        // 动态重新加载 kernel 模块
        vi.resetModules();
        await import("../src/kernel");
    });

    it("registers echo and exam plans publish RPC handlers on load", async () => {
        expect(mockApi.plugin.lifecycle.onload).toBeTypeOf("function");
        expect(mockApi.plugin.lifecycle.onunload).toBeTypeOf("function");

        await mockApi.plugin.lifecycle.onload();

        expect(mockApi.logger.info).toHaveBeenCalledWith("[siyuan-lv-cards] kernel plugin loading");
        expect(mockApi.rpc.bind).toHaveBeenCalledTimes(2);
        expect(rpcHandlers.has("echo")).toBe(true);
        expect(rpcHandlers.has(EXAM_PLANS_PUBLISH_RPC)).toBe(true);
    });

    it("echo RPC returns plugin name, platform, and received arguments", async () => {
        await mockApi.plugin.lifecycle.onload();
        const echoHandler = rpcHandlers.get("echo")!;

        const result = await echoHandler("ping", 123, { test: true });
        expect(result).toEqual({
            plugin: "siyuan-lv-cards",
            platform: "desktop-windows",
            args: ["ping", 123, { test: true }],
        });
    });

    it("accepts valid exam plans notice and broadcasts to other frontends", async () => {
        await mockApi.plugin.lifecycle.onload();
        const publishHandler = rpcHandlers.get(EXAM_PLANS_PUBLISH_RPC)!;

        const notice = createExamPlansChangedNotice("window-frontend-1", 5, 1_700_000_000_000);
        const res = await publishHandler(notice);

        expect(res).toEqual({ accepted: true });
        expect(broadcastCalls).toHaveLength(1);
        expect(broadcastCalls[0]).toEqual({
            event: EXAM_PLANS_CHANGED_EVENT,
            data: notice,
        });
    });

    it.each([
        null,
        undefined,
        "string-notice",
        12345,
        {},
        { schema: 2, sourceID: "win-1", sequence: 1, changedAt: Date.now() },
        { schema: 1, sourceID: "", sequence: 1, changedAt: Date.now() },
        { schema: 1, sourceID: "win-1", sequence: 0, changedAt: Date.now() },
        { schema: 1, sourceID: "win-1", sequence: -1, changedAt: Date.now() },
        { schema: 1, sourceID: "win-1", sequence: 1, changedAt: 0 },
    ])("rejects invalid change notice (%j) and refuses to broadcast", async (invalidNotice) => {
        await mockApi.plugin.lifecycle.onload();
        const publishHandler = rpcHandlers.get(EXAM_PLANS_PUBLISH_RPC)!;

        await expect(publishHandler(invalidNotice)).rejects.toThrow("Invalid exam plans change notice");
        expect(broadcastCalls).toHaveLength(0);
    });

    it("unbinds echo and exam plans RPC upon plugin unload", async () => {
        await mockApi.plugin.lifecycle.onload();
        expect(rpcHandlers.size).toBe(2);

        await mockApi.plugin.lifecycle.onunload();

        expect(unbindCalls).toEqual(["echo", EXAM_PLANS_PUBLISH_RPC]);
        expect(rpcHandlers.size).toBe(0);
    });
});
