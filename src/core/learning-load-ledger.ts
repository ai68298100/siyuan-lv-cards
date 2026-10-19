/**
 * BT-4 学习负担账本与认知成本透明化引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 独立核算六大生命周期学习成本：捕获（capture）、理解（comprehend）、制卡（author）、复习（review）、应用（apply）、维护（maintain）；
 * 2. 破除连击崇拜：绝不以连击数或单次保持率代替掌握，真实反映学习者的认知负荷；
 * 3. 高负担低收益识别：量化识别死记硬背陷阱、歧义坏卡与维护过载卡片，提供具体的简化、拆分、封存建议；
 * 4. 纯函数设计，数据不可变隔离。
 */

export const LEARNING_PHASES = [
    "capture",
    "comprehend",
    "author",
    "review",
    "apply",
    "maintain",
] as const;

export type LearningPhase = (typeof LEARNING_PHASES)[number];

export interface LoadCostRecord {
    id: string;
    targetId: string; // cardId or deckId
    phase: LearningPhase;
    /** 投入时长（秒） */
    durationSeconds: number;
    timestamp: number;
    note?: string;
}

/** 单个目标对象的成本账本汇总 */
export interface TargetLoadSummary {
    targetId: string;
    /** 各阶段累计耗时（秒） */
    phaseSeconds: Record<LearningPhase, number>;
    /** 总耗时（秒） */
    totalSeconds: number;
    /** 总复习次数 */
    reviewCount: number;
    /** 遗忘次数 */
    forgetCount: number;
    /** 平均每次复习耗时（秒） */
    avgReviewSeconds: number;
    /** 认知负荷等级 */
    burdenLevel: "low" | "medium" | "high" | "critical";
    /** 减负建议行动 i18n 键 */
    reliefActionKey?: string;
    /** 减负分析理由 i18n 键 */
    reliefReasonKey?: string;
}

/** 账本状态模型 */
export interface LearningLoadLedgerState {
    version: 1;
    updatedAt: number;
    records: LoadCostRecord[];
}

export function createEmptyLoadLedger(now: number = Date.now()): LearningLoadLedgerState {
    return {
        version: 1,
        updatedAt: now,
        records: [],
    };
}

/** 记录一次生命周期耗时成本（纯函数，返回新 state） */
export function recordLearningCost(
    state: LearningLoadLedgerState,
    params: {
        targetId: string;
        phase: LearningPhase;
        durationSeconds: number;
        timestamp?: number;
        note?: string;
    },
): LearningLoadLedgerState {
    const ts = params.timestamp ?? Date.now();
    const duration = Math.max(0, Math.round(params.durationSeconds));
    const newRecord: LoadCostRecord = {
        id: `cost-${ts}-${Math.random().toString(36).substring(2, 6)}`,
        targetId: params.targetId,
        phase: params.phase,
        durationSeconds: duration,
        timestamp: ts,
        note: params.note,
    };

    return {
        ...state,
        updatedAt: ts,
        records: [...state.records, newRecord],
    };
}

/** 卡片回忆表现数据（供关联核算） */
export interface CardPerformanceFacts {
    reviewCount: number;
    forgetCount: number;
}

/** 计算指定目标的认知负担与减负建议（纯函数） */
export function summarizeTargetLoad(
    targetId: string,
    records: readonly LoadCostRecord[],
    perf?: CardPerformanceFacts,
): TargetLoadSummary {
    const phaseSeconds: Record<LearningPhase, number> = {
        capture: 0,
        comprehend: 0,
        author: 0,
        review: 0,
        apply: 0,
        maintain: 0,
    };

    let totalSec = 0;
    const targetRecords = records.filter(r => r.targetId === targetId);

    for (const r of targetRecords) {
        phaseSeconds[r.phase] = (phaseSeconds[r.phase] || 0) + r.durationSeconds;
        totalSec += r.durationSeconds;
    }

    const reviews = perf?.reviewCount ?? 0;
    const forgets = perf?.forgetCount ?? 0;
    const avgReviewSec = reviews > 0 ? Math.round(phaseSeconds.review / reviews) : 0;

    let burdenLevel: "low" | "medium" | "high" | "critical" = "low";
    let actionKey: string | undefined;
    let reasonKey: string | undefined;

    const forgetRate = reviews > 0 ? forgets / reviews : 0;

    // 启发式减负决策算法：
    // 1. 死记硬背陷阱：复习多（>=8 次）、遗忘率高（>35%），但理解投入几乎为 0
    if (reviews >= 8 && forgetRate > 0.35 && phaseSeconds.comprehend < 30) {
        burdenLevel = "critical";
        actionKey = "loadLedger.action.needComprehend";
        reasonKey = "loadLedger.reason.blindMemorization";
    }
    // 2. 题面过载/多问题陷阱：单卡复习平均耗时极长（>45秒），且维护耗时高
    else if (avgReviewSec > 45 && phaseSeconds.maintain > 60) {
        burdenLevel = "high";
        actionKey = "loadLedger.action.atomicSplit";
        reasonKey = "loadLedger.reason.overloadedCard";
    }
    // 3. 维护债务过重：维护耗时超过复习总耗时的 50%
    else if (phaseSeconds.maintain > 120 && phaseSeconds.maintain > phaseSeconds.review * 0.5) {
        burdenLevel = "medium";
        actionKey = "loadLedger.action.reviewSource";
        reasonKey = "loadLedger.reason.heavyMaintenance";
    }
    // 4. 高频轻量复习正常
    else if (reviews >= 5 && forgetRate < 0.2) {
        burdenLevel = "low";
        actionKey = "loadLedger.action.keepGoing";
        reasonKey = "loadLedger.reason.healthyMastery";
    }

    return {
        targetId,
        phaseSeconds,
        totalSeconds: totalSec,
        reviewCount: reviews,
        forgetCount: forgets,
        avgReviewSeconds: avgReviewSec,
        burdenLevel,
        reliefActionKey: actionKey,
        reliefReasonKey: reasonKey,
    };
}

/** 全库宏观成本分布统计 */
export function summarizeLedgerOverview(state: LearningLoadLedgerState): {
    totalSeconds: number;
    phaseDistribution: Record<LearningPhase, number>;
    totalRecords: number;
} {
    const phaseDistribution: Record<LearningPhase, number> = {
        capture: 0,
        comprehend: 0,
        author: 0,
        review: 0,
        apply: 0,
        maintain: 0,
    };

    let total = 0;
    for (const r of state.records) {
        phaseDistribution[r.phase] += r.durationSeconds;
        total += r.durationSeconds;
    }

    return {
        totalSeconds: total,
        phaseDistribution,
        totalRecords: state.records.length,
    };
}
