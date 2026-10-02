/**
 * 考试计划（M7，docs/11）：riff 路径可用的倒排学习。
 * 范围粒度与复习面板一致（all/deck/notebook），进度指标只用可证实数据（到期数/卡组规模）。
 */
import { localDate } from "./revlog";

export type ExamScopeKind = "all" | "deck" | "notebook";

export interface ExamPlan {
    id: string;
    name: string;
    /** YYYY-MM-DD */
    examDate: string;
    scopeKind: ExamScopeKind;
    /** 空串 = 全部 */
    scopeId: string;
    scopeName: string;
    /** 考前 cram 天数（进入 cram 的提前量） */
    cramDays: number;
    /** 范围总卡量（可选手填；deck 范围可自动取 size） */
    totalCards?: number;
    enabled: boolean;
    /** 已归档（考后收起） */
    archived?: boolean;
    createdAt: number;
}

export interface ExamPlansData {
    version: 1;
    plans: ExamPlan[];
}

export function emptyExamPlans(): ExamPlansData {
    return { version: 1, plans: [] };
}

export function normalizeExamPlans(raw: unknown): ExamPlansData {
    const data = raw && typeof raw === "object" ? (raw as Partial<ExamPlansData>) : null;
    const plans = Array.isArray(data?.plans) ? data!.plans! : [];
    return {
        version: 1,
        plans: plans
            .filter(p => p && typeof p.id === "string" && typeof p.examDate === "string")
            .map(p => ({
                id: p.id,
                name: String(p.name ?? ""),
                examDate: p.examDate,
                scopeKind: (p.scopeKind === "deck" || p.scopeKind === "notebook" ? p.scopeKind : "all") as ExamScopeKind,
                scopeId: String(p.scopeId ?? ""),
                scopeName: String(p.scopeName ?? ""),
                cramDays: Math.max(0, Number(p.cramDays) || 7),
                totalCards: Number(p.totalCards) > 0 ? Number(p.totalCards) : undefined,
                enabled: p.enabled !== false,
                createdAt: Number(p.createdAt) || Date.now(),
            })),
    };
}

