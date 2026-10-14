import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    applyRestoreTransaction,
    buildCostLedgerExportPayload,
    downloadFile,
    formatRevlogExportCsv,
    formatRevlogExportJson,
    formatSettingsExportJson,
} from "../src/core/data-transfer";
import type { CostLedgerData } from "../src/core/ai-cost-ledger";
import type { RevlogData } from "../src/core/revlog";
import { defaultSettings } from "../src/core/settings";

describe("data-transfer 数据导出与备份恢复事务", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("导出格式化", () => {
        it("formatRevlogExportJson 产生格式化 JSON", () => {
            const revlog: RevlogData = {
                entries: [{ cardID: "c1", deckID: "d1", blockID: "b1", rating: 3, ts: 1700000000000, source: "plugin" }],
                days: {},
            };
            const json = formatRevlogExportJson(revlog);
            expect(json).toContain('"c1"');
            expect(JSON.parse(json)).toEqual(revlog);
        });

        it("formatRevlogExportCsv 产生带 BOM 的 CSV 文本", () => {
            const revlog: RevlogData = {
                entries: [{ cardID: "c1", deckID: "d1", blockID: "b1", rating: 3, ts: 1700000000000, source: "plugin" }],
                days: {},
            };
            const csv = formatRevlogExportCsv(revlog);
            expect(csv.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
            expect(csv).toContain("cardID,deckID,blockID,rating,source");
            expect(csv).toContain('"c1","d1","b1",3,plugin');
        });

        it("formatSettingsExportJson 产生合法的设置 JSON", () => {
            const settings = defaultSettings();
            const json = formatSettingsExportJson(settings);
            const parsed = JSON.parse(json);
            expect(parsed.version).toBe(settings.version);
            expect(parsed.modules).toBeDefined();
        });

        it("buildCostLedgerExportPayload 包含聚合与明细", () => {
            const ledger: CostLedgerData = {
                version: 1,
                entries: [
                    {
                        at: 1700000000000,
                        task: "cards-generate",
                        mode: "custom",
                        modelId: "gpt-4o",
                        tokens: 100,
                        est: true,
                        costUsd: 0.001,
                        algorithm: "chars/4",
                        priceVersion: "2026-10",
                    },
                ],
            };
            const payload = buildCostLedgerExportPayload(ledger);
            expect(payload.exportedAt).toBeDefined();
            expect(payload.entries).toHaveLength(1);
            expect(payload.aggregates.byModel).toHaveLength(1);
            expect(payload.aggregates.byModel[0].modelId).toBe("gpt-4o");
            expect(payload.aggregates.byModel[0].calls).toBe(1);
        });
    });

    describe("applyRestoreTransaction 多文件事务与回滚补偿", () => {
        it("所有文件写入成功时顺利提交并返回写入的 key 列表", async () => {
            const saved: Record<string, unknown> = {};
            const saveFile = vi.fn(async (key: string, data: unknown) => {
                saved[key] = data;
            });

            const restoreFiles = {
                "settings.json": { version: 2 },
                "revlog.json": { entries: [] },
            };
            const currentFiles = {
                "settings.json": { version: 1 },
                "revlog.json": { entries: [{ cardID: "old" }] },
            };

            const applied = await applyRestoreTransaction({
                restoreFiles,
                currentFiles,
                saveFile,
            });

            expect(applied).toEqual(["settings.json", "revlog.json"]);
            expect(saveFile).toHaveBeenCalledTimes(2);
            expect(saved["settings.json"]).toEqual({ version: 2 });
            expect(saved["revlog.json"]).toEqual({ entries: [] });
        });

        it("当中间某个文件写入失败时，逆序回滚此前已写入的文件并抛出异常", async () => {
            const history: Array<{ action: "save"; key: string; data: any }> = [];
            const saveFile = vi.fn(async (key: string, data: unknown) => {
                if (key === "failed.json") {
                    throw new Error("Disk full error");
                }
                history.push({ action: "save", key, data });
            });

            const logError = vi.fn();

            const restoreFiles = {
                "file1.json": { v: "new-1" },
                "file2.json": { v: "new-2" },
                "failed.json": { v: "new-fail" },
            };
            const currentFiles = {
                "file1.json": { v: "old-1" },
                "file2.json": { v: "old-2" },
                "failed.json": { v: "old-fail" },
            };

            await expect(
                applyRestoreTransaction({
                    restoreFiles,
                    currentFiles,
                    saveFile,
                    logError,
                }),
            ).rejects.toThrow("Disk full error");

            // 验证执行序列：
            // 1. 尝试写入 file1 -> new-1
            // 2. 尝试写入 file2 -> new-2
            // 3. 尝试写入 failed -> 抛错
            // 4. 逆序补偿：file2 -> old-2
            // 5. 逆序补偿：file1 -> old-1
            expect(history).toEqual([
                { action: "save", key: "file1.json", data: { v: "new-1" } },
                { action: "save", key: "file2.json", data: { v: "new-2" } },
                { action: "save", key: "file2.json", data: { v: "old-2" } },
                { action: "save", key: "file1.json", data: { v: "old-1" } },
            ]);
        });
    });

    describe("downloadFile 浏览器文件下载", () => {
        it("创建 a 标签触发下载并在延时后释放 URL", () => {
            vi.useFakeTimers();
            const clickMock = vi.fn();
            const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue({
                href: "",
                download: "",
                click: clickMock,
            } as any);

            const createObjectURLMock = vi.fn().mockReturnValue("blob:test-url");
            const revokeObjectURLMock = vi.fn();
            globalThis.URL.createObjectURL = createObjectURLMock;
            globalThis.URL.revokeObjectURL = revokeObjectURLMock;

            downloadFile("test.json", '{"a":1}', "application/json");

            expect(createObjectURLMock).toHaveBeenCalled();
            expect(createElementSpy).toHaveBeenCalledWith("a");
            expect(clickMock).toHaveBeenCalled();

            vi.advanceTimersByTime(1100);
            expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:test-url");

            vi.useRealTimers();
            createElementSpy.mockRestore();
        });
    });
});
