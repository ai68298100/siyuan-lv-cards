import { describe, expect, it } from "vitest";
import {
    evaluateDualAxisCard,
    summarizeMatrixDistribution,
} from "../src/core/dual-axis-matrix";
import type { CardEvaluationFacts } from "../src/core/dual-axis-matrix";

describe("dual-axis-matrix (BT-6 知识可信度与掌握度双轴象限矩阵引擎)", () => {
    it("新卡（reviewCount=0）掌握度标记为 unknown，整卡归入 uncalibrated 待标定区", () => {
        const newCardFacts: CardEvaluationFacts = {
            cardId: "c-new",
            deckId: "d1",
            sourceBlockExists: true,
            sourceConfidence: 90,
            reviewCount: 0,
            forgetCount: 0,
        };

        const pos = evaluateDualAxisCard(newCardFacts);
        expect(pos.credibility.level).toBe("high");
        expect(pos.mastery.level).toBe("unknown");
        expect(pos.quadrant).toBe("uncalibrated");
        expect(pos.quadrantKey).toBe("dualAxisMatrix.quadrant.uncalibrated");
        expect(pos.actionKey).toBe("dualAxisMatrix.action.gatherEvidence");
        expect(pos.reasonKey).toBe("dualAxisMatrix.reason.missingAxisData");
    });

    it("Q1 核心资产区（core-asset）：高可信来源且复习稳固，建议保持复习节奏", () => {
        const solidCardFacts: CardEvaluationFacts = {
            cardId: "c-solid",
            deckId: "d1",
            sourceBlockExists: true,
            sourceConfidence: 90,
            reviewCount: 6,
            forgetCount: 1, // 16.7% 遗忘率
            intervalDays: 25,
            hasApplicationEvidence: true,
        };

        const pos = evaluateDualAxisCard(solidCardFacts);
        expect(pos.credibility.level).toBe("high");
        expect(pos.mastery.level).toBe("mastered");
        expect(pos.quadrant).toBe("core-asset");
        expect(pos.actionKey).toBe("dualAxisMatrix.action.maintainRhythm");
        expect(pos.reasonKey).toBe("dualAxisMatrix.reason.healthyMastery");
    });

    it("Q2 熟读错误陷阱（dangerous-trap）：复习多次且已记住，但来源笔记已过时或存疑 -> 极度危险，立即警报冻结重写", () => {
        const trapCardFacts: CardEvaluationFacts = {
            cardId: "c-trap",
            deckId: "d1",
            sourceBlockExists: true,
            isStale: true, // 知识点已过时！
            reviewCount: 8,
            forgetCount: 1, // 学习者自以为牢固掌握
            intervalDays: 30,
        };

        const pos = evaluateDualAxisCard(trapCardFacts);
        expect(pos.credibility.level).toBe("low");
        expect(pos.mastery.level).toBe("mastered");
        expect(pos.quadrant).toBe("dangerous-trap");
        expect(pos.actionKey).toBe("dualAxisMatrix.action.freezeAndRewrite");
        expect(pos.reasonKey).toBe("dualAxisMatrix.reason.memorizedStaleKnowledge");
    });

    it("Q3 冗余噪音区（stale-noise）：低可信且记忆屡次失败，建议直接归档或删除", () => {
        const noiseCardFacts: CardEvaluationFacts = {
            cardId: "c-noise",
            deckId: "d1",
            sourceBlockExists: false, // 原笔记已被物理删除
            reviewCount: 6,
            forgetCount: 4, // 遗忘率高达 66%
            intervalDays: 2,
        };

        const pos = evaluateDualAxisCard(noiseCardFacts);
        expect(pos.credibility.level).toBe("low");
        expect(pos.mastery.level).toBe("struggling");
        expect(pos.quadrant).toBe("stale-noise");
        expect(pos.actionKey).toBe("dualAxisMatrix.action.deleteOrArchive");
        expect(pos.reasonKey).toBe("dualAxisMatrix.reason.worthlessNoise");
    });

    it("Q4 重点攻坚区（promising-target）：来源极其可靠但尚处于学习初期，建议专注复习", () => {
        const targetCardFacts: CardEvaluationFacts = {
            cardId: "c-target",
            deckId: "d1",
            sourceBlockExists: true,
            sourceConfidence: 95,
            reviewCount: 2,
            forgetCount: 0,
            intervalDays: 3,
        };

        const pos = evaluateDualAxisCard(targetCardFacts);
        expect(pos.credibility.level).toBe("high");
        expect(pos.mastery.level).toBe("learning");
        expect(pos.quadrant).toBe("promising-target");
        expect(pos.actionKey).toBe("dualAxisMatrix.action.focusDrill");
        expect(pos.reasonKey).toBe("dualAxisMatrix.reason.reliableTarget");
    });

    it("批量矩阵宏观分布透视（summarizeMatrixDistribution）精准聚类与陷阱卡预警", () => {
        const batch: CardEvaluationFacts[] = [
            { cardId: "c1", deckId: "d1", sourceBlockExists: true, reviewCount: 6, forgetCount: 1, intervalDays: 20 }, // core-asset
            { cardId: "c2-trap", deckId: "d1", sourceBlockExists: true, isStale: true, reviewCount: 6, forgetCount: 1, intervalDays: 20 }, // dangerous-trap
            { cardId: "c3", deckId: "d1", sourceBlockExists: true, reviewCount: 0, forgetCount: 0 }, // uncalibrated
        ];

        const summary = summarizeMatrixDistribution(batch);
        expect(summary.totalCards).toBe(3);
        expect(summary.quadrantCounts["core-asset"]).toBe(1);
        expect(summary.quadrantCounts["dangerous-trap"]).toBe(1);
        expect(summary.quadrantCounts["uncalibrated"]).toBe(1);
        expect(summary.highRiskTrapCardIds).toEqual(["c2-trap"]);
    });
});
