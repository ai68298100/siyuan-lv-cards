/**
 * BI-32 阶段到阶段结果指标与认知流转漏斗引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 六阶段全生命周期流转：
 *    - 捕获（capture） -> 理解（comprehend） -> 回忆（recall） -> 应用（apply） -> 维护（maintain） -> 迁移（transfer）；
 * 2. 验收铁律一：严格保留真实分母！绝不为了转化率好看而随意裁剪分母；
 * 3. 验收铁律二：明确标明未知（unknown）、跳过（skipped）和依赖不可用（dependency-unavailable）的具体原因；
 * 4. 验收铁律三：绝不使用卡片总数或签到连击数代替真实的认知掌握；
 * 5. 纯函数设计，数据不可变隔离。
 */

export const PIPELINE_STAGES = [
    "capture",
    "comprehend",
    "recall",
    "apply",
    "maintain",
    "transfer",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type DropoffReasonType =
    | "not-attempted"
    | "skipped-deliberately"
    | "dependency-unavailable"
    | "too-difficult"
    | "stale-abandoned"
    | "unknown";

/** 单个知识对象在某阶段的流转事件记录 */
export interface StageTransitionEvent {
    id: string;
    targetId: string; // cardId or knowledgeObjectId
    deckId: string;
    fromStage?: PipelineStage;
    toStage: PipelineStage;
    timestamp: number;
    /** 是否成功跨越到该阶段 */
    passed: boolean;
    /** 若未跨越或流失，记录具体原因 */
    dropoffReason?: DropoffReasonType;
    dropoffNote?: string;
}

/** 单个阶段之间的转化度量 */
export interface StageConversionMetric {
    fromStage: PipelineStage;
    toStage: PipelineStage;
    /** 输入基数分母（严格保留） */
    denominator: number;
    /** 成功跨越分子 */
    numerator: number;
    /** 转化率（0 ~ 1.0） */
    conversionRate: number;
    /** 流失未转化数 */
    dropoffCount: number;
    /** 流失原因细分统计 */
    dropoffBreakdown: Record<DropoffReasonType, number>;
}

/** 全流程漏斗分析报告 */
export interface PipelineFunnelReport {
    generatedAt: number;
    totalCaptured: number;
    stageHeadcounts: Record<PipelineStage, number>;
    transitions: StageConversionMetric[];
    /** 整个流水线最严重的流失瓶颈阶段 */
    primaryBottleneck?: {
        from: PipelineStage;
        to: PipelineStage;
        dropoffCount: number;
        topReason: DropoffReasonType;
        bottleneckInsightKey: string;
    };
    overallCompletionRate: number; // capture -> transfer
}

export interface PipelineMetricsStoreState {
    version: 1;
    updatedAt: number;
    events: StageTransitionEvent[];
}

export function createEmptyPipelineStore(now: number = Date.now()): PipelineMetricsStoreState {
    return {
        version: 1,
        updatedAt: now,
        events: [],
    };
}

/** 记录一次阶段流转事件（纯函数） */
export function recordStageTransition(
    state: PipelineMetricsStoreState,
    params: {
        targetId: string;
        deckId: string;
        toStage: PipelineStage;
        fromStage?: PipelineStage;
        passed: boolean;
        dropoffReason?: DropoffReasonType;
        dropoffNote?: string;
        now?: number;
    },
): PipelineMetricsStoreState {
    const ts = params.now ?? Date.now();
    const newEvent: StageTransitionEvent = {
        id: `ev-${ts}-${Math.random().toString(36).substring(2, 6)}`,
        targetId: params.targetId,
        deckId: params.deckId,
        fromStage: params.fromStage,
        toStage: params.toStage,
        timestamp: ts,
        passed: params.passed,
        dropoffReason: params.passed ? undefined : (params.dropoffReason ?? "unknown"),
        dropoffNote: params.dropoffNote,
    };

    return {
        ...state,
        updatedAt: ts,
        events: [...state.events, newEvent],
    };
}

/**
 * 计算六阶段流转漏斗与流失分析（纯函数）：
 * 保留每个阶段的真实分母，输出明确的转化率与流失瓶颈。
 */
export function computePipelineFunnel(
    state: PipelineMetricsStoreState,
    now: number = Date.now(),
): PipelineFunnelReport {
    const events = state.events;

    // 统计各阶段去重达成的实体集合
    const stageEntitySets: Record<PipelineStage, Set<string>> = {
        capture: new Set<string>(),
        comprehend: new Set<string>(),
        recall: new Set<string>(),
        apply: new Set<string>(),
        maintain: new Set<string>(),
        transfer: new Set<string>(),
    };

    // 统计流失事件
    const dropoffsByTransition: Record<string, { total: number; reasons: Record<DropoffReasonType, number> }> = {};

    for (const ev of events) {
        if (ev.passed) {
            stageEntitySets[ev.toStage].add(ev.targetId);
            // 如果从某个阶段流转过来，也要计入该阶段的分母（捕获是起点，必须有）
            if (ev.fromStage) {
                stageEntitySets[ev.fromStage].add(ev.targetId);
            } else {
                // 如果是直接捕获事件（没有 fromStage），也需要记录到 capture 集合
                stageEntitySets.capture.add(ev.targetId);
            }
        } else if (ev.fromStage) {
            const transKey = `${ev.fromStage}->${ev.toStage}`;
            if (!dropoffsByTransition[transKey]) {
                dropoffsByTransition[transKey] = {
                    total: 0,
                    reasons: {
                        "not-attempted": 0,
                        "skipped-deliberately": 0,
                        "dependency-unavailable": 0,
                        "too-difficult": 0,
                        "stale-abandoned": 0,
                        "unknown": 0,
                    },
                };
            }
            dropoffsByTransition[transKey].total++;
            const reason = ev.dropoffReason ?? "unknown";
            dropoffsByTransition[transKey].reasons[reason] = (dropoffsByTransition[transKey].reasons[reason] || 0) + 1;
            
            // 关键：流失事件的起始阶段也必须计入分母！
            stageEntitySets[ev.fromStage].add(ev.targetId);
        }
    }

    const headcounts: Record<PipelineStage, number> = {
        capture: stageEntitySets.capture.size,
        comprehend: stageEntitySets.comprehend.size,
        recall: stageEntitySets.recall.size,
        apply: stageEntitySets.apply.size,
        maintain: stageEntitySets.maintain.size,
        transfer: stageEntitySets.transfer.size,
    };

    const transitions: StageConversionMetric[] = [];
    const stagePairs: [PipelineStage, PipelineStage][] = [
        ["capture", "comprehend"],
        ["comprehend", "recall"],
        ["recall", "apply"],
        ["apply", "maintain"],
        ["maintain", "transfer"],
    ];

    let maxDropoffCount = -1;
    let bottleneckInfo: PipelineFunnelReport["primaryBottleneck"];

    for (const [from, to] of stagePairs) {
        const denominator = headcounts[from]; // 严格保留分母
        const numerator = headcounts[to];
        const rate = denominator > 0 ? Math.min(1, Math.round((numerator / denominator) * 100) / 100) : 0;
        const dropoffCount = Math.max(0, denominator - numerator);

        const transKey = `${from}->${to}`;
        const recordReasons = dropoffsByTransition[transKey]?.reasons ?? {
            "not-attempted": dropoffCount, // 缺省视作尚未尝试
            "skipped-deliberately": 0,
            "dependency-unavailable": 0,
            "too-difficult": 0,
            "stale-abandoned": 0,
            "unknown": 0,
        };

        // 识别流失最多的主因
        let topReason: DropoffReasonType = "not-attempted";
        let topReasonCount = -1;
        for (const [r, count] of Object.entries(recordReasons)) {
            if (count > topReasonCount) {
                topReasonCount = count;
                topReason = r as DropoffReasonType;
            }
        }

        if (dropoffCount > maxDropoffCount && denominator > 0) {
            maxDropoffCount = dropoffCount;
            bottleneckInfo = {
                from,
                to,
                dropoffCount,
                topReason,
                bottleneckInsightKey: `pipelineMetrics.bottleneck.${from}To${to.charAt(0).toUpperCase() + to.slice(1)}`,
            };
        }

        transitions.push({
            fromStage: from,
            toStage: to,
            denominator,
            numerator,
            conversionRate: rate,
            dropoffCount,
            dropoffBreakdown: recordReasons,
        });
    }

    const totalCaptured = headcounts.capture;
    const finalTransferred = headcounts.transfer;
    const overallRate = totalCaptured > 0 ? Math.round((finalTransferred / totalCaptured) * 100) / 100 : 0;

    return {
        generatedAt: now,
        totalCaptured,
        stageHeadcounts: headcounts,
        transitions,
        primaryBottleneck: bottleneckInfo,
        overallCompletionRate: overallRate,
    };
}
