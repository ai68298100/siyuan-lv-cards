/**
 * 内核错误码 → 用户文案（327）：已知错误码给可执行提示，未知原样透传。
 * 文案本体在 i18n（键 ec393/ec401/ec404/ec500/ec501），不占主包体积。
 */

/** 从任意异常中提取内核/HTTP 错误码，命中则取 i18n 提示（hints 由调用方传 plugin i18n） */
export function friendlyError(e: unknown, hints?: Record<string, string>): string {
    const raw = e instanceof Error ? e.message : String(e ?? "");
    if (hints) {
        const codeMatch = raw.match(/code=(\d+)/) ?? raw.match(/HTTP (\d{3})/);
        if (codeMatch) {
            const hint = hints[`ec${codeMatch[1]}`];
            if (hint) {
                return hint;
            }
        }
    }
    return raw;
}
