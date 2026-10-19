/**
 * BT-5 个人学习策略实验与旁路效能对比引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 三大实验变量观察：
 *    - 题型维度（cardType）：问答（qa）、挖空（cloze）、打字默写（typing）、选择题（choice）、图片遮挡（occlusion）；
 *    - 提示维度（hintUsage）：无提示（none）、弱提示（subtle）、强提示（direct）；
 *    - 时段维度（timeOfDay）：早晨（morning, 5-11）、下午（afternoon, 12-17）、晚间（evening, 18-22）、深夜（night, 23-4）；
 * 2. 纯旁路记录原则：仅做旁路统计观察，绝不篡改内核原生 FSRS 调度参数与排期；
 * 3. 样本量透明原则：必须透明公示每组的样本量（n），样本量过少（n < 20）时坚决提示“样本不足，结论仅供参考”；
 * 4. 纯函数设计，数据不可变隔离。
 */

export const OBSERVED_CARD_TYPES = ["qa", "cloze", "typing", "choice", "occlusion"] as const;
export type ObservedCardType = (typeof OBSERVED_CARD_TYPES)[number];

export const HINT_USAGE_LEVELS = ["none", "subtle", "direct"] as const;
export type HintUsageLevel = (typeof HINT_USAGE_LEVELS)[number];

export const TIME_OF_DAY_SLOTS = ["morning", "afternoon", "evening", "night"] as const;
export type TimeOfDaySlot = (typeof TIME_OF_DAY_SLOTS)[number];

/** 单次复习的策略实验观测数据 */
export interface StrategyObservationEntry {
    id: string;
    cardId: string;
    deckId: string;
    timestamp: number;
    rating: 1 | 2 | 3 | 4; // FSRS 4 档评分 (1=Again, 2=Hard, 3=Good, 4=Easy)
    durationMs: number;
    cardType: ObservedCardType;
    hintLevel: HintUsageLevel;
    timeSlot: TimeOfDaySlot;
}

/** 某个变量维度的效能聚合统计 */
export interface DimensionMetricAggregate {
    dimensionValue: string;
    sampleSize: number; // 样本量 n
    retentionRate: number; // 成功率 (rating >= 3 的比例, 0 ~ 1)
    avgDurationMs: number;
    isStatisticallyReliable: boolean; // n >= 20 为真
    confidenceKey: string;
}

/** 策略实验综合对比洞察报告 */
export interface StrategyExperimentReport {
    generatedAt: number;
    totalObservations: number;
    cardTypeMetrics: Record<ObservedCardType, DimensionMetricAggregate>;
    hintLevelMetrics: Record<HintUsageLevel, DimensionMetricAggregate>;
    timeSlotMetrics: Record<TimeOfDaySlot, DimensionMetricAggregate>;
    /** 最佳学习时段推荐 */
    optimalTimeSlot?: TimeOfDaySlot;
    /** 最高保留率题型 */
    optimalCardType?: ObservedCardType;
    insights: string[];
}

export interface StrategyExperimentStoreState {
    version: 1;
    updatedAt: number;
    entries: StrategyObservationEntry[];
}

export function createEmptyExperimentStore(now: number = Date.now()): StrategyExperimentStoreState {
    return {
        version: 1,
        updatedAt: now,
        entries: [],
    };
}

/** 根据时间戳推算时段分类（纯函数） */
export function resolveTimeOfDaySlot(timestamp: number): TimeOfDaySlot {
    const hour = new Date(timestamp).getHours();
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 18) return "afternoon";
    if (hour >= 18 && hour < 23) return "evening";
    return "night";
}

/** 记录一次复习策略实验观测值（纯函数，返回新 state） */
export function recordStrategyObservation(
    state: StrategyExperimentStoreState,
    params: {
        cardId: string;
        deckId: string;
        rating: 1 | 2 | 3 | 4;
        durationMs: number;
        cardType: ObservedCardType;
        hintLevel?: HintUsageLevel;
        timestamp?: number;
    },
): StrategyExperimentStoreState {
    const ts = params.timestamp ?? Date.now();
    const timeSlot = resolveTimeOfDaySlot(ts);

    const newEntry: StrategyObservationEntry = {
        id: `obs-${ts}-${Math.random().toString(36).substring(2, 6)}`,
        cardId: params.cardId,
        deckId: params.deckId,
        timestamp: ts,
        rating: params.rating,
        durationMs: Math.max(100, Math.round(params.durationMs)),
        cardType: params.cardType,
        hintLevel: params.hintLevel ?? "none",
        timeSlot,
    };

    return {
        ...state,
        updatedAt: ts,
        entries: [...state.entries, newEntry],
    };
}

