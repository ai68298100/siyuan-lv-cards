/**
 * BL-7 用户可见审计日志（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 记录九大类关键操作：创建、评分、改期、导入、导出、联动、删除、恢复与自动化；
 * 2. 验收硬性要求：时间、来源、结果可查；
 * 3. 隐私铁律：原文正文、API Key/Token、个人私有路径等敏感信息默认自动脱敏遮蔽；
 * 4. 有界内存与持久化环形缓冲（默认 500 条），支持多维过滤与 JSON / CSV 双格式导出。
 */

export const AUDIT_CATEGORIES = [
    "create",
    "rating",
    "reschedule",
    "import",
    "export",
    "integration",
    "delete",
    "restore",
    "automation",
] as const;

export type AuditActionCategory = (typeof AUDIT_CATEGORIES)[number];

export type AuditSource =
    | "ui"
    | "shortcut"
    | "command-palette"
    | "ai-wizard"
    | "ecosystem-bridge"
    | "maintenance"
    | "automation";

export type AuditResult = "success" | "failure" | "cancelled";

/** 审计事件条目 */
export interface AuditLogEntry {
    id: string;
    timestamp: number;
    category: AuditActionCategory;
    action: string;
    source: AuditSource;
    result: AuditResult;
    /** 操作对象标识（blockID、deckID 或 batchId） */
    targetId?: string;
    /** 脱敏后的简明摘要 */
    summary: string;
    /** 脱敏后的结构化元数据（计数、耗时、旧新值等） */
    details?: Record<string, unknown>;
}

/** 审计日志多维检索过滤器 */
export interface AuditLogFilter {
    categories?: AuditActionCategory[];
    results?: AuditResult[];
    sources?: AuditSource[];
    fromTimestamp?: number;
    toTimestamp?: number;
    targetId?: string;
    limit?: number;
    offset?: number;
}

/** 最大保留审计条目上限 */
export const DEFAULT_AUDIT_LOG_CAPACITY = 500;

// 正则表达式脱敏模式
const API_KEY_REGEX = /\b(sk-[a-zA-Z0-9_\-]{8,}|Bearer\s+[a-zA-Z0-9_\-\.]{16,}|token-[a-zA-Z0-9_\-]{8,})\b/gi;
const AUTH_HEADER_REGEX = /(authorization|token|secret|password|apiKey|api_key)\s*[:=]\s*["']?([a-zA-Z0-9_\-\.]{6,})["']?/gi;
const ABSOLUTE_PATH_REGEX = /(?:[a-zA-Z]:[\\\/]Users[\\\/][^\\\/]+[\\\/]|(?:\/home|\/Users)\/[^\/]+\/)/g;

/**
 * 敏感信息脱敏过滤器（纯函数）：
 * - API Key / Token 遮蔽为前缀 + *** + 后4位；
 * - 绝对路径去除个人用户名；
 * - 原文内容超长自动截断并标注。
 */
export function sanitizeSensitiveText(text: string, maxExcerptLength: number = 60): string {
    if (!text || typeof text !== "string") return "";

    let result = text;

    // 1. 脱敏 API Key 与 Bearer Token
    result = result.replace(API_KEY_REGEX, (match) => {
        if (match.length <= 8) return "***";
        const prefix = match.substring(0, 3);
        const suffix = match.substring(match.length - 4);
        return `${prefix}***${suffix}`;
    });

    // 2. 脱敏配置中的 secret / password / token 字段
    result = result.replace(AUTH_HEADER_REGEX, (_m, key, val) => {
        const masked = val.length > 4 ? `***${val.slice(-3)}` : "***";
        return `${key}: ${masked}`;
    });

    // 3. 脱敏个人主目录绝对路径
    result = result.replace(ABSOLUTE_PATH_REGEX, "~/...");

    // 4. 长度超限截断
    if (result.length > maxExcerptLength) {
        result = `${result.substring(0, maxExcerptLength)}…`;
    }

    return result;
}

/** 深度遍历对 details 对象的每个值进行安全脱敏 */
export function sanitizeAuditDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!details || typeof details !== "object") return undefined;

    const sanitized: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(details)) {
        const lowerKey = key.toLowerCase();
        if (
            lowerKey.includes("token") ||
            lowerKey.includes("secret") ||
            lowerKey.includes("key") ||
            lowerKey.includes("password")
        ) {
            sanitized[key] = "***";
        } else if (typeof val === "string") {
            sanitized[key] = sanitizeSensitiveText(val, 80);
        } else if (typeof val === "number" || typeof val === "boolean" || val === null) {
            sanitized[key] = val;
        } else if (Array.isArray(val)) {
            sanitized[key] = val.slice(0, 10).map(item =>
                typeof item === "string" ? sanitizeSensitiveText(item, 40) : item,
            );
        } else if (typeof val === "object") {
            sanitized[key] = sanitizeAuditDetails(val as Record<string, unknown>);
        } else {
            sanitized[key] = String(val);
        }
    }

    return sanitized;
}

