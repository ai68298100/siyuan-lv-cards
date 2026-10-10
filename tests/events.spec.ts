import { describe, expect, it } from "vitest";
import {
    cardsCreatedEvent, EVENT_SOURCE, EVENT_VERSION, gatewayChangedEvent, LV_EVENTS,
    reviewedEvent, sessionFinishedEvent, settingsChangedEvent, storesChangedEvent, streakChangedEvent,
} from "../src/libs/events";

// AX-2 事件契约：version/来源/毫秒时间戳单一事实源；payload 只增不改
describe("events 契约（AX-2）", () => {
    const t = () => 1791045009395;

    it("事件名常量与历史裸字符串一致（生态兼容）", () => {
        expect(LV_EVENTS.reviewed).toBe("lv-cards:reviewed");
        expect(LV_EVENTS.streakChanged).toBe("lv-cards:streak-changed");
        expect(LV_EVENTS.cardsCreated).toBe("lv-cards:cards-created");
        expect(LV_EVENTS.sessionFinished).toBe("lv-cards:session-finished");
        expect(LV_EVENTS.settingsChanged).toBe("lv-cards:settings-changed");
        expect(LV_EVENTS.gatewayChanged).toBe("lv-cards:gateway-changed");
        expect(LV_EVENTS.storesChanged).toBe("lv-cards:stores-changed");
    });

    it("reviewedEvent：基础字段（plugin/v/ts）+ payload 原样", () => {
        const e = reviewedEvent({ cardID: "c1", deckID: "d1", blockID: "b1", rating: 3, source: "plugin" }, t);
        expect(e).toEqual({
            plugin: EVENT_SOURCE, v: EVENT_VERSION, ts: 1791045009395,
            cardID: "c1", deckID: "d1", blockID: "b1", rating: 3, source: "plugin",
        });
    });

    it("streakChanged / cardsCreated / sessionFinished / settingsChanged / gatewayChanged 形状", () => {
        expect(streakChangedEvent(5, t)).toEqual({ plugin: EVENT_SOURCE, v: 1, ts: 1791045009395, streak: 5 });
        expect(cardsCreatedEvent({ deckID: "d", count: 2, blockIDs: ["b"] }, t)).toEqual({
            plugin: EVENT_SOURCE, v: 1, ts: 1791045009395, deckID: "d", count: 2, blockIDs: ["b"],
        });
        expect(sessionFinishedEvent({ a: 1 }, t).summary).toEqual({ a: 1 });
        expect(settingsChangedEvent(t)).toEqual({ plugin: EVENT_SOURCE, v: 1, ts: 1791045009395 });
        expect(gatewayChangedEvent("Active", t)).toEqual({ plugin: EVENT_SOURCE, v: 1, ts: 1791045009395, state: "Active" });
        expect(storesChangedEvent(["/storage/petal/siyuan-lv-cards/revlog.json"], t)).toEqual({
            plugin: EVENT_SOURCE, v: 1, ts: 1791045009395,
            files: ["/storage/petal/siyuan-lv-cards/revlog.json"],
        });
    });

    it("ts 为毫秒精度（幂等键=cardID+rating+ts 组合由消费方构造）", () => {
        let now = 1000;
        const e1 = reviewedEvent({ cardID: "c", deckID: "d", blockID: "b", rating: 2, source: "native" }, () => now);
        now = 1001;
        const e2 = reviewedEvent({ cardID: "c", deckID: "d", blockID: "b", rating: 2, source: "native" }, () => now);
        expect(e2.ts - e1.ts).toBe(1);
    });
});
