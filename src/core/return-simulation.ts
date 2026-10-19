/**
 * BI-28 返场前只读影响模拟与可撤销批次（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 比较五大策略（继续旧计划、缩小范围、维护优先、阶段封存、平滑重建计划）；
 * 2. 纯只读模拟：不写内核、不篡改原生 riff/FSRS 排期、不伪造学习日志（坚决捍卫 ADR-3 铁律）；
 * 3. 验收标准：量化评估今日负担与消解天数，用户确认后生成 100% 可撤销批次（Reversible Batch）。
 */

import { BACKLOG_DUE_WARN, GAP_DAYS_WARN } from "./return-check";

export const RETURN_STRATEGY_KINDS = [
    "continue-old",
    "narrow-scope",
    "maintenance-first",
    "archive-phase",
    "rebuild-fresh",
] as const;

export type ReturnStrategyKind = (typeof RETURN_STRATEGY_KINDS)[number];

/** 返场输入事实 */
export interface ReturnSimulationFacts {
    /** 当前到期总张数 */
    dueCount: number;
    /** 距上次学习天数（null 表示新用户或无历史） */
    daysSinceLastStudy: number | null;
    /** 活跃学习目标数 */
    activeGoalsCount: number;
    /** 临期学习目标数（<=3 天） */
    urgentGoalsCount?: number;
    /** 过时或待修订材料数 */
    staleMaterialsCount: number;
    /** 题面有疑问或结构坏卡数 */
    brokenCardsCount: number;
    /** 已结项/已完成阶段的目标或卡组数 */
    completedPhasesCount?: number;
    /** 卡库总卡片数 */
    totalCardsInDeck?: number;
    /** 单张预计耗时（分钟，默认 0.5 即 30 秒） */
    averageMinutesPerCard?: number;
    /** 用户常规每日投入预算（分钟，默认 15） */
    targetDailyMinutes?: number;
}

/** 量化工作量与消解预估 */
export interface SimulatedWorkload {
    /** 今日建议/预计处理卡片张数 */
    projectedCount: number;
    /** 预计耗时（分钟） */
    estimatedMinutes: number;
    /** 积压完全消解预估天数 */
    backlogClearDays: number;
}

/** 单个策略的模拟结果 */
export interface SimulatedStrategy {
    kind: ReturnStrategyKind;
    /** 策略名称多语言键 */
    nameKey: string;
    /** 策略描述多语言键 */
    descKey: string;
    /** 工作量预估 */
    workload: SimulatedWorkload;
    /** 保留的事实源（i18n 键列表） */
    preserves: string[];
    /** 产生变动或影响的现场（i18n 键列表） */
    discardsOrChanges: string[];
    /** 认知负荷与风险等级 */
    riskLevel: "low" | "medium" | "high";
    /** 风险预警提示键（无风险时为 null） */
    riskWarningKey: string | null;
    /** 适用场景说明键 */
    recommendedForKey: string;
    /** 是否为当前返场事实下的首选推荐 */
    isRecommended: boolean;
    /** 综合推荐分（0~100） */
    recommendationScore: number;
}

/** 完整的策略对比与模拟报告 */
export interface ReturnSimulationReport {
    facts: ReturnSimulationFacts;
    strategies: SimulatedStrategy[];
    recommendedKind: ReturnStrategyKind;
    recommendationReasonKey: string;
    generatedAt: number;
}

/** 可撤销批次动作类型 */
export type ReturnBatchAction =
    | { type: "set-session-budget"; cap: number; previousCap?: number | null }
    | { type: "suspend-batch-today"; cardIds: string[]; previousSuspended?: string[] }
    | { type: "tag-phase-archive"; deckIds: string[]; previousArchivedState?: boolean }
    | { type: "route-to-maintenance"; targetView: "maintenance" }
    | { type: "reset-session-queue"; resetAt: number; rampUpSize: number };

/** 可撤销批次载荷（用户确认后生成，具备严格对称的撤销计划） */
export interface ReturnStrategyBatch {
    batchId: string;
    strategyKind: ReturnStrategyKind;
    createdAt: number;
    appliedAt: number | null;
    revertedAt: number | null;
    status: "prepared" | "applied" | "reverted";
    actions: ReturnBatchAction[];
    rollbackActions: ReturnBatchAction[];
    factsSnapshot: ReturnSimulationFacts;
}

export const DEFAULT_MINUTES_PER_CARD = 0.5;
export const DEFAULT_TARGET_MINUTES = 15;
export const SMALL_BUDGET_CAP = 15;
export const REBUILD_SEED_CAP = 10;

