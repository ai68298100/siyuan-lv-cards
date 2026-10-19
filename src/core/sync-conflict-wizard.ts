/**
 * BL-9 多设备同步冲突决策向导与细粒度三路合并引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 六大领域分别解决：内容（content）、个人字段（personal）、模板（template）、卡历史（history）、计划（plan）、事件（event）；
 * 2. 禁止最后写入覆盖一切（Strictly No Last-Write-Wins Blind Overwrite）；
 * 3. 字段级三向合并：非冲突字段自动无损归并（如本地改标签、远端增复习日志自动共存）；
 * 4. 冲突项保留两侧原值并提供四项仲裁策略：采纳本地、采纳远端、人工合成、分叉为兄弟卡（Fork Variant）。
 */

export const CONFLICT_DOMAINS = [
    "content",
    "personal",
    "template",
    "history",
    "plan",
    "event",
] as const;

export type ConflictDomain = (typeof CONFLICT_DOMAINS)[number];

export type ConflictResolutionChoice =
    | "choose-local"
    | "choose-remote"
    | "fork-variant"
    | "manual-merge";

/** 单个字段冲突项 */
export interface FieldConflictItem<T = unknown> {
    id: string;
    domain: ConflictDomain;
    field: string;
    entityId: string;
    entityName?: string;
    baseValue: T;
    localValue: T;
    remoteValue: T;
    choice?: ConflictResolutionChoice;
    manualMergedValue?: T;
    resolved: boolean;
    descriptionKey: string;
}

/** 实体差异三路输入模型 */
export interface ThreeWayDiffInput<T extends Record<string, unknown>> {
    domain: ConflictDomain;
    entityId: string;
    entityName?: string;
    base: T;
    local: T;
    remote: T;
}

/** 结构化同步冲突向导报告 */
export interface SyncConflictReport {
    conflictId: string;
    detectedAt: number;
    hasConflicts: boolean;
    autoMergedFields: { field: string; value: unknown }[];
    conflicts: FieldConflictItem[];
    resolvedAll: boolean;
}

/** 深比较两值是否在语义上等价 */
export function areValuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null || a === undefined || b === undefined) return a === b;

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, idx) => areValuesEqual(val, b[idx]));
    }

    if (typeof a === "object" && typeof b === "object") {
        const keysA = Object.keys(a as Record<string, unknown>);
        const keysB = Object.keys(b as Record<string, unknown>);
        if (keysA.length !== keysB.length) return false;
        return keysA.every(k => areValuesEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
    }

    return false;
}

/**
 * 字段级三向比对与自动无损合并（纯函数）：
 * - 若 Local == Base，说明本地未动，自动采纳 Remote；
 * - 若 Remote == Base，说明远端未动，自动采纳 Local；
 * - 若 Local == Remote，两侧做了相同的修改，自动采纳；
 * - 若 Local != Remote 且两侧均不同于 Base，产生真实冲突！
 */
