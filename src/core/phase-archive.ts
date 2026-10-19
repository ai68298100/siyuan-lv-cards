/**
 * BI-29 长期项目阶段封存与复开引擎（Phase Archive & Reopen Engine）
 * 纯逻辑模块，Node / 浏览器双兼容，具备完整单测覆盖。
 *
 * 核心契约与安全原则：
 * 1. 【封存上下文完整性】：记录课程/语言/专业项目的来源文档指纹、卡片清单、掌握度与最后学习状态；
 * 2. 【复开前严格校验】：复开时首先检查来源有效性与版本漂移（missing / drifted），绝不静默覆盖；
 * 3. 【零瞬时今日负担（Zero Instant Burden Shield）】：长期封存卡片必然处于 overdue 状态，
 *    复开必须采用平滑渐进配额（gradual ramp-up）或按需摸底抽查，严禁默认一次性全量灌入今日复习队列；
 * 4. 【坚决捍卫 ADR-3 铁律】：不篡改思源内核原生 FSRS 排期、due 时间与学习日志；
 * 5. 【100% 对称可回滚】：支持一键撤销复开并恢复完整封存快照。
 */

export const PHASE_DOMAINS = ["course", "language", "professional", "general"] as const;
export type PhaseDomain = (typeof PHASE_DOMAINS)[number];

export const PHASE_STATUSES = ["active", "archived", "reopening-check", "reopened"] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export const REOPEN_STRATEGIES = [
    "gradual-ramp",         // 平滑渐进释放：限制每日上限，平滑分散
    "on-demand-diagnostic", // 按需摸底抽查：不入日常队列，生成专项诊断批次
    "paused-waiting",       // 挂起待命：复开项目但暂不激活卡片复习
] as const;
export type ReopenStrategy = (typeof REOPEN_STRATEGIES)[number];

export const ARCHIVE_REASONS = [
    "curriculum-finished", // 课程结课/学期结束
    "exam-completed",      // 考试或认证已结束
    "stage-mastered",      // 当前阶段目标已达成
    "pause-temporarily",   // 临时搁置/精力转向其他主任务
    "custom-archive",      // 用户自定义原因
] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];

/** 来源文档或块引用快照 */
export interface PhaseSourceRef {
    blockId: string;
    title: string;
    contentHash: string;
    updatedAt: number;
    notebookId?: string;
}

/** 卡片集合引用快照 */
export interface PhaseCardRef {
    cardId: string;
    contentHash?: string;
    deckId?: string;
    lastDue?: number;
    lastStability?: number;
}

/** 阶段掌握度指标快照 */
export interface PhaseStatsSnapshot {
    totalCards: number;
    masteredCount: number;
    dueCountAtArchive: number;
    retentionRate?: number;
}

/** 封存上下文快照（完全不可变） */
export interface PhaseArchiveSnapshot {
    archivedAt: number;
    reason: ArchiveReason;
    note?: string;
    sourceRefs: PhaseSourceRef[];
    cardRefs: PhaseCardRef[];
    stats: PhaseStatsSnapshot;
    originalGoalId?: string;
}

/** 阶段操作轨迹日志 */
export interface PhaseHistoryEntry {
    action: "archive" | "reopen-check" | "reopen" | "rollback";
    timestamp: number;
    note?: string;
    details?: Record<string, unknown>;
}

/** 长期阶段项目模型 */
export interface PhaseProject {
    id: string;
    title: string;
    domain: PhaseDomain;
    status: PhaseStatus;
    snapshot: PhaseArchiveSnapshot | null;
    history: PhaseHistoryEntry[];
    createdAt: number;
    updatedAt: number;
}

/** 来源版本校验问题项 */
export interface SourceIssue {
    blockId: string;
    title: string;
    issueType: "missing" | "drifted";
    reasonKey: string;
    expectedHash: string;
    actualHash?: string;
}

/** 复开前校验综合报告 */
export interface ReopenCheckReport {
    projectId: string;
    checkedAt: number;
    canDirectlyReopen: boolean;
    totalArchivedCards: number;
    healthySourcesCount: number;
    driftedSourcesCount: number;
    missingSourcesCount: number;
    sourceIssues: SourceIssue[];
    missingCardsCount: number;
    validCardsCount: number;
    summaryKey: string;
}

