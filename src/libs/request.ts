/**
 * 统一请求层（321/565）：带超时的 JSON POST（AbortController）。
 * 内核 API 调用点逐步迁移至此；超时给出可识别错误便于 friendlyError 映射。
 */

export interface RequestOptions {
    /** 超时毫秒，默认 15000；0 = 不设超时 */
    timeoutMs?: number;
    headers?: Record<string, string>;
}

export async function postJSON<T = any>(url: string, payload: unknown, opts: RequestOptions = {}): Promise<T> {
    const timeoutMs = opts.timeoutMs ?? 15000;
    const ctrl = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
        });
        return (await resp.json()) as T;
    } catch (e: any) {
        if (e?.name === "AbortError") {
            throw new Error(`kernel timeout after ${timeoutMs}ms (code=504)`);
        }
        throw e;
    } finally {
        if (timer) { clearTimeout(timer); }
    }
}
