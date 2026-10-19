/**
 * BT-6 知识可信度与掌握度双轴象限矩阵引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 彻底解耦两大轴线：
 *    - 内容可信度轴（Credibility Axis）：衡量知识本身的来源可靠性、是否有冲突、是否过时；
 *    - 记忆掌握度轴（Mastery Axis）：衡量学习者大脑的回忆稳定性与应用表现；
 * 2. 诚实未知原则：任何一个轴线缺乏充分数据时，明确标注为 unknown，绝不胡乱估算；
 * 3. 识破“高记忆低可信”误读陷阱：熟读了错误/过时知识是最大负资产，及时发出冻结重写警报；
 * 4. 纯函数设计，数据不可变隔离。
 */

export type CredibilityLevel = "high" | "medium" | "low" | "unknown";

export type MasteryLevel = "mastered" | "learning" | "struggling" | "unknown";

export type MatrixQuadrant =
    | "core-asset" // 高可信 + 高掌握（Q1: 核心资产）
    | "dangerous-trap" // 低可信 + 高掌握（Q2: 熟读错误陷阱）
    | "stale-noise" // 低可信 + 低掌握（Q3: 无效冗余噪音）
    | "promising-target" // 高可信 + 低掌握（Q4: 重点攻坚新知）
    | "uncalibrated"; // 任一轴数据不足（未知待定）

/** 单张卡片在双轴矩阵上的定位模型 */
export interface DualAxisCardPosition {
    cardId: string;
    deckId: string;
    credibility: {
        level: CredibilityLevel;
        score: number; // 0 ~ 100
        hasConflicts: boolean;
        isStale: boolean;
        sourceAvailable: boolean;
        levelKey: string;
    };
    mastery: {
        level: MasteryLevel;
        score: number; // 0 ~ 100
        reviewCount: number;
        forgetRate: number;
        hasApplicationEvidence: boolean;
        levelKey: string;
    };
    quadrant: MatrixQuadrant;
    quadrantKey: string;
    actionKey: string;
    reasonKey: string;
}

/** 评估输入事实 */
export interface CardEvaluationFacts {
    cardId: string;
    deckId: string;
    /** 来源笔记是否存在且未删除 */
    sourceBlockExists: boolean;
    /** 来源笔记是否有未解决冲突 */
    hasConflict?: boolean;
    /** 是否标记为知识过时 */
    isStale?: boolean;
    /** 来源置信度（0 ~ 100，默认 80） */
    sourceConfidence?: number;
    /** 累计复习次数 */
    reviewCount: number;
    /** 累计遗忘次数 */
    forgetCount: number;
    /** 是否有通过的应用或自解释证据 */
    hasApplicationEvidence?: boolean;
    /** 当前 FSRS 间隔天数（null 表示新卡） */
    intervalDays?: number | null;
}

/** 矩阵宏观分布概览 */
export interface MatrixDistributionSummary {
    totalCards: number;
    quadrantCounts: Record<MatrixQuadrant, number>;
    highRiskTrapCardIds: string[];
    uncalibratedCount: number;
}

/**
 * 计算单张卡片的双轴定位与象限归属（纯函数）
 */
