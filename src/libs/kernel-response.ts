/**
 * 内核响应统一校验（AQ-20）：所有 fetchSyncPost 裸响应先过这里，
 * code !== 0 / 结构缺失一律抛错，调用方不再各自宽容读取导致静默空白。
 * 纯函数、零依赖，fixture 可直接单测。
 */

export interface KernelEnvelope<T = unknown> {
    code: number;
    msg: string;
    data: T;
}

/** 校验响应封套并取出 data；非 0/缺失抛本地可读错误 */
export function unwrapKernelData<T>(resp: unknown): T {
    const r = resp as Partial<KernelEnvelope<T>> | null;
    if (!r || typeof r !== "object" || typeof r.code !== "number") {
        throw new Error("kernel error (code=unknown)");
    }
    if (r.code !== 0) {
        throw new Error(r.msg || `kernel error (code=${r.code})`);
    }
    return r.data as T;
}

/** 从 data 中宽容读取字符串字段（缺字段回空串，不产生 undefined 渲染） */
export function dataStr<T>(data: T, field: string): string {
    const v = (data as Record<string, unknown> | null)?.[field];
    return typeof v === "string" ? v : "";
}
