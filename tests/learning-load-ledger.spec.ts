import { describe, expect, it } from "vitest";
import {
    LEARNING_PHASES,
    createEmptyLoadLedger,
    recordLearningCost,
    summarizeTargetLoad,
    summarizeLedgerOverview,
} from "../src/core/learning-load-ledger";
import type {
    LearningLoadLedgerState,
    CardPerformanceFacts,
} from "../src/core/learning-load-ledger";

describe("learning-load-ledger (BT-4 学习负担账本与认知成本透明化引擎)", () => {
    it("包含六大生命周期学习成本维度", () => {
        expect(LEARNING_PHASES).toEqual([
            "capture",
            "comprehend",
            "author",
            "review",
            "apply",
            "maintain",
        ]);
    });

    it("空账本初始化正确", () => {
        const state = createEmptyLoadLedger(1000);
        expect(state.version).toBe(1);
        expect(state.updatedAt).toBe(1000);
        expect(state.records).toHaveLength(0);
    });

    it("recordLearningCost 纯函数累积记录并规范化时长", () => {
        let state = createEmptyLoadLedger(1000);
        state = recordLearningCost(state, {
            targetId: "card-1",
            phase: "capture",
            durationSeconds: 15.4, // 四舍五入为 15
            timestamp: 2000,
            note: "摘录自数学笔记",
        });

        state = recordLearningCost(state, {
            targetId: "card-1",
            phase: "author",
            durationSeconds: 30,
            timestamp: 2100,
        });

        expect(state.records).toHaveLength(2);
        expect(state.records[0].durationSeconds).toBe(15);
        expect(state.records[1].durationSeconds).toBe(30);
        expect(state.updatedAt).toBe(2100);
    });

    describe("认知负担评估与减负建议 (summarizeTargetLoad)", () => {
        it("死记硬背陷阱识别：复习多（>=8）、遗忘高（>35%），但理解投入极低 -> critical 且建议补齐理解", () => {
            let state = createEmptyLoadLedger();
            // 8 次复习，每次 20 秒，review 共 160 秒
            for (let i = 0; i < 8; i++) {
                state = recordLearningCost(state, {
                    targetId: "card-rote",
                    phase: "review",
                    durationSeconds: 20,
                });
            }
            // 几乎没有投入理解（0 秒）

            const perf: CardPerformanceFacts = {
                reviewCount: 8,
                forgetCount: 4, // 50% 遗忘率
            };

            const summary = summarizeTargetLoad("card-rote", state.records, perf);
            expect(summary.burdenLevel).toBe("critical");
            expect(summary.reliefActionKey).toBe("loadLedger.action.needComprehend");
            expect(summary.reliefReasonKey).toBe("loadLedger.reason.blindMemorization");
            expect(summary.phaseSeconds.review).toBe(160);
            expect(summary.phaseSeconds.comprehend).toBe(0);
        });

        it("题面过载识别：单卡平均复习耗时极长（>45s）且维护耗时高 -> high 且建议原子拆解", () => {
            let state = createEmptyLoadLedger();
            // 复习 2 次，共 100 秒（均值 50s）
            state = recordLearningCost(state, { targetId: "card-heavy", phase: "review", durationSeconds: 50 });
            state = recordLearningCost(state, { targetId: "card-heavy", phase: "review", durationSeconds: 50 });
            // 维护耗时 80 秒
            state = recordLearningCost(state, { targetId: "card-heavy", phase: "maintain", durationSeconds: 80 });

            const perf: CardPerformanceFacts = {
                reviewCount: 2,
                forgetCount: 0,
            };

            const summary = summarizeTargetLoad("card-heavy", state.records, perf);
            expect(summary.burdenLevel).toBe("high");
            expect(summary.reliefActionKey).toBe("loadLedger.action.atomicSplit");
            expect(summary.reliefReasonKey).toBe("loadLedger.reason.overloadedCard");
            expect(summary.avgReviewSeconds).toBe(50);
        });

        it("维护过载识别：维护耗时超过复习耗时的 50% -> medium 且建议核对来源", () => {
            let state = createEmptyLoadLedger();
            // 复习 150 秒，维护 130 秒（> 120s 且 > 75s）
            state = recordLearningCost(state, { targetId: "card-maint", phase: "review", durationSeconds: 150 });
            state = recordLearningCost(state, { targetId: "card-maint", phase: "maintain", durationSeconds: 130 });

            const perf: CardPerformanceFacts = {
                reviewCount: 6,
                forgetCount: 1, // 16.7% 遗忘率
            };

            const summary = summarizeTargetLoad("card-maint", state.records, perf);
            expect(summary.burdenLevel).toBe("medium");
            expect(summary.reliefActionKey).toBe("loadLedger.action.reviewSource");
            expect(summary.reliefReasonKey).toBe("loadLedger.reason.heavyMaintenance");
        });

        it("健康在轨识别：低遗忘率且节奏良好 -> low", () => {
            let state = createEmptyLoadLedger();
            state = recordLearningCost(state, { targetId: "card-good", phase: "comprehend", durationSeconds: 60 });
            state = recordLearningCost(state, { targetId: "card-good", phase: "review", durationSeconds: 60 });

            const perf: CardPerformanceFacts = {
                reviewCount: 6,
                forgetCount: 1, // 16.7% < 20%
            };

            const summary = summarizeTargetLoad("card-good", state.records, perf);
            expect(summary.burdenLevel).toBe("low");
            expect(summary.reliefActionKey).toBe("loadLedger.action.keepGoing");
            expect(summary.reliefReasonKey).toBe("loadLedger.reason.healthyMastery");
        });
    });

    it("全库宏观分布统计 summarizeLedgerOverview", () => {
        let state = createEmptyLoadLedger();
        state = recordLearningCost(state, { targetId: "c1", phase: "capture", durationSeconds: 10 });
        state = recordLearningCost(state, { targetId: "c1", phase: "comprehend", durationSeconds: 20 });
        state = recordLearningCost(state, { targetId: "c2", phase: "review", durationSeconds: 30 });
        state = recordLearningCost(state, { targetId: "c2", phase: "apply", durationSeconds: 40 });

        const overview = summarizeLedgerOverview(state);
        expect(overview.totalRecords).toBe(4);
        expect(overview.totalSeconds).toBe(100);
        expect(overview.phaseDistribution.capture).toBe(10);
        expect(overview.phaseDistribution.comprehend).toBe(20);
        expect(overview.phaseDistribution.review).toBe(30);
        expect(overview.phaseDistribution.apply).toBe(40);
        expect(overview.phaseDistribution.maintain).toBe(0);
    });
});
