/**
 * BT-1 学习结果声明生成器 与 BT-2 前置依赖准备度检查（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 诚实三维证据模型：回忆（recall）、解释（explanation）、应用（application）；
 * 2. 只有当三维证据均达到设定阈值时，才声明“达到目标”（achieved）；否则诚实呈现 partial / insufficient / unknown；
 * 3. 绝不基于单一连击数或保持率做绝对结论；
 * 4. 前置依赖准备度：显示缺失先修证据并允许用户知情绕过（bypassable），不强行建卡或改评分。
 */

export type OutcomeEvidenceType = "recall" | "explanation" | "application";

/** 单项证据记录 */
export interface OutcomeEvidenceItem {
    type: OutcomeEvidenceType;
    /** 证据时间戳 */
    recordedAt: number;
    /** 证据强度评分或权重（通常 1，高质量实战可为更高） */
    weight?: number;
    /** 关联凭据或出处描述（卡片ID、题目ID、错题复盘记录等） */
    sourceRef?: string;
}

/** 目标知识点/主题的证据集合 */
export interface TopicEvidenceCollection {
    topicId: string;
    topicName: string;
    items: OutcomeEvidenceItem[];
}

/** 自定义证据阈值配置 */
export interface OutcomeThresholdConfig {
    /** 最小回忆成功次数（默认 3） */
    minRecallCount: number;
    /** 最小解释通过次数（默认 1） */
    minExplanationCount: number;
    /** 最小应用实战次数（默认 1） */
    minApplicationCount: number;
    /** 证据有效时间窗（天数，默认 90 天；超期证据需重新验证） */
    validWindowDays?: number;
}

export const DEFAULT_OUTCOME_THRESHOLDS: OutcomeThresholdConfig = {
    minRecallCount: 3,
    minExplanationCount: 1,
    minApplicationCount: 1,
    validWindowDays: 90,
};

export type OutcomeClaimStatus = "achieved" | "partial" | "insufficient" | "unknown";

/** 单个维度的达标情况 */
export interface DimensionProgress {
    count: number;
    threshold: number;
    met: boolean;
}

/** BT-1 学习结果声明模型 */
export interface OutcomeClaim {
    topicId: string;
    topicName: string;
    status: OutcomeClaimStatus;
    statusKey: string;
    dimensions: {
        recall: DimensionProgress;
        explanation: DimensionProgress;
        application: DimensionProgress;
    };
    /** 未满足维度的补齐建议 i18n 键 */
    gapSuggestionKeys: string[];
    /** 诚实说明理由键 */
    reasonKey: string;
    assessedAt: number;
}

/**
 * BT-1 学习结果声明生成器（纯函数）：
 * 基于三维证据评估学习结果，不夸大、不伪造，缺乏证据时绝不宣称掌握。
 */
export function generateOutcomeClaim(
    evidence: TopicEvidenceCollection,
    customThresholds: Partial<OutcomeThresholdConfig> = {},
    now: number = Date.now(),
): OutcomeClaim {
    const config: OutcomeThresholdConfig = {
        ...DEFAULT_OUTCOME_THRESHOLDS,
        ...customThresholds,
    };

    const windowMs = (config.validWindowDays ?? 90) * 86400 * 1000;
    const cutoff = now - windowMs;

    // 过滤掉超出有效期的陈旧证据
    const validItems = evidence.items.filter(item => item.recordedAt >= cutoff);

    let recallCount = 0;
    let explanationCount = 0;
    let applicationCount = 0;

    for (const item of validItems) {
        const w = Math.max(0.5, item.weight ?? 1);
        if (item.type === "recall") recallCount += w;
        else if (item.type === "explanation") explanationCount += w;
        else if (item.type === "application") applicationCount += w;
    }

    const recallProgress: DimensionProgress = {
        count: Math.round(recallCount * 10) / 10,
        threshold: config.minRecallCount,
        met: recallCount >= config.minRecallCount,
    };

    const explanationProgress: DimensionProgress = {
        count: Math.round(explanationCount * 10) / 10,
        threshold: config.minExplanationCount,
        met: explanationCount >= config.minExplanationCount,
    };

    const applicationProgress: DimensionProgress = {
        count: Math.round(applicationCount * 10) / 10,
        threshold: config.minApplicationCount,
        met: applicationCount >= config.minApplicationCount,
    };

    const metCount = [recallProgress.met, explanationProgress.met, applicationProgress.met].filter(Boolean).length;
    const hasAnyRecord = validItems.length > 0;

    let status: OutcomeClaimStatus = "unknown";
    let statusKey = "learningOutcome.status.unknown";
    let reasonKey = "learningOutcome.reason.noEvidence";

    const gapSuggestionKeys: string[] = [];

    if (!recallProgress.met) gapSuggestionKeys.push("learningOutcome.gap.needRecall");
    if (!explanationProgress.met) gapSuggestionKeys.push("learningOutcome.gap.needExplanation");
    if (!applicationProgress.met) gapSuggestionKeys.push("learningOutcome.gap.needApplication");

    if (!hasAnyRecord) {
        status = "unknown";
        statusKey = "learningOutcome.status.unknown";
        reasonKey = "learningOutcome.reason.noEvidence";
    } else if (metCount === 3) {
        status = "achieved";
        statusKey = "learningOutcome.status.achieved";
        reasonKey = "learningOutcome.reason.allMet";
    } else if (metCount >= 1) {
        status = "partial";
        statusKey = "learningOutcome.status.partial";
        reasonKey = "learningOutcome.reason.partiallyMet";
    } else {
        status = "insufficient";
        statusKey = "learningOutcome.status.insufficient";
        reasonKey = "learningOutcome.reason.belowThresholds";
    }

    return {
        topicId: evidence.topicId,
        topicName: evidence.topicName,
        status,
        statusKey,
        dimensions: {
            recall: recallProgress,
            explanation: explanationProgress,
            application: applicationProgress,
        },
        gapSuggestionKeys,
        reasonKey,
        assessedAt: now,
    };
}

