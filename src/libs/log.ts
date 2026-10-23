/**
 * 环形日志缓冲（324）：内存中保留最近 200 条插件侧日志，
 * 诊断复制时随「复制诊断」导出，供远程排障；不落盘、不含块内容。
 */

export type LvLogLevel = "info" | "warn" | "error";

interface LogEntry {
    ts: number;
    level: LvLogLevel;
    msg: string;
}

const RING_MAX = 200;
const ring: LogEntry[] = [];

export function lvLog(level: LvLogLevel, msg: unknown): void {
    try {
        const text = String(msg).slice(0, 500);
        ring.push({ ts: Date.now(), level, msg: text });
        if (ring.length > RING_MAX) {
            ring.splice(0, ring.length - RING_MAX);
        }
        if (typeof console !== "undefined") {
            const m = text.startsWith("[LvCards]") ? text : `[LvCards] ${text}`;
            (console[level] || console.log)(m);
        }
    } catch { /* 日志绝不抛错 */ }
}

/** 导出为多行文本（诊断附加段） */
export function lvLogDump(): string {
    return ring.map(r => `${new Date(r.ts).toISOString()} [${r.level}] ${r.msg}`).join("\n");
}

export function lvLogClear(): void {
    ring.length = 0;
}
