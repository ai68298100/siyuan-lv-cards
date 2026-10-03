/**
 * BK-1 知识对象与卡实例分离（纯模块，node 可单测）。
 *
 * 设计小节（存储位置与 riff 映射）：
 * - 知识对象（KnowledgeObject）= 一个可考核的核心事实 + 它派生出的多张题型卡实例。
 * - 身份：对象用插件私有 id（`ko-` 前缀），实例挂内核 riff cardID（卡片身份仍归内核，ADR-3）。
 * - 存储：`data/storage/petal/siyuan-lv-cards/knowledge-objects.json`（normalize 白名单清洗，
 *   与 settings/revlog 同目录同口径；写入走 persist 队列）。
 * - 映射关系：对象 1 → N 实例；实例记录 cardID/cardType/capability/disabled；
 *   删除 riff 卡时由调用方同步摘除实例（内核是卡片存在性的事实源，BH-3）。
 * - 核心事实修订：列出受影响实例（含已停用），由用户逐张确认后批量更新题面（BU-3 批量事务口径）；
 *   单张变体可独立停用（disabled=true 不参与复习范围选择，不删内核卡）。
 */

import type { CapabilityType } from "./capability-types";

export interface CardInstance {
    /** 内核 riff 卡 id（卡片身份事实源） */
    cardID: string;
    /** 卡型（card-catalog id） */
    cardType: string;
    /** 能力类型（BJ-1 分类法，可空=未标注） */
    capability: CapabilityType | null;
    /** 单变体独立停用：不参与复习，不删内核卡 */
    disabled: boolean;
}

export interface KnowledgeObject {
    id: string;
    /** 核心事实规范表述（修订此处 → 列出受影响实例） */
    fact: string;
    /** 来源块（可空：手工录入无来源） */
    sourceBlockID: string;
    instances: CardInstance[];
    updatedAt: number;
}

export interface KnowledgeObjectsData {
    version: 1;
    objects: KnowledgeObject[];
}

export function emptyKnowledgeObjects(): KnowledgeObjectsData {
    return { version: 1, objects: [] };
}

const FACT_MAX = 500;

/** 清洗单个对象：字段白名单 + 边界收敛（id/fact 必需，实例逐条清洗） */
function sanitizeObject(raw: any, now: number): KnowledgeObject | null {
    if (!raw || typeof raw !== "object") return null;
    const id = typeof raw.id === "string" && raw.id.startsWith("ko-") ? raw.id : "";
    const fact = typeof raw.fact === "string" ? raw.fact.trim().slice(0, FACT_MAX) : "";
    if (!id || !fact) return null;
    const instances = Array.isArray(raw.instances)
        ? raw.instances
              .map((i: any): CardInstance | null => {
                  if (!i || typeof i !== "object") return null;
                  const cardID = typeof i.cardID === "string" ? i.cardID : "";
                  const cardType = typeof i.cardType === "string" ? i.cardType : "";
                  if (!cardID || !cardType) return null;
                  return {
                      cardID,
                      cardType,
                      capability: typeof i.capability === "string" ? (i.capability as CapabilityType) : null,
                      disabled: i.disabled === true,
                  };
              })
              .filter((i: CardInstance | null): i is CardInstance => i !== null)
        : [];
    const updatedAt = Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now;
    return { id, fact, sourceBlockID: typeof raw.sourceBlockID === "string" ? raw.sourceBlockID : "", instances, updatedAt };
}

/** 整库清洗：坏对象剔除而非整库兜底；同 id 后者丢弃 */
export function normalizeKnowledgeObjects(raw: unknown, now: number = Date.now()): KnowledgeObjectsData {
    const arr = (raw as any)?.objects;
    if (!Array.isArray(arr)) {
        return emptyKnowledgeObjects();
    }
    const seen = new Set<string>();
    const objects: KnowledgeObject[] = [];
    for (const r of arr) {
        const o = sanitizeObject(r, now);
        if (o && !seen.has(o.id)) {
            seen.add(o.id);
            objects.push(o);
        }
    }
    return { version: 1, objects };
}

/** 派生实例：为对象追加题型卡实例（幂等——同 cardID 重复派生返回 false） */
export function deriveInstance(
    obj: KnowledgeObject,
    spec: { cardID: string; cardType: string; capability?: CapabilityType | null },
): boolean {
    if (obj.instances.some(i => i.cardID === spec.cardID)) {
        return false;
    }
    obj.instances.push({
        cardID: spec.cardID,
        cardType: spec.cardType,
        capability: spec.capability ?? null,
        disabled: false,
    });
    obj.updatedAt = Date.now();
    return true;
}

/** 核心事实修订的受影响实例清单：全部实例（含已停用——停用卡也可能被改写后重新启用） */
export function affectedInstances(obj: KnowledgeObject): CardInstance[] {
    return [...obj.instances];
}

/** 单变体独立停用/启用：返回是否发生变更（未知 cardID 无操作） */
export function toggleInstance(obj: KnowledgeObject, cardID: string, disabled: boolean): boolean {
    const inst = obj.instances.find(i => i.cardID === cardID);
    if (!inst || inst.disabled === disabled) {
        return false;
    }
    inst.disabled = disabled;
    obj.updatedAt = Date.now();
    return true;
}

/** 摘除实例（内核卡已删除时调用）：返回是否发生变更 */
export function removeInstance(obj: KnowledgeObject, cardID: string): boolean {
    const before = obj.instances.length;
    obj.instances = obj.instances.filter(i => i.cardID !== cardID);
    if (obj.instances.length !== before) {
        obj.updatedAt = Date.now();
        return true;
    }
    return false;
}

/** 参与复习的实例（未停用）——复习范围选择/统计口径用 */
export function activeInstances(obj: KnowledgeObject): CardInstance[] {
    return obj.instances.filter(i => !i.disabled);
}

/** 按对象 id 查找 */
export function findObject(data: KnowledgeObjectsData, id: string): KnowledgeObject | undefined {
    return data.objects.find(o => o.id === id);
}

/** 按来源块查找（一个块至多注册一个对象——BK-1 口径，多题型走实例派生） */
export function findBySource(data: KnowledgeObjectsData, sourceBlockID: string): KnowledgeObject | undefined {
    return data.objects.find(o => o.sourceBlockID === sourceBlockID);
}

/** 注册新对象：fact=块文本规范表述，来源块绑定；返回新对象（id 自动生成 ko- 前缀） */
export function registerObject(data: KnowledgeObjectsData, fact: string, sourceBlockID: string, now: number = Date.now()): KnowledgeObject {
    const obj: KnowledgeObject = {
        id: `ko-${now.toString(36)}`,
        fact: fact.trim().slice(0, 500),
        sourceBlockID,
        instances: [],
        updatedAt: now,
    };
    data.objects.push(obj);
    return obj;
}