export function evaluateDualAxisCard(
    facts: CardEvaluationFacts,
): DualAxisCardPosition {
    // --- 1. 计算内容可信度轴 ---
    let credLevel: CredibilityLevel = "unknown";
    let credScore = 0;

    if (facts.sourceConfidence === null) {
        // 显式声明来源未知
        credLevel = "unknown";
        credScore = 0;
    } else if (!facts.sourceBlockExists) {
        // 来源笔记已被物理删除 -> 孤儿低可信
        credLevel = "low";
        credScore = 15;
    } else if (facts.isStale || facts.hasConflict) {
        // 内容过时或有冲突未决 -> 低可信
        credLevel = "low";
        credScore = 30;
    } else {
        const conf = facts.sourceConfidence ?? 85;
        credScore = conf;
        if (conf >= 75) credLevel = "high";
        else if (conf >= 50) credLevel = "medium";
        else credLevel = "low";
    }

    // --- 2. 计算记忆掌握度轴 ---
    let mastLevel: MasteryLevel = "unknown";
    let mastScore = 0;

    if (facts.reviewCount === 0) {
        mastLevel = "unknown";
        mastScore = 0;
    } else {
        const forgetRate = facts.forgetCount / facts.reviewCount;
        const interval = facts.intervalDays ?? 0;

        // 综合评分算法（结合复习次数、遗忘率与当前间隔）
        let rawScore = Math.max(0, 100 - forgetRate * 80);
        if (interval >= 21) rawScore += 15;
        if (facts.hasApplicationEvidence) rawScore += 10;
        mastScore = Math.min(100, Math.round(rawScore));

        if (facts.reviewCount >= 4 && forgetRate <= 0.25 && interval >= 14) {
            mastLevel = "mastered";
        } else if (facts.reviewCount >= 5 && forgetRate > 0.4) {
            mastLevel = "struggling";
        } else {
            mastLevel = "learning";
        }
    }

    // --- 3. 四象限与行动建议判定 ---
    let quadrant: MatrixQuadrant = "uncalibrated";
    let quadrantKey = "dualAxisMatrix.quadrant.uncalibrated";
    let actionKey = "dualAxisMatrix.action.gatherEvidence";
    let reasonKey = "dualAxisMatrix.reason.missingAxisData";

    const isCredHigh = credLevel === "high" || credLevel === "medium";
    const isCredLow = credLevel === "low";
    const isMastHigh = mastLevel === "mastered";
    const isMastLow = mastLevel === "learning" || mastLevel === "struggling";

    if (credLevel === "unknown" || mastLevel === "unknown") {
        quadrant = "uncalibrated";
        quadrantKey = "dualAxisMatrix.quadrant.uncalibrated";
        actionKey = "dualAxisMatrix.action.gatherEvidence";
        reasonKey = "dualAxisMatrix.reason.missingAxisData";
    } else if (isCredHigh && isMastHigh) {
        quadrant = "core-asset";
        quadrantKey = "dualAxisMatrix.quadrant.coreAsset";
        actionKey = "dualAxisMatrix.action.maintainRhythm";
        reasonKey = "dualAxisMatrix.reason.healthyMastery";
    } else if (isCredLow && isMastHigh) {
        // 核心风险：熟读了错误/过时的卡片
        quadrant = "dangerous-trap";
        quadrantKey = "dualAxisMatrix.quadrant.dangerousTrap";
        actionKey = "dualAxisMatrix.action.freezeAndRewrite";
        reasonKey = "dualAxisMatrix.reason.memorizedStaleKnowledge";
    } else if (isCredLow && isMastLow) {
        quadrant = "stale-noise";
        quadrantKey = "dualAxisMatrix.quadrant.staleNoise";
        actionKey = "dualAxisMatrix.action.deleteOrArchive";
        reasonKey = "dualAxisMatrix.reason.worthlessNoise";
    } else if (isCredHigh && isMastLow) {
        quadrant = "promising-target";
        quadrantKey = "dualAxisMatrix.quadrant.promisingTarget";
        actionKey = "dualAxisMatrix.action.focusDrill";
        reasonKey = "dualAxisMatrix.reason.reliableTarget";
    }

    return {
        cardId: facts.cardId,
        deckId: facts.deckId,
        credibility: {
            level: credLevel,
            score: credScore,
            hasConflicts: !!facts.hasConflict,
            isStale: !!facts.isStale,
            sourceAvailable: facts.sourceBlockExists,
            levelKey: `dualAxisMatrix.credibility.${credLevel}`,
        },
        mastery: {
            level: mastLevel,
            score: mastScore,
            reviewCount: facts.reviewCount,
            forgetRate: facts.reviewCount > 0 ? Math.round((facts.forgetCount / facts.reviewCount) * 100) / 100 : 0,
            hasApplicationEvidence: !!facts.hasApplicationEvidence,
            levelKey: `dualAxisMatrix.mastery.${mastLevel}`,
        },
        quadrant,
        quadrantKey,
        actionKey,
        reasonKey,
    };
}

/** 批量计算多张卡片的矩阵分布宏观透视（纯函数） */
export function summarizeMatrixDistribution(
    cards: readonly CardEvaluationFacts[],
): MatrixDistributionSummary {
    const quadrantCounts: Record<MatrixQuadrant, number> = {
        "core-asset": 0,
        "dangerous-trap": 0,
        "stale-noise": 0,
        "promising-target": 0,
        "uncalibrated": 0,
    };

    const highRiskTrapCardIds: string[] = [];

    for (const card of cards) {
        const evaluated = evaluateDualAxisCard(card);
        quadrantCounts[evaluated.quadrant]++;
        if (evaluated.quadrant === "dangerous-trap") {
            highRiskTrapCardIds.push(card.cardId);
        }
    }

    return {
        totalCards: cards.length,
        quadrantCounts,
        highRiskTrapCardIds,
        uncalibratedCount: quadrantCounts["uncalibrated"],
    };
}
