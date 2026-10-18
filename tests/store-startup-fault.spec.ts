import { describe, expect, it, vi } from "vitest";
import { zipLoaded, loadStore } from "../src/libs/store";
import { defaultSettings, normalizeSettings, type LvCardsSettings } from "../src/core/settings";
import { emptyRevlog, normalizeRevlog } from "../src/core/revlog";
import { normalizeSuspendToday } from "../src/core/suspend-today";
import { normalizeExamPlans } from "../src/core/exam";
import { normalizeSessionState } from "../src/core/session-state";
import { normalizeKnowledgeObjects } from "../src/core/knowledge-objects";
import { normalizeCardRelations } from "../src/core/card-relations";
import { normalizeErrorTags } from "../src/core/error-reasons";
import { normalizeInbox } from "../src/core/inbox";
import { normalizeGoals } from "../src/core/learning-goal";
import { normalizeSourceHealth } from "../src/core/source-health-store";
import { normalizeLedger } from "../src/core/anki-import";
import { normalizeCostLedger } from "../src/core/ai-cost-ledger";
import { createEmptyRepairJournal } from "../src/core/maintenance-repair";
import { emptyAIBatches, normalizeAIBatches } from "../src/core/ai-batches";
import { emptyAIJobs, normalizeAIJobs } from "../src/core/ai-jobs";

