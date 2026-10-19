import { describe, expect, it } from "vitest";
import {
    aggregateDailyToTrend,
    computeBaselineAnchor,
    generateAchievementDashboard,
} from "../src/core/achievement-dashboard";
import type { DailyMetricsSnapshot } from "../src/core/achievement-dashboard";

describe("achievement-dashboard (BI-35 学习成果可视化仪表盘与对比分析引擎)", () => {
    const mockSnapshots: DailyMetricsSnapshot[] = [
        { dateIso: "2026-11-01", cardsReviewed: 20, newCardsCount: 5, retentionRate: 0.85, studyMinutes: 45, avgReviewDurationMs: 1350 },
        { dateIso: "2026-11-02", cardsReviewed: 25, newCardsCount: 7, retentionRate: 0.92, studyMinutes: 50, avgReviewDurationMs: 1250 },
        { dateIso: "2026-11-03", cardsReviewed: 18, newCardsCount: 3, retentionRate: 0.78, studyMinutes: 40, avgReviewDurationMs: 1450 },
        { dateIso: "2026-11-04", cardsReviewed: 30, newCardsCount: 10, retentionRate: 0.95, studyMinutes: 60, avgReviewDurationMs: 1200 },
        { dateIso: "2026-11-05", cardsReviewed: 22, newCardsCount: 6, retentionRate: 0.88, studyMinutes: 48, avgReviewDurationMs: 1300 },
    ];

    it("aggregateDailyToTrend 按日粒度聚合生成趋势图数据点", () => {
        const trend = aggregateDailyToTrend(mockSnapshots, "day");
        expect(trend).toHaveLength(5);
        expect(trend[0].xLabel).toBe("2026-11-01");
        expect(trend[0].yValue).toBe(0.85);
        expect(trend[0].anomalyMarker).toBe("stable"); // 0.85 不属于 spike/drop

        expect(trend[3].xLabel).toBe("2026-11-04");
        expect(trend[3].yValue).toBe(0.95);
        expect(trend[3].anomalyMarker).toBe("spike"); // > 0.9 为异常高峰
    });

    it("computeBaselineAnchor 计算过去 N 天均值作为基线并计算偏离度", () => {
        const baseline = computeBaselineAnchor(mockSnapshots, 3); // 最近 3 天
        expect(baseline.windowDays).toBe(3);
        // 最近 3 天：0.78 + 0.95 + 0.88 = 2.61 / 3 ≈ 0.87
        expect(baseline.baselineRetention).toBeCloseTo(0.87, 2);
        expect(baseline.currentDeviationRetention).toBeDefined();
    });

    it("generateAchievementDashboard 组装完整仪表盘数据模型", () => {
        const dashboard = generateAchievementDashboard({
            dailySnapshots: mockSnapshots,
            totalCardsMastered: 150,
            overallRetentionRate: 0.89,
            totalStudyMinutes: 243,
            streakDays: 12,
            groupComparisons: {
                "考研党": { percentileRanking: 75, avgRetention: 0.82, avgStudyMinutes: 55, nMembers: 120 },
                "语言学习者": { percentileRanking: 60, avgRetention: 0.88, avgStudyMinutes: 40, nMembers: 80 },
            },
            now: 1700000000000,
        });

        expect(dashboard.summary.totalCardsMastered).toBe(150);
        expect(dashboard.summary.overallRetentionRate).toBe(0.89);
        expect(dashboard.summary.streakDays).toBe(12);

        expect(dashboard.trendCharts.retention).toHaveLength(5);
        expect(dashboard.groupComparisons["考研党"].percentileRanking).toBe(75);
        expect(dashboard.baselineAnchor.windowDays).toBe(7); // 默认窗口
    });

    it("时间序列按周粒度聚合", () => {
        const weeklyTrend = aggregateDailyToTrend(mockSnapshots, "week");
        expect(weeklyTrend).toHaveLength(1); // 全部在同一周
        expect(weeklyTrend[0].xLabel).toBe("2026-11-01"); // 周日（该周起始日）
        // 5 天平均：(0.85+0.92+0.78+0.95+0.88)/5 = 4.38/5 = 0.876
        expect(weeklyTrend[0].yValue).toBeCloseTo(0.876, 2);
    });

    it("基线警告阈值正确设置：低于基线 20% 或高于基线 50% 触发警告", () => {
        const baseline = computeBaselineAnchor(mockSnapshots, 3);
        expect(baseline.warningThresholds?.lowRetention).toBe(-0.2);
        expect(baseline.warningThresholds?.highStudyMinutes).toBe(0.5);
    });
});
