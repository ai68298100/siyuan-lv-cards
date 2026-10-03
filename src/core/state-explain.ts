/**
 * BI-7 用户可见的状态转移解释（纯逻辑，node 可单测）。
 * 把「为什么现在是候选 / 为什么不可复习 / 来源失效 / 为什么需修订」翻译成
 * 用户可读的解释 + 直达修复动作（验收硬性要求：能直达修复、不裸露内部枚举）。
 * 输入只依赖内容状态（BI-5）与少量上下文，不读内核。
 */

import type { ContentState } from "./content-lifecycle";

export interface StateExplanation {
    /** 解释文案 i18n 键（stateWhy.<key>） */
    whyKey: string;
    /** 直达修复动作（BI-6 NextAction 子集 + 恢复类动作）；无修复为 null */
    repair: string | null;
    /** 修复动作展示 i18n 键 */
    repairLabelKey: string | null;
}

/** 每个状态的「为什么 + 修复」 */
const EXPLANATIONS: Record<ContentState, StateExplanation> = {
    source: { whyKey: "stateWhy.source", repair: "makeCards", repairLabelKey: "nextAction.makeCards" },
    candidate: { whyKey: "stateWhy.candidate", repair: "makeCards", repairLabelKey: "nextAction.makeCards" },
    reviewed: { whyKey: "stateWhy.reviewed", repair: "makeCards", repairLabelKey: "nextAction.makeCards" },
    stocked: { whyKey: "stateWhy.stocked", repair: "formalReview", repairLabelKey: "nextAction.formalReview" },
    inReview: { whyKey: "stateWhy.inReview", repair: "practice", repairLabelKey: "nextAction.practice" },
    applied: { whyKey: "stateWhy.applied", repair: "practice", repairLabelKey: "nextAction.practice" },
    needsRevision: { whyKey: "stateWhy.needsRevision", repair: "revise", repairLabelKey: "nextAction.revise" },
    paused: { whyKey: "stateWhy.paused", repair: "resume", repairLabelKey: "stateWhy.repairResume" },
    stale: { whyKey: "stateWhy.stale", repair: "openSource", repairLabelKey: "nextAction.openSource" },
    archived: { whyKey: "stateWhy.archived", repair: "unarchive", repairLabelKey: "stateWhy.repairUnarchive" },
};

export function explainState(state: ContentState): StateExplanation {
    return EXPLANATIONS[state];
}

/**
 * 「为什么不可复习」专项：内容侧视角判断卡/材料当前为什么进不了正式复习队列。
 * 调度侧（真到期与否）属内核 riff（ADR-3），本函数只答内容侧原因。
 */
export function whyNotReviewable(state: ContentState): StateExplanation {
    switch (state) {
        case "source":
        case "candidate":
            return { whyKey: "stateWhy.notReviewedYet", repair: "makeCards", repairLabelKey: "nextAction.makeCards" };
        case "reviewed":
            return { whyKey: "stateWhy.notStockedYet", repair: "makeCards", repairLabelKey: "nextAction.makeCards" };
        case "stocked":
            return { whyKey: "stateWhy.notInReviewYet", repair: "formalReview", repairLabelKey: "nextAction.formalReview" };
        case "needsRevision":
            return { whyKey: "stateWhy.blockedByRevision", repair: "revise", repairLabelKey: "nextAction.revise" };
        case "paused":
            return { whyKey: "stateWhy.paused", repair: "resume", repairLabelKey: "stateWhy.repairResume" };
        case "stale":
            return { whyKey: "stateWhy.stale", repair: "openSource", repairLabelKey: "nextAction.openSource" };
        case "archived":
            return { whyKey: "stateWhy.archived", repair: "unarchive", repairLabelKey: "stateWhy.repairUnarchive" };
        default:
            // inReview/applied：内容侧无阻碍，指向练习巩固
            return { whyKey: "stateWhy.inReview", repair: "practice", repairLabelKey: "nextAction.practice" };
    }
}
