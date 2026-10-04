/**
 * BI-13 负荷解释与减负选择（纯逻辑，node 可单测）。
 * 积压/疲劳时给出五种减负路径，每条必须说明对 due 与历史的影响（验收硬性要求）——
 * 全部为只读建议：不自动执行、不改调度、不写内核；用户可选可跳过。
 * 与 BI-10 返场检查横幅同场呈现：四查发现问题 → 减负选择给出路。
 */

export const LOAD_CHOICES = ["narrow", "highPriority", "readOnly", "rest", "rebuild"] as const;
export type LoadChoice = (typeof LOAD_CHOICES)[number];

export interface LoadReliefChoice {
    key: LoadChoice;
    /** 选择标签 i18n 键（loadRelief.<key>） */
    labelKey: string;
    /** 对 due/历史的影响说明 i18n 键（loadRelief.impact.<key>）——验收硬性要求 */
    impactKey: string;
}

const CHOICES: Record<LoadChoice, { labelKey: string; impactKey: string }> = {
    narrow: { labelKey: "narrow", impactKey: "impact.narrow" },
    highPriority: { labelKey: "highPriority", impactKey: "impact.highPriority" },
    readOnly: { labelKey: "readOnly", impactKey: "impact.readOnly" },
    rest: { labelKey: "rest", impactKey: "impact.rest" },
    rebuild: { labelKey: "rebuild", impactKey: "impact.rebuild" },
};

/** 五种减负选择（有序：阻力从小到大）；纯建议，无副作用 */
export function loadReliefChoices(): LoadReliefChoice[] {
    return LOAD_CHOICES.map(k => ({ key: k, ...CHOICES[k] }));
}
