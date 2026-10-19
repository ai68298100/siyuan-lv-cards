import { describe, expect, it } from "vitest";
import {
    generateOutcomeClaim,
    checkPrerequisiteReadiness,
    DEFAULT_OUTCOME_THRESHOLDS,
} from "../src/core/learning-outcome";
import type {
    TopicEvidenceCollection,
    OutcomeEvidenceItem,
    PrerequisiteRequirement,
    OutcomeClaim,
} from "../src/core/learning-outcome";

describe("learning-outcome (BT-1 学习结果声明生成器)", () => {
    const now = 1700000000000;
    const dayMs = 86400 * 1000;

    it("空证据集合评定为 unknown（状态未知），缺全部维度建议", () => {
        const emptyCollection: TopicEvidenceCollection = {
            topicId: "top-1",
            topicName: "量子力学基础",
            items: [],
        };

        const claim = generateOutcomeClaim(emptyCollection, {}, now);
        expect(claim.status).toBe("unknown");
        expect(claim.statusKey).toBe("learningOutcome.status.unknown");
        expect(claim.reasonKey).toBe("learningOutcome.reason.noEvidence");
        expect(claim.dimensions.recall.met).toBe(false);
        expect(claim.dimensions.explanation.met).toBe(false);
        expect(claim.dimensions.application.met).toBe(false);
        expect(claim.gapSuggestionKeys).toHaveLength(3);
    });

    it("仅满足回忆证据：评定为 partial（部分达到），给出解释与应用补齐建议", () => {
        const items: OutcomeEvidenceItem[] = [
            { type: "recall", recordedAt: now - dayMs * 5 },
            { type: "recall", recordedAt: now - dayMs * 3 },
            { type: "recall", recordedAt: now - dayMs * 1 },
        ];
        const collection: TopicEvidenceCollection = {
            topicId: "top-2",
            topicName: "HTTP 协议缓存机制",
            items,
        };

        const claim = generateOutcomeClaim(collection, {}, now);
        expect(claim.status).toBe("partial");
        expect(claim.statusKey).toBe("learningOutcome.status.partial");
        expect(claim.reasonKey).toBe("learningOutcome.reason.partiallyMet");
        expect(claim.dimensions.recall.met).toBe(true);
        expect(claim.dimensions.recall.count).toBe(3);
        expect(claim.dimensions.explanation.met).toBe(false);
        expect(claim.dimensions.application.met).toBe(false);
        expect(claim.gapSuggestionKeys).toEqual([
            "learningOutcome.gap.needExplanation",
            "learningOutcome.gap.needApplication",
        ]);
    });

    it("回忆、解释、应用三项证据全满足：评定为 achieved（达到目标）", () => {
        const items: OutcomeEvidenceItem[] = [
            // recall >= 3
            { type: "recall", recordedAt: now - dayMs * 10 },
            { type: "recall", recordedAt: now - dayMs * 6 },
            { type: "recall", recordedAt: now - dayMs * 2 },
            // explanation >= 1
            { type: "explanation", recordedAt: now - dayMs * 4, sourceRef: "self-rubric-card-1" },
            // application >= 1
            { type: "application", recordedAt: now - dayMs * 1, sourceRef: "exam-problem-101" },
        ];
        const collection: TopicEvidenceCollection = {
            topicId: "top-3",
            topicName: "双指针算法",
            items,
        };

        const claim = generateOutcomeClaim(collection, {}, now);
        expect(claim.status).toBe("achieved");
        expect(claim.statusKey).toBe("learningOutcome.status.achieved");
        expect(claim.reasonKey).toBe("learningOutcome.reason.allMet");
        expect(claim.gapSuggestionKeys).toHaveLength(0);
        expect(claim.dimensions.recall.met).toBe(true);
        expect(claim.dimensions.explanation.met).toBe(true);
        expect(claim.dimensions.application.met).toBe(true);
    });

    it("证据数量均低于阈值：评定为 insufficient（证据不足）", () => {
        const items: OutcomeEvidenceItem[] = [
            { type: "recall", recordedAt: now - dayMs * 2 }, // 仅 1 次，低于 3 次阈值
        ];
        const collection: TopicEvidenceCollection = {
            topicId: "top-4",
            topicName: "红黑树旋转",
            items,
        };

        const claim = generateOutcomeClaim(collection, {}, now);
        expect(claim.status).toBe("insufficient");
        expect(claim.statusKey).toBe("learningOutcome.status.insufficient");
        expect(claim.reasonKey).toBe("learningOutcome.reason.belowThresholds");
    });

    it("超出有效时间窗的陈旧证据自动被过滤", () => {
        const items: OutcomeEvidenceItem[] = [
            // 100 天前（超出默认 90 天有效期）
            { type: "recall", recordedAt: now - dayMs * 100 },
            { type: "recall", recordedAt: now - dayMs * 110 },
            { type: "recall", recordedAt: now - dayMs * 120 },
            // 7 天前（有效）
            { type: "recall", recordedAt: now - dayMs * 7 },
        ];
        const collection: TopicEvidenceCollection = {
            topicId: "top-5",
            topicName: "过期的记忆",
            items,
        };

        const claim = generateOutcomeClaim(collection, { validWindowDays: 90 }, now);
        // 只有 1 条有效证据，低于 3
        expect(claim.dimensions.recall.count).toBe(1);
        expect(claim.dimensions.recall.met).toBe(false);
        expect(claim.status).toBe("insufficient");
    });

    it("支持加权证据累加与小数四舍五入", () => {
        const items: OutcomeEvidenceItem[] = [
            { type: "application", recordedAt: now - dayMs * 1, weight: 1.5 },
            { type: "application", recordedAt: now - dayMs * 2, weight: 0.8 },
        ];
        const collection: TopicEvidenceCollection = {
            topicId: "top-6",
            topicName: "加权实战",
            items,
        };

        const claim = generateOutcomeClaim(collection, { minApplicationCount: 2 }, now);
        // 1.5 + 0.8 = 2.3
        expect(claim.dimensions.application.count).toBe(2.3);
        expect(claim.dimensions.application.met).toBe(true);
    });
});

