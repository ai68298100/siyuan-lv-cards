/**
 * 混合题型轮换（调研登记 v0.178.0 → v0.179.0 落地；纯逻辑 node 可单测）。
 * 按本场作答张数在已启用题型间轮换出题形态（翻面/打字/选择），防单一形态疲劳——
 * 展示层轮换：不改变调度、不写内核、被轮换到的题型仍走该题型既有判分口径。
 * 参考：Quizlet Learn 多题型混合轮换（docs/17 AO 区 v0.178.0 登记）。
 */

export type AnswerVariant = "flip" | "typing" | "choice";

/** 轮换周期（固定起点=翻面，保证第一张总是最基础的形态） */
export const ROTATION_CYCLE: readonly AnswerVariant[] = ["flip", "choice", "typing"];

export interface RotationEnabled {
    typing: boolean;
    choice: boolean;
}

/**
 * 轮换提名：turn=本场已作答张数（0 起）。
 * 仅在已启用题型中轮换；只启用一种（或全未启用）时恒翻面——没有多样性就不假装轮换。
 * turn 为负等异常输入按 0 处理（取模前归一）。
 */
export function nominateVariant(turn: number, enabled: RotationEnabled): AnswerVariant {
    const cycle = ROTATION_CYCLE.filter(
        v => v === "flip" || (v === "typing" && enabled.typing) || (v === "choice" && enabled.choice)
    );
    if (cycle.length <= 1) {
        return "flip";
    }
    const t = Number.isFinite(turn) && turn > 0 ? Math.floor(turn) : 0;
    return cycle[t % cycle.length];
}
