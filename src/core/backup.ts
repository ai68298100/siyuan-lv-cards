/**
 * 备份与恢复中心（docs/38 P2，纯逻辑，node 可单测）。
 * 备份 = 插件全部私有存储文件打包为单个 JSON bundle（含 manifest：字节数/FNV-1a 校验/条目数）；
 * 恢复 = 先预览（逐 key 动作与条目数对比 + 校验失败清单）→ 确认后由调用方经 persist 队列落盘。
 * 验收口径：误删回滚（当前状态先导出即可回滚）、升级前快照（导出即快照）、恢复演练（预览不改数据）。
 * 边界：备份含用户内容（卡面版本快照/复习日志），导出文件由用户自行保管——**不自动上传**；
 * 未知 key 拒绝恢复（防外来数据注入未知存储槽）。
 */

export const BACKUP_SCHEMA = 1;
export const BACKUP_APP = "siyuan-lv-cards";

export interface BackupFileMeta {
    bytes: number;
    checksum: string;
    /** 顶层条目数（数组=length；对象=键数；标量=null） */
    entries: number | null;
}

export interface BackupManifest {
    app: string;
    schema: number;
    createdAt: number;
    files: Record<string, BackupFileMeta>;
}

export interface BackupBundle {
    /** 包裹标识（防任意 JSON 误导入） */
    lvBackup: true;
    manifest: BackupManifest;
    /** 各存储文件原始数据（键=存储文件名） */
    files: Record<string, unknown>;
}

/** 稳定序列化（键排序，数组保序）——checksum 可复现的前提 */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value ?? null);
    }
    if (Array.isArray(value)) {
        return `[${value.map(v => stableStringify(v)).join(",")}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** FNV-1a 指纹（与 ai-provenance 同算法；此处独立实现保持模块零依赖） */
export function checksumOf(value: unknown): string {
    const text = stableStringify(value);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
}

function entriesOf(value: unknown): number | null {
    if (Array.isArray(value)) {
        return value.length;
    }
    if (value && typeof value === "object") {
        return Object.keys(value).length;
    }
    return null;
}

/** 打包：全量文件 → bundle（manifest 含逐文件校验） */
export function buildBackupBundle(files: Record<string, unknown>, now: number = Date.now()): BackupBundle {
    const manifest: BackupManifest = { app: BACKUP_APP, schema: BACKUP_SCHEMA, createdAt: now, files: {} };
    for (const key of Object.keys(files).sort()) {
        const data = files[key];
        manifest.files[key] = {
            bytes: stableStringify(data).length,
            checksum: checksumOf(data),
            entries: entriesOf(data),
        };
    }
    return { lvBackup: true, manifest, files };
}

export interface RestoreKeyDiff {
    key: string;
    action: "replace" | "add" | "unchanged";
    entriesBefore: number | null;
    entriesAfter: number | null;
}

export interface RestorePreview {
    ok: boolean;
    /** 校验失败/拒绝原因（有则 ok=false，调用方必须中止） */
    errors: string[];
    perKey: RestoreKeyDiff[];
    /** 替换/新增/不变的 key 数（确认弹窗摘要用） */
    summary: { replace: number; add: number; unchanged: number };
    /** 校验通过的文件数据（仅应用时使用） */
    files: Record<string, unknown>;
    createdAt: number;
}

/**
 * 恢复预览（纯校验，不改任何状态——「恢复演练」口径）：
 * bundle 形态/app/schema 校验 → 逐文件 checksum → 与当前数据逐 key 对比。
 * 未知 key（当前不存在且不在允许清单）不恢复并计入 errors。
 */
export function previewRestore(raw: unknown, currentFiles: Record<string, unknown>, allowedKeys: string[]): RestorePreview {
    const errors: string[] = [];
    const empty: RestorePreview = { ok: false, errors, perKey: [], summary: { replace: 0, add: 0, unchanged: 0 }, files: {}, createdAt: 0 };
    if (!raw || typeof raw !== "object") {
        errors.push("not an object");
        return empty;
    }
    const bundle = raw as Partial<BackupBundle>;
    if (bundle.lvBackup !== true || !bundle.manifest || typeof bundle.manifest !== "object") {
        errors.push("missing backup envelope");
        return empty;
    }
    if (bundle.manifest.app !== BACKUP_APP) {
        errors.push(`unknown app: ${String(bundle.manifest.app)}`);
    }
    if (bundle.manifest.schema !== BACKUP_SCHEMA) {
        errors.push(`unsupported schema: ${String(bundle.manifest.schema)}`);
    }
    const files = (bundle.files && typeof bundle.files === "object" ? bundle.files : {}) as Record<string, unknown>;
    const metas = (bundle.manifest.files && typeof bundle.manifest.files === "object" ? bundle.manifest.files : {}) as Record<string, BackupFileMeta>;
    const allowed = new Set(allowedKeys);
    const perKey: RestoreKeyDiff[] = [];
    const out: Record<string, unknown> = {};
    let replace = 0;
    let add = 0;
    let unchanged = 0;
    for (const key of Object.keys(files).sort()) {
        if (!allowed.has(key)) {
            errors.push(`unknown storage key: ${key}`);
            continue;
        }
        const data = files[key];
        const meta = metas[key];
        if (!meta || meta.checksum !== checksumOf(data)) {
            errors.push(`checksum mismatch: ${key}`);
            continue;
        }
        const before = currentFiles[key] === undefined ? null : entriesOf(currentFiles[key]);
        const after = entriesOf(data);
        const action: RestoreKeyDiff["action"] = before === null ? "add" : checksumOf(currentFiles[key]) === meta.checksum ? "unchanged" : "replace";
        if (action === "add") { add += 1; } else if (action === "replace") { replace += 1; } else { unchanged += 1; }
        perKey.push({ key, action, entriesBefore: before, entriesAfter: after });
        out[key] = data;
    }
    if (Object.keys(out).length === 0) {
        errors.push("no restorable files");
    }
    return {
        ok: errors.length === 0,
        errors,
        perKey,
        summary: { replace, add, unchanged },
        files: out,
        createdAt: typeof bundle.manifest.createdAt === "number" ? bundle.manifest.createdAt : 0,
    };
}