describe("learning-outcome (BT-2 前置依赖准备度检查)", () => {
    const mockClaims: Record<string, OutcomeClaim> = {
        "p-math": {
            topicId: "p-math",
            topicName: "高等数学基础",
            status: "achieved",
            statusKey: "learningOutcome.status.achieved",
            dimensions: {
                recall: { count: 5, threshold: 3, met: true },
                explanation: { count: 2, threshold: 1, met: true },
                application: { count: 2, threshold: 1, met: true },
            },
            gapSuggestionKeys: [],
            reasonKey: "learningOutcome.reason.allMet",
            assessedAt: 1000,
        },
        "p-linear": {
            topicId: "p-linear",
            topicName: "线性代数矩阵运算",
            status: "partial",
            statusKey: "learningOutcome.status.partial",
            dimensions: {
                recall: { count: 4, threshold: 3, met: true },
                explanation: { count: 0, threshold: 1, met: false },
                application: { count: 0, threshold: 1, met: false },
            },
            gapSuggestionKeys: ["learningOutcome.gap.needExplanation"],
            reasonKey: "learningOutcome.reason.partiallyMet",
            assessedAt: 1000,
        },
    };

    it("无前置依赖要求时直接判定为 ready", () => {
        const res = checkPrerequisiteReadiness("target-1", [], mockClaims);
        expect(res.verdict).toBe("ready");
        expect(res.allMet).toBe(true);
        expect(res.gaps).toHaveLength(0);
        expect(res.canBypass).toBe(true);
    });

    it("所有前置依赖均已达成时判定为 ready", () => {
        const reqs: PrerequisiteRequirement[] = [
            { id: "p-math", name: "高等数学基础", requiredStatus: "achieved" },
        ];
        const res = checkPrerequisiteReadiness("target-2", reqs, mockClaims);
        expect(res.verdict).toBe("ready");
        expect(res.allMet).toBe(true);
        expect(res.gaps).toHaveLength(0);
    });

    it("前置依赖存在缺口时标记为 gap-warning，列出缺失维度，且坚决允许用户绕过", () => {
        const reqs: PrerequisiteRequirement[] = [
            { id: "p-math", name: "高等数学基础", requiredStatus: "achieved" },
            { id: "p-linear", name: "线性代数矩阵运算", requiredStatus: "achieved" },
        ];
        const res = checkPrerequisiteReadiness("target-3", reqs, mockClaims);
        expect(res.verdict).toBe("gap-warning");
        expect(res.allMet).toBe(false);
        expect(res.gaps).toHaveLength(1);

        const gap = res.gaps[0];
        expect(gap.prerequisiteId).toBe("p-linear");
        expect(gap.missingDimensions).toContain("explanation");
        expect(gap.missingDimensions).toContain("application");

        // 核心安全原则：永远允许知情绕过（canBypass: true）
        expect(res.canBypass).toBe(true);
    });

    it("前置依赖完全未建立声明时给出 missingAll 提示", () => {
        const reqs: PrerequisiteRequirement[] = [
            { id: "p-unknown", name: "完全未知概念" },
        ];
        const res = checkPrerequisiteReadiness("target-4", reqs, mockClaims);
        expect(res.verdict).toBe("gap-warning");
        expect(res.gaps[0].explanationKey).toBe("learningOutcome.prereq.missingAll");
        expect(res.gaps[0].missingDimensions).toEqual(["recall", "explanation", "application"]);
    });
});
