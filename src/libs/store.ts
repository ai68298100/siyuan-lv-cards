/**
 * TypedStore（322）：插件私有数据的统一加载入口——key + 版本 + 清洗函数，
 * 读取失败/结构非法时落回 fallback，绝不抛错阻塞启动。
 * 迁移策略：normalize 承担版本合并（normalizeX 内部处理旧结构）；
 * 后续 settings/revlog/plans/session/suspend 逐步改走此入口。
 */

export interface StoreDef<T> {
    /** 存储键（如 "settings.json"） */
    key: string;
    /** 结构非法/读取失败时的兜底工厂 */
    fallback: () => T;
    /** 运行时清洗（含旧版本迁移，必须幂等） */
    normalize: (raw: unknown) => T;
}

export async function loadStore<T>(
    plugin: { loadData: (key: string) => Promise<any> },
    def: StoreDef<T>,
    /** 已随批量加载取出的原文（AQ-1）：传入则不再二次 loadData */
    preloaded?: unknown,
): Promise<T> {
    try {
        const raw = preloaded !== undefined ? preloaded : await plugin.loadData(def.key);
        return def.normalize(raw ?? def.fallback());
    } catch {
        return def.fallback();
    }
}

/**
 * 按位置配对批量 loadData 的结果（AQ-1 回归核心）：
 * Promise.all([...keys.map(load)]) 的返回值按位置对应 keys，
 * 历史上解构数量与键数量错位导致会话状态读到 AI 批次数据。
 * 长度不一致直接抛错（宁可启动失败也不静默错位）。
 */
export function zipLoaded<K extends string>(keys: readonly K[], values: readonly unknown[]): Record<K, unknown> {
    if (values.length !== keys.length) {
        throw new Error(`load mismatch: ${keys.length} keys vs ${values.length} values`);
    }
    const out = {} as Record<K, unknown>;
    keys.forEach((key, i) => {
        out[key] = values[i];
    });
    return out;
}
