/**
 * BK-2 卡片关系图（纯模块，node 可单测）。
 * 设计：关系是**纯元数据**（插件私有 relations.json）——只记录实体之间的语义关联，
 * 绝不产生第二调度器（不改变内核 due/间隔；BH-3 口径）。
 * 实体 id 口径：当前=承载卡的**块 ID**（思源块原子性；UI 从卡片详情抽屉以块维度操作），
 * from/to 为透明字符串，未来换 riff cardID 无需改结构。
 * 关系类型：sibling（兄弟变体）/ prerequisite（前置）/ example（示例）/ counterexample（反例）/
 * source（来源）/ application（应用）/ alternative（替代表述）。
 * 规则：仅手工创建（不自动推理建边）；无自环；同 from+to+type 去重；删除实体时按端点清理。
 */

export const RELATION_TYPES = [
    "sibling", "prerequisite", "example", "counterexample", "source", "application", "alternative",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export interface CardRelation {
    /** 关系主体卡（内核 riff cardID） */
    from: string;
    /** 关系目标卡 */
    to: string;
    type: RelationType;
    createdAt: number;
}

export interface CardRelationsData {
    version: 1;
    relations: CardRelation[];
}

export function emptyCardRelations(): CardRelationsData {
    return { version: 1, relations: [] };
}

function isRelationType(v: unknown): v is RelationType {
    return typeof v === "string" && (RELATION_TYPES as readonly string[]).includes(v);
}

/** 整库清洗：坏边剔除、自环剔除、完全重复边去重 */
export function normalizeCardRelations(raw: unknown, now: number = Date.now()): CardRelationsData {
    const arr = (raw as any)?.relations;
    if (!Array.isArray(arr)) {
        return emptyCardRelations();
    }
    const seen = new Set<string>();
    const relations: CardRelation[] = [];
    for (const r of arr) {
        if (!r || typeof r !== "object") continue;
        const from = typeof r.from === "string" ? r.from : "";
        const to = typeof r.to === "string" ? r.to : "";
        const type = r.type;
        if (!from || !to || from === to || !isRelationType(type)) continue;
        const key = `${from}|${to}|${type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ts = Number.isFinite(Number(r.createdAt)) ? Number(r.createdAt) : now;
        relations.push({ from, to, type, createdAt: ts });
    }
    return { version: 1, relations };
}

/** 建边：无自环、同 from+to+type 去重；返回是否新建（重复返回 false 不报错） */
export function addRelation(data: CardRelationsData, from: string, to: string, type: RelationType, now: number = Date.now()): boolean {
    if (!from || !to || from === to) return false;
    if (data.relations.some(r => r.from === from && r.to === to && r.type === type)) return false;
    data.relations.push({ from, to, type, createdAt: now });
    return true;
}

/** 删边：返回是否删除 */
export function removeRelation(data: CardRelationsData, from: string, to: string, type: RelationType): boolean {
    const before = data.relations.length;
    data.relations = data.relations.filter(r => !(r.from === from && r.to === to && r.type === type));
    return data.relations.length !== before;
}

/** 某卡的关系视图（双向：作为 from 或 to 都算），附方向标注 */
export function relationsOf(data: CardRelationsData, cardID: string): { relation: CardRelation; direction: "outgoing" | "incoming" }[] {
    return data.relations
        .filter(r => r.from === cardID || r.to === cardID)
        .map(r => ({ relation: r, direction: r.from === cardID ? ("outgoing" as const) : ("incoming" as const) }));
}

/** 内核卡删除时的端点清理：移除该卡参与的全部边；返回删除条数 */
export function detachCard(data: CardRelationsData, cardID: string): number {
    const before = data.relations.length;
    data.relations = data.relations.filter(r => r.from !== cardID && r.to !== cardID);
    return before - data.relations.length;
}
