import { describe, expect, it } from "vitest";
import {
    createEmptyOfflineQueue,
    enqueueOfflineAction,
    replayNextAction,
    removeOfflineAction,
    resolveConflictForceReplay,
    summarizeOfflineQueue,
} from "../src/core/offline-action-queue";
import type {
    OfflineActionQueueState,
    ActionHandlerResult,
} from "../src/core/offline-action-queue";

describe("offline-action-queue (BL-8 离线动作队列、幂等重放与冲突保护引擎)", () => {
    it("空队列初始化正确", () => {
        const q = createEmptyOfflineQueue(1000);
        expect(q.version).toBe(1);
        expect(q.updatedAt).toBe(1000);
        expect(q.items).toHaveLength(0);
    });

    it("离线动作入队并基于 idempotencyKey 严格幂等去重", () => {
        let q = createEmptyOfflineQueue(1000);

        // 第一次入队
        q = enqueueOfflineAction(q, {
            type: "create-card",
            idempotencyKey: "card-create-note-101",
            payload: { prompt: "问题A", answer: "答案A" },
            now: 2000,
        });

        expect(q.items).toHaveLength(1);
        expect(q.items[0].idempotencyKey).toBe("card-create-note-101");
        expect(q.items[0].status).toBe("pending");
        expect((q.items[0].payload as any).prompt).toBe("问题A");

        // 相同幂等键再次入队（如断网期间用户反复点击提交或修改了内容）
        q = enqueueOfflineAction(q, {
            type: "create-card",
            idempotencyKey: "card-create-note-101",
            payload: { prompt: "问题A修正版", answer: "答案A" },
            now: 2500,
        });

        // 核心断言：长度依然是 1，payload 原地安全更新，绝不重复生成新条目
        expect(q.items).toHaveLength(1);
        expect((q.items[0].payload as any).prompt).toBe("问题A修正版");
        expect(q.items[0].queuedAt).toBe(2500);
    });

    it("顺序重放成功路径：replayNextAction 转移为 completed 并更新时间戳", async () => {
        let q = createEmptyOfflineQueue(1000);
        q = enqueueOfflineAction(q, {
            type: "write-report",
            idempotencyKey: "report-week-42",
            payload: { title: "第42周周报" },
            now: 1100,
        });

        const replayedPayloads: any[] = [];
        const { nextState, replayedAction, result } = await replayNextAction(q, async (action) => {
            replayedPayloads.push(action.payload);
            return { success: true };
        }, 3000);

        expect(result?.success).toBe(true);
        expect(replayedAction?.idempotencyKey).toBe("report-week-42");
        expect(replayedPayloads).toEqual([{ title: "第42周周报" }]);

        const item = nextState.items[0];
        expect(item.status).toBe("completed");
        expect(item.replayedAt).toBe(3000);
    });

    it("冲突检测与安全阻断：远端在此期间被修改时，禁止静默覆盖，生成冲突预览并暂停", async () => {
        let q = createEmptyOfflineQueue(1000);
        q = enqueueOfflineAction(q, {
            type: "create-card",
            idempotencyKey: "card-edit-block-99",
            payload: { blockId: "block-99", newMarkdown: "离线修改的内容" },
            now: 1100,
        });

        const { nextState } = await replayNextAction(q, async (action) => {
            // 模拟远端版本比对发现冲突
            return {
                success: false,
                conflict: {
                    targetId: "block-99",
                    expectedBaseline: "原本旧笔记内容",
                    currentActual: "远端其他设备修改后的新内容",
                    reasonKey: "offlineQueue.conflict.modifiedRemotely",
                },
            };
        }, 4000);

        const item = nextState.items[0];
        expect(item.status).toBe("conflict-blocked");
        expect(item.conflictPreview).toBeDefined();
        expect(item.conflictPreview?.targetId).toBe("block-99");
        expect(item.conflictPreview?.expectedBaseline).toBe("原本旧笔记内容");
        expect(item.conflictPreview?.currentActual).toBe("远端其他设备修改后的新内容");
        expect(item.conflictPreview?.conflictReasonKey).toBe("offlineQueue.conflict.modifiedRemotely");

        // 人工确认以本地版本强制覆盖重试
        const resolvedState = resolveConflictForceReplay(nextState, item.id, 5000);
        expect(resolvedState.items[0].status).toBe("pending");
        expect(resolvedState.items[0].conflictPreview).toBeUndefined();
    });

    it("失败重试机制：在 maxRetries 范围内保持 pending，耗尽后转为 failed", async () => {
        let q = createEmptyOfflineQueue(1000);
        q = enqueueOfflineAction(q, {
            type: "export-backup",
            idempotencyKey: "backup-attempt-1",
            payload: {},
            maxRetries: 2,
            now: 1100,
        });

        // 第一次失败（retryCount: 0 -> 1 < 2，保持 pending）
        const attempt1 = await replayNextAction(q, async () => {
            return { success: false, retryable: true, error: "Network timeout" };
        });
        expect(attempt1.nextState.items[0].status).toBe("pending");
        expect(attempt1.nextState.items[0].retryCount).toBe(1);
        expect(attempt1.nextState.items[0].lastError).toBe("Network timeout");

        // 第二次失败（retryCount: 1 -> 2 >= 2，耗尽转为 failed）
        const attempt2 = await replayNextAction(attempt1.nextState, async () => {
            return { success: false, retryable: true, error: "Network timeout again" };
        });
        expect(attempt2.nextState.items[0].status).toBe("failed");
        expect(attempt2.nextState.items[0].retryCount).toBe(2);
    });

    it("概览统计与移除动作", () => {
        let q = createEmptyOfflineQueue();
        q = enqueueOfflineAction(q, { type: "create-card", idempotencyKey: "k1", payload: {} });
        q = enqueueOfflineAction(q, { type: "create-card", idempotencyKey: "k2", payload: {} });

        let stats = summarizeOfflineQueue(q);
        expect(stats.total).toBe(2);
        expect(stats.pendingCount).toBe(2);

        // 移除其中一项
        const targetId = q.items[0].id;
        q = removeOfflineAction(q, targetId);
        stats = summarizeOfflineQueue(q);
        expect(stats.total).toBe(1);
        expect(stats.items?.length).toBeUndefined();
    });
});
