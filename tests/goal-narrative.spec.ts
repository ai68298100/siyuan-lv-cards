import { describe, expect, it } from "vitest";
import { narrateGoalProgress, NARRATIVE_STAGES, stageLabelKey } from "../src/core/goal-narrative";

// BI-15 进度叙事：阶段计数描述进展，不做掌握百分比
describe("goal-narrative（BI-15）", () => {
    it("四阶段按旅程顺序归组十态", () => {
        expect([...NARRATIVE_STAGES]).toEqual(["filtered", "stocked", "applied", "maintain"]);
        const stats = {
            source: 2, candidate: 1, reviewed: 3,          // filtered=6
            stocked: 4, inReview: 2,                       // stocked=6
            applied: 1,                                     // applied=1
            needsRevision: 1, stale: 2, archived: 1,       // maintain=4
        };
        expect(narrateGoalProgress(stats)).toEqual([
            { stage: "filtered", count: 6 },
            { stage: "stocked", count: 6 },
            { stage: "applied", count: 1 },
            { stage: "maintain", count: 4 },
        ]);
    });

    it("零计数阶段不出现；全空返回空数组（不虚构 0%）", () => {
        expect(narrateGoalProgress({ source: 0, applied: 3 })).toEqual([{ stage: "applied", count: 3 }]);
        expect(narrateGoalProgress({})).toEqual([]);
        expect(narrateGoalProgress({ source: 0, stocked: 0 })).toEqual([]);
    });

    it("展示键随阶段派生", () => {
        expect(stageLabelKey("filtered")).toBe("goalNarrative.filtered");
    });
});
