/**
 * BI-27 返场原因分流（纯逻辑，node 可单测）。
 * 返场时区分时间不足/目标改变/内容过时/数据故障/压力/单纯离开六类原因——
 * 验收硬性要求：每类给出**不同**的应对方案（绝不统一补齐逾期），且任何方案的
 * duePolicy 恒为 keep（due 事实保留在内核 riff，ADR-3）；分流记录追加留痕（历史保留）。
 * 与 BI-8 收工原因分工：收工原因记录「为什么离开」，本模块决定「回来怎么办」。
 */

export const RETURN_REASONS = ["time-short", "goal-changed", "content-stale", "data-failure", "pressure", "plain-leave"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export interface TriageFacts {
    dueCount: number;
    /** 距上次学习天数（无历史=null） */
    daysGap: number | null;
    /** BI-20 过时材料数 */
    staleCount: number;
}

export interface TriagePlan {
    reason: ReturnReason;
    /** 方案步骤（有序 i18n 键，returnTriage.step.<key>） */
    steps: string[];
    /** 恒 keep：任何分流方案都不补齐/清空逾期（验收硬性要求） */
    duePolicy: "keep";
    /** 建议本次作答上限（张）；0=建议只读不评分；null=不设限 */
    suggestedCap: number | null;
    /** 展示说明 i18n 键（returnTriage.plan.<reason>） */
    planKey: string;
}

const SMALL_CAP = 10;

/** 分流：每类原因对应不同方案——六类六样，不统一补齐逾期 */
export function triageReturn(reason: ReturnReason, f: TriageFacts): TriagePlan {
    switch (reason) {
        case "time-short":
            // 时间不足：预算模式+只做小批量，剩余留队列（不强补）
            return { reason, duePolicy: "keep", suggestedCap: Math.min(SMALL_CAP, f.dueCount), planKey: "returnTriage.plan.time-short", steps: ["budget", "high-priority"] };
        case "goal-changed":
            // 目标改变：先重审完成标准与优先级（BI-16/BI-11），不动队列
            return { reason, duePolicy: "keep", suggestedCap: null, planKey: "returnTriage.plan.goal-changed", steps: ["review-criteria", "re-prioritize"] };
        case "content-stale":
            // 内容过时：先跑来源健康（BI-20）与修订清单，修订优先于复习
            return { reason, duePolicy: "keep", suggestedCap: f.staleCount > 0 ? null : SMALL_CAP, planKey: "returnTriage.plan.content-stale", steps: ["source-health", "revision-first"] };
        case "data-failure":
            // 数据故障：先诊断对账（导出/体检），保守小批量验证数据完好
            return { reason, duePolicy: "keep", suggestedCap: 5, planKey: "returnTriage.plan.data-failure", steps: ["diagnostics", "verify-then-review"] };
        case "pressure":
            // 压力：只读浏览（不评分）或休息，零负担
            return { reason, duePolicy: "keep", suggestedCap: 0, planKey: "returnTriage.plan.pressure", steps: ["browse-only", "rest"] };
        case "plain-leave":
        default:
            // 单纯离开：正常继续，标准复习
            return { reason, duePolicy: "keep", suggestedCap: null, planKey: "returnTriage.plan.plain-leave", steps: ["normal-review"] };
    }
}

/** 分流记录（追加留痕，验收「历史保留」）；最新在后，截 30 条 */
export interface TriageRecord {
    at: number;
    reason: ReturnReason;
    /** 当时的关键事实快照（不含材料内容） */
    dueCount: number;
    steps: string[];
}

export function recordTriage(history: TriageRecord[], reason: ReturnReason, f: TriageFacts, now: number = Date.now()): TriageRecord[] {
    const plan = triageReturn(reason, f);
    const next = [...history, { at: now, reason, dueCount: f.dueCount, steps: plan.steps }];
    return next.slice(-30);
}
