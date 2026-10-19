import { describe, expect, it } from "vitest";
import {
    OBSERVED_CARD_TYPES,
    HINT_USAGE_LEVELS,
    TIME_OF_DAY_SLOTS,
    createEmptyExperimentStore,
    resolveTimeOfDaySlot,
    recordStrategyObservation,
    generateStrategyExperimentReport,
} from "../src/core/strategy-experiment";

describe("strategy-experiment (BT-5 个人学习策略实验与旁路效能对比引擎)", () => {
    it("包含全量观察维度分类枚举", () => {
        expect(OBSERVED_CARD_TYPES).toEqual(["qa", "cloze", "typing", "choice", "occlusion"]);
        expect(HINT_USAGE_LEVELS).toEqual(["none", "subtle", "direct"]);
        expect(TIME_OF_DAY_SLOTS).toEqual(["morning", "afternoon", "evening", "night"]);
    });

    it("resolveTimeOfDaySlot 根据小时时间戳准确推算时段分类", () => {
        // 构造指定小时的时间戳
        const makeTimestampAtHour = (hour: number) => {
            const d = new Date(2026, 9, 19, hour, 30, 0);
            return d.getTime();
        };

        expect(resolveTimeOfDaySlot(makeTimestampAtHour(8))).toBe("morning");
        expect(resolveTimeOfDaySlot(makeTimestampAtHour(14))).toBe("afternoon");
        expect(resolveTimeOfDaySlot(makeTimestampAtHour(20))).toBe("evening");
        expect(resolveTimeOfDaySlot(makeTimestampAtHour(1))).toBe("night");
    });

    it("recordStrategyObservation 记录观测数据并自动关联时段", () => {
        let store = createEmptyExperimentStore(1000);
        store = recordStrategyObservation(store, {
            cardId: "card-1",
            deckId: "deck-1",
            rating: 3, // Good
            durationMs: 3200,
            cardType: "cloze",
            hintLevel: "subtle",
            timestamp: new Date(2026, 9, 19, 9, 0, 0).getTime(), // morning
        });

        expect(store.entries).toHaveLength(1);
        const entry = store.entries[0];
        expect(entry.cardType).toBe("cloze");
        expect(entry.hintLevel).toBe("subtle");
        expect(entry.timeSlot).toBe("morning");
        expect(entry.rating).toBe(3);
        expect(entry.durationMs).toBe(3200);
    });

    it("样本量透明原则：n < 20 时明确标注样本不足，不给出虚假的统计结论", () => {
        let store = createEmptyExperimentStore();
        // 仅录入 5 条数据（n = 5 < 20）
        for (let i = 0; i < 5; i++) {
            store = recordStrategyObservation(store, {
                cardId: `c-${i}`,
                deckId: "d1",
                rating: 3,
                durationMs: 2000,
                cardType: "qa",
                timestamp: new Date(2026, 9, 19, 8, 0, 0).getTime(),
            });
        }

        const report = generateStrategyExperimentReport(store);
        const qaMetric = report.cardTypeMetrics["qa"];
        expect(qaMetric.sampleSize).toBe(5);
        expect(qaMetric.isStatisticallyReliable).toBe(false);
        expect(qaMetric.confidenceKey).toBe("strategyExperiment.confidence.insufficientSample");

        // 核心断言：样本不足时，最佳题型和最佳时段不予推荐（保持 undefined，避免误导用户）
        expect(report.optimalCardType).toBeUndefined();
        expect(report.optimalTimeSlot).toBeUndefined();
    });

    it("样本量充足（n >= 20）时推导可靠指标与最佳时段洞察", () => {
        let store = createEmptyExperimentStore();

        // 晚间段录入 25 次，全部成功（保持率 100%）
        for (let i = 0; i < 25; i++) {
            store = recordStrategyObservation(store, {
                cardId: `c-eve-${i}`,
                deckId: "d1",
                rating: 4,
                durationMs: 1500,
                cardType: "typing",
                timestamp: new Date(2026, 9, 19, 20, 0, 0).getTime(), // evening
            });
        }

        // 下午段录入 20 次，10 次成功（保持率 50%）
        for (let i = 0; i < 20; i++) {
            store = recordStrategyObservation(store, {
                cardId: `c-aft-${i}`,
                deckId: "d1",
                rating: (i % 2 === 0 ? 3 : 1) as any,
                durationMs: 3000,
                cardType: "typing",
                timestamp: new Date(2026, 9, 19, 15, 0, 0).getTime(), // afternoon
            });
        }

        const report = generateStrategyExperimentReport(store);
        expect(report.timeSlotMetrics["evening"].isStatisticallyReliable).toBe(true);
        expect(report.timeSlotMetrics["evening"].retentionRate).toBe(1);
        expect(report.timeSlotMetrics["afternoon"].isStatisticallyReliable).toBe(true);
        expect(report.timeSlotMetrics["afternoon"].retentionRate).toBe(0.5);

        // 识别出最佳时段为 evening
        expect(report.optimalTimeSlot).toBe("evening");
        expect(report.insights.some(msg => msg.includes("evening"))).toBe(true);
    });

    it("洞察生成：提示依赖度过高时产生虚假流畅感预警", () => {
        let store = createEmptyExperimentStore();

        // 无提示 20 次，保持率 50%
        for (let i = 0; i < 20; i++) {
            store = recordStrategyObservation(store, {
                cardId: `c-none-${i}`,
                deckId: "d1",
                rating: (i % 2 === 0 ? 3 : 1) as any,
                durationMs: 4000,
                cardType: "qa",
                hintLevel: "none",
            });
        }

        // 强提示 20 次，保持率 90% (相差 40% > 15%)
        for (let i = 0; i < 20; i++) {
            store = recordStrategyObservation(store, {
                cardId: `c-dir-${i}`,
                deckId: "d1",
                rating: (i < 18 ? 3 : 1) as any,
                durationMs: 1500,
                cardType: "qa",
                hintLevel: "direct",
            });
        }

        const report = generateStrategyExperimentReport(store);
        expect(report.insights.some(msg => msg.includes("虚假流畅感"))).toBe(true);
    });
});
