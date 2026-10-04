/**
 * BI-15 目标进度叙事（纯逻辑，node 可单测）。
 * 用「材料已筛选/已入库/已应用/待维护」四阶段描述目标进展——
 * 验收硬性要求：不把卡数直接显示为掌握百分比（阶段计数是描述，不是评分）。
 * 输入=BI-5 内容生命周期按状态计数（lifecycleStats），输出=旅程顺序的非零阶段。
 */

import type { ContentState } from "./content-lifecycle";

/** 旅程四阶段（与 BI-5 十态的归组；顺序=学习旅程方向） */
export const NARRATIVE_STAGES = ["filtered", "stocked", "applied", "maintain"] as const;
export type NarrativeStage = (typeof NARRATIVE_STAGES)[number];

/** 阶段 → 归入的内容状态（已归档计入待维护：退出活跃不等于消失） */
const STAGE_STATES: Record<NarrativeStage, readonly ContentState[]> = {
    filtered: ["source", "candidate", "reviewed"],
    stocked: ["stocked", "inReview"],
    applied: ["applied"],
    maintain: ["needsRevision", "paused", "stale", "archived"],
};

/** 展示 i18n 键（goalNarrative.<stage>） */
export function stageLabelKey(stage: NarrativeStage): string {
    return `goalNarrative.${stage}`;
}

/**
 * 目标进展叙事：按旅程顺序给出非零阶段计数。
 * 全部为零（未开档/无材料）返回空数组——调用方显示「尚无进展记录」而非虚构 0%。
 */
export function narrateGoalProgress(stats: Partial<Record<ContentState, number>>): { stage: NarrativeStage; count: number }[] {
    const out: { stage: NarrativeStage; count: number }[] = [];
    for (const stage of NARRATIVE_STAGES) {
        const count = (STAGE_STATES[stage] as readonly string[]).reduce((sum, s) => sum + (stats[s] ?? 0), 0);
        if (count > 0) out.push({ stage, count });
    }
    return out;
}
