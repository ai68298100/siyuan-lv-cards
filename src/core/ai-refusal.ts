/**
 * BU-11 不确定性与拒答策略（纯逻辑，node 可单测）。
 * 为六类拒答/不确定场景定义可读原因与下一步：事实不足、来源冲突、过时材料、危险请求、
 * 超出能力、格式失败。验收硬性要求：**拒答绝不自动换更宽权限或偷换未授权 provider**——
 * 本模块把每类拒答映射到 BU-28 阶梯的**终止类**（risk/parse/unknown），
 * 测试逐类断言 nextLadderStep 恒 abort（即使备用端点可用）——拒答与降级阶梯在类型层面对齐。
 * 可读文案由调用方按 reasonKey/nextKeys 渲染（i18n aiRefusal.*）；本模块不做网络与权限操作。
 */

export const REFUSAL_KINDS = [
    "insufficient-evidence", // 事实不足：材料撑不起目标卡片数/结论
    "source-conflict",       // 来源冲突：多来源对同一事实口径不一
    "stale-material",        // 过时材料：来源已标记过时/版本变化
    "hazardous-request",     // 危险请求：注入命中/敏感目标/越权意图
    "beyond-capability",     // 超出能力：任务超出在册任务/模型登记能力
    "format-failure",        // 格式失败：响应不可解析/解析后为空
] as const;
export type RefusalKind = (typeof REFUSAL_KINDS)[number];

/** 拒答信号：kind → 证据说明（可空；展示时仅作诊断，不含材料明文由调用方保证） */
export type RefusalSignals = Partial<Record<RefusalKind, string | boolean>>;

export interface RefusalVerdict {
    kind: RefusalKind;
    /** 原因 i18n 键（aiRefusal.kind.<kind>） */
    reasonKey: string;
    /** 下一步（有序 i18n 键，aiRefusal.next.<key>） */
    nextKeys: string[];
    /** 恒 true——验收断言点：拒答不换更宽权限/未授权 provider */
    neverEscalates: true;
    /** 对应 BU-28 阶梯失败类（恒为终止类） */
    ladderClass: "risk" | "parse" | "unknown";
    /** 证据说明（原样透传；可为空） */
    detail: string;
}

/** 每类不同的下一步（两两不同签名——防「统一话术」退化） */
const NEXT_STEPS: Record<RefusalKind, string[]> = {
    "hazardous-request": ["stop", "manual-local"],
    "source-conflict": ["inspect-sources", "pick-side-or-split", "manual-card"],
    "insufficient-evidence": ["narrow-topic", "add-source", "manual-card"],
    "stale-material": ["source-health", "update-source"],
    "beyond-capability": ["manual-card", "split-task"],
    "format-failure": ["retry-once", "manual-card"],
};

/** 固定优先级：危险请求最先（安全优先于一切），格式失败最后（最接近「重试可解」） */
const PRIORITY: RefusalKind[] = [
    "hazardous-request",
    "source-conflict",
    "insufficient-evidence",
    "stale-material",
    "beyond-capability",
    "format-failure",
];

/** 拒答 → BU-28 阶梯失败类：全部落终止类（nextLadderStep 对其恒 abort，见 ai-degradation） */
export function mapRefusalToLadderClass(kind: RefusalKind): RefusalVerdict["ladderClass"] {
    switch (kind) {
        case "hazardous-request":
            return "risk";
        case "format-failure":
            return "parse";
        default:
            return "unknown";
    }
}

/** 评估：按固定优先级返回第一个命中信号；无信号=null（可以请求/继续） */
export function evaluateRefusal(signals: RefusalSignals): RefusalVerdict | null {
    for (const kind of PRIORITY) {
        const sig = signals[kind];
        if (sig === undefined || sig === false) {
            continue;
        }
        return {
            kind,
            reasonKey: `aiRefusal.kind.${kind}`,
            nextKeys: NEXT_STEPS[kind],
            neverEscalates: true,
            ladderClass: mapRefusalToLadderClass(kind),
            detail: typeof sig === "string" ? sig.slice(0, 200) : "",
        };
    }
    return null;
}

/** 可读错误文本（调用方 throw 前拼装：原因 + 有序下一步；i18n 文案由调用方映射后传入） */
export function formatRefusalMessage(reason: string, steps: string[]): string {
    return [reason, ...steps].filter(Boolean).join(" → ");
}
