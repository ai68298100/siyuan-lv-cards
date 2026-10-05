/**
 * Anki 导入宿主适配层（M3 UI 接线）。
 * 职责：探测渲染端 node:sqlite 可用性（不可用给出可读原因），并提供打开临时库的适配器。
 * 全部经 globalThis.require 动态取用——打包器不静态分析，缺失环境不炸（调用方降级提示）。
 * 无 Node require（移动端/纯浏览器）→ 不可用，导入入口隐藏。
 */
import type { SqliteAdapter } from "../core/anki-package";

export interface HostSqliteProbe {
    available: boolean;
    reason?: string;
}

export function detectSqlite(): HostSqliteProbe {
    try {
        const req = (globalThis as unknown as { require?: unknown }).require;
        if (typeof req !== "function") {
            return { available: false, reason: "当前环境无 Node require（非桌面端）" };
        }
        const mod = (req as (m: string) => unknown)("node:sqlite");
        const hasDb = typeof (mod as { DatabaseSync?: unknown })?.DatabaseSync === "function";
        if (!hasDb) {
            return { available: false, reason: "宿主 Node 缺少 node:sqlite（需较新思源桌面版）" };
        }
        return { available: true };
    } catch (e) {
        return { available: false, reason: `node:sqlite 加载失败：${String(e).slice(0, 80)}` };
    }
}

/** 打开字节形式的 SQLite（写临时文件后由 node:sqlite 打开）；调用方负责 close() */
export function openSqliteFile(bytes: Uint8Array): { adapter: SqliteAdapter; close: () => void } {
    const req = (globalThis as unknown as { require: (m: string) => any }).require;
    const { DatabaseSync } = req("node:sqlite");
    const fsMod = req("node:fs");
    const osMod = req("node:os");
    const pathMod = req("node:path");
    const dir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), "anki-import-"));
    const file = pathMod.join(dir, "collection.anki2");
    fsMod.writeFileSync(file, bytes);
    const db = new DatabaseSync(file);
    return {
        adapter: { all: (sql, params = []) => db.prepare(sql).all(...(params as never[])) },
        close: () => {
            try { db.close(); } catch { /* 尽力而为 */ }
        },
    };
}
