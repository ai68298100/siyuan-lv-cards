/**
 * BU-14 人工审阅策略与批量阈值（纯逻辑，node 可单测）。
 * 按任务风险、模型可信度（BU-18 登记状态）、来源可信度（BW-9 未命中）和质量分（BU-13 批量统计）
 * 决定三种审阅强度：逐卡审阅 / 抽样审阅 / 全部阻断。
 * 验收硬性要求：未审（未接受）卡**永不进入正式复习队列**——unreviewedNeverCommits 恒真，
 * canCommit 只认 accepted（edited 必须重新接受）；阻断=0 张可提交，不静默放行。
 * 高风险任务直接阻断（换低风险任务或人工路径），deny 命中的来源在 eligibility 已硬阻断（不进本函数）。
 */

export const REVIEW_DECISIONS = ["per-card", "sample", "block"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface ReviewFactors {
    taskRisk: "low" | "medium" | "high";
    /** 模型可信度：BU-18 登记 active=known；未登记/deprecated=unknown */
    modelTrust: "known" | "unknown";
    /** 来源可信度：用户显式载入=trusted；剪贴板/外部粘贴=unverified */
    sourceTrust: "trusted" | "unverified";
    /** BU-13 批量统计：平均综合分（0-100，缺省=未评分不判） */
    avgComposite?: number;
    /** 问题卡占比（综合分 <70 的比例 0-1；缺省不判） */
    problemRatio?: number;
    /** 批量张数（抽样量计算用） */
    totalCards: number;
}

export interface ReviewPlan {
    decision: ReviewDecision;
    /** decision=sample 时的建议抽审张数 */
    sampleSize?: number;
    /** 决策说明 i18n 键（aiReview.decision.<decision>） */
    reasonKey: string;
    /** 触发因子（可解释性：哪些因子把强度推到当前档） */
    factors: string[];
    /** 恒 true——未审卡不入正式队列（验收断言点） */
    unreviewedNeverCommits: true;
}

export type ReviewCardState = "pending" | "accepted" | "rejected" | "deferred";

/** 审阅状态是否可提交（只有显式接受可入库；编辑后必须重新接受） */
export function canCommit(state: ReviewCardState): boolean {
    return state === "accepted";
}

const SAMPLE_MIN = 3;
const SAMPLE_MAX = 10;
const SAMPLE_RATIO = 0.2;
const COMPOSITE_FLOOR = 70;
const PROBLEM_RATIO_CAP = 0.3;

/** 审阅计划：强度就高不就低——任一因子触发即升级，风险叠加只升不降 */
export function planReview(f: ReviewFactors): ReviewPlan {
    if (f.taskRisk === "high") {
        return { decision: "block", reasonKey: "aiReview.decision.block", factors: ["taskRisk:high"], unreviewedNeverCommits: true };
    }
    const factors: string[] = [];
    if (f.modelTrust === "unknown") {
        factors.push("modelTrust:unknown");
    }
    if (f.sourceTrust === "unverified") {
        factors.push("sourceTrust:unverified");
    }
    if (typeof f.avgComposite === "number" && f.avgComposite < COMPOSITE_FLOOR) {
        factors.push("avgComposite:low");
    }
    if (typeof f.problemRatio === "number" && f.problemRatio > PROBLEM_RATIO_CAP) {
        factors.push("problemRatio:high");
    }
    if (factors.length > 0) {
        return { decision: "per-card", reasonKey: "aiReview.decision.per-card", factors, unreviewedNeverCommits: true };
    }
    if (f.taskRisk === "medium") {
        // 中风险：即使各因子干净也全量逐卡（高风险任务面）
        return { decision: "per-card", reasonKey: "aiReview.decision.per-card", factors: ["taskRisk:medium"], unreviewedNeverCommits: true };
    }
    const sampleSize = Math.min(SAMPLE_MAX, Math.max(SAMPLE_MIN, Math.ceil(f.totalCards * SAMPLE_RATIO)));
    return { decision: "sample", sampleSize, reasonKey: "aiReview.decision.sample", factors: [], unreviewedNeverCommits: true };
}

/** 抽样命中：前 sampleSize 张逐审，其余仍需至少扫描（返回每卡是否属于建议抽审集） */
export function sampleIndices(total: number, sampleSize: number): number[] {
    const n = Math.max(0, Math.min(sampleSize, total));
    return Array.from({ length: n }, (_, i) => i);
}