/** 比较与模拟返场五大策略 */
export function simulateReturnStrategies(
    facts: ReturnSimulationFacts,
    now: number = Date.now(),
): ReturnSimulationReport {
    const avgTime = facts.averageMinutesPerCard && facts.averageMinutesPerCard > 0
        ? facts.averageMinutesPerCard
        : DEFAULT_MINUTES_PER_CARD;
    const targetDailyTime = facts.targetDailyMinutes && facts.targetDailyMinutes > 0
        ? facts.targetDailyMinutes
        : DEFAULT_TARGET_MINUTES;

    const due = Math.max(0, facts.dueCount);
    const gap = facts.daysSinceLastStudy ?? 0;
    const hasDefects = (facts.brokenCardsCount + facts.staleMaterialsCount) > 0;
    const completedPhases = facts.completedPhasesCount ?? 0;

    // 1. continue-old: 照常全量面对
    const continueWorkload: SimulatedWorkload = {
        projectedCount: due,
        estimatedMinutes: Math.ceil(due * avgTime),
        backlogClearDays: due > 0 ? 1 : 0,
    };
    const continueRisk: "low" | "medium" | "high" = due > BACKLOG_DUE_WARN || gap > GAP_DAYS_WARN * 2
        ? "high"
        : due > 40
            ? "medium"
            : "low";
    const continueWarning = continueRisk === "high"
        ? "returnSimulation.risk.overload"
        : continueRisk === "medium"
            ? "returnSimulation.risk.fatigue"
            : null;

    // 2. narrow-scope: 缩小范围削峰
    const budgetCap = facts.targetDailyMinutes && facts.targetDailyMinutes > 0
        ? Math.max(5, Math.floor(targetDailyTime / avgTime))
        : SMALL_BUDGET_CAP;
    const narrowCap = due > 0 ? Math.min(budgetCap, due) : 0;
    const narrowWorkload: SimulatedWorkload = {
        projectedCount: narrowCap,
        estimatedMinutes: Math.ceil(narrowCap * avgTime),
        backlogClearDays: narrowCap > 0 ? Math.ceil(due / narrowCap) : 0,
    };

    // 3. maintenance-first: 维护优先，先修后学
    const defectCount = facts.brokenCardsCount + facts.staleMaterialsCount;
    const maintWorkload: SimulatedWorkload = {
        projectedCount: defectCount,
        estimatedMinutes: Math.max(defectCount > 0 ? 5 : 0, Math.ceil(defectCount * 1.5)),
        backlogClearDays: due > 0 ? Math.ceil(due / SMALL_BUDGET_CAP) + 1 : 1,
    };

    // 4. archive-phase: 阶段封存，剔除已结项项目
    const archivedReductionRate = completedPhases > 0 ? 0.4 : 0.15;
    const archivedRemainingDue = Math.max(0, Math.ceil(due * (1 - archivedReductionRate)));
    const archiveWorkload: SimulatedWorkload = {
        projectedCount: archivedRemainingDue,
        estimatedMinutes: Math.ceil(archivedRemainingDue * avgTime),
        backlogClearDays: archivedRemainingDue > 0 ? Math.ceil(archivedRemainingDue / 20) : 0,
    };

    // 5. rebuild-fresh: 平滑重建，起步批次
    const seedCap = due > 0 ? Math.min(REBUILD_SEED_CAP, due) : 0;
    const rebuildWorkload: SimulatedWorkload = {
        projectedCount: seedCap,
        estimatedMinutes: Math.ceil(seedCap * avgTime),
        backlogClearDays: seedCap > 0 ? Math.max(5, Math.ceil(due / 25)) : 0,
    };

    // 策略评分与最佳推荐推导
    let bestKind: ReturnStrategyKind = "continue-old";
    let reasonKey = "returnSimulation.reason.normal";

    let scoreContinue = 60;
    let scoreNarrow = 50;
    let scoreMaint = 40;
    let scoreArchive = 35;
    let scoreRebuild = 30;

    if (hasDefects) {
        // 有坏卡或过时材料时，首推先修后学
        scoreMaint += 55;
        scoreContinue -= 30;
    }

    if (due > BACKLOG_DUE_WARN || gap > GAP_DAYS_WARN) {
        // 大积压或长间隔：削峰优先
        scoreNarrow += 45;
        scoreContinue -= 40;
    }

    if (gap >= 30 && due > 150) {
        // 超长间隔且巨大积压：平滑重建更适合破除心理阻力
        scoreRebuild += 70;
    }

    if (completedPhases > 0 && due > 50) {
        // 有已完成阶段：阶段封存加分
        scoreArchive += 45;
    }

    if (due <= 25 && gap <= GAP_DAYS_WARN && !hasDefects) {
        // 小积压轻负荷：继续旧计划最直接高效
        scoreContinue += 40;
    }

    const scores: Record<ReturnStrategyKind, number> = {
        "continue-old": Math.min(100, Math.max(0, scoreContinue)),
        "narrow-scope": Math.min(100, Math.max(0, scoreNarrow)),
        "maintenance-first": Math.min(100, Math.max(0, scoreMaint)),
        "archive-phase": Math.min(100, Math.max(0, scoreArchive)),
        "rebuild-fresh": Math.min(100, Math.max(0, scoreRebuild)),
    };

    // 选出最高分
    const sortedKinds = ([...RETURN_STRATEGY_KINDS] as ReturnStrategyKind[]).sort(
        (a, b) => scores[b] - scores[a],
    );
    bestKind = sortedKinds[0];

    if (bestKind === "maintenance-first") {
        reasonKey = "returnSimulation.reason.defects";
    } else if (bestKind === "narrow-scope") {
        reasonKey = "returnSimulation.reason.backlogRelief";
    } else if (bestKind === "rebuild-fresh") {
        reasonKey = "returnSimulation.reason.rebuildRestart";
    } else if (bestKind === "archive-phase") {
        reasonKey = "returnSimulation.reason.phaseArchived";
    } else {
        reasonKey = "returnSimulation.reason.normal";
    }

    const strategies: SimulatedStrategy[] = [
        {
            kind: "continue-old",
            nameKey: "returnSimulation.strategy.continueOld.name",
            descKey: "returnSimulation.strategy.continueOld.desc",
            workload: continueWorkload,
            preserves: [
                "returnCheck.rebuild.due",
                "returnCheck.rebuild.goals",
                "returnCheck.rebuild.lifecycle",
            ],
            discardsOrChanges: ["returnSimulation.change.none"],
            riskLevel: continueRisk,
            riskWarningKey: continueWarning,
            recommendedForKey: "returnSimulation.strategy.continueOld.recommendedFor",
            isRecommended: bestKind === "continue-old",
            recommendationScore: scores["continue-old"],
        },
        {
            kind: "narrow-scope",
            nameKey: "returnSimulation.strategy.narrowScope.name",
            descKey: "returnSimulation.strategy.narrowScope.desc",
            workload: narrowWorkload,
            preserves: [
                "returnCheck.rebuild.due",
                "returnCheck.rebuild.goals",
                "returnCheck.rebuild.lifecycle",
            ],
            discardsOrChanges: ["returnSimulation.change.sessionCap"],
            riskLevel: "low",
            riskWarningKey: null,
            recommendedForKey: "returnSimulation.strategy.narrowScope.recommendedFor",
            isRecommended: bestKind === "narrow-scope",
            recommendationScore: scores["narrow-scope"],
        },
        {
            kind: "maintenance-first",
            nameKey: "returnSimulation.strategy.maintenanceFirst.name",
            descKey: "returnSimulation.strategy.maintenanceFirst.desc",
            workload: maintWorkload,
            preserves: [
                "returnCheck.rebuild.due",
                "returnCheck.rebuild.goals",
                "returnCheck.rebuild.lifecycle",
            ],
            discardsOrChanges: ["returnSimulation.change.divertToMaint"],
            riskLevel: "low",
            riskWarningKey: null,
            recommendedForKey: "returnSimulation.strategy.maintenanceFirst.recommendedFor",
            isRecommended: bestKind === "maintenance-first",
            recommendationScore: scores["maintenance-first"],
        },
        {
            kind: "archive-phase",
            nameKey: "returnSimulation.strategy.archivePhase.name",
            descKey: "returnSimulation.strategy.archivePhase.desc",
            workload: archiveWorkload,
            preserves: [
                "returnCheck.rebuild.due",
                "returnCheck.rebuild.goals",
                "returnCheck.rebuild.lifecycle",
            ],
            discardsOrChanges: ["returnSimulation.change.phaseArchive"],
            riskLevel: "medium",
            riskWarningKey: "returnSimulation.risk.archivedHidden",
            recommendedForKey: "returnSimulation.strategy.archivePhase.recommendedFor",
            isRecommended: bestKind === "archive-phase",
            recommendationScore: scores["archive-phase"],
        },
        {
            kind: "rebuild-fresh",
            nameKey: "returnSimulation.strategy.rebuildFresh.name",
            descKey: "returnSimulation.strategy.rebuildFresh.desc",
            workload: rebuildWorkload,
            preserves: [
                "returnCheck.rebuild.due",
                "returnCheck.rebuild.goals",
                "returnCheck.rebuild.lifecycle",
            ],
            discardsOrChanges: ["returnCheck.rebuild.session"],
            riskLevel: "medium",
            riskWarningKey: "returnSimulation.risk.sessionReset",
            recommendedForKey: "returnSimulation.strategy.rebuildFresh.recommendedFor",
            isRecommended: bestKind === "rebuild-fresh",
            recommendationScore: scores["rebuild-fresh"],
        },
    ];

    return {
        facts,
        strategies,
        recommendedKind: bestKind,
        recommendationReasonKey: reasonKey,
        generatedAt: now,
    };
}

