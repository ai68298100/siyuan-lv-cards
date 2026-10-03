/**
 * BH-4 全卡型注册与降级路线（声明式目录，纯数据+纯函数）。
 * 与 card-types.ts 的动态判分注册表分工：目录=能力/阶段/调度映射/降级路线的单一事实源（docs/33 矩阵代码化）；
 * 判分实现仍走 registerCardType（ADR-3：正式调度只走内核）。
 * 阶段口径：shipped=已实现、experimental=实验中、planned=规划（docs/33 口径，如有出入以 docs/33 为准）。
 */

export type CardTypePhase = "shipped" | "experimental" | "planned";
/** 调度映射：native=内核 riff 正式调度；practice=插件练习模式（不当正式调度，BH-5 口径表） */
export type CardTypeScheduler = "native" | "practice";

export interface CardTypeCatalogEntry {
    id: string;
    nameKey: string;
    phase: CardTypePhase;
    scheduler: CardTypeScheduler;
    /** 降级路线：能力/宿主缺失时退化到的卡型 id（目标必须在目录中） */
    degradeTo?: string;
    /** 降级触发条件（人读说明键或短语） */
    degradeWhen?: string;
}

export const CARD_CATALOG: CardTypeCatalogEntry[] = [
    { id: "qa", nameKey: "cardTypeQA", phase: "shipped", scheduler: "native" },
    { id: "cloze", nameKey: "cardTypeCloze", phase: "shipped", scheduler: "native" },
    { id: "occlusion", nameKey: "cardTypeOcclusion", phase: "shipped", scheduler: "native", degradeTo: "qa", degradeWhen: "遮挡渲染不可用时退化问答" },
    { id: "typing", nameKey: "cardTypeTyping", phase: "shipped", scheduler: "practice" },
    { id: "choice", nameKey: "cardTypeChoice", phase: "shipped", scheduler: "practice", degradeTo: "qa", degradeWhen: "干扰项不足时退化问答" },
    { id: "dictation", nameKey: "cardTypeDictation", phase: "shipped", scheduler: "practice", degradeTo: "typing", degradeWhen: "TTS/音源缺失时退化打字" },
    { id: "pairing", nameKey: "cardTypePairing", phase: "shipped", scheduler: "practice", degradeTo: "qa", degradeWhen: "卡量不足或窄屏时退化问答" },
    { id: "code", nameKey: "cardTypeCode", phase: "planned", scheduler: "practice", degradeTo: "typing", degradeWhen: "等宽渲染不可用时退化打字（AO 素材立项后转 shipped）" },
    { id: "bidi", nameKey: "cardTypeBidi", phase: "planned", scheduler: "native", degradeTo: "qa", degradeWhen: "双向派生不受宿主支持时退化单向问答" },
    { id: "list", nameKey: "cardTypeList", phase: "planned", scheduler: "practice", degradeTo: "qa", degradeWhen: "列表拆分不可用时逐项退化问答" },
    { id: "table", nameKey: "cardTypeTable", phase: "planned", scheduler: "practice", degradeTo: "qa", degradeWhen: "表格抽取不可用时退化问答" },
    { id: "audio", nameKey: "cardTypeAudio", phase: "planned", scheduler: "practice", degradeTo: "dictation", degradeWhen: "音频源缺失退化听写再退化打字" },
    { id: "handwriting", nameKey: "cardTypeHandwriting", phase: "planned", scheduler: "practice", degradeTo: "qa", degradeWhen: "触控/笔输入不可用时退化问答" },
    { id: "applied", nameKey: "cardTypeApplied", phase: "planned", scheduler: "practice", degradeTo: "qa", degradeWhen: "应用题模板缺失时退化问答" },
];

/** 按 id 取目录条目 */
export function getCatalogEntry(id: string): CardTypeCatalogEntry | undefined {
    return CARD_CATALOG.find(c => c.id === id);
}

/** 降级链解析：id → 逐级退化目标列表（防环：超过目录长度即截断） */
export function degradationRoute(id: string): string[] {
    const route: string[] = [];
    let cur = getCatalogEntry(id);
    const guard = new Set<string>();
    while (cur?.degradeTo && !guard.has(cur.degradeTo)) {
        guard.add(cur.degradeTo);
        route.push(cur.degradeTo);
        cur = getCatalogEntry(cur.degradeTo);
    }
    return route;
}

/** 已实现（shipped）卡型 id 集 */
export function shippedCardTypes(): string[] {
    return CARD_CATALOG.filter(c => c.phase === "shipped").map(c => c.id);
}
