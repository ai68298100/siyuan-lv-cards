/**
 * BL-14 产品目标与用户反馈闭环引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 三维指标严格解耦：
 *    - 功能使用率（usage）：调用频次与使用频率；
 *    - 学习结果（outcome）：客观回忆保持率与目标达成度；
 *    - 用户满意度（satisfaction）：主观体验与无阻滞感评分；
 *    - 验收铁律：三者独立分立，绝不把使用率高假定为掌握得好！
 * 2. 问题闭环五元组：每项高频问题必须关联 用户任务（task）、证据（evidence）、待办（todo）、版本（version）与回访（revisit）；
 * 3. 零遥测纯本地存储：所有数据在本地闭环，支持导出 Markdown 对账清单。
 */

import { sanitizeSensitiveText } from "./audit-log";

export type MetricDimensionType = "usage" | "outcome" | "satisfaction";

export type RevisitLifecycleStatus =
    | "unaddressed"
    | "in-progress"
    | "revisit-pending"
    | "verified-closed";

/** 单项用户反馈与任务闭环条目 */
export interface FeedbackLoopItem {
    id: string;
    /** 用户当时尝试完成的任务上下文 */
    userTask: string;
    /** 问题描述 */
    issueDescription: string;
    /** 客观事实证据引用（如卡片ID、日志条目、时间戳等） */
    evidenceRef: string;
    /** 关联的项目待办或缺陷编号（如 AR-5 / BL-7） */
    linkedTodoId?: string;
    /** 计划解决的目标版本 */
    targetVersion?: string;
    /** 闭环回访状态 */
    revisitStatus: RevisitLifecycleStatus;
    /** 用户主观评分（1 ~ 5，可选） */
    satisfactionRating?: number;
    createdAt: number;
    resolvedAt?: number;
}

/** 三维指标综合评估报告 */
export interface ThreeDimensionMetrics {
    /** 1. 功能使用率维度 */
    usage: {
        totalActionsCount: number;
        activeDecksCount: number;
        usageLevel: "light" | "moderate" | "heavy";
        levelKey: string;
    };
    /** 2. 学习结果客观维度 */
    outcome: {
        retentionRate: number; // 0 ~ 1
        achievedGoalsCount: number;
        outcomeLevel: "low" | "medium" | "high";
        levelKey: string;
    };
    /** 3. 主观满意度维度 */
    satisfaction: {
        avgRating: number; // 1.0 ~ 5.0
        npsCategory: "promoter" | "passive" | "detractor" | "unknown";
        categoryKey: string;
    };
    /** 综合健康洞察：识别“高使用·低结果”假繁荣或“低使用·高满意”轻量工具特征 */
    alignmentInsightKey: string;
}

export interface UserFeedbackLoopStoreState {
    version: 1;
    updatedAt: number;
    items: FeedbackLoopItem[];
}

export function createEmptyFeedbackLoopStore(now: number = Date.now()): UserFeedbackLoopStoreState {
    return {
        version: 1,
        updatedAt: now,
        items: [],
    };
}

/** 记录一条用户反馈与任务闭环条目（纯函数） */
export function recordFeedbackLoopItem(
    state: UserFeedbackLoopStoreState,
    params: {
        userTask: string;
        issueDescription: string;
        evidenceRef: string;
        linkedTodoId?: string;
        targetVersion?: string;
        satisfactionRating?: number;
        now?: number;
    },
): UserFeedbackLoopStoreState {
    const ts = params.now ?? Date.now();
    const rating = params.satisfactionRating
        ? Math.max(1, Math.min(5, Math.round(params.satisfactionRating)))
        : undefined;

    const newItem: FeedbackLoopItem = {
        id: `fb-${ts}-${Math.random().toString(36).substring(2, 6)}`,
        userTask: sanitizeSensitiveText(params.userTask, 60),
        issueDescription: sanitizeSensitiveText(params.issueDescription, 120),
        evidenceRef: sanitizeSensitiveText(params.evidenceRef, 60),
        linkedTodoId: params.linkedTodoId ? sanitizeSensitiveText(params.linkedTodoId, 20) : undefined,
        targetVersion: params.targetVersion ? sanitizeSensitiveText(params.targetVersion, 20) : undefined,
        revisitStatus: "unaddressed",
        satisfactionRating: rating,
        createdAt: ts,
    };

    return {
        ...state,
        updatedAt: ts,
        items: [...state.items, newItem],
    };
}

