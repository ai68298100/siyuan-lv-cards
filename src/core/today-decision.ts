/**
 * 今日主页行动优先级决策管线（纯逻辑，node 可单测）。
 * 依据真实学习者处境（是否中断、是否有坏卡、到期数、距上次天数、收件箱/维护债务），
 * 输出清晰的行动优先级与建议，彻底解决“中断后回来不知道先学还是先修”的问题。
 */

export interface TodayDecisionFacts {
    dueCount: number;
    unknownDue?: boolean;
    hasLiveSession?: boolean;
    sessionReviewedCount?: number;
    brokenCardsInDueCount?: number;
    daysGap?: number | null;
    inboxCount?: number;
    maintenanceDebtCount?: number;
    suspendedCount?: number;
}

export type TodayDecisionKind =
    | "blocked"
    | "resume"
    | "fix-broken"
    | "long-gap-start"
    | "normal-start"
    | "clear-inbox"
    | "clear-maintenance"
    | "all-done";

export interface TodayDecisionResult {
    kind: TodayDecisionKind;
    /** 决策主标题 */
    title: string;
    /** 决策副标题/说明 */
    summary: string;
    /** 状态标签 */
    tag: string;
    /** 主动作类型 */
    primaryAction: "start-review" | "continue-review" | "open-maintenance" | "open-inbox" | "open-library";
    /** 主动作按钮文案 */
    primaryActionLabel: string;
    /** 是否锁定主按钮（如状态未知时） */
    actionDisabled?: boolean;
    /** 建议的可用时间（分钟） */
    suggestedBudgetMinutes?: number;
    /** 辅助解释理由 */
    reason: string;
}

export function decideTodayAction(facts: TodayDecisionFacts, i18n?: any): TodayDecisionResult {
    const t = i18n?.dashboardDecision ?? {};

    // 1. 状态未知或读取阻断
    if (facts.unknownDue) {
        return {
            kind: "blocked",
            title: t.blockedTitle ?? "正在核对当前范围",
            summary: t.blockedSummary ?? "到期总数未知，请核对后再开始正式复习",
            tag: t.blockedTag ?? "待核对",
            primaryAction: "start-review",
            primaryActionLabel: t.startReview ?? "开始复习",
            actionDisabled: true,
            reason: t.blockedReason ?? "范围读取中或部分卡组失败，请先重试或缩小范围。",
        };
    }

    // 2. 有未完成的本场复习现场
    if (facts.hasLiveSession && (facts.sessionReviewedCount ?? 0) > 0) {
        const n = facts.sessionReviewedCount ?? 0;
        return {
            kind: "resume",
            title: (t.resumeTitle ?? "从第 ${n} 张继续").replace("${n}", String(n + 1)),
            summary: (t.resumeSummary ?? "已完成 ${n} 张 · 当前范围与本场偏好已保留").replace("${n}", String(n)),
            tag: t.resumeTag ?? "继续本场",
            primaryAction: "continue-review",
            primaryActionLabel: t.continueReview ?? "继续复习",
            reason: t.resumeReason ?? "已评分的卡片不会重复出现，现场和筛选已保留。",
        };
    }

    // 3. 今日复习队列中存在明确坏卡（建议先修卡）
    if (facts.dueCount > 0 && (facts.brokenCardsInDueCount ?? 0) > 0) {
        const count = facts.brokenCardsInDueCount ?? 0;
        return {
            kind: "fix-broken",
            title: t.fixBrokenTitle ?? "建议先修复题面有疑问的卡片",
            summary: (t.fixBrokenSummary ?? "今日到期中有 ${n} 张卡片存在结构问题，建议先修卡避免复习中断").replace("${n}", String(count)),
            tag: t.fixBrokenTag ?? "先修后学",
            primaryAction: "open-maintenance",
            primaryActionLabel: t.openMaintenanceAction ?? "前往修卡",
            reason: t.fixBrokenReason ?? "修复后的卡片会自动重新纳入复习，不会打乱进度。",
        };
    }

    // 4. 长期未复习返场（>=7 天未学习，温和启动）
    if (facts.dueCount > 0 && (facts.daysGap ?? 0) >= 7) {
        const gap = facts.daysGap ?? 7;
        return {
            kind: "long-gap-start",
            title: t.longGapTitle ?? "用 5 分钟，温习旧知识",
            summary: (t.longGapSummary ?? "距离上次复习已有 ${n} 天 · 建议先从小目标启动").replace("${n}", String(gap)),
            tag: t.longGapTag ?? "温和启动",
            primaryAction: "start-review",
            primaryActionLabel: t.startReview ?? "开始复习",
            suggestedBudgetMinutes: 5,
            reason: t.longGapReason ?? "不必一次学完全部到期，今天完成一个小目标就很棒。",
        };
    }

    // 5. 正常今日到期复习
    if (facts.dueCount > 0) {
        return {
            kind: "normal-start",
            title: t.normalStartTitle ?? "用 15 分钟，温习旧知识",
            summary: (t.normalStartSummary ?? "${n} 张待复习 · 当前卡组范围").replace("${n}", String(facts.dueCount)),
            tag: t.normalStartTag ?? "今日复习",
            primaryAction: "start-review",
            primaryActionLabel: t.startReview ?? "开始复习",
            suggestedBudgetMinutes: 15,
            reason: t.normalStartReason ?? "正式评分由你选择，时间到不会自动提交。",
        };
    }

    // 6. 今日到期已完成，但有收件箱材料等待整理
    if (facts.dueCount === 0 && (facts.inboxCount ?? 0) > 0) {
        const count = facts.inboxCount ?? 0;
        return {
            kind: "clear-inbox",
            title: t.clearInboxTitle ?? "今日复习已完成，顺便整理材料",
            summary: (t.clearInboxSummary ?? "收件箱还有 ${n} 项材料等待整理，选入制卡或暂存").replace("${n}", String(count)),
            tag: t.clearInboxTag ?? "整理材料",
            primaryAction: "open-inbox",
            primaryActionLabel: t.openInboxAction ?? "打开收件箱",
            reason: t.clearInboxReason ?? "及时清理收件箱，把零碎笔记变成长期好卡。",
        };
    }

    // 7. 今日到期已完成，但有维护债务
    if (facts.dueCount === 0 && ((facts.maintenanceDebtCount ?? 0) > 0 || (facts.suspendedCount ?? 0) > 0)) {
        const debt = (facts.maintenanceDebtCount ?? 0) + (facts.suspendedCount ?? 0);
        return {
            kind: "clear-maintenance",
            title: t.clearMaintTitle ?? "今日复习已完成，查看维护债务",
            summary: (t.clearMaintSummary ?? "有 ${n} 项维护债务或暂缓卡片，可顺手审阅或恢复").replace("${n}", String(debt)),
            tag: t.clearMaintTag ?? "维护健康",
            primaryAction: "open-maintenance",
            primaryActionLabel: t.openMaintenanceAction ?? "打开维护页",
            reason: t.clearMaintReason ?? "定期审阅来源健康，让卡片能够长期可用。",
        };
    }

    // 8. 全部清爽完成
    return {
        kind: "all-done",
        title: t.allDoneTitle ?? "给记忆一点呼吸，今天已全部完成",
        summary: t.allDoneSummary ?? "没有到期卡片 · 不要求额外学习",
        tag: t.allDoneTag ?? "今日已完成",
        primaryAction: "open-library",
        primaryActionLabel: t.openLibraryAction ?? "整理卡片库",
        reason: t.allDoneReason ?? "休息也是学习节奏的一部分，明天再继续。",
    };
}
