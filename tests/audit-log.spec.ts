import { describe, expect, it } from "vitest";
import {
    AUDIT_CATEGORIES,
    createAuditLogEntry,
    appendAuditLog,
    queryAuditLogs,
    exportAuditLogsToJson,
    exportAuditLogsToCsv,
    sanitizeSensitiveText,
    sanitizeAuditDetails,
    DEFAULT_AUDIT_LOG_CAPACITY,
} from "../src/core/audit-log";
import type { AuditLogEntry } from "../src/core/audit-log";

describe("audit-log (BL-7 用户可见审计日志)", () => {
    it("覆盖全部 9 大业务操作类别", () => {
        expect(AUDIT_CATEGORIES).toEqual([
            "create",
            "rating",
            "reschedule",
            "import",
            "export",
            "integration",
            "delete",
            "restore",
            "automation",
        ]);

        for (const cat of AUDIT_CATEGORIES) {
            const entry = createAuditLogEntry({
                category: cat,
                action: `test-${cat}`,
                source: "ui",
                result: "success",
                summary: `Action ${cat} completed`,
            });
            expect(entry.category).toBe(cat);
            expect(entry.id).toMatch(/^aud-\d+-[a-z0-9]+$/);
            expect(entry.timestamp).toBeGreaterThan(0);
            expect(entry.result).toBe("success");
        }
    });

    describe("隐私敏感信息脱敏过滤器 (sanitizeSensitiveText & sanitizeAuditDetails)", () => {
        it("脱敏 API Key 与 Bearer Token", () => {
            const text = "调用模型使用 key: sk-abcdef1234567890 和 Bearer a1b2c3d4e5f6g7h8i9j0";
            const sanitized = sanitizeSensitiveText(text);
            expect(sanitized).not.toContain("sk-abcdef1234567890");
            expect(sanitized).toContain("sk-***7890");
            expect(sanitized).not.toContain("Bearer a1b2c3d4e5f6g7h8i9j0");
            expect(sanitized).toContain("Bea***i9j0");
        });

        it("脱敏配置中的 password / secret / token 键值", () => {
            const text = 'auth config: apiKey="my_super_secret_1234"';
            const sanitized = sanitizeSensitiveText(text);
            expect(sanitized).not.toContain("my_super_secret_1234");
            expect(sanitized).toContain("apiKey: ***234");
        });

        it("脱敏绝对路径中的用户目录名", () => {
            const winPath = "C:\\Users\\JohnDoe\\Documents\\data.json";
            const sanitizedWin = sanitizeSensitiveText(winPath);
            expect(sanitizedWin).not.toContain("JohnDoe");
            expect(sanitizedWin).toContain("~/...Documents\\data.json");

            const unixPath = "/Users/alice/Library/Application Support";
            const sanitizedUnix = sanitizeSensitiveText(unixPath);
            expect(sanitizedUnix).not.toContain("alice");
            expect(sanitizedUnix).toContain("~/...Library/Application Support");
        });

        it("超长文本摘要自动截断", () => {
            const longText = "A".repeat(100);
            const sanitized = sanitizeSensitiveText(longText, 40);
            expect(sanitized.length).toBe(41); // 40 chars + "…"
            expect(sanitized.endsWith("…")).toBe(true);
        });

        it("深度脱敏 details 对象", () => {
            const rawDetails = {
                cardId: "20261019120000-abcdef1",
                userApiKey: "sk-1234567890123456",
                nested: {
                    token: "secret-token-value",
                    normal: "hello world",
                },
                tags: ["normal-tag", "sk-1234567890123456"],
                count: 42,
            };

            const sanitized = sanitizeAuditDetails(rawDetails)!;
            expect(sanitized.cardId).toBe("20261019120000-abcdef1");
            expect(sanitized.userApiKey).toBe("***");
            expect((sanitized.nested as any).token).toBe("***");
            expect((sanitized.nested as any).normal).toBe("hello world");
            expect((sanitized.tags as any)[1]).not.toContain("sk-1234567890123456");
            expect(sanitized.count).toBe(42);
        });
    });

    describe("有界环形缓冲 (appendAuditLog)", () => {
        it("正常追加未满时不淘汰", () => {
            let log: AuditLogEntry[] = [];
            const e1 = createAuditLogEntry({ category: "create", action: "c1", source: "ui", result: "success", summary: "s1" });
            const e2 = createAuditLogEntry({ category: "rating", action: "r1", source: "shortcut", result: "success", summary: "s2" });
            log = appendAuditLog(log, e1, 5);
            log = appendAuditLog(log, e2, 5);
            expect(log).toHaveLength(2);
            expect(log[0].id).toBe(e1.id);
            expect(log[1].id).toBe(e2.id);
        });

        it("超出容量上限时遵循先进先出（FIFO）淘汰旧条目", () => {
            let log: AuditLogEntry[] = [];
            const capacity = 3;
            for (let i = 1; i <= 5; i++) {
                const entry = createAuditLogEntry({
                    category: "create",
                    action: `action-${i}`,
                    source: "ui",
                    result: "success",
                    summary: `summary-${i}`,
                });
                log = appendAuditLog(log, entry, capacity);
            }
            expect(log).toHaveLength(3);
            expect(log.map(e => e.action)).toEqual(["action-3", "action-4", "action-5"]);
        });
    });

    describe("多维检索与分页查询 (queryAuditLogs)", () => {
        const sampleEntries: AuditLogEntry[] = [
            createAuditLogEntry({
                category: "create",
                action: "quick-card",
                source: "ui",
                result: "success",
                targetId: "card-1",
                summary: "Created card 1",
                timestamp: 1000,
            }),
            createAuditLogEntry({
                category: "rating",
                action: "fsrs-rate",
                source: "shortcut",
                result: "success",
                targetId: "card-1",
                summary: "Rated good",
                timestamp: 2000,
            }),
            createAuditLogEntry({
                category: "reschedule",
                action: "reschedule-dialog",
                source: "ui",
                result: "failure",
                targetId: "card-2",
                summary: "Reschedule failed",
                timestamp: 3000,
            }),
            createAuditLogEntry({
                category: "import",
                action: "import-lvcards",
                source: "command-palette",
                result: "success",
                summary: "Imported package",
                timestamp: 4000,
            }),
        ];

        it("默认按时间倒序排列", () => {
            const { items, total, hasMore } = queryAuditLogs(sampleEntries);
            expect(total).toBe(4);
            expect(hasMore).toBe(false);
            expect(items.map(i => i.timestamp)).toEqual([4000, 3000, 2000, 1000]);
        });

        it("按类别过滤", () => {
            const { items } = queryAuditLogs(sampleEntries, { categories: ["rating", "create"] });
            expect(items).toHaveLength(2);
            expect(items.map(i => i.category)).toEqual(["rating", "create"]);
        });

        it("按结果状态过滤", () => {
            const { items } = queryAuditLogs(sampleEntries, { results: ["failure"] });
            expect(items).toHaveLength(1);
            expect(items[0].action).toBe("reschedule-dialog");
        });

        it("按时间窗口过滤", () => {
            const { items } = queryAuditLogs(sampleEntries, { fromTimestamp: 2000, toTimestamp: 3000 });
            expect(items).toHaveLength(2);
            expect(items.map(i => i.timestamp)).toEqual([3000, 2000]);
        });

        it("按 targetId 模糊检索", () => {
            const { items } = queryAuditLogs(sampleEntries, { targetId: "card-1" });
            expect(items).toHaveLength(2);
        });

        it("支持 limit 与 offset 分页", () => {
            const page1 = queryAuditLogs(sampleEntries, { limit: 2, offset: 0 });
            expect(page1.items).toHaveLength(2);
            expect(page1.hasMore).toBe(true);
            expect(page1.items[0].timestamp).toBe(4000);
            expect(page1.items[1].timestamp).toBe(3000);

            const page2 = queryAuditLogs(sampleEntries, { limit: 2, offset: 2 });
            expect(page2.items).toHaveLength(2);
            expect(page2.hasMore).toBe(false);
            expect(page2.items[0].timestamp).toBe(2000);
            expect(page2.items[1].timestamp).toBe(1000);
        });
    });

    describe("脱敏数据导出 (JSON & CSV)", () => {
        const sample: AuditLogEntry[] = [
            createAuditLogEntry({
                category: "import",
                action: "lvcards-import",
                source: "ui",
                result: "success",
                targetId: "deck-xyz",
                summary: 'Imported 10 cards, key="sk-1234567890123456"',
                timestamp: 1700000000000,
            }),
            createAuditLogEntry({
                category: "delete",
                action: "remove-card",
                source: "ui",
                result: "cancelled",
                targetId: "card-abc",
                summary: 'Cancelled "dangerous delete"\nwith newline',
                timestamp: 1700000010000,
            }),
        ];

        it("exportAuditLogsToJson 导出合法 JSON 且脱敏敏感信息", () => {
            const jsonStr = exportAuditLogsToJson(sample);
            const parsed = JSON.parse(jsonStr);
            expect(parsed.totalEntries).toBe(2);
            expect(parsed.version).toBe("1.0");
            expect(parsed.entries).toHaveLength(2);
            expect(jsonStr).not.toContain("sk-1234567890123456");
            expect(jsonStr).toContain("sk-***3456");
        });

        it("exportAuditLogsToCsv 包含 UTF-8 BOM 并正确转义引号与换行", () => {
            const csvStr = exportAuditLogsToCsv(sample);
            expect(csvStr.charCodeAt(0)).toBe(0xFEFF); // UTF-8 BOM
            expect(csvStr).toContain("ID,Timestamp,DateTimeISO,Category,Action,Source,Result,TargetID,Summary");
            expect(csvStr).toContain('"Cancelled ""dangerous delete""\nwith newline"');
            expect(csvStr).not.toContain("sk-1234567890123456");
        });
    });
});
