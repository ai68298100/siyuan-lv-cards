import { describe, expect, it } from "vitest";
import { normalizeNativeCardAction, NativeEventDeduper } from "../src/core/native-events";

describe("normalizeNativeCardAction（AQ-5 原生评分严格化）", () => {
    it("合法评分 1-4 整数放行并透传字段", () => {
        const e = normalizeNativeCardAction({ cardID: "c1", deckID: "d", blockID: "b", rating: 3, ts: 1000 });
        expect(e).toEqual({ cardID: "c1", deckID: "d", blockID: "b", rating: 3, ts: 1000, timeEstimated: false });
    });

    it("level 字段别名同样接受", () => {
        expect(normalizeNativeCardAction({ id: "c2", level: 4 })?.rating).toBe(4);
    });

    it("非整数评分（2.5）与小数边界外（5、-1）丢弃", () => {
        expect(normalizeNativeCardAction({ cardID: "c", rating: 2.5 })).toBeNull();
        expect(normalizeNativeCardAction({ cardID: "c", rating: 5 })).toBeNull();
        expect(normalizeNativeCardAction({ cardID: "c", rating: -1 })).toBeNull();
        expect(normalizeNativeCardAction({ cardID: "c", rating: "3" })).toBeNull();
    });

    it("显式 skip（action/rating=0）记为 0 分", () => {
        expect(normalizeNativeCardAction({ cardID: "c", action: "skip" })?.rating).toBe(0);
        expect(normalizeNativeCardAction({ cardID: "c", rating: 0 })?.rating).toBe(0);
    });

    it("缺卡 ID / 非对象事件丢弃", () => {
        expect(normalizeNativeCardAction({ rating: 3 })).toBeNull();
        expect(normalizeNativeCardAction(null)).toBeNull();
        expect(normalizeNativeCardAction("x")).toBeNull();
    });

    it("内核未带时间时回退本地时钟并标估算；带时间直接用真实事件时间", () => {
        const now = 1_700_000_000_000;
        const est = normalizeNativeCardAction({ cardID: "c", rating: 2 }, now);
        expect(est?.ts).toBe(now);
        expect(est?.timeEstimated).toBe(true);
        const real = normalizeNativeCardAction({ cardID: "c", rating: 2, ts: 12345 }, now);
        expect(real?.ts).toBe(12345);
        expect(real?.timeEstimated).toBe(false);
    });
});

describe("NativeEventDeduper（AQ-5 幂等去重）", () => {
    it("同 eventId 只记一次", () => {
        const d = new NativeEventDeduper();
        expect(d.seen("e1", "c1", 1000)).toBe(false);
        expect(d.seen("e1", "c1", 1001)).toBe(true);
    });

    it("无 eventId 时同卡 1s 时间窗内视为重复", () => {
        const d = new NativeEventDeduper();
        expect(d.seen(undefined, "c1", 1000)).toBe(false);
        expect(d.seen(undefined, "c1", 1500)).toBe(true);
        expect(d.seen(undefined, "c1", 2500)).toBe(false); // 窗口外不再重复
    });

    it("不同卡互不影响", () => {
        const d = new NativeEventDeduper();
        expect(d.seen(undefined, "c1", 1000)).toBe(false);
        expect(d.seen(undefined, "c2", 1000)).toBe(false);
    });

    it("容量裁剪不抛错（极值下允许遗忘，保证不膨胀）", () => {
        const d = new NativeEventDeduper(1000, 4);
        for (let i = 0; i < 20; i++) {
            expect(() => d.seen(`e${i}`, `c${i}`, 1000 + i)).not.toThrow();
        }
    });
});
