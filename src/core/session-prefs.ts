// BX-3 本场偏好：覆盖合并与最小化（纯函数，脱离 Svelte 组件可单测）
// 语义：本场覆盖优先、全局兜底；与全局同值的覆盖项自动摘除（覆盖面最小化，
// hasOverrides 仅在真正偏离全局时亮显）。

/** 融合读取：override 只需是部分字段，其余回落 base */
export function mergeSessionPrefs<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
    return { ...base, ...override };
}

/** 摘除与 base 同值的覆盖键，返回修剪后的覆盖集（可能为空对象） */
export function pruneSessionPrefs<T extends Record<string, unknown>>(base: T, next: Partial<T>): Partial<T> {
    const out: Partial<T> = { ...next };
    for (const k of Object.keys(out) as (keyof T)[]) {
        if (String(out[k]) === String(base[k])) {
            delete out[k];
        }
    }
    return out;
}