/** 计算单个维度的聚合指标（纯函数） */
function calculateDimensionAggregate(
    entries: readonly StrategyObservationEntry[],
    dimensionValue: string,
    filterFn: (e: StrategyObservationEntry) => boolean,
): DimensionMetricAggregate {
    const matched = entries.filter(filterFn);
    const n = matched.length;

    if (n === 0) {
        return {
            dimensionValue,
            sampleSize: 0,
            retentionRate: 0,
            avgDurationMs: 0,
            isStatisticallyReliable: false,
            confidenceKey: "strategyExperiment.confidence.noData",
        };
    }

    const successes = matched.filter(e => e.rating >= 3).length;
    const totalDuration = matched.reduce((sum, e) => sum + e.durationMs, 0);

    const retention = Math.round((successes / n) * 100) / 100;
    const avgDuration = Math.round(totalDuration / n);
    const reliable = n >= 20;

    return {
        dimensionValue,
        sampleSize: n,
        retentionRate: retention,
        avgDurationMs: avgDuration,
        isStatisticallyReliable: reliable,
        confidenceKey: reliable
            ? "strategyExperiment.confidence.reliable"
            : "strategyExperiment.confidence.insufficientSample",
    };
}

/**
 * 汇总并生成全量策略效能实验报告（纯函数）
 */
export function generateStrategyExperimentReport(
    state: StrategyExperimentStoreState,
    now: number = Date.now(),
): StrategyExperimentReport {
    const entries = state.entries;

    // 1. 题型聚合
    const cardTypeMetrics = {} as Record<ObservedCardType, DimensionMetricAggregate>;
    for (const ct of OBSERVED_CARD_TYPES) {
        cardTypeMetrics[ct] = calculateDimensionAggregate(entries, ct, e => e.cardType === ct);
    }

    // 2. 提示级别聚合
    const hintLevelMetrics = {} as Record<HintUsageLevel, DimensionMetricAggregate>;
    for (const hl of HINT_USAGE_LEVELS) {
        hintLevelMetrics[hl] = calculateDimensionAggregate(entries, hl, e => e.hintLevel === hl);
    }

    // 3. 时段聚合
    const timeSlotMetrics = {} as Record<TimeOfDaySlot, DimensionMetricAggregate>;
    for (const ts of TIME_OF_DAY_SLOTS) {
        timeSlotMetrics[ts] = calculateDimensionAggregate(entries, ts, e => e.timeSlot === ts);
    }

    // 4. 识别最佳时段（仅在样本量充足时推荐）
    let optimalTimeSlot: TimeOfDaySlot | undefined;
    const reliableTimeSlots = TIME_OF_DAY_SLOTS.filter(s => timeSlotMetrics[s].isStatisticallyReliable);
    if (reliableTimeSlots.length > 0) {
        optimalTimeSlot = reliableTimeSlots.sort(
            (a, b) => timeSlotMetrics[b].retentionRate - timeSlotMetrics[a].retentionRate,
        )[0];
    }

    // 5. 识别最高保持率题型
    let optimalCardType: ObservedCardType | undefined;
    const reliableCardTypes = OBSERVED_CARD_TYPES.filter(ct => cardTypeMetrics[ct].isStatisticallyReliable);
    if (reliableCardTypes.length > 0) {
        optimalCardType = reliableCardTypes.sort(
            (a, b) => cardTypeMetrics[b].retentionRate - cardTypeMetrics[a].retentionRate,
        )[0];
    }

    // 6. 生成可解释的个性化洞察
    const insights: string[] = [];
    if (optimalTimeSlot) {
        insights.push(`你在 ${optimalTimeSlot} 时段的记忆保持率最高（${Math.round(timeSlotMetrics[optimalTimeSlot].retentionRate * 100)}%）`);
    }
    if (optimalCardType) {
        insights.push(`题型中 ${optimalCardType} 的作答效果最为稳固`);
    }
    if (hintLevelMetrics["none"].isStatisticallyReliable && hintLevelMetrics["direct"].isStatisticallyReliable) {
        const diff = hintLevelMetrics["direct"].retentionRate - hintLevelMetrics["none"].retentionRate;
        if (diff > 0.15) {
            insights.push("依赖强提示时的通过率明显偏高，需警惕虚假流畅感");
        }
    }

    return {
        generatedAt: now,
        totalObservations: entries.length,
        cardTypeMetrics,
        hintLevelMetrics,
        timeSlotMetrics,
        optimalTimeSlot,
        optimalCardType,
        insights,
    };
}