/** 零瞬时负担调度规划方案 */
export interface ReopenPlan {
    strategy: ReopenStrategy;
    /** 今日建议安排张数（严格受控于安全配额） */
    todayAssignedCount: number;
    /** 预计平滑分散总天数 */
    spreadDays: number;
    /** 每日推荐配额上限 */
    dailyCap: number;
    /** 建议说明键 */
    descriptionKey: string;
    /** 警告提示键（如存在过载风险） */
    warningKey: string | null;
}

/** 默认安全每日配额 */
export const DEFAULT_DAILY_RAMP_CAP = 10;
export const MAX_SAFE_INSTANT_LOAD = 15;

/**
 * 创建新阶段项目（初始状态为 active）
 */
export function createPhaseProject(
    params: {
        id: string;
        title: string;
        domain: PhaseDomain;
    },
    now: number = Date.now(),
): PhaseProject {
    return {
        id: params.id.trim(),
        title: params.title.trim() || "未命名阶段项目",
        domain: params.domain,
        status: "active",
        snapshot: null,
        history: [{
            action: "archive",
            timestamp: now,
            note: "创建阶段项目",
        }],
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * 执行阶段封存，冻结日常复习并记录完整上下文快照
 */
export function archivePhase(
    project: PhaseProject,
    params: {
        reason: ArchiveReason;
        note?: string;
        sources: PhaseSourceRef[];
        cards: PhaseCardRef[];
        stats: PhaseStatsSnapshot;
        originalGoalId?: string;
    },
    now: number = Date.now(),
): PhaseProject {
    const snapshot: PhaseArchiveSnapshot = {
        archivedAt: now,
        reason: params.reason,
        note: params.note?.trim() || undefined,
        sourceRefs: params.sources.map(s => ({ ...s })),
        cardRefs: params.cards.map(c => ({ ...c })),
        stats: { ...params.stats },
        originalGoalId: params.originalGoalId,
    };

    const newHistory: PhaseHistoryEntry[] = [
        ...project.history,
        {
            action: "archive",
            timestamp: now,
            note: params.note,
            details: {
                reason: params.reason,
                totalCards: params.cards.length,
                totalSources: params.sources.length,
            },
        },
    ];

    return {
        ...project,
        status: "archived",
        snapshot,
        history: newHistory,
        updatedAt: now,
    };
}

/**
 * 复开前预检：检查来源是否存在、内容哈希是否漂移、卡片存续情况
 * 核心验收契约：复开先检查版本和来源
 */
export function checkReopenPrerequisites(
    project: PhaseProject,
    currentSources: Map<string, { title: string; contentHash: string }>,
    existingCardIds: Set<string>,
    now: number = Date.now(),
): ReopenCheckReport {
    if (!project.snapshot) {
        return {
            projectId: project.id,
            checkedAt: now,
            canDirectlyReopen: false,
            totalArchivedCards: 0,
            healthySourcesCount: 0,
            driftedSourcesCount: 0,
            missingSourcesCount: 0,
            sourceIssues: [],
            missingCardsCount: 0,
            validCardsCount: 0,
            summaryKey: "phaseArchive.check.noSnapshot",
        };
    }

    const { sourceRefs, cardRefs } = project.snapshot;
    const issues: SourceIssue[] = [];
    let healthyCount = 0;
    let driftedCount = 0;
    let missingCount = 0;

    for (const src of sourceRefs) {
        const current = currentSources.get(src.blockId);
        if (!current) {
            missingCount++;
            issues.push({
                blockId: src.blockId,
                title: src.title,
                issueType: "missing",
                reasonKey: "phaseArchive.issue.sourceMissing",
                expectedHash: src.contentHash,
            });
        } else if (current.contentHash !== src.contentHash) {
            driftedCount++;
            issues.push({
                blockId: src.blockId,
                title: current.title || src.title,
                issueType: "drifted",
                reasonKey: "phaseArchive.issue.sourceDrifted",
                expectedHash: src.contentHash,
                actualHash: current.contentHash,
            });
        } else {
            healthyCount++;
        }
    }

    let validCardsCount = 0;
    let missingCardsCount = 0;

    for (const card of cardRefs) {
        if (existingCardIds.has(card.cardId)) {
            validCardsCount++;
        } else {
            missingCardsCount++;
        }
    }

    const hasBlockers = missingCount > 0 || missingCardsCount === cardRefs.length;
    const canDirectlyReopen = !hasBlockers && driftedCount === 0;

    let summaryKey = "phaseArchive.check.allHealthy";
    if (hasBlockers) {
        summaryKey = "phaseArchive.check.hasBlockers";
    } else if (driftedCount > 0) {
        summaryKey = "phaseArchive.check.needsReview";
    }

    return {
        projectId: project.id,
        checkedAt: now,
        canDirectlyReopen,
        totalArchivedCards: cardRefs.length,
        healthySourcesCount: healthyCount,
        driftedSourcesCount: driftedCount,
        missingSourcesCount: missingCount,
        sourceIssues: issues,
        missingCardsCount,
        validCardsCount,
        summaryKey,
    };
}

/**
 * 规划复开调度方案
 * 核心验收契约：不自动制造今日负担！
 */
export function planReopenWorkload(
    totalCards: number,
    options: {
        strategy?: ReopenStrategy;
        preferredDailyCap?: number;
    } = {},
): ReopenPlan {
    const strategy = options.strategy || "gradual-ramp";
    const cap = options.preferredDailyCap && options.preferredDailyCap > 0
        ? options.preferredDailyCap
        : DEFAULT_DAILY_RAMP_CAP;

    if (totalCards <= 0) {
        return {
            strategy,
            todayAssignedCount: 0,
            spreadDays: 0,
            dailyCap: cap,
            descriptionKey: "phaseArchive.plan.empty",
            warningKey: null,
        };
    }

    if (strategy === "paused-waiting") {
        return {
            strategy,
            todayAssignedCount: 0,
            spreadDays: 0,
            dailyCap: cap,
            descriptionKey: "phaseArchive.plan.pausedDesc",
            warningKey: null,
        };
    }

    if (strategy === "on-demand-diagnostic") {
        // 抽样摸底测验：取卡库的 10% 或最多 15 张
        const sampleCount = Math.min(MAX_SAFE_INSTANT_LOAD, Math.max(5, Math.ceil(totalCards * 0.1)));
        return {
            strategy,
            todayAssignedCount: sampleCount,
            spreadDays: 1,
            dailyCap: sampleCount,
            descriptionKey: "phaseArchive.plan.diagnosticDesc",
            warningKey: null,
        };
    }

    // 默认 gradual-ramp: 严格遵守每日配额上限，杜绝突发过载
    const todayAssigned = Math.min(cap, totalCards);
    const spreadDays = Math.ceil(totalCards / cap);
    const warningKey = totalCards > 100 ? "phaseArchive.warning.largeBacklogSpread" : null;

    return {
        strategy: "gradual-ramp",
        todayAssignedCount: todayAssigned,
        spreadDays,
        dailyCap: cap,
        descriptionKey: "phaseArchive.plan.gradualRampDesc",
        warningKey,
    };
}

/**
 * 执行复开确认
 * 将项目状态切换为 reopened，并生成调度指引
 */
export function executeReopen(
    project: PhaseProject,
    plan: ReopenPlan,
    now: number = Date.now(),
): PhaseProject {
    const historyEntry: PhaseHistoryEntry = {
        action: "reopen",
        timestamp: now,
        details: {
            strategy: plan.strategy,
            todayAssignedCount: plan.todayAssignedCount,
            dailyCap: plan.dailyCap,
            spreadDays: plan.spreadDays,
        },
    };

    return {
        ...project,
        status: "reopened",
        history: [...project.history, historyEntry],
        updatedAt: now,
    };
}

/**
 * 撤销复开，安全回滚至封存状态（100% 对称保护）
 */
export function rollbackReopen(
    project: PhaseProject,
    reason: string = "用户手动回滚",
    now: number = Date.now(),
): PhaseProject {
    if (project.status !== "reopened") {
        return project;
    }

    const historyEntry: PhaseHistoryEntry = {
        action: "rollback",
        timestamp: now,
        note: reason,
    };

    return {
        ...project,
        status: "archived",
        history: [...project.history, historyEntry],
        updatedAt: now,
    };
}
