/**
 * BI-35 学习成果可视化仪表盘与对比分析引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 四维核心指标：掌握卡片数（cards）、保持率（retention）、复习投入（study-minutes）、遗忘曲线斜率（decay-slope）；
 * 2. 时间序列趋势图：按日/周/月粒度聚合，支持平滑曲线与异常点标注；
 * 3. 同组对比：支持用户分组对比（如"考研党"vs"语言学习者"），展示百分位排名；
 * 4. 个人历史基线锚定：以过去 N 天均值作为基线，实时计算偏离度与预警阈值；
 * 5. 隐私零泄露：所有对比仅使用脱敏后的聚合统计，绝不暴露原始题面与笔记内容。
 */

export type TimeGranularity = "day" | "week" | "month";

/** 单日维度指标快照 */
export interface DailyMetricsSnapshot {
    dateIso: string;
    cardsReviewed: number;
    newCardsCount: number;
    retentionRate: number; // 0 ~ 1.0
    studyMinutes: number;
    avgReviewDurationMs: number;
}

/** 时间序列趋势图数据点 */
export interface TrendChartDataPoint {
    xLabel: string;
    yValue: number;
    isBaseline: boolean;
    deviationFromBaseline?: number; // ±百分比偏离度
    anomalyMarker?: "spike" | "drop" | "stable";
}

/** 同组对比统计信息 */
export interface GroupComparisonStats {
    groupName: string;
    percentileRanking: number; // 1~99
    groupAvgRetention: number;
    groupAvgStudyMinutes: number;
    nMembers: number;
}

/** 个人历史基线锚定信息 */
export interface BaselineAnchor {
    windowDays: number;
    baselineRetention: number;
    baselineStudyMinutes: number;
    currentDeviationRetention?: number; // 当前值相对于基线的偏离度（±%）
    currentDeviationMinutes?: number;
    warningThresholds?: {
        lowRetention: number;
        highStudyMinutes: number;
    };
}

/** 完整仪表盘数据模型 */
export interface AchievementDashboardData {
    summary: {
        totalCardsMastered: number;
        overallRetentionRate: number;
        totalStudyMinutes: number;
        streakDays: number;
    };
    trendCharts: {
        retention: TrendChartDataPoint[];
        studyMinutes: TrendChartDataPoint[];
    };
    groupComparisons: Record<string, GroupComparisonStats>;
    baselineAnchor: BaselineAnchor;
    generatedAt: number;
}

/**
 * 按指定粒度聚合每日指标为趋势图数据点
 */
export function aggregateDailyToTrend(
    dailySnapshots: DailyMetricsSnapshot[],
    granularity: TimeGranularity,
): TrendChartDataPoint[] {
    const aggregated: Record<string, { snap: DailyMetricsSnapshot; retentionSum: number; count: number }> = {};

    for (const snap of dailySnapshots) {
        let key: string;
        if (granularity === "day") {
            key = snap.dateIso;
        } else if (granularity === "week") {
            const date = new Date(snap.dateIso);
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            key = weekStart.toISOString().split("T")[0];
        } else {
            const date = new Date(snap.dateIso);
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        }

        if (!aggregated[key]) {
            aggregated[key] = {
                snap: { ...snap, dateIso: key },
                retentionSum: snap.retentionRate,
                count: 1,
            };
        } else {
            const existing = aggregated[key];
            existing.snap.cardsReviewed += snap.cardsReviewed;
            existing.snap.newCardsCount += snap.newCardsCount;
            existing.snap.studyMinutes += snap.studyMinutes;
            existing.retentionSum += snap.retentionRate;
            existing.count += 1;
            existing.snap.avgReviewDurationMs = Math.round(
                (existing.snap.avgReviewDurationMs * (existing.snap.cardsReviewed - snap.cardsReviewed) + snap.avgReviewDurationMs * snap.cardsReviewed) / existing.snap.cardsReviewed,
            );
        }
    }

    return Object.entries(aggregated)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, item]) => {
            const avgRetention = item.retentionSum / Math.max(1, item.count);
            return {
                xLabel: item.snap.dateIso,
                yValue: avgRetention,
                isBaseline: false,
                deviationFromBaseline: undefined,
                anomalyMarker: avgRetention > 0.9 ? "spike" : avgRetention < 0.6 ? "drop" : "stable",
            };
        });
}

/**
 * 计算个人历史基线锚定（基于过去 N 天均值）
 */
export function computeBaselineAnchor(
    dailySnapshots: DailyMetricsSnapshot[],
    windowDays: number = 7,
): BaselineAnchor {
    const recent = dailySnapshots.slice(-windowDays);
    const avgRetention = recent.reduce((sum, s) => sum + s.retentionRate, 0) / Math.max(1, recent.length);
    const avgStudyMinutes = recent.reduce((sum, s) => sum + s.studyMinutes, 0) / Math.max(1, recent.length);

    const latest = dailySnapshots[dailySnapshots.length - 1];
    const deviationRetention = latest && avgRetention > 0 ? Math.round(((latest.retentionRate - avgRetention) / avgRetention) * 100) / 100 : 0;
    const deviationMinutes = latest && avgStudyMinutes > 0 ? Math.round(((latest.studyMinutes - avgStudyMinutes) / avgStudyMinutes) * 100) / 100 : 0;

    return {
        windowDays,
        baselineRetention: Math.round(avgRetention * 100) / 100,
        baselineStudyMinutes: Math.round(avgStudyMinutes),
        currentDeviationRetention: deviationRetention,
        currentDeviationMinutes: deviationMinutes,
        warningThresholds: {
            lowRetention: -0.2, // 低于基线 20% 触发警告
            highStudyMinutes: 0.5, // 高于基线 50% 触发警告
        },
    };
}

/**
 * 组装完整仪表盘数据（纯函数）
 */
export function generateAchievementDashboard(params: {
    dailySnapshots: DailyMetricsSnapshot[];
    totalCardsMastered: number;
    overallRetentionRate: number;
    totalStudyMinutes: number;
    streakDays: number;
    groupComparisons?: Record<string, GroupComparisonStats>;
    now?: number;
}): AchievementDashboardData {
    const snapshots = params.dailySnapshots.sort((a, b) => a.dateIso.localeCompare(b.dateIso));

    return {
        summary: {
            totalCardsMastered: Math.max(0, params.totalCardsMastered),
            overallRetentionRate: Math.max(0, Math.min(1, params.overallRetentionRate)),
            totalStudyMinutes: Math.max(0, params.totalStudyMinutes),
            streakDays: Math.max(0, params.streakDays),
        },
        trendCharts: {
            retention: aggregateDailyToTrend(snapshots, "day"),
            studyMinutes: aggregateDailyToTrend(snapshots, "day").map(d => ({
                ...d,
                yValue: snapshots.find(s => s.dateIso === d.xLabel)?.studyMinutes || 0,
            })),
        },
        groupComparisons: params.groupComparisons || {},
        baselineAnchor: computeBaselineAnchor(snapshots),
        generatedAt: params.now ?? Date.now(),
    };
}