export function genPlanId(): string {
    return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 距考试剩余天数（含今天，考试日=1 剩？定义：考试日当天为 0 天后） */
export function daysLeft(examDate: string): number | null {
    const [y, m, d] = examDate.split("-").map(Number);
    if (!y || !m || !d) {
        return null;
    }
    const exam = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((exam.getTime() - today.getTime()) / 86400000);
}

export function isCramActive(plan: ExamPlan): boolean {
    const left = daysLeft(plan.examDate);
    return left !== null && left >= 0 && left <= plan.cramDays;
}

/** 每日建议学习量：ceil(范围总卡量 / 剩余天数)，数据不足返回 null */
export function dailyTarget(plan: ExamPlan, scopeSize?: number): number | null {
    const left = daysLeft(plan.examDate);
    if (left === null || left < 0) {
        return null;
    }
    const total = plan.totalCards ?? (plan.scopeKind === "deck" ? scopeSize : undefined);
    if (!total || total <= 0) {
        return null;
    }
    return Math.max(1, Math.ceil(total / Math.max(1, left)));
}

export function todayKey(): string {
    return localDate(Date.now());
}

// ---- 考试计划动态重算建议（AQ-8，现版建议层：只读展示，不改内核 due）----

export interface DynamicPlanAdvice {
    /** 今日建议学习量（基础日均 + 落后补偿）；无法核算时 null */
    todayTarget: number | null;
    /** 基础日均 = 剩余量 / 剩余天数（向上取整） */
    baseDaily: number;
    /** 按日均应完成而未完成的量（落后补偿部分，≥0） */
    behind: number;
    /** 本地已观察的范围内有效评分次数（证据窗口=计划创建以来） */
    observed: number;
    /** true = 容量未知（未填总卡量且非 deck 范围），建议按未知历史口径展示 */
    capacityUnknown: boolean;
    /** 不可行原因：expired=考试已过；over-capacity=按每日上限剩余天数不够；null=可行 */
    infeasible: null | "expired" | "over-capacity";
    /** 按当前每日上限需要的最少天数（over-capacity 时展示） */
    daysNeededAtCap: number | null;
}

/**
 * 动态倒排建议（AQ-8）：
 * - 学习日 = 距考试剩余天数（含今天）；容量 = 用户手填 totalCards 或 deck 实时规模；
 * - 落后补偿 = 已过天数 × 基础日均 − 本地已观察；今日建议 = 基础日均 + 补偿；
 * - 卡量变化（deck size 更新）与数据变化（本地记录增长）都即时反映在下一次计算；
 * - 只读建议：预览/取消不写任何 due，正式调度只走内核。
 */
export function dynamicPlanAdvice(
    plan: ExamPlan,
    opts: {
        now?: number;
        /** 范围容量：deck 实时规模或手填总卡量；未知传 undefined */
        capacity?: number;
        /** 本地已观察的范围内有效评分次数（examReportStats(...).reviews） */
        observed: number;
        /** 每日复习上限（设置），用于不可行判定 */
        dailyCap: number;
    },
): DynamicPlanAdvice {
    const now = opts.now ?? Date.now();
    const observed = Math.max(0, Math.round(opts.observed));
    // 剩余天数按注入时钟计算（与 now 同一口径，考试日当天=0）
    const [y, m, d] = plan.examDate.split("-").map(Number);
    if (!y || !m || !d) {
        return { todayTarget: null, baseDaily: 0, behind: 0, observed, capacityUnknown: true, infeasible: null, daysNeededAtCap: null };
    }
    const examDay = new Date(y, m - 1, d).getTime();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const left = Math.round((examDay - today.getTime()) / 86400000);
    if (left < 0) {
        return { todayTarget: null, baseDaily: 0, behind: 0, observed, capacityUnknown: false, infeasible: "expired", daysNeededAtCap: null };
    }
    const capacityRaw = opts.capacity ?? plan.totalCards;
    const capacity = capacityRaw && capacityRaw > 0 ? Math.round(capacityRaw) : null;
    const elapsedDays = Math.max(0, Math.floor((now - plan.createdAt) / 86400000));
    if (capacity === null) {
        // 容量未知：不推算 FSRS/全量，只给日均参考（剩余天数直接摊 0）——明确按未知历史展示
        return { todayTarget: null, baseDaily: 0, behind: 0, observed, capacityUnknown: true, infeasible: null, daysNeededAtCap: null };
    }
    const remaining = Math.max(0, capacity - observed);
    const studyDays = Math.max(1, left);
    const baseDaily = Math.ceil(remaining / studyDays);
    // 应完成基线 = 已过天数 × 日均（含今天之前）；落后 = 基线 − 已观察
    const expectedByNow = Math.min(remaining, baseDaily * Math.min(elapsedDays, studyDays));
    const behind = Math.max(0, Math.round(expectedByNow - observed));
    const todayTarget = Math.min(remaining, baseDaily + behind);
    const cap = opts.dailyCap > 0 ? Math.floor(opts.dailyCap) : null;
    let infeasible: DynamicPlanAdvice["infeasible"] = null;
    let daysNeededAtCap: number | null = null;
    if (cap !== null && remaining > cap * studyDays) {
        infeasible = "over-capacity";
        daysNeededAtCap = Math.ceil(remaining / cap);
    }
    return { todayTarget, baseDaily, behind, observed, capacityUnknown: false, infeasible, daysNeededAtCap };
}

// ---- 考后复盘统计（AR-11）----

export interface ExamReportStats {
    /** 窗口起点 = 计划创建时刻（固定规则，不再用 min(created, exam-90d) 扩大） */
    windowFrom: number;
    windowTo: number;
    reviews: number;
    forgets: number;
    activeDays: number;
    /** 窗口内命中时间但无法归属范围的记录（如原生事件缺 deckID）——单独计数，不冒充 0 */
    unattributed: number;
    /** 窗口内是否出现过任何本地记录（false 时报告须声明“无可核算数据”而非全 0） */
    hasData: boolean;
}

/**
 * 计划窗口内的范围化统计（AR-11）：
 * - 时间窗：[plan.createdAt, min(now, 考试日 23:59:59)]；
 * - 范围：deck 按 deckID 精确归属；notebook/all 由调用方注入 inScope（blockID 归属需查内核）；
 * - 归属不到的记录进 unattributed，缺失历史不宣称 0。
 */
export function examReportStats(
    plan: ExamPlan,
    entries: { ts: number; rating: number; deckID?: string; blockID?: string }[],
    opts: { now?: number; inScope?: (e: { deckID?: string; blockID?: string }) => boolean } = {},
): ExamReportStats {
    const now = opts.now ?? Date.now();
    const examTs = new Date(plan.examDate + "T23:59:59").getTime();
    const windowFrom = plan.createdAt;
    const windowTo = Math.min(now, Number.isFinite(examTs) ? examTs : now);
    const inWindow = entries.filter(e => e.ts >= windowFrom && e.ts <= windowTo && e.rating > 0);
    // deck 范围的归属规则是确定的（deckID 精确匹配），无需调用方注入；notebook/all 由调用方传入
    const inScope = opts.inScope ?? (plan.scopeKind === "deck"
        ? (e: { deckID?: string }) => e.deckID === plan.scopeId
        : undefined);
    let reviews = 0;
    let forgets = 0;
    let unattributed = 0;
    const days = new Set<string>();
    for (const e of inWindow) {
        // deck 范围：缺 deckID（原生评分常见）无法归属——单独计数，不冒认也不冒充 0
        if (plan.scopeKind === "deck" && !e.deckID) {
            unattributed += 1;
            continue;
        }
        if (inScope && !inScope(e)) {
            continue;
        }
        reviews += 1;
        if (e.rating === 1) {
            forgets += 1;
        }
        days.add(localDate(e.ts));
    }
    return {
        windowFrom,
        windowTo,
        reviews,
        forgets,
        activeDays: days.size,
        unattributed,
        hasData: inWindow.length > 0,
    };
}
