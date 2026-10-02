import { describe, expect, it } from "vitest";
import { normalizeSessionState, emptySessionState } from "../src/core/session-state";

const TODAY = "2026-10-02";

describe("session-state（AQ-2：跳过集合落盘与清洗）", () => {
    it("当日状态恢复，含 skippedIDs", () => {
        const s = normalizeSessionState({
            date: TODAY,
            reviewedIDs: ["c1", "c2"],
            skippedIDs: ["s1"],
            counters: { new: 2, review: 0, forget: 0, skip: 1 },
        }, TODAY);
        expect(s.reviewedIDs).toEqual(["c1", "c2"]);
        expect(s.skippedIDs).toEqual(["s1"]);
        expect(s.counters.skip).toBe(1);
    });

    it("跨日状态作废", () => {
        expect(normalizeSessionState({ date: "2026-10-01", reviewedIDs: ["c1"] }, TODAY)).toEqual(emptySessionState());
    });

    it("旧版无 skippedIDs 兼容为空数组", () => {
        const s = normalizeSessionState({ date: TODAY, reviewedIDs: ["c1"], counters: {} }, TODAY);
        expect(s.skippedIDs).toEqual([]);
    });

    it("ID 列表清洗：非字符串剔除、去重", () => {
        const s = normalizeSessionState({
            date: TODAY,
            reviewedIDs: ["c1", 5, null, "c1", "c2"],
            skippedIDs: "not-an-array",
            counters: { new: NaN, review: "3", forget: undefined, skip: -1 },
        }, TODAY);
        expect(s.reviewedIDs).toEqual(["c1", "c2"]);
        expect(s.skippedIDs).toEqual([]);
        expect(s.counters).toEqual({ new: 0, review: 3, forget: 0, skip: 0 });
    });
});
