import { describe, expect, it } from "vitest";
import { enabledBranches, recoveryOptions, type RecoverySnapshot } from "../src/core/session-recovery";
import { explainState, whyNotReviewable } from "../src/core/state-explain";

// BI-7 状态解释：为什么 + 直达修复
describe("state-explain（BI-7）", () => {
    it("每个状态都有解释与修复动作", () => {
        for (const s of ["source", "candidate", "reviewed", "stocked", "inReview", "applied", "needsRevision", "paused", "stale", "archived"] as const) {
            const e = explainState(s);
            expect(e.whyKey).toMatch(/^stateWhy\./);
            expect(e.repair).not.toBeNull();
            expect(e.repairLabelKey).not.toBeNull();
        }
    });

    it("语义：需修订→修订；暂停→恢复；过时→回来源", () => {
        expect(explainState("needsRevision").repair).toBe("revise");
        expect(explainState("paused").repair).toBe("resume");
        expect(explainState("stale").repair).toBe("openSource");
    });

    it("whyNotReviewable：逐状态给内容侧原因", () => {
        expect(whyNotReviewable("candidate").whyKey).toBe("stateWhy.notReviewedYet");
        expect(whyNotReviewable("reviewed").whyKey).toBe("stateWhy.notStockedYet");
        expect(whyNotReviewable("stocked").whyKey).toBe("stateWhy.notInReviewYet");
        expect(whyNotReviewable("needsRevision").whyKey).toBe("stateWhy.blockedByRevision");
        expect(whyNotReviewable("paused").repair).toBe("resume");
    });
});

// BI-9 恢复分支：四分支可用性
describe("session-recovery（BI-9）", () => {
    const base: RecoverySnapshot = { date: "2026-10-03", today: "2026-10-03", reviewedCount: 5, skippedCount: 1, queueRemaining: 10 };

    it("正常现场：四分支全部可用", () => {
        const opts = recoveryOptions(base);
        expect(opts).toHaveLength(4);
        expect(enabledBranches(opts)).toEqual(["resume", "summary", "narrow", "end"]);
    });

    it("跨天快照：继续原场不可用（计数失效），结束永远可用", () => {
        const opts = recoveryOptions({ ...base, today: "2026-10-04" });
        const byBranch = Object.fromEntries(opts.map(o => [o.branch, o]));
        expect(byBranch.resume.enabled).toBe(false);
        expect(byBranch.resume.disabledWhyKey).toBe("recovery.disabledStale");
        expect(byBranch.end.enabled).toBe(true);
        expect(enabledBranches(opts)).toContain("summary");
    });

    it("零进度：摘要/缩小范围不可用", () => {
        const opts = recoveryOptions({ ...base, reviewedCount: 0, skippedCount: 0 });
        expect(enabledBranches(opts)).toEqual(["resume", "end"]);
        const summary = opts.find(o => o.branch === "summary")!;
        expect(summary.disabledWhyKey).toBe("recovery.disabledNoProgress");
    });

    it("队列清空/未知：继续原场与缩小范围不可用", () => {
        expect(enabledBranches(recoveryOptions({ ...base, queueRemaining: 0 }))).toEqual(["summary", "end"]);
        expect(enabledBranches(recoveryOptions({ ...base, queueRemaining: -1 }))).toEqual(["summary", "end"]);
    });
});
