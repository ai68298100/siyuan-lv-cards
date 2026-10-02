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

export async function loadStore<T>(plugin: { loadData: (key: string) => Promise<any> }, def: StoreDef<T>): Promise<T> {
    try {
        const raw = await plugin.loadData(def.key);
        return def.normalize(raw ?? def.fallback());
    } catch {
        return def.fallback();
    }
}
