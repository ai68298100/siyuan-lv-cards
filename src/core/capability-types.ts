/**
 * BJ-1 能力类型矩阵（纯数据+纯函数）：每张卡标记所考能力类型，
 * 题面与统计按能力分开（题面标记归后续 BK-1 知识对象模型，此处先立分类法与统计口径）。
 */

export const CAPABILITY_TYPES = [
    "fact",              // 事实回忆
    "definition",        // 定义
    "distinction",       // 辨析（对比/易混）
    "procedure",         // 步骤/流程
    "generation",        // 生成/应用输出
    "lang-comprehension",// 语言理解
    "lang-production",   // 语言输出
    "application",       // 综合应用
] as const;

export type CapabilityType = (typeof CAPABILITY_TYPES)[number];

/** 宽容归一：未知值返回 null（不猜测，stats 归入未标注桶） */
export function normalizeCapability(v: unknown): CapabilityType | null {
    return typeof v === "string" && (CAPABILITY_TYPES as readonly string[]).includes(v)
        ? (v as CapabilityType)
        : null;
}

export interface CapabilityTagged {
    capability?: string | null;
}

/** 按能力类型分组计数（未标注/非法归入 "unspecified" 桶，不丢弃——统计不撒谎） */
export function capabilityStats(cards: CapabilityTagged[]): Record<CapabilityType | "unspecified", number> {
    const out = Object.fromEntries(CAPABILITY_TYPES.map(c => [c, 0])) as Record<CapabilityType | "unspecified", number>;
    out.unspecified = 0;
    for (const c of cards) {
        const cap = normalizeCapability(c.capability);
        if (cap) {
            out[cap] = (out[cap] ?? 0) + 1;
        } else {
            out.unspecified += 1;
        }
    }
    return out;
}

/** 占比（分母=全部卡；unspecified 也计入——口径透明） */
export function capabilityShare(cards: CapabilityTagged[]): { cap: CapabilityType | "unspecified"; count: number; pct: number }[] {
    const stats = capabilityStats(cards);
    const total = cards.length || 1;
    return Object.entries(stats)
        .map(([cap, count]) => ({ cap: cap as CapabilityType | "unspecified", count, pct: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count);
}
