import { describe, expect, it } from "vitest";
import { mergeSessionPrefs, pruneSessionPrefs } from "../src/core/session-prefs";

// BX-3 本场偏好：覆盖合并与最小化语义
describe("session-prefs", () => {
    const base = { ratingStyle: "four", reverseOrder: false, timeoutMode: "off", limit: 20 };

    it("merge：覆盖优先、其余回落全局", () => {
        const eff = mergeSessionPrefs(base, { ratingStyle: "three" });
        expect(eff.ratingStyle).toBe("three");
        expect(eff.reverseOrder).toBe(false);
        expect(eff.limit).toBe(20);
        // 不污染 base
        expect(base.ratingStyle).toBe("four");
    });

    it("merge：空覆盖 = 全局原样", () => {
        expect(mergeSessionPrefs(base, {})).toEqual(base);
    });

    it("prune：与全局同值的覆盖键被摘除", () => {
        expect(pruneSessionPrefs(base, { ratingStyle: "four", timeoutMode: "reveal" })).toEqual({ timeoutMode: "reveal" });
    });

    it("prune：全部同值时清空覆盖集", () => {
        expect(pruneSessionPrefs(base, { ratingStyle: "four", reverseOrder: false })).toEqual({});
    });

    it("prune：类型不同但字面同值也算同值（String 比较）", () => {
        expect(pruneSessionPrefs(base, { limit: 20 as unknown as string })).toEqual({});
        expect(pruneSessionPrefs(base, { limit: "20" as unknown as number })).toEqual({});
    });

    it("prune：布尔翻转保留", () => {
        expect(pruneSessionPrefs(base, { reverseOrder: true })).toEqual({ reverseOrder: true });
    });
});
