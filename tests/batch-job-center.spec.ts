import { describe, expect, it } from "vitest";
import {
    BATCH_JOB_TYPES,
    createEmptyBatchJobCenterState,
    createBatchJob,
    advanceJobWithItemResult,
    pauseJob,
    requestCancelJob,
    resetFailedItemsForRetry,
} from "../src/core/batch-job-center";
import type { BatchJobCenterState } from "../src/core/batch-job-center";

describe("batch-job-center (BL-3 批处理作业中心与长耗时任务状态机引擎)", () => {
    it("包含六大批处理作业类型", () => {
        expect(BATCH_JOB_TYPES).toEqual([
            "import-package",
            "ai-batch-processing",
            "media-extraction",
            "version-diff",
            "export-backup",
            "maintenance-repair",
        ]);
    });

    it("创建新作业并细分为有序子项，初始状态为 pending，百分比为 0", () => {
        const state = createEmptyBatchJobCenterState(1000);
        const { nextState, job } = createBatchJob(state, {
            type: "import-package",
            title: "导入医学闪卡包",
            inputs: ["card-1", "card-2", "card-3"],
            now: 2000,
        });

        expect(nextState.jobs).toHaveLength(1);
        expect(job.status).toBe("pending");
        expect(job.totalCount).toBe(3);
        expect(job.processedCount).toBe(0);
        expect(job.percentage).toBe(0);
        expect(job.items).toHaveLength(3);
        expect(job.items[0].status).toBe("pending");
        expect(job.items[0].input).toBe("card-1");
    });

    it("相同 idempotencyKey 幂等去重：未完成作业直接复用，不重复开辟新作业", () => {
        let state = createEmptyBatchJobCenterState(1000);
        const res1 = createBatchJob(state, {
            type: "ai-batch-processing",
            title: "AI 批量拆卡",
            inputs: ["note-1"],
            idempotencyKey: "ai-batch-doc-99",
            now: 1500,
        });
        state = res1.nextState;
        expect(state.jobs).toHaveLength(1);

        // 重复触发相同幂等键作业
        const res2 = createBatchJob(state, {
            type: "ai-batch-processing",
            title: "AI 批量拆卡（重发）",
            inputs: ["note-1"],
            idempotencyKey: "ai-batch-doc-99",
            now: 1600,
        });

        // 核心断言：复用既有作业，状态库长度依然为 1
        expect(res2.nextState.jobs).toHaveLength(1);
        expect(res2.job.id).toBe(res1.job.id);
    });

    it("逐项推进成功路径：百分比与计数实时累积，全部完成后状态为 completed", () => {
        const state = createEmptyBatchJobCenterState();
        let { job } = createBatchJob<string, string>(state, {
            type: "media-extraction",
            title: "媒体提取",
            inputs: ["img1.png", "img2.png"],
        });

        const id0 = job.items[0].id;
        const id1 = job.items[1].id;

        // 推进第 1 项
        job = advanceJobWithItemResult(job, id0, { success: true, output: "sha256-1" }, 3000);
        expect(job.status).toBe("running");
        expect(job.processedCount).toBe(1);
        expect(job.successCount).toBe(1);
        expect(job.percentage).toBe(50);
        expect(job.items[0].status).toBe("succeeded");
        expect(job.items[0].output).toBe("sha256-1");

        // 推进第 2 项
        job = advanceJobWithItemResult(job, id1, { success: true, output: "sha256-2" }, 4000);
        expect(job.status).toBe("completed");
        expect(job.processedCount).toBe(2);
        expect(job.successCount).toBe(2);
        expect(job.percentage).toBe(100);
        expect(job.finishedAt).toBe(4000);
    });

    it("单项失败不阻塞整体进度，完成状态反映部分成功（部分成功视为 completed，全部失败视为 failed）", () => {
        const state = createEmptyBatchJobCenterState();
        let { job } = createBatchJob<string, string>(state, {
            type: "version-diff",
            title: "版本对比",
            inputs: ["diff-a", "diff-b"],
        });

        const id0 = job.items[0].id;
        const id1 = job.items[1].id;

        // 第 1 项成功，第 2 项失败
        job = advanceJobWithItemResult(job, id0, { success: true, output: "ok" });
        job = advanceJobWithItemResult(job, id1, { success: false, error: "Network 404" });

        expect(job.status).toBe("completed"); // 包含成功项，整体按完成报账
        expect(job.successCount).toBe(1);
        expect(job.failureCount).toBe(1);
        expect(job.percentage).toBe(100);
        expect(job.items[1].status).toBe("failed");
        expect(job.items[1].error).toBe("Network 404");
    });

    it("仅重试失败项（resetFailedItemsForRetry）：已成功项保持不变，失败项重置为 pending", () => {
        const state = createEmptyBatchJobCenterState();
        let { nextState, job } = createBatchJob<string, string>(state, {
            type: "export-backup",
            title: "备份导出",
            inputs: ["item-ok", "item-err"],
        });

        // 推进项
        job = advanceJobWithItemResult(job, job.items[0].id, { success: true, output: "saved" });
        job = advanceJobWithItemResult(job, job.items[1].id, { success: false, error: "Disk full" });

        nextState.jobs = [job];

        // 触发仅重试失败项
        const retriedState = resetFailedItemsForRetry(nextState, job.id, 5000);
        const retriedJob = retriedState.jobs[0];

        expect(retriedJob.status).toBe("pending");
        expect(retriedJob.items[0].status).toBe("succeeded"); // 成功项不重新执行
        expect(retriedJob.items[1].status).toBe("pending"); // 失败项被重置
        expect(retriedJob.items[1].error).toBeUndefined();
        expect(retriedJob.successCount).toBe(1);
        expect(retriedJob.failureCount).toBe(0);
        expect(retriedJob.processedCount).toBe(1);
        expect(retriedJob.percentage).toBe(50);
    });

    it("暂停与取消作业生命周期", () => {
        let state = createEmptyBatchJobCenterState();
        const { nextState, job } = createBatchJob(state, {
            type: "maintenance-repair",
            title: "批量维护",
            inputs: ["card-1", "card-2"],
        });
        state = nextState;

        // 模拟开始运行
        state.jobs[0].status = "running";

        // 暂停
        state = pauseJob(state, job.id, 3000);
        expect(state.jobs[0].status).toBe("paused");

        // 请求取消
        state = requestCancelJob(state, job.id, 4000);
        expect(state.jobs[0].cancelRequested).toBe(true);

        // 下一次子项结算时触发取消终态
        const cancelledJob = advanceJobWithItemResult(state.jobs[0], state.jobs[0].items[0].id, {
            success: true,
            output: "done",
        });
        expect(cancelledJob.status).toBe("cancelled");
    });
});
