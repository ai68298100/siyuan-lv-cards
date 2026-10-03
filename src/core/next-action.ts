/**
 * BI-6 每一步的下一动作建议（纯逻辑，node 可单测）。
 * 按 BI-5 内容状态推导建议动作（回来源/解释/制卡/练习/正式复习/修订/收工），
 * 建议可跳过、不自动执行写入（验收硬性要求）。
 * 输入只依赖内容状态与少量计数，不读内核、不产生副作用。
 */

import type { ContentState } from "./content-lifecycle";

export const NEXT_ACTIONS = [
    "openSource",   // 回来源：打开材料原文
    "explain",      // 解释：AI/手册补一段理解
    "makeCards",    // 制卡：从材料产出卡片
    "practice",     // 练习：练习模式巩固
    "formalReview", // 正式复习：进调度队列
    "revise",       // 修订：改内容/改卡
    "wrapUp",       // 收工：保存现场结束会话
] as const;
export type NextAction = (typeof NEXT_ACTIONS)[number];

export interface NextActionHint {
    action: NextAction;
    /** 展示 i18n 键（action.action 形式） */
    labelKey: string;
}

/** 每个内容状态的有序建议（首位=主建议，其余=次选） */
const STATE_SUGGESTIONS: Record<ContentState, readonly NextAction[]> = {
    source: ["explain", "makeCards", "wrapUp"],
    candidate: ["explain", "makeCards", "wrapUp"],
    reviewed: ["makeCards", "explain", "wrapUp"],
    stocked: ["formalReview", "practice", "wrapUp"],
    inReview: ["formalReview", "practice", "wrapUp"],
    applied: ["practice", "wrapUp"],
    needsRevision: ["revise", "openSource", "wrapUp"],
    paused: ["formalReview", "openSource", "wrapUp"],
    stale: ["openSource", "revise", "wrapUp"],
    archived: ["openSource", "wrapUp"],
};

/**
 * 推导下一动作建议。
 * - 主建议永远排首位；建议可为空数组的调用方兜底（当前实现全状态非空）；
 * - reviewedCount>0 且状态已入库后，练习位次提升由调用方用返回顺序自行呈现。
 */
export function nextActions(state: ContentState): NextActionHint[] {
    return (STATE_SUGGESTIONS[state] ?? ["wrapUp"]).map(action => ({
        action,
        labelKey: `nextAction.${action}`,
    }));
}

/** 主建议（首项），异常状态兜底收工 */
export function primaryAction(state: ContentState): NextAction {
    return STATE_SUGGESTIONS[state]?.[0] ?? "wrapUp";
}
