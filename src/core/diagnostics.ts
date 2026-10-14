/**
 * 诊断信息导出与格式化模块（自诊断 AD）
 * 将脱敏的环境信息、内核状态、模块开关、队列与持久化统计汇总为结构化文本，便于用户排查与 Issue 反馈。
 */

export interface DiagnosticsInput {
    pluginVersion: string;
    kernelVersion: string;
    v2State?: string | null;
    modules: Record<string, boolean>;
    revlogCount: number;
    streak: number;
    dueToday: number;
    plansCount: number;
    persistStats: Array<{
        key: string;
        ok: number;
        fail: number;
        lastOkTs?: number;
        lastError?: string;
    }>;
    hasPersistFailures: boolean;
    dueCacheStats: unknown;
    recentLogDump?: string;
}

/**
 * 构建可复制/导出的诊断文本（纯函数，易测试）
 */
export function buildDiagnosticsText(input: DiagnosticsInput): string {
    const activeModules = Object.entries(input.modules)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(", ");

    const persistLines = input.persistStats.map(s => {
        const okTs = s.lastOkTs ? ` lastOk=${new Date(s.lastOkTs).toISOString()}` : "";
        const err = s.lastError ? ` lastError=${s.lastError}` : "";
        return `${s.key}: ok=${s.ok} fail=${s.fail}${okTs}${err}`;
    });

    return [
        "Lv Cards (Beta) diagnostics",
        `plugin version: ${input.pluginVersion || "unknown"}`,
        `siyuan/kernel: ${input.kernelVersion || "?"}`,
        `V2 state: ${input.v2State ?? "N/A (<3.9.0)"}`,
        `modules on: ${activeModules}`,
        `revlog entries: ${input.revlogCount}`,
        `streak: ${input.streak}`,
        `due today (badge): ${input.dueToday}`,
        `plans: ${input.plansCount}`,
        "",
        "--- persist (AQ-4) ---",
        ...persistLines,
        ...(input.hasPersistFailures ? [] : ["all writes ok"]),
        "--- due cache (AT-4) ---",
        `dueCache: ${JSON.stringify(input.dueCacheStats)}`,
        "",
        "--- recent log (324) ---",
        input.recentLogDump || "(empty)",
    ].join("\n");
}
