import { describe, expect, it } from "vitest";
import {
    PIPELINE_STAGES,
    createEmptyPipelineStore,
    recordStageTransition,
    computePipelineFunnel,
} from "../src/core/pipeline-metrics";
import type { PipelineMetricsStoreState } from "../src/core/pipeline-metrics";

describe("pipeline-metrics (BI-32 阶段到阶段认知流转漏斗引擎)", () => {
    it("包含全量六阶段枚举", () => {
        expect(PIPELINE_STAGES).toEqual([
            "capture",
            "comprehend",
            "recall",
            "apply",
            "maintain",
            "transfer",
        ]);
    });

    it("记录成功流转事件：实体依次通过各阶段", () => {
        let store: PipelineMetricsStoreState = createEmptyPipelineStore();
        const cardId = "card-bio-1";

        // 捕获 -> 理解
        store = recordStageTransition(store, {
            targetId: cardId,
            deckId: "d-bio",
            toStage: "comprehend",
            fromStage: "capture",
            passed: true,
            now: 1000,
        });

        // 理解 -> 回忆
        store = recordStageTransition(store, {
            targetId: cardId,
            deckId: "d-bio",
            toStage: "recall",
            fromStage: "comprehend",
            passed: true,
            now: 2000,
        });

        // 回忆 -> 应用（失败）
        store = recordStageTransition(store, {
            targetId: cardId,
            deckId: "d-bio",
            toStage: "apply",
            fromStage: "recall",
            passed: false,
            dropoffReason: "too-difficult",
            dropoffNote: "题目难度过高，产生挫败感",
            now: 3000,
        });

        const report = computePipelineFunnel(store);

        // 严格保留分母：从 capture 到 comprehend 的转化率为 100%
        const cToR = report.transitions.find(t => t.fromStage === "capture" && t.toStage === "comprehend");
        expect(cToR?.denominator).toBe(1);
        expect(cToR?.numerator).toBe(1);
        expect(cToR?.conversionRate).toBe(1);

        // recall -> apply 的转化率应为 50%（1/2），但这里只有 1 个实体进入 recall，所以为 0
        const rToA = report.transitions.find(t => t.fromStage === "recall" && t.toStage === "apply");
        expect(rToA?.denominator).toBe(1);
        expect(rToA?.numerator).toBe(0);
        expect(rToA?.dropoffCount).toBe(1);
        expect(rToA?.dropoffBreakdown["too-difficult"]).toBe(1);
    });

    it("分母保真原则：即使部分实体未完成所有阶段，分母仍为完整捕获数", () => {
        let store = createEmptyPipelineStore();

        // 实体 A：完成全部 6 阶段
        for (let i = 0; i < 5; i++) {
            store = recordStageTransition(store, {
                targetId: "card-a",
                deckId: "d1",
                toStage: PIPELINE_STAGES[i + 1],
                fromStage: PIPELINE_STAGES[i],
                passed: true,
            });
        }

        // 实体 B：仅捕获，未进入理解
        store = recordStageTransition(store, {
            targetId: "card-b",
            deckId: "d1",
            toStage: "comprehend",
            fromStage: "capture",
            passed: false,
            dropoffReason: "not-attempted",
        });

        const report = computePipelineFunnel(store);
        expect(report.totalCaptured).toBe(2);
        expect(report.stageHeadcounts.capture).toBe(2);
        expect(report.stageHeadcounts.comprehend).toBe(1);

        // capture -> comprehend 转化率应为 50%
        const cToC = report.transitions.find(t => t.fromStage === "capture" && t.toStage === "comprehend");
        expect(cToC?.denominator).toBe(2);
        expect(cToC?.numerator).toBe(1);
        expect(cToC?.conversionRate).toBe(0.5);
    });

    it("识别主要瓶颈阶段：流失最多且主因清晰的阶段", () => {
        let store = createEmptyPipelineStore();

        // 模拟 10 个实体在 comprehend->recall 阶段大量流失
        for (let i = 0; i < 10; i++) {
            store = recordStageTransition(store, {
                targetId: `c-${i}`,
                deckId: "d1",
                toStage: "comprehend",
                fromStage: "capture",
                passed: true,
            });
        }

        // 其中 8 个在 recall 阶段失败，主因为 too-difficult
        for (let i = 0; i < 8; i++) {
            store = recordStageTransition(store, {
                targetId: `c-${i}`,
                deckId: "d1",
                toStage: "recall",
                fromStage: "comprehend",
                passed: false,
                dropoffReason: "too-difficult",
            });
        }

        // 剩余 2 个成功进入 recall
        for (let i = 8; i < 10; i++) {
            store = recordStageTransition(store, {
                targetId: `c-${i}`,
                deckId: "d1",
                toStage: "recall",
                fromStage: "comprehend",
                passed: true,
            });
        }

        const report = computePipelineFunnel(store);
        expect(report.primaryBottleneck).toBeDefined();
        expect(report.primaryBottleneck?.from).toBe("comprehend");
        expect(report.primaryBottleneck?.to).toBe("recall");
        expect(report.primaryBottleneck?.dropoffCount).toBe(8);
        expect(report.primaryBottleneck?.topReason).toBe("too-difficult");
    });

    it("整体完成率计算：capture -> transfer 的真实转化路径", () => {
        let store = createEmptyPipelineStore();

        // 10 个实体全部完成全流程
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 5; j++) {
                store = recordStageTransition(store, {
                    targetId: `c-${i}`,
                    deckId: "d1",
                    toStage: PIPELINE_STAGES[j + 1],
                    fromStage: PIPELINE_STAGES[j],
                    passed: true,
                });
            }
        }

        const report = computePipelineFunnel(store);
        expect(report.overallCompletionRate).toBe(1); // 100% 完成
        expect(report.stageHeadcounts.transfer).toBe(10);
    });
});
