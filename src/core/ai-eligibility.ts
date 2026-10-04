/**
 * BU-33 AI eligibility 前置检查（纯逻辑，node 可单测）。
 * 请求前检查材料、配置、同意、网络、敏感级别、成本、任务风险——
 * 验收硬性要求：不满足条件时在组装 prompt 前阻断，并给出手工/本地替代路径；
 * 不把环境性失败（断网/未配置/材料缺失）归因成模型质量。
 * 事实未提供的检查项视为「不判」（跳过而非失败）——调用方按可得信息渐进接入。
 */

export type EligibilityReason =
    | "no-material"      // 材料为空
    | "not-configured"   // custom 模式但端点/密钥缺失
    | "offline"          // 断网（调用方提供 navigator.onLine 等事实才判）
    | "sensitive-source" // 来源被标记敏感（deny 名单，BL-5 接口预留）
    | "cost-exceeded";   // 成本预算耗尽（BU-24/25 账本接口预留）

export interface EligibilityFacts {
    hasMaterial: boolean;
    /** custom 模式下端点与密钥是否已配置（siyuan 模式由内核管理，传 true） */
    aiConfigured: boolean;
    /** 网络状态；不传=不判（无法廉价探测时不阻断） */
    online?: boolean;
    /** 来源敏感级别；不传=normal */
    sensitive?: boolean;
    /** 成本预算是否已耗尽；不传=不判（BU-24/25 账本接入前恒不判） */
    costExceeded?: boolean;
    /** 任务风险等级；制卡=low（当前唯一在册任务） */
    taskRisk?: "low" | "medium";
}

export interface EligibilityBlock {
    reason: EligibilityReason;
    /** 阻断说明 i18n 键（aiElig.<reason>） */
    reasonKey: string;
    /** 手工/本地替代 i18n 键（aiElig.alt.<reason>）——验收硬性要求 */
    alternativeKey: string;
}

export interface EligibilityResult {
    ok: boolean;
    /** 第一个阻断（调用方按此抛错/提示；多条阻断按固定优先级取首） */
    block: EligibilityBlock | null;
    allBlocks: EligibilityBlock[];
}

const REASON_ORDER: EligibilityReason[] = ["no-material", "not-configured", "offline", "sensitive-source", "cost-exceeded"];

function block(reason: EligibilityReason): EligibilityBlock {
    return { reason, reasonKey: `aiElig.${reason}`, alternativeKey: `aiElig.alt.${reason}` };
}

/** 前置检查：按固定优先级返回全部阻断；空数组=可发起请求 */
export function checkEligibility(f: EligibilityFacts): EligibilityResult {
    const blocks: EligibilityBlock[] = [];
    if (!f.hasMaterial) blocks.push(block("no-material"));
    if (!f.aiConfigured) blocks.push(block("not-configured"));
    if (f.online === false) blocks.push(block("offline"));
    if (f.sensitive === true) blocks.push(block("sensitive-source"));
    if (f.costExceeded === true) blocks.push(block("cost-exceeded"));
    // 任务风险：当前在册任务（制卡）为 low，不构成阻断；medium 预留给未来任务
    const sorted = REASON_ORDER.filter(r => blocks.some(b => b.reason === r)).map(r => blocks.find(b => b.reason === r)!);
    return { ok: sorted.length === 0, block: sorted[0] ?? null, allBlocks: sorted };
}
