/**
 * BI-2 目的驱动会话入口（纯逻辑，node 可单测）。
 * 会话开始时选择目的（探索/构建/复习/练习/应用/维护），不同目的有不同的
 * 结束条件与评分口径：formal=计入正式复习统计与每日目标；informal=练习性质
 * 不占每日目标（调度仍由内核 riff 独占，ADR-3，本模块只定义口径与进度）。
 * 与 session-summary（BI-8）分工：本模块定义「为什么学/何时收」，BI-8 定义「怎么收」。
 */

export const SESSION_PURPOSES = ["explore", "build", "review", "practice", "apply", "maintain"] as const;
export type SessionPurpose = (typeof SESSION_PURPOSES)[number];

/** 进度取值来源：目的不同，看不同的计数器 */
export type PurposeMetric =
    | "inboxProcessed"    // 探索：材料筛完
    | "newCards"          // 构建：新卡入库
    | "dueRemaining"      // 复习：队列清空
    | "practiceAttempts"  // 练习：练够 M 题
    | "appliedCount"      // 应用：完成 X 次应用
    | "maintainedCount";  // 维护：修订清单清掉 N 张

export interface PurposeProfile {
    purpose: SessionPurpose;
    /** 展示名 i18n 键 */
    nameKey: string;
    /** 结束条件说明 i18n 键 */
    endLabelKey: string;
    metric: PurposeMetric;
    /** 默认目标量；dueRemaining 型为「开始时到期数」，0=未提供时无量化目标 */
    defaultTarget: number;
    /** 评分口径：formal=计入正式复习统计与每日目标；informal=不占每日目标 */
    grading: "formal" | "informal";
}

export const PURPOSE_PROFILES: Record<SessionPurpose, PurposeProfile> = {
    explore: { purpose: "explore", nameKey: "purpose.explore.name", endLabelKey: "purpose.explore.end", metric: "inboxProcessed", defaultTarget: 10, grading: "informal" },
    build: { purpose: "build", nameKey: "purpose.build.name", endLabelKey: "purpose.build.end", metric: "newCards", defaultTarget: 10, grading: "informal" },
    review: { purpose: "review", nameKey: "purpose.review.name", endLabelKey: "purpose.review.end", metric: "dueRemaining", defaultTarget: 0, grading: "formal" },
    practice: { purpose: "practice", nameKey: "purpose.practice.name", endLabelKey: "purpose.practice.end", metric: "practiceAttempts", defaultTarget: 20, grading: "informal" },
    apply: { purpose: "apply", nameKey: "purpose.apply.name", endLabelKey: "purpose.apply.end", metric: "appliedCount", defaultTarget: 5, grading: "informal" },
    maintain: { purpose: "maintain", nameKey: "purpose.maintain.name", endLabelKey: "purpose.maintain.end", metric: "maintainedCount", defaultTarget: 5, grading: "formal" },
};

export function isSessionPurpose(v: unknown): v is SessionPurpose {
    return typeof v === "string" && (SESSION_PURPOSES as readonly string[]).includes(v);
}

/** 白名单归一：非法值回 null（由调用方决定默认目的） */
export function normalizePurpose(raw: unknown): SessionPurpose | null {
    return isSessionPurpose(raw) ? raw : null;
}

/** 目的进度计数器快照（各入口按现成状态填充，缺省 0） */
export interface PurposeCounters {
    inboxProcessed: number;
    newCards: number;
    reviewed: number;
    practiceAttempts: number;
    appliedCount: number;
    maintainedCount: number;
    /** 剩余到期数（复习目的的进度=开始到期数-剩余） */
    dueRemaining: number;
}

export function emptyCounters(): PurposeCounters {
    return { inboxProcessed: 0, newCards: 0, reviewed: 0, practiceAttempts: 0, appliedCount: 0, maintainedCount: 0, dueRemaining: 0 };
}

export interface PurposeProgress {
    current: number;
    target: number;
    /** 0-100；无量化目标（target=0）时恒 0 */
    pct: number;
    /** 是否已达结束条件 */
    done: boolean;
}

/**
 * 计算目的进度。
 * - review 型：target=会话开始时到期数（targetOverride），done=队列清空或评分达 target；
 * - 其余型：target=用户覆盖或 profile.defaultTarget，current=对应计数器；
 * - target<=0（无量化目标）：done=false，由队列空/用户退出收工（BI-8 endReason）。
 */
export function purposeProgress(
    purpose: SessionPurpose,
    counters: PurposeCounters,
    targetOverride?: number,
): PurposeProgress {
    const profile = PURPOSE_PROFILES[purpose];
    const target = targetOverride !== undefined && Number.isFinite(targetOverride) && targetOverride > 0
        ? Math.floor(targetOverride)
        : profile.defaultTarget;
    const current = currentOf(profile.metric, counters);
    if (target <= 0) {
        return { current, target: 0, pct: 0, done: false };
    }
    const remainingBased = profile.metric === "dueRemaining";
    const progress = remainingBased ? Math.max(0, target - counters.dueRemaining) : current;
    const done = remainingBased ? counters.dueRemaining <= 0 || progress >= target : progress >= target;
    return { current: progress, target, pct: Math.min(100, Math.round((progress / target) * 100)), done };
}

function currentOf(metric: PurposeMetric, c: PurposeCounters): number {
    switch (metric) {
        case "inboxProcessed": return c.inboxProcessed;
        case "newCards": return c.newCards;
        case "dueRemaining": return Math.max(0, c.reviewed);
        case "practiceAttempts": return c.practiceAttempts;
        case "appliedCount": return c.appliedCount;
        case "maintainedCount": return c.maintainedCount;
    }
}
