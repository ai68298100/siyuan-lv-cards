/**
 * 状态角标与周期提醒决策引擎（Badge & Reminder Engine）
 * 集中管理静音时段计算（跨午夜支持）、积压预警、每日到期提醒判定、考试里程碑与角标数据组装。
 */

import { daysLeft, type ExamPlan } from "./exam";

/**
 * 判断当前时刻是否处于免打扰时段（支持跨午夜，如 22:00 ~ 08:00）
 */
export function isWithinQuietHours(
    quietStart: string,
    quietEnd: string,
    now: Date = new Date(),
): boolean {
    const toMin = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return Number.isFinite(h) ? h * 60 + (m || 0) : null;
    };
    const start = toMin(quietStart);
    const end = toMin(quietEnd);
    if (start === null || end === null || start === end) {
        return false;
    }
    const cur = now.getHours() * 60 + now.getMinutes();
    return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
}

export interface BacklogDecision {
    shouldWarn: boolean;
    days: number;
}

/**
 * 积压预警判定（连续 N>=3 天未复习时提醒一次）
 */
export function decideBacklogWarning(params: {
    reminderEnabled: boolean;
    lastDue: number;
    inQuiet: boolean;
    lastRevlogTs: number;
    today: string;
    alreadyWarnedToday: boolean;
    nowTs?: number;
}): BacklogDecision {
    const { reminderEnabled, lastDue, inQuiet, lastRevlogTs, alreadyWarnedToday, nowTs = Date.now() } = params;
    if (!reminderEnabled || lastDue <= 0 || inQuiet || alreadyWarnedToday) {
        return { shouldWarn: false, days: 0 };
    }
    const days = Math.floor((nowTs - lastRevlogTs) / 86400000);
    if (days >= 3) {
        return { shouldWarn: true, days };
    }
    return { shouldWarn: false, days };
}

export interface ExamMilestoneDecision {
    shouldNotify: boolean;
    plan?: ExamPlan;
    daysLeft?: number;
    key?: string;
}

/**
 * 考试里程碑提醒判定（考前 30/7/1 天，同日同计划去重）
 */
export function decideExamMilestoneReminder(params: {
    examEnabled: boolean;
    reminderEnabled: boolean;
    inQuiet: boolean;
    plans: ExamPlan[];
    today: string;
    lastNotifiedKey: string;
}): ExamMilestoneDecision {
    const { examEnabled, reminderEnabled, inQuiet, plans, today, lastNotifiedKey } = params;
    if (!examEnabled || !reminderEnabled || inQuiet) {
        return { shouldNotify: false };
    }
    const plan = plans.find(p => p.enabled && p.examDate && !p.archived);
    if (!plan || !plan.examDate) {
        return { shouldNotify: false };
    }
    const left = daysLeft(plan.examDate);
    if (left === null || ![30, 7, 1].includes(left)) {
        return { shouldNotify: false };
    }
    const key = `${plan.id}:${left}:${today}`;
    if (lastNotifiedKey === key) {
        return { shouldNotify: false };
    }
    return { shouldNotify: true, plan, daysLeft: left, key };
}

/**
 * 每日到期提醒时刻判定
 */
export function shouldTriggerDailyReminder(params: {
    reminderEnabled: boolean;
    reminderTime: string;
    alreadyShownToday: boolean;
    now?: Date;
}): boolean {
    const { reminderEnabled, reminderTime, alreadyShownToday, now = new Date() } = params;
    if (!reminderEnabled || alreadyShownToday) {
        return false;
    }
    const [h, m] = reminderTime.split(":").map(Number);
    if (!Number.isFinite(h)) {
        return false;
    }
    const targetMin = h * 60 + (m || 0);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return nowMin >= targetMin;
}

export interface BadgeDescriptor {
    visible: boolean;
    text: string;
    title: string;
    isDone: boolean;
    isExam: boolean;
    milestoneDays?: number;
}

/**
 * 计算顶栏角标展示数据（纯计算）
 */
export function computeBadgeDescriptor(params: {
    reviewEnabled: boolean;
    count: number;
    activeExamPlan?: ExamPlan | null;
    dailyReviewTarget: number;
    doneToday: number;
    i18n: Record<string, any>;
}): BadgeDescriptor {
    const { reviewEnabled, count, activeExamPlan, dailyReviewTarget, doneToday, i18n } = params;
    if (!reviewEnabled) {
        return { visible: false, text: "", title: "", isDone: false, isExam: false };
    }

    // 优先显示活动考试计划倒计时
    if (activeExamPlan && activeExamPlan.examDate) {
        const left = daysLeft(activeExamPlan.examDate);
        if (left !== null && left >= 0) {
            const daysLeftText = (i18n.exam?.daysLeft ?? "${n} 天").replace("${n}", String(left));
            const milestone = [30, 7, 1].includes(left) ? left : undefined;
            return {
                visible: true,
                text: left > 99 ? "99+" : String(left),
                title: `${activeExamPlan.name} · ${daysLeftText}`,
                isDone: false,
                isExam: true,
                milestoneDays: milestone,
            };
        }
    }

    if (count <= 0) {
        return { visible: false, text: "", title: "", isDone: false, isExam: false };
    }

    const isDone = dailyReviewTarget > 0 && doneToday >= dailyReviewTarget;
    return {
        visible: true,
        text: count > 99 ? "99+" : String(count),
        title: (i18n.badgeDue ?? "${n} 张待复习").replace("${n}", String(count)),
        isDone,
        isExam: false,
    };
}