describe("store startup fault tolerance & snapshot resilience (P0 风险闭环)", () => {
    describe("zipLoaded: 键值对齐与错位防御", () => {
        it("strictly maps keys and values by array index", () => {
            const keys = ["k1", "k2", "k3"] as const;
            const values = [{ id: 1 }, "string-val", [1, 2]];

            const res = zipLoaded(keys, values);
            expect(res).toEqual({
                k1: { id: 1 },
                k2: "string-val",
                k3: [1, 2],
            });
        });

        it("throws loud error on length mismatch to prevent misattributing store payloads", () => {
            const keys = ["settings", "revlog", "session"] as const;
            expect(() => zipLoaded(keys, [1, 2])).toThrow("load mismatch: 3 keys vs 2 values");
            expect(() => zipLoaded(keys, [1, 2, 3, 4])).toThrow("load mismatch: 3 keys vs 4 values");
        });
    });

    describe("readAllStores pattern: 坏槽位单键故障隔离模拟", () => {
        const ALL_KEYS = [
            "settings.json",
            "revlog.json",
            "suspend-today.json",
            "exam-plans.json",
            "ai-batches.json",
            "session-state.json",
            "ai-jobs.json",
            "knowledge-objects.json",
            "relations.json",
            "error-tags.json",
            "inbox.json",
            "learning-goals.json",
            "source-health.json",
            "ai-cost-ledger.json",
            "maintenance-repair-journal.json",
        ] as const;

        it("survives single or multiple slot disk errors without crashing startup batch", async () => {
            // 模拟思源底层 loadData：其中 revlog.json 磁盘损坏，ai-jobs.json 权限拒绝
            const mockLoadData = vi.fn().mockImplementation(async (key: string) => {
                if (key === "revlog.json") throw new Error("EIO: disk I/O error");
                if (key === "ai-jobs.json") throw new Error("EACCES: permission denied");
                if (key === "settings.json") return { dailyNewTarget: 30 };
                return null;
            });

            // 按照 src/index.ts readAllStores() 规范运行
            const values = await Promise.all(ALL_KEYS.map(async key => {
                try {
                    return await mockLoadData(key);
                } catch {
                    return undefined;
                }
            }));

            const loaded = zipLoaded(ALL_KEYS, values);

            expect(loaded["revlog.json"]).toBeUndefined();
            expect(loaded["ai-jobs.json"]).toBeUndefined();
            expect(loaded["settings.json"]).toEqual({ dailyNewTarget: 30 });
            expect(loaded["suspend-today.json"]).toBeNull();
        });
    });

    describe("applyLoadedStores: 坏槽位 normalize 纯默认值兜底", () => {
        it("defaults every critical store safely when undefined or malformed is passed", () => {
            // 1. Settings 兜底
            const settings = normalizeSettings(undefined);
            expect(settings.dailyNewTarget).toBe(defaultSettings().dailyNewTarget);
            expect(settings.modules).toBeDefined();

            // 2. Revlog 兜底
            const revlog = normalizeRevlog(undefined);
            expect(revlog.entries).toEqual([]);
            expect(revlog.days).toEqual({});

            // 3. SuspendToday 兜底
            const suspend = normalizeSuspendToday(undefined);
            expect(suspend.cardIDs).toEqual([]);

            // 4. ExamPlans 兜底
            const exam = normalizeExamPlans(undefined);
            expect(exam.version).toBe(1);
            expect(exam.plans).toEqual([]);

            // 5. SessionState 兜底
            const session = normalizeSessionState(undefined, "20261019");
            expect(session.date).toBe("");
            expect(session.reviewedIDs).toEqual([]);
            expect(session.counters.review).toBe(0);

            // 6. KnowledgeObjects 兜底
            const ko = normalizeKnowledgeObjects(undefined);
            expect(ko.objects).toEqual([]);

            // 7. CardRelations 兜底
            const rel = normalizeCardRelations(undefined);
            expect(rel.relations).toEqual([]);

            // 8. ErrorTags 兜底
            const errTags = normalizeErrorTags(undefined);
            expect(errTags.tags).toEqual([]);

            // 9. Inbox 兜底
            const inbox = normalizeInbox(undefined);
            expect(inbox.items).toEqual([]);

            // 10. LearningGoals 兜底
            const goals = normalizeGoals(undefined);
            expect(goals.goals).toEqual([]);

            // 11. SourceHealth 兜底
            const health = normalizeSourceHealth(undefined);
            expect(health.entries).toEqual([]);

            // 12. Anki Ledger 兜底 (返回 LedgerEntry[])
            const ankiLedger = normalizeLedger(undefined);
            expect(ankiLedger).toEqual([]);

            // 13. AI Cost Ledger 兜底
            const costLedger = normalizeCostLedger(undefined);
            expect(costLedger.entries).toEqual([]);

            // 14. Maintenance Repair Journal 兜底
            const journal = createEmptyRepairJournal();
            expect(journal.entries).toEqual([]);

            // 15. AI Batches 兜底 (通过 TypedStore 模式)
            const batches = normalizeAIBatches(undefined);
            expect(batches.batches).toEqual([]);

            // 16. AI Jobs 兜底
            const jobs = normalizeAIJobs(undefined);
            expect(jobs.jobs).toEqual([]);
        });
    });

    describe("loadStore: TypedStore 运行时安全与 fallback 保证", () => {
        it("returns preloaded clean state without calling loadData when preloaded is provided", async () => {
            const loadData = vi.fn();
            const res = await loadStore(
                { loadData },
                {
                    key: "test.json",
                    fallback: emptyAIBatches,
                    normalize: normalizeAIBatches,
                },
                { batches: [] }
            );

            expect(res).toEqual({ version: 1, batches: [] });
            expect(loadData).not.toHaveBeenCalled();
        });

        it("catches loadData exceptions and falls back to clean default", async () => {
            const loadData = vi.fn().mockRejectedValue(new Error("read failed"));
            const res = await loadStore(
                { loadData },
                {
                    key: "ai-jobs.json",
                    fallback: emptyAIJobs,
                    normalize: normalizeAIJobs,
                }
            );

            expect(res).toEqual({ version: 1, jobs: [] });
            expect(loadData).toHaveBeenCalledWith("ai-jobs.json");
        });
    });

    describe("Immutable disk snapshot isolation: 内存修改隔离与安全回滚基线", () => {
        it("ensures persistedSettingsSnapshot is an isolated clone and immune to running state mutations", () => {
            const rawDisk = { dailyNewTarget: 20, sessionBudgetMin: 15 };
            const settings: LvCardsSettings = normalizeSettings(rawDisk);
            const persistedSettingsSnapshot = normalizeSettings(JSON.parse(JSON.stringify(settings)));

            // 模拟用户在前端修改配置或进行复习（内存运行态发生变化）
            settings.dailyNewTarget = 999;
            settings.sessionBudgetMin = 60;

            // 快照必须保持不变，代表真实的磁盘基线
            expect(persistedSettingsSnapshot.dailyNewTarget).toBe(20);
            expect(persistedSettingsSnapshot.sessionBudgetMin).toBe(15);

            // 模拟保存失败回滚：从 persistedSettingsSnapshot 恢复
            const rolledBack = normalizeSettings(JSON.parse(JSON.stringify(persistedSettingsSnapshot)));
            expect(rolledBack.dailyNewTarget).toBe(20);
            expect(rolledBack.sessionBudgetMin).toBe(15);
        });

        it("ensures session state snapshot remains isolated during active review mutations", () => {
            const rawSession = {
                date: "20261019",
                reviewedIDs: ["card-1"],
                counters: { review: 1 },
            };
            const session = normalizeSessionState(rawSession, "20261019");
            const persistedSnapshot = JSON.parse(JSON.stringify(session));

            // 在专注复习中实时答题（内存状态变化）
            session.reviewedIDs.push("card-2");
            session.counters.review = 2;

            // 磁盘快照完好如初
            expect(persistedSnapshot.reviewedIDs).toEqual(["card-1"]);
            expect(persistedSnapshot.counters.review).toBe(1);
        });
    });
});