export interface ReturnBatchOptions {
    customSessionCap?: number;
    cardIdsToSuspend?: string[];
    deckIdsToArchive?: string[];
    previousSessionCap?: number | null;
}

/** 生成可撤销批次定义 */
export function createReturnStrategyBatch(
    strategyKind: ReturnStrategyKind,
    facts: ReturnSimulationFacts,
    options: ReturnBatchOptions = {},
    now: number = Date.now(),
): ReturnStrategyBatch {
    const batchId = `rsb-${now}-${Math.random().toString(36).substring(2, 8)}`;
    const actions: ReturnBatchAction[] = [];
    const rollbackActions: ReturnBatchAction[] = [];

    switch (strategyKind) {
        case "narrow-scope": {
            const cap = options.customSessionCap ?? SMALL_BUDGET_CAP;
            const prev = options.previousSessionCap ?? null;
            actions.push({
                type: "set-session-budget",
                cap,
                previousCap: prev,
            });
            rollbackActions.push({
                type: "set-session-budget",
                cap: prev ?? 0,
                previousCap: cap,
            });
            break;
        }
        case "maintenance-first": {
            actions.push({
                type: "route-to-maintenance",
                targetView: "maintenance",
            });
            rollbackActions.push({
                type: "route-to-maintenance",
                targetView: "maintenance",
            });
            break;
        }
        case "archive-phase": {
            const decks = options.deckIdsToArchive ?? [];
            actions.push({
                type: "tag-phase-archive",
                deckIds: decks,
                previousArchivedState: false,
            });
            rollbackActions.push({
                type: "tag-phase-archive",
                deckIds: decks,
                previousArchivedState: true,
            });
            break;
        }
        case "rebuild-fresh": {
            actions.push({
                type: "reset-session-queue",
                resetAt: now,
                rampUpSize: REBUILD_SEED_CAP,
            });
            rollbackActions.push({
                type: "reset-session-queue",
                resetAt: now,
                rampUpSize: facts.dueCount,
            });
            break;
        }
        case "continue-old":
        default: {
            // 继续旧计划无变动动作
            break;
        }
    }

    return {
        batchId,
        strategyKind,
        createdAt: now,
        appliedAt: null,
        revertedAt: null,
        status: "prepared",
        actions,
        rollbackActions,
        factsSnapshot: Object.freeze({ ...facts }),
    };
}

