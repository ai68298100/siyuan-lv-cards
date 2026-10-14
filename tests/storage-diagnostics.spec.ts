import { describe, expect, it, vi } from "vitest";
import {
    computeStorageStats,
    probeAnkiConnection,
    type StorageStatsInput,
} from "../src/core/storage-diagnostics";

describe("storage-diagnostics 存储体检与外部连接探测", () => {
    describe("computeStorageStats 存储健康摘要计算", () => {
        const input: StorageStatsInput = {
            settingsVersion: 2,
            revlogCount: 150,
            suspendTodayCount: 5,
            examPlansCount: 2,
            aiBatchesCount: 10,
            aiJobsCount: 3,
            knowledgeObjectsCount: 8,
            relationsCount: 12,
            errorTagsCount: 4,
            inboxCount: 20,
            learningGoalsCount: 1,
            entryContextsCount: 6,
            contentLifecyclesCount: 9,
            killSwitchDisabledCount: 1,
            killSwitchQuarantinedCount: 0,
            storageLastWrite: {
                "settings.json": 1700000000000,
                "revlog.json": 1700000005000,
            },
        };

        it("输出全部 14 个私有存储文件的体检行并正确格式化", () => {
            const rows = computeStorageStats(input);
            expect(rows).toHaveLength(14);

            const settingsRow = rows.find(r => r.file === "settings.json");
            expect(settingsRow).toEqual({
                file: "settings.json",
                size: "v2",
                lastWrite: 1700000000000,
            });

            const revlogRow = rows.find(r => r.file === "revlog.json");
            expect(revlogRow).toEqual({
                file: "revlog.json",
                size: "150 entries",
                lastWrite: 1700000005000,
            });

            const inboxRow = rows.find(r => r.file === "inbox.json");
            expect(inboxRow).toEqual({
                file: "inbox.json",
                size: "20 items (BI-4)",
                lastWrite: 0,
            });
        });
    });

    describe("probeAnkiConnection AnkiConnect 联通测试", () => {
        const i18n = {
            ankiTestOk: "连接成功",
            ankiTestFail: "连接失败",
        };

        it("探测成功返回版本号", async () => {
            const fetchVersion = vi.fn().mockResolvedValue("6");
            const result = await probeAnkiConnection("http://127.0.0.1:8765", "key-1", i18n, fetchVersion);
            expect(fetchVersion).toHaveBeenCalledWith("http://127.0.0.1:8765", "key-1");
            expect(result).toBe("连接成功 (v6)");
        });

        it("探测失败格式化错误信息", async () => {
            const fetchVersion = vi.fn().mockRejectedValue(new Error("Connection refused"));
            const result = await probeAnkiConnection("http://127.0.0.1:8765", "", i18n, fetchVersion);
            expect(result).toBe("连接失败: Connection refused");
        });
    });
});
