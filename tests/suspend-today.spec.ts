import { describe, expect, it } from "vitest";
import { emptySuspendToday, normalizeSuspendToday, rollDateIfNeeded, isSuspended, suspend, unsuspend } from "../src/core/suspend-today";
import { localDate } from "../src/core/revlog";

const TODAY = localDate(Date.now());

describe("suspend-today（今天不学，M3·FR5）", () => {
    it("normalize：结构非法落空库；cardIDs 透传", () => {
        expect(normalizeSuspendToday(null)).toEqual({ date: TODAY, cardIDs: [] });
        expect(normalizeSuspendToday({})).toEqual({ date: TODAY, cardIDs: [] });
        expect(normalizeSuspendToday({ cardIDs: "x" })).toEqual({ date: TODAY, cardIDs: [] });
        const r = normalizeSuspendToday({ date: "2026-10-02", cardIDs: ["c1", "c2"] });
        expect(r).toEqual({ date: "2026-10-02", cardIDs: ["c1", "c2"] });
    });

    it("rollDateIfNeeded：跨天清空并返回 true，同日不动", () => {
        const d = { date: "2000-01-01", cardIDs: ["c1"] };
        expect(rollDateIfNeeded(d)).toBe(true);
        expect(d).toEqual({ date: TODAY, cardIDs: [] });
        expect(rollDateIfNeeded(d)).toBe(false); // 同日幂等
    });

    it("suspend 去重且自动滚日；isSuspended 只看当日集合", () => {
        const d = { date: "2000-01-01", cardIDs: [] };
        suspend(d, "c1");
        suspend(d, "c1"); // 去重
        suspend(d, "c2");
        expect(d.date).toBe(TODAY); // suspend 内部先滚日
        expect(isSuspended(d, "c1")).toBe(true);
        expect(isSuspended(d, "c3")).toBe(false);
        expect(d.cardIDs).toEqual(["c1", "c2"]);
        expect(emptySuspendToday()).toEqual({ date: TODAY, cardIDs: [] });
    });

    it("unsuspend（BI-25 撤销）：移除在册卡；不在册幂等无操作", () => {
        const d = emptySuspendToday();
        suspend(d, "c1");
        suspend(d, "c2");
        unsuspend(d, "c1");
        expect(isSuspended(d, "c1")).toBe(false);
        expect(isSuspended(d, "c2")).toBe(true);
        unsuspend(d, "c1"); // 幂等：不在册无操作
        expect(d.cardIDs).toEqual(["c2"]);
    });
});
