import { describe, expect, it } from "vitest";
import { normalizeSessionState, emptySessionState, withEndReason, END_REASONS } from "../src/core/session-state";

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

describe("session-state BI-8：收工原因", () => {
    const live = { date: TODAY, reviewedIDs: ["c1"], skippedIDs: [], counters: { new: 1, review: 0, forget: 0, skip: 0 } };

    it("白名单内原因不可变写入", () => {
        const next = withEndReason(live, "energy")!;
        expect(next.endReason).toBe("energy");
        expect(next).not.toBe(live); // 不可变：原状态不受影响
        expect(live.endReason).toBeUndefined();
        expect(END_REASONS).toContain("goal-done");
        expect(END_REASONS).toHaveLength(5);
    });

    it("跨天/空场拒绝写入（返回 null）", () => {
        expect(withEndReason(emptySessionState(), "manual")).toBeNull();
    });

    it("normalize 白名单清洗：非法原因回空，合法保留", () => {
        const ok = normalizeSessionState({ ...live, endReason: "time-up" }, TODAY);
        expect(ok.endReason).toBe("time-up");
        const bad = normalizeSessionState({ ...live, endReason: "hack" }, TODAY);
        expect(bad.endReason).toBeNull();
        const none = normalizeSessionState(live, TODAY);
        expect(none.endReason).toBeNull();
    });
});