export function compareThreeWayEntity<T extends Record<string, unknown>>(
    input: ThreeWayDiffInput<T>,
    now: number = Date.now(),
): {
    autoMergedResult: Partial<T>;
    conflicts: FieldConflictItem[];
} {
    const allKeys = Array.from(
        new Set([
            ...Object.keys(input.base || {}),
            ...Object.keys(input.local || {}),
            ...Object.keys(input.remote || {}),
        ]),
    );

    const autoMergedResult: Partial<T> = {};
    const conflicts: FieldConflictItem[] = [];

    for (const key of allKeys) {
        const bVal = input.base ? input.base[key] : undefined;
        const lVal = input.local ? input.local[key] : undefined;
        const rVal = input.remote ? input.remote[key] : undefined;

        const localChanged = !areValuesEqual(bVal, lVal);
        const remoteChanged = !areValuesEqual(bVal, rVal);

        if (!localChanged && !remoteChanged) {
            // 两侧均无修改，保留原值
            autoMergedResult[key as keyof T] = bVal as T[keyof T];
        } else if (localChanged && !remoteChanged) {
            // 仅本地修改，无冲突采纳本地
            autoMergedResult[key as keyof T] = lVal as T[keyof T];
        } else if (!localChanged && remoteChanged) {
            // 仅远端修改，无冲突采纳远端
            autoMergedResult[key as keyof T] = rVal as T[keyof T];
        } else if (areValuesEqual(lVal, rVal)) {
            // 两侧做了相同修改，无冲突采纳
            autoMergedResult[key as keyof T] = lVal as T[keyof T];
        } else {
            // 特殊情况：数组追加合并（例如复习日志 revlog，如果能无损并集去重则自动合并）
            if (input.domain === "history" && Array.isArray(lVal) && Array.isArray(rVal) && Array.isArray(bVal)) {
                const mergedArray = mergeArrayHistory(bVal, lVal, rVal);
                autoMergedResult[key as keyof T] = mergedArray as unknown as T[keyof T];
                continue;
            }

            // 发生真实冲突
            const conflictItem: FieldConflictItem = {
                id: `cnf-${now}-${Math.random().toString(36).substring(2, 6)}`,
                domain: input.domain,
                field: key,
                entityId: input.entityId,
                entityName: input.entityName,
                baseValue: bVal,
                localValue: lVal,
                remoteValue: rVal,
                resolved: false,
                descriptionKey: `syncConflict.field.${key}`,
            };
            conflicts.push(conflictItem);
        }
    }

    return { autoMergedResult, conflicts };
}

/** 历史复习日志数组无损合并（CRDT 式 union） */
function mergeArrayHistory<T>(base: T[], local: T[], remote: T[]): T[] {
    const seen = new Set<string>();
    const result: T[] = [];

    const addUnique = (item: T) => {
        const str = typeof item === "object" && item !== null ? JSON.stringify(item) : String(item);
        if (!seen.has(str)) {
            seen.add(str);
            result.push(item);
        }
    };

    // 保留 base + local + remote 的所有唯一事件
    for (const item of base) addUnique(item);
    for (const item of local) addUnique(item);
    for (const item of remote) addUnique(item);

    return result;
}

/**
 * 解决单个冲突项（纯函数，返回更新后的冲突项）
 */
export function resolveConflictItem(
    item: FieldConflictItem,
    choice: ConflictResolutionChoice,
    manualValue?: unknown,
): FieldConflictItem {
    if (choice === "manual-merge" && manualValue === undefined) {
        throw new Error("Manual merge choice requires a valid manualValue");
    }

    return {
        ...item,
        choice,
        manualMergedValue: manualValue,
        resolved: true,
    };
}

/**
 * 将已解决的冲突项与自动合并结果合成为最终落地对象
 */
export function assembleFinalResolvedEntity<T extends Record<string, unknown>>(
    autoMerged: Partial<T>,
    resolvedConflicts: readonly FieldConflictItem[],
): {
    finalEntity: T;
    forkedVariants?: T[];
} {
    const finalEntity: Record<string, unknown> = { ...autoMerged };
    const forkedVariants: T[] = [];

    for (const c of resolvedConflicts) {
        if (!c.resolved) {
            throw new Error(`Cannot assemble entity with unresolved conflict: ${c.field}`);
        }

        switch (c.choice) {
            case "choose-local":
                finalEntity[c.field] = c.localValue;
                break;
            case "choose-remote":
                finalEntity[c.field] = c.remoteValue;
                break;
            case "manual-merge":
                finalEntity[c.field] = c.manualMergedValue;
                break;
            case "fork-variant":
                // 实体分叉：主实体采纳本地，同时生成孪生变体实体保存远端内容
                finalEntity[c.field] = c.localValue;
                const forkedEntity: Record<string, unknown> = {
                    ...autoMerged,
                    [c.field]: c.remoteValue,
                    isForkedVariant: true,
                    forkedFromId: c.entityId,
                };
                forkedVariants.push(forkedEntity as unknown as T);
                break;
        }
    }

    return {
        finalEntity: finalEntity as T,
        forkedVariants: forkedVariants.length > 0 ? forkedVariants : undefined,
    };
}
