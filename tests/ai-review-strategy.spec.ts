import { describe, expect, it } from "vitest";
import { REVIEW_DECISIONS, planReview, canCommit, sampleIndices } from "../src/core/ai-review-strategy";

// BU-14 审阅策略：强度就高不就低；未审卡永不入正式队列（只有 accepted 可提交）
describe("ai-review-strategy（BU-14）", () => {
    const clean = { taskRisk: "low" as const, modelTrust: "known" as const, sourceTrust: "trusted" as const, totalCards: 20 };

    it("三档决策在册；干净低风险小批 → 抽样（样本量 clamp 3-10、20%）", () => {
        expect([...REVIEW_DECISIONS]).toEqual(["per-card", "sample", "block"]);
        const plan = planReview(clean);
        expect(plan.decision).toBe("sample");
        expect(plan.sampleSize).toBe(4); // ceil(20*0.2)
        expect(plan.unreviewedNeverCommits).toBe(true);
        expect(sampleIndices(20, 4)).toEqual([0, 1, 2, 3]);
    });

    it("样本量边界：小批至少 3、大批至多 10、总数小于样本量取全量", () => {
        expect(planReview({ ...clean, totalCards: 5 }).sampleSize).toBe(3);
        expect(planReview({ ...clean, totalCards: 200 }).sampleSize).toBe(10);
        expect(sampleIndices(2, 4)).toEqual([0, 1]);
    });

    it("任一因子触发即升级逐卡（模型未登记/来源未验证/均分低/问题卡占比高），因子留痕", () => {
        for (const f of [
            { ...clean, modelTrust: "unknown" as const },
            { ...clean, sourceTrust: "unverified" as const },
            { ...clean, avgComposite: 60 },
            { ...clean, problemRatio: 0.5 },
        ]) {
            const plan = planReview(f);
            expect(plan.decision).toBe("per-card");
            expect(plan.factors.length).toBe(1);
        }
        // 均分恰好达标/占比恰好达标 不触发（阈值语义：<70 与 >0.3）
        expect(planReview({ ...clean, avgComposite: 70, problemRatio: 0.3 }).decision).toBe("sample");
    });

    it("风险分级：medium=逐卡；high=阻断（0 张可提交）", () => {
        expect(planReview({ ...clean, taskRisk: "medium" }).decision).toBe("per-card");
        const blocked = planReview({ ...clean, taskRisk: "high", modelTrust: "unknown" });
        expect(blocked.decision).toBe("block");
        expect(blocked.sampleSize).toBeUndefined();
        expect(blocked.factors).toEqual(["taskRisk:high"]);
    });

    it("验收核心：canCommit 只认 accepted；pending/rejected/deferred 一律不可入库", () => {
        expect(canCommit("accepted")).toBe(true);
        for (const s of ["pending", "rejected", "deferred"] as const) {
            expect(canCommit(s)).toBe(false);
        }
    });
});
