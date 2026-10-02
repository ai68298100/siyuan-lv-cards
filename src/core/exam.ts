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