/** 推进闭环回访状态（纯函数） */
export function advanceRevisitStatus(
    state: UserFeedbackLoopStoreState,
    itemId: string,
    newStatus: RevisitLifecycleStatus,
    now: number = Date.now(),
): UserFeedbackLoopStoreState {
    return {
        ...state,
        updatedAt: now,
        items: state.items.map(item =>
            item.id === itemId
                ? {
                      ...item,
                      revisitStatus: newStatus,
                      resolvedAt: newStatus === "verified-closed" ? now : item.resolvedAt,
                  }
                : item,
        ),
    };
}

/**
 * 三维独立指标评估（纯函数）：
 * 使用率、结果与满意度分立核算，输出洞察。
 */
export function evaluateProductMetrics(params: {
    totalActions: number;
    activeDecks: number;
    retentionRate: number;
    achievedGoals: number;
    ratings: number[];
}): ThreeDimensionMetrics {
    // 1. 使用率评估
    const usageCount = params.totalActions;
    let usageLevel: "light" | "moderate" | "heavy" = "light";
    if (usageCount >= 100) usageLevel = "heavy";
    else if (usageCount >= 30) usageLevel = "moderate";

    // 2. 学习结果评估
    const retention = Math.max(0, Math.min(1, params.retentionRate));
    let outcomeLevel: "low" | "medium" | "high" = "low";
    if (retention >= 0.85 && params.achievedGoals > 0) outcomeLevel = "high";
    else if (retention >= 0.7) outcomeLevel = "medium";

    // 3. 满意度评估
    const validRatings = params.ratings.filter(r => r >= 1 && r <= 5);
    const avgRating =
        validRatings.length > 0
            ? Math.round((validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length) * 10) / 10
            : 0;

    let npsCategory: "promoter" | "passive" | "detractor" | "unknown" = "unknown";
    if (avgRating >= 4.5) npsCategory = "promoter";
    else if (avgRating >= 3.5) npsCategory = "passive";
    else if (avgRating > 0) npsCategory = "detractor";

    // 4. 交叉洞察（铁律：破除使用率等同于掌握率的假象）
    let insightKey = "userFeedbackLoop.insight.balancedGrowth";
    if (usageLevel === "heavy" && outcomeLevel === "low") {
        insightKey = "userFeedbackLoop.insight.busyWithoutMastery"; // 假繁荣陷阱
    } else if (usageLevel === "light" && outcomeLevel === "high") {
        insightKey = "userFeedbackLoop.insight.efficientTool"; // 高效轻量
    } else if (outcomeLevel === "high" && npsCategory === "detractor") {
        insightKey = "userFeedbackLoop.insight.frictionInWorkflow"; // 结果好但流程有阻滞
    }

    return {
        usage: {
            totalActionsCount: usageCount,
            activeDecksCount: params.activeDecks,
            usageLevel,
            levelKey: `userFeedbackLoop.usage.${usageLevel}`,
        },
        outcome: {
            retentionRate: retention,
            achievedGoalsCount: params.achievedGoals,
            outcomeLevel,
            levelKey: `userFeedbackLoop.outcome.${outcomeLevel}`,
        },
        satisfaction: {
            avgRating,
            npsCategory,
            categoryKey: `userFeedbackLoop.nps.${npsCategory}`,
        },
        alignmentInsightKey: insightKey,
    };
}

/** 导出反馈闭环清单为 Markdown 报告 */
export function exportFeedbackLoopMarkdown(state: UserFeedbackLoopStoreState): string {
    const lines = [
        "# 小驴闪卡 · 用户反馈与任务闭环台账",
        `- 总条目数：${state.items.length}`,
        `- 更新时间：${new Date(state.updatedAt).toISOString()}`,
        "",
        "## 反馈明细与回访状态",
    ];

    for (const item of state.items) {
        lines.push(
            `- [${item.revisitStatus}] 任务: "${item.userTask}" | 问题: ${item.issueDescription} | 待办: ${item.linkedTodoId ?? "无"} | 目标版本: ${item.targetVersion ?? "待定"}`,
        );
    }

    return lines.join("\n");
}
