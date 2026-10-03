import { describe, expect, it } from "vitest";
import {
    emptyCounters, normalizePurpose, PURPOSE_PROFILES,
    purposeProgress, SESSION_PURPOSES, type PurposeCounters,
} from "../src/core/session-purpose";

// BI-2 目的驱动会话：六目的档案/结束条件/评分口径/进度计算
describe("session-purpose（BI-2）", () => {
    it("六个目的档案：评分口径正确", () => {
        expect(SESSION_PURPOSES).toHaveLength(6);
        expect(PURPOSE_PROFILES.review.grading).toBe("formal");
        expect(PURPOSE_PROFILES.maintain.grading).toBe("formal");
        expect(PURPOSE_PROFILES.explore.grading).toBe("informal");
        expect(PURPOSE_PROFILES.build.grading).toBe("informal");
        expect(PURPOSE_PROFILES.practice.grading).toBe("informal");
        expect(PURPOSE_PROFILES.apply.grading).toBe("informal");
    });

    it("normalizePurpose：白名单，非法回 null", () => {
        expect(normalizePurpose("review")).toBe("review");
        expect(normalizePurpose("bogus")).toBeNull();
        expect(normalizePurpose(42)).toBeNull();
    });

    it("build 目的：新卡进度与达标", () => {
        const c = { ...emptyCounters(), newCards: 7 };
        const p = purposeProgress("build", c);
        expect(p.current).toBe(7);
        expect(p.target).toBe(10);
        expect(p.pct).toBe(70);
        expect(p.done).toBe(false);
        expect(purposeProgress("build", { ...c, newCards: 10 }).done).toBe(true);
    });

    it("review 目的：队列清空即完成（remaining 型）", () => {
        const c: PurposeCounters = { ...emptyCounters(), reviewed: 5, dueRemaining: 3 };
        const p = purposeProgress("review", c, 8);
        expect(p.current).toBe(5);
        expect(p.target).toBe(8);
        expect(p.done).toBe(false);
        const cleared = purposeProgress("review", { ...c, dueRemaining: 0 }, 8);
        expect(cleared.done).toBe(true);
    });

    it("review 目的：targetOverride 无效时无量化目标", () => {
        const c = { ...emptyCounters(), reviewed: 5, dueRemaining: 0 };
        const p = purposeProgress("review", c, 0);
        expect(p.target).toBe(0);
        expect(p.done).toBe(false); // 无量化目标→由 BI-8 endReason 收工
        expect(p.pct).toBe(0);
    });

    it("practice 目的：默认目标 20，负数覆盖回默认", () => {
        const c = { ...emptyCounters(), practiceAttempts: 20 };
        expect(purposeProgress("practice", c).done).toBe(true);
        expect(purposeProgress("practice", c, -3).target).toBe(20);
    });

    it("explore 目的：收件箱处理数驱动", () => {
        const c = { ...emptyCounters(), inboxProcessed: 4 };
        const p = purposeProgress("explore", c);
        expect(p.pct).toBe(40);
    });

    it("maintain 目的：修订清单清掉 N 张（formal 口径）", () => {
        const c = { ...emptyCounters(), maintainedCount: 5 };
        const p = purposeProgress("maintain", c);
        expect(p.done).toBe(true);
        expect(PURPOSE_PROFILES.maintain.metric).toBe("maintainedCount");
    });
});