// ----------------------------------------------------------------------------
// BT-2 前置依赖准备度检查（Prerequisite Readiness Gate）
// ----------------------------------------------------------------------------

/** 前置依赖定义 */
export interface PrerequisiteRequirement {
    id: string;
    name: string;
    /** 期望的最低达成标准（默认 achieved） */
    requiredStatus?: OutcomeClaimStatus;
}

/** 前置依赖缺口明细 */
export interface PrerequisiteGap {
    prerequisiteId: string;
    prerequisiteName: string;
    currentStatus: OutcomeClaimStatus;
    requiredStatus: OutcomeClaimStatus;
    missingDimensions: OutcomeEvidenceType[];
    explanationKey: string;
}

export type ReadinessVerdict = "ready" | "gap-warning" | "blocked";

/** BT-2 准备度检查结果 */
export interface PrerequisiteReadinessResult {
    targetId: string;
    verdict: ReadinessVerdict;
    allMet: boolean;
    gaps: PrerequisiteGap[];
    /** 允许用户知情绕过 */
    canBypass: boolean;
    verdictKey: string;
}

/**
 * BT-2 检查前置依赖准备度（纯函数）：
 * 对比目标任务所需的前置依赖与当前声明，标记缺口，允许知情绕过。
 */
export function checkPrerequisiteReadiness(
    targetId: string,
    requirements: PrerequisiteRequirement[],
    claimsMap: Record<string, OutcomeClaim>,
): PrerequisiteReadinessResult {
    if (!requirements || requirements.length === 0) {
        return {
            targetId,
            verdict: "ready",
            allMet: true,
            gaps: [],
            canBypass: true,
            verdictKey: "learningOutcome.prereq.ready",
        };
    }

    const gaps: PrerequisiteGap[] = [];

    for (const req of requirements) {
        const claim = claimsMap[req.id];
        const reqStatus = req.requiredStatus ?? "achieved";

        if (!claim) {
            gaps.push({
                prerequisiteId: req.id,
                prerequisiteName: req.name,
                currentStatus: "unknown",
                requiredStatus: reqStatus,
                missingDimensions: ["recall", "explanation", "application"],
                explanationKey: "learningOutcome.prereq.missingAll",
            });
            continue;
        }

        const isMet = reqStatus === "achieved"
            ? claim.status === "achieved"
            : (claim.status === "achieved" || claim.status === "partial");

        if (!isMet) {
            const missingDims: OutcomeEvidenceType[] = [];
            if (!claim.dimensions.recall.met) missingDims.push("recall");
            if (!claim.dimensions.explanation.met) missingDims.push("explanation");
            if (!claim.dimensions.application.met) missingDims.push("application");

            gaps.push({
                prerequisiteId: req.id,
                prerequisiteName: req.name,
                currentStatus: claim.status,
                requiredStatus: reqStatus,
                missingDimensions: missingDims,
                explanationKey: claim.status === "insufficient"
                    ? "learningOutcome.prereq.insufficient"
                    : "learningOutcome.prereq.notAchieved",
            });
        }
    }

    const allMet = gaps.length === 0;
    const verdict: ReadinessVerdict = allMet ? "ready" : "gap-warning";
    const verdictKey = allMet
        ? "learningOutcome.prereq.ready"
        : "learningOutcome.prereq.hasGaps";

    return {
        targetId,
        verdict,
        allMet,
        gaps,
        canBypass: true, // 契约原则：永远允许用户知情绕过，不硬编码死锁
        verdictKey,
    };
}
