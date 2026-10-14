/**
 * 内核错误码 → 用户文案（327）：已知错误码给可执行提示，未知原样透传。
 * 文案本体在 i18n（键 ec393/ec401/ec404/ec500/ec501），不占主包体积。
 */

/** 从任意异常中提取内核/HTTP 错误码，命中则取 i18n 提示（hints 由调用方传 plugin i18n） */
export function friendlyError(e: unknown, hints?: Record<string, string>): string {
    const raw = e instanceof Error ? e.message : String(e ?? "");
    const category = classifyError(e);
    if (hints) {
        const codeMatch = raw.match(/code[=：:]\s*(\d+)/i) ?? raw.match(/HTTP\s+(\d{3})/i);
        if (codeMatch) {
            const hint = hints[`ec${codeMatch[1]}`];
            if (hint) {
                return hint;
            }
        }
        // Plain application errors may intentionally contain domain-specific
        // wording (for example "offline" from a test double or validation
        // rule). Use generic transport copy only when the error carries an
        // explicit transport category/kind/status.
        const hasTransportShape = !!e && typeof e === "object"
            && ("category" in (e as object) || "kind" in (e as object) || "status" in (e as object));
        if (hasTransportShape) {
            const categoryHint = hints[`request${category[0].toUpperCase()}${category.slice(1)}`];
            if (categoryHint) return categoryHint;
        }
    }
    return raw;
}

/** Stable category used by UI error states; no host-specific login API assumed. */
export function classifyError(e: unknown): "Cancelled" | "Timeout" | "Network" | "Auth" | "Permission" | "Validation" | "Server" | "Unknown" {
    const value = e as { category?: string; kind?: string; status?: number } | null;
    if (value?.category === "cancelled" || value?.kind === "abort" || value?.kind === "stale") return "Cancelled";
    if (value?.category === "timeout" || value?.kind === "timeout" || /timeout/i.test(String(e))) return "Timeout";
    if (value?.category === "network" || value?.kind === "network" || /network|offline|failed to fetch/i.test(String(e))) return "Network";
    if (value?.status === 401 || /(?:code=|HTTP )401\b|unauthori[sz]ed|登录|鉴权/i.test(String(e))) return "Auth";
    if (value?.status === 403 || /(?:code=|HTTP )403\b|forbidden|permission|权限/i.test(String(e))) return "Permission";
    if (value?.status && value.status >= 400 && value.status < 500) return "Validation";
    if (value?.status && value.status >= 500) return "Server";
    if (/(?:code=|HTTP )5\d\d\b|server error|internal error/i.test(String(e))) return "Server";
    return "Unknown";
}
