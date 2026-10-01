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