/** 检验批次安全契约（确保不触碰破坏性操作） */
export function validateBatchSafety(batch: ReturnStrategyBatch): {
    safe: boolean;
    violatesDuePolicy: boolean;
    reasons: string[];
} {
    const reasons: string[] = [];
    let violatesDuePolicy = false;

    // 严格禁止任何修改内核原生 due 或删除卡片的操作类型
    for (const action of [...batch.actions, ...batch.rollbackActions]) {
        const actionType = (action as any).type;
        if (actionType === "delete-card" || actionType === "purge-revlog" || actionType === "override-kernel-due") {
            violatesDuePolicy = true;
            reasons.push(`Forbidden destructive action type: ${actionType}`);
        }
    }

    return {
        safe: !violatesDuePolicy && reasons.length === 0,
        violatesDuePolicy,
        reasons,
    };
}

/** 标记批次为已应用（纯状态转换，返回新对象） */
export function markBatchApplied(batch: ReturnStrategyBatch, appliedAt: number = Date.now()): ReturnStrategyBatch {
    if (batch.status !== "prepared") {
        throw new Error(`Cannot apply batch in status: ${batch.status}`);
    }
    return {
        ...batch,
        appliedAt,
        status: "applied",
    };
}

/** 标记批次为已撤销（纯状态转换，返回新对象） */
export function markBatchReverted(batch: ReturnStrategyBatch, revertedAt: number = Date.now()): ReturnStrategyBatch {
    if (batch.status !== "applied") {
        throw new Error(`Cannot revert batch in status: ${batch.status}`);
    }
    return {
        ...batch,
        revertedAt,
        status: "reverted",
    };
}