/** 创建一条脱敏后的审计条目 */
export function createAuditLogEntry(params: {
    category: AuditActionCategory;
    action: string;
    source: AuditSource;
    result: AuditResult;
    targetId?: string;
    summary: string;
    details?: Record<string, unknown>;
    timestamp?: number;
    idPrefix?: string;
}): AuditLogEntry {
    const ts = params.timestamp ?? Date.now();
    const prefix = params.idPrefix ?? "aud";
    const rand = Math.random().toString(36).substring(2, 7);
    const id = `${prefix}-${ts}-${rand}`;

    return {
        id,
        timestamp: ts,
        category: params.category,
        action: sanitizeSensitiveText(params.action, 50),
        source: params.source,
        result: params.result,
        targetId: params.targetId ? sanitizeSensitiveText(params.targetId, 40) : undefined,
        summary: sanitizeSensitiveText(params.summary, 120),
        details: sanitizeAuditDetails(params.details),
    };
}

/**
 * 环形追加审计条目（纯函数）：
 * 保留最大 capacity 条，超出部分先入先出淘汰。
 */
export function appendAuditLog(
    entries: readonly AuditLogEntry[],
    newEntry: AuditLogEntry,
    capacity: number = DEFAULT_AUDIT_LOG_CAPACITY,
): AuditLogEntry[] {
    const next = [...entries, newEntry];
    if (next.length > capacity) {
        return next.slice(next.length - capacity);
    }
    return next;
}

/** 多维过滤与分页查询审计日志 */
export function queryAuditLogs(
    entries: readonly AuditLogEntry[],
    filter: AuditLogFilter = {},
): {
    items: AuditLogEntry[];
    total: number;
    hasMore: boolean;
} {
    let filtered = [...entries];

    if (filter.categories && filter.categories.length > 0) {
        const catSet = new Set(filter.categories);
        filtered = filtered.filter(e => catSet.has(e.category));
    }

    if (filter.results && filter.results.length > 0) {
        const resSet = new Set(filter.results);
        filtered = filtered.filter(e => resSet.has(e.result));
    }

    if (filter.sources && filter.sources.length > 0) {
        const srcSet = new Set(filter.sources);
        filtered = filtered.filter(e => srcSet.has(e.source));
    }

    if (filter.fromTimestamp !== undefined) {
        filtered = filtered.filter(e => e.timestamp >= filter.fromTimestamp!);
    }

    if (filter.toTimestamp !== undefined) {
        filtered = filtered.filter(e => e.timestamp <= filter.toTimestamp!);
    }

    if (filter.targetId) {
        const target = filter.targetId.toLowerCase();
        filtered = filtered.filter(e => e.targetId?.toLowerCase().includes(target));
    }

    // 默认按时间倒序排列（最新在前）
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    const total = filtered.length;
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = filter.limit && filter.limit > 0 ? filter.limit : total;

    const items = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return { items, total, hasMore };
}

/** 格式化为标准脱敏 JSON 导出内容 */
export function exportAuditLogsToJson(entries: readonly AuditLogEntry[], indent: number = 2): string {
    const payload = {
        exportedAt: new Date().toISOString(),
        totalEntries: entries.length,
        version: "1.0",
        entries,
    };
    return JSON.stringify(payload, null, indent);
}

/** CSV 字段安全转义 */
function escapeCsvField(val: unknown): string {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/** 格式化为带有 UTF-8 BOM 的脱敏 CSV 导出内容 */
export function exportAuditLogsToCsv(entries: readonly AuditLogEntry[]): string {
    const headers = [
        "ID",
        "Timestamp",
        "DateTimeISO",
        "Category",
        "Action",
        "Source",
        "Result",
        "TargetID",
        "Summary",
    ];

    const rows: string[] = [headers.join(",")];

    for (const e of entries) {
        const iso = new Date(e.timestamp).toISOString();
        const row = [
            escapeCsvField(e.id),
            escapeCsvField(e.timestamp),
            escapeCsvField(iso),
            escapeCsvField(e.category),
            escapeCsvField(e.action),
            escapeCsvField(e.source),
            escapeCsvField(e.result),
            escapeCsvField(e.targetId ?? ""),
            escapeCsvField(e.summary),
        ];
        rows.push(row.join(","));
    }

    // UTF-8 BOM 头，确保 Excel 正确识别中文
    return "\uFEFF" + rows.join("\n");
}
