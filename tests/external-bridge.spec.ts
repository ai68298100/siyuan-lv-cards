import { describe, expect, it, vi } from "vitest";
import {
    buildCardsBridge,
    CARDS_BRIDGE_NAME,
    CARDS_BRIDGE_PROTOCOL,
    dispatchCardReviewedEvent,
    mountCardsBridge,
    type CardsBridgeHost,
} from "../src/api/external-bridge";

describe("小驴闪卡对外窗口桥与事件总线（Epoch 6）", () => {
    const makeHost = (overrides: Partial<CardsBridgeHost> = {}): CardsBridgeHost => ({
        getStats: () => ({
            todayReviews: 12,
            todayNew: 5,
            todayForget: 2,
            streak: 7,
            dueCount: 15,
            historyDays: 30,
        }),
        getDueSummary: async () => ({
            unreviewedCount: 15,
            unreviewedNewCardCount: 5,
            unreviewedOldCardCount: 10,
            updatedAt: "2026-10-19T08:00:00.000Z",
        }),
        openHub: vi.fn(),
        openReview: vi.fn(),
        ...overrides,
    });

    it("协议常量与契约元数据对齐", () => {
        expect(CARDS_BRIDGE_PROTOCOL).toBe(1);
        expect(CARDS_BRIDGE_NAME).toBe("xiaolv-cards");

        const bridge = buildCardsBridge(makeHost());
        expect(bridge.protocol).toBe(1);
        expect(bridge.protocolName).toBe("xiaolv-cards");
        expect(bridge.capabilities).toContain("whenReady");
        expect(bridge.capabilities).toContain("stats");
        expect(bridge.capabilities).toContain("due");
        expect(bridge.capabilities).toContain("openHub");
        expect(bridge.capabilities).toContain("openReview");
        expect(bridge.capabilities).toContain("hasCapability");
        expect(bridge.capabilities).toContain("getOverview");
        expect(bridge.hasCapability("stats")).toBe(true);
        expect(bridge.hasCapability("unknown-xyz")).toBe(false);
        const overview = bridge.getOverview() as Record<string, unknown>;
        expect(overview.name).toBe("siyuan-lv-cards");
        expect(overview.maturity).toBe("stable");
    });

    it("whenReady：探针就绪直接返回 true", async () => {
        const bridge = buildCardsBridge(makeHost());
        const ready = await bridge.whenReady();
        expect(ready).toBe(true);
    });

    it("getStats：正常返回数据信封与异常防御", async () => {
        const bridge = buildCardsBridge(makeHost());
        const res = await bridge.getStats();
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.todayReviews).toBe(12);
            expect(res.data.streak).toBe(7);
            expect(res.data.dueCount).toBe(15);
        }

        // 异常防御
        const brokenBridge = buildCardsBridge(makeHost({
            getStats: () => { throw new Error("db fault"); },
        }));
        const fail = await brokenBridge.getStats();
        expect(fail.ok).toBe(false);
        if (!fail.ok) {
            expect(fail.code).toBe("stats-error");
            expect(fail.message).toContain("db fault");
        }
    });

    it("getDueSummary：获取到期卡汇总与异常保护", async () => {
        const bridge = buildCardsBridge(makeHost());
        const res = await bridge.getDueSummary();
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.unreviewedCount).toBe(15);
            expect(res.data.unreviewedNewCardCount).toBe(5);
            expect(res.data.unreviewedOldCardCount).toBe(10);
            expect(res.data.updatedAt).toBe("2026-10-19T08:00:00.000Z");
        }

        const brokenBridge = buildCardsBridge(makeHost({
            getDueSummary: async () => { throw new Error("network timeout"); },
        }));
        const fail = await brokenBridge.getDueSummary();
        expect(fail.ok).toBe(false);
        if (!fail.ok) {
            expect(fail.code).toBe("due-error");
            expect(fail.message).toContain("network timeout");
        }
    });

    it("openHub 与 openReview：成功调用并安全回执", async () => {
        const openHubSpy = vi.fn();
        const openReviewSpy = vi.fn();
        const bridge = buildCardsBridge(makeHost({
            openHub: openHubSpy,
            openReview: openReviewSpy,
        }));

        const hubRes = await bridge.openHub("manage");
        expect(hubRes.ok).toBe(true);
        expect(openHubSpy).toHaveBeenCalledWith("manage");

        const reviewRes = await bridge.openReview({ scope: "deck-123", cram: true });
        expect(reviewRes.ok).toBe(true);
        expect(openReviewSpy).toHaveBeenCalledWith({ scope: "deck-123", cram: true });
    });

    it("mountCardsBridge：挂载四命名空间别名，遵循首实例独占与安全卸载", () => {
        const fakeWindow: Record<string, unknown> = {};
        const host = makeHost();

        const unmount = mountCardsBridge(host, fakeWindow as any);
        expect(fakeWindow.xiaolvCards).toBeDefined();
        expect(fakeWindow.lvCards).toBeDefined();
        expect(fakeWindow.LvCards).toBeDefined();
        expect(fakeWindow.siyuanCards).toBeDefined();
        expect(fakeWindow.xiaolvCards).toBe(fakeWindow.lvCards);
        expect(fakeWindow.LvCards).toBe(fakeWindow.siyuanCards);

        // 重复挂载不覆盖已存在的桥（首个实例独占）
        const secondHost = makeHost({ openHub: vi.fn() });
        const unmountSecond = mountCardsBridge(secondHost, fakeWindow as any);
        expect(fakeWindow.xiaolvCards).toBe(fakeWindow.lvCards);

        // 卸载
        unmount();
        expect(fakeWindow.xiaolvCards).toBeUndefined();
        expect(fakeWindow.lvCards).toBeUndefined();
        expect(fakeWindow.LvCards).toBeUndefined();
        expect(fakeWindow.siyuanCards).toBeUndefined();

        // 次级 unmount 不应误删已清空的环境
        unmountSecond();
    });

    it("dispatchCardReviewedEvent：通过 window.dispatchEvent 派发标准生态事件", () => {
        const dispatchSpy = vi.spyOn(window, "dispatchEvent");
        try {
            dispatchCardReviewedEvent({
                cardID: "card-999",
                deckID: "deck-111",
                blockID: "block-888",
                rating: 3,
                source: "plugin",
                ts: 1791045009999,
            });

            expect(dispatchSpy).toHaveBeenCalledTimes(1);
            const callArg = dispatchSpy.mock.calls[0][0] as CustomEvent;
            expect(callArg.type).toBe("lv-cards:reviewed");
            expect(callArg.detail).toEqual({
                plugin: "lv-cards",
                v: 1,
                ts: 1791045009999,
                cardID: "card-999",
                deckID: "deck-111",
                blockID: "block-888",
                rating: 3,
                source: "plugin",
                occurredAt: new Date(1791045009999).toISOString(),
                idempotencyKey: "card-999:1791045009999",
            });
        } finally {
            dispatchSpy.mockRestore();
        }
    });
});
