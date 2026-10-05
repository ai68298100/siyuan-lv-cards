/**
 * BU-15 AI 生成与人工修改双轨 provenance（纯逻辑，node 可单测）。
 * 逐卡保存版本链：生成候选（via=ai，含模型/模板快照）→ 用户编辑（via=user）→ 接受版本；
 * 重生成追加新 ai 版本（可 diff 新旧），「回到任意人工版本」= 取链上任意 user 版本原文。
 * 验收硬性要求：**删除 AI 记录不误删用户内容**——purgeAIOnly 只剔除纯 ai 轨迹卡；
 * 只要该卡存在任何 user 版本，AI 原文可清而用户文本必须保留。
 * 模型配置快照不含密钥（key 永不进入 provenance）；文本 hash 用 FNV-1a（快速去重指纹，非安全摘要）。
 */

export type ProvenanceVia = "ai" | "user";

export interface ProvenanceVersion {
    at: number;
    via: ProvenanceVia;
    q: string;
    a: string;
    /** ai 版本携带的生成环境快照（首个 ai 版本必填；重生成各带各的） */
    gen?: {
        /** 生成环境：siyuan 内置 / custom 端点 */
        mode: "siyuan" | "custom";
        /** 模型 ID（未登记/内置= null） */
        modelId: string | null;
        /** 模板 hash（FNV-1a，可比较「同一模板」） */
        templateHash: string;
    };
}

export interface CardProvenance {
    /** 作业内候选下标（与 ai-jobs candidates 对位） */
    index: number;
    versions: ProvenanceVersion[];
}

/** FNV-1a 32 位 hash（十六进制；非安全摘要，仅指纹/去重/对比用） */
export function fnv1a(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
}

const VERSIONS_CAP = 20;

/** 追加版本（最新在后，截上限）；ai 版本无 gen 快照视为非法剔除 */
export function appendVersion(card: CardProvenance, v: ProvenanceVersion): CardProvenance {
    if (v.via === "ai" && !v.gen) {
        return card;
    }
    const versions = [...card.versions, { ...v }].slice(-VERSIONS_CAP);
    return { ...card, versions };
}

/** 最新 user 版本（可「回到任意人工版本」的默认落点）；无= null */
export function latestUserVersion(card: CardProvenance): ProvenanceVersion | null {
    for (let i = card.versions.length - 1; i >= 0; i--) {
        if (card.versions[i].via === "user") {
            return card.versions[i];
        }
    }
    return null;
}

/** 全部 user 版本（供「回到任意人工版本」选择列表，最新在前） */
export function userVersions(card: CardProvenance): ProvenanceVersion[] {
    return card.versions.filter(v => v.via === "user").reverse();
}

/**
 * 删除 AI 记录不误删用户内容：剔除「从未被用户编辑过」的卡的完整轨迹；
 * 有 user 版本的卡保留整链（含 ai 原文——它是 diff 上下文；如需纯净化可后续选做）。
 * 返回：清理后链 + 被整卡清除的数量（诊断用）。
 */
export function purgeAIOnly(cards: CardProvenance[]): { kept: CardProvenance[]; purgedCount: number } {
    const kept = cards.filter(c => c.versions.some(v => v.via === "user"));
    return { kept, purgedCount: cards.length - kept.length };
}

/** 批量清洗：index 去重（保留版本多者）、版本非法剔除、上限截断 */
export function normalizeProvenance(raw: unknown, cap = 500): CardProvenance[] {
    const list = Array.isArray(raw) ? raw : [];
    const byIndex = new Map<number, CardProvenance>();
    for (const item of list) {
        const c = item as Partial<CardProvenance>;
        if (typeof c?.index !== "number" || !Array.isArray(c.versions)) {
            continue;
        }
        const versions = (c.versions as Partial<ProvenanceVersion>[])
            .filter(v => (v.via === "ai" || v.via === "user") && typeof v.at === "number" && typeof v.q === "string" && typeof v.a === "string" && (v.via === "user" || (v.gen != null && typeof v.gen.templateHash === "string")))
            .map(v => ({ at: v.at as number, via: v.via as ProvenanceVia, q: v.q as string, a: v.a as string, ...(v.via === "ai" ? { gen: v.gen } : {}) }));
        if (versions.length === 0) {
            continue;
        }
        const prev = byIndex.get(c.index);
        if (!prev || prev.versions.length < versions.length) {
            byIndex.set(c.index, { index: c.index, versions: versions.slice(-VERSIONS_CAP) });
        }
    }
    return [...byIndex.values()].slice(0, cap);
}
