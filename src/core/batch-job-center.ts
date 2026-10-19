/**
 * BL-3 批处理作业中心与长耗时任务状态机引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 覆盖六大长耗时作业：导入、AI批量、媒体提取、版本比对、全量导出与批量维护；
 * 2. 细粒度子项进度追踪：显示队列/百分比/成功数/失败数，单项失败不阻塞整体进度；
 * 3. 完整生命周期控制：支持运行（running）、暂停（paused）、取消（cancelled）、失败单独重试（retry-failed-only）；
 * 4. 幂等与断点续跑：持久化作业快照，重启后可识别已完成子项，绝不重复扣减算力或重复建卡。
 */

import { sanitizeSensitiveText } from "./audit-log";

export const BATCH_JOB_TYPES = [
    "import-package",
    "ai-batch-processing",
    "media-extraction",
    "version-diff",
    "export-backup",
    "maintenance-repair",
] as const;

export type BatchJobType = (typeof BATCH_JOB_TYPES)[number];

export type JobStatus =
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "cancelled"
    | "failed";

export type JobItemStatus = "pending" | "processing" | "succeeded" | "failed" | "skipped";

/** 作业单个执行子项 */
export interface BatchJobItem<TInput = unknown, TOutput = unknown> {
    id: string;
    index: number;
    input: TInput;
    status: JobItemStatus;
    output?: TOutput;
    error?: string;
    startedAt?: number;
    finishedAt?: number;
}

/** 完整批处理作业模型 */
export interface BatchJob<TInput = unknown, TOutput = unknown> {
    id: string;
    idempotencyKey?: string;
    type: BatchJobType;
    title: string;
    status: JobStatus;
    items: BatchJobItem<TInput, TOutput>[];
    totalCount: number;
    processedCount: number;
    successCount: number;
    failureCount: number;
    percentage: number; // 0 ~ 100
    createdAt: number;
    startedAt?: number;
    finishedAt?: number;
    cancelRequested?: boolean;
}

/** 批处理作业中心持久化状态 */
export interface BatchJobCenterState {
    version: 1;
    updatedAt: number;
    jobs: BatchJob[];
}

export function createEmptyBatchJobCenterState(now: number = Date.now()): BatchJobCenterState {
    return {
        version: 1,
        updatedAt: now,
        jobs: [],
    };
}

/**
 * 创建新批处理作业（纯函数，返回新 state）：
 * 具备幂等去重能力，相同 idempotencyKey 且未完成时直接复用已有作业。
 */
export function createBatchJob<TInput = unknown, TOutput = unknown>(
    state: BatchJobCenterState,
    params: {
        type: BatchJobType;
        title: string;
        inputs: TInput[];
        idempotencyKey?: string;
        now?: number;
    },
): { nextState: BatchJobCenterState; job: BatchJob<TInput, TOutput> } {
    const ts = params.now ?? Date.now();

    if (params.idempotencyKey) {
        const existing = state.jobs.find(
            j => j.idempotencyKey === params.idempotencyKey && j.status !== "cancelled" && j.status !== "failed",
        );
        if (existing) {
            return { nextState: state, job: existing as BatchJob<TInput, TOutput> };
        }
    }

    const jobId = `job-${params.type}-${ts}-${Math.random().toString(36).substring(2, 6)}`;
    const items: BatchJobItem<TInput, TOutput>[] = params.inputs.map((inp, idx) => ({
        id: `item-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        index: idx,
        input: inp,
        status: "pending",
    }));

    const newJob: BatchJob<TInput, TOutput> = {
        id: jobId,
        idempotencyKey: params.idempotencyKey,
        type: params.type,
        title: sanitizeSensitiveText(params.title, 50),
        status: "pending",
        items,
        totalCount: items.length,
        processedCount: 0,
        successCount: 0,
        failureCount: 0,
        percentage: 0,
        createdAt: ts,
    };

    return {
        nextState: {
            ...state,
            updatedAt: ts,
            jobs: [...state.jobs, newJob as BatchJob],
        },
        job: newJob,
    };
}

/** 请求取消作业 */
export function requestCancelJob(
    state: BatchJobCenterState,
    jobId: string,
    now: number = Date.now(),
): BatchJobCenterState {
    return {
        ...state,
        updatedAt: now,
        jobs: state.jobs.map(j => (j.id === jobId ? { ...j, cancelRequested: true } : j)),
    };
}

/** 暂停作业 */
export function pauseJob(
    state: BatchJobCenterState,
    jobId: string,
    now: number = Date.now(),
): BatchJobCenterState {
    return {
        ...state,
        updatedAt: now,
        jobs: state.jobs.map(j => (j.id === jobId && j.status === "running" ? { ...j, status: "paused" as const } : j)),
    };
}

/** 仅重试失败项：已成功的子项保持不动，将 failed 项重置为 pending */
export function resetFailedItemsForRetry(
    state: BatchJobCenterState,
    jobId: string,
    now: number = Date.now(),
): BatchJobCenterState {
    return {
        ...state,
        updatedAt: now,
        jobs: state.jobs.map(j => {
            if (j.id !== jobId) return j;

            const nextItems = j.items.map(item =>
                item.status === "failed" ? { ...item, status: "pending" as const, error: undefined } : item,
            );

            const processed = nextItems.filter(i => i.status === "succeeded" || i.status === "skipped").length;
            const success = nextItems.filter(i => i.status === "succeeded").length;
            const pct = j.totalCount > 0 ? Math.round((processed / j.totalCount) * 100) : 0;

            return {
                ...j,
                status: "pending" as const,
                cancelRequested: false,
                items: nextItems,
                processedCount: processed,
                successCount: success,
                failureCount: 0,
                percentage: pct,
                finishedAt: undefined,
            };
        }),
    };
}

/**
 * 推进执行作业中的单个子项（纯函数计算更新后的 Job）
 */
export function advanceJobWithItemResult<TInput, TOutput>(
    job: BatchJob<TInput, TOutput>,
    itemId: string,
    result: { success: true; output: TOutput } | { success: false; error: string },
    now: number = Date.now(),
): BatchJob<TInput, TOutput> {
    const isSuccess = result.success;
    const itemOutput = result.success ? result.output : undefined;
    const itemError = "error" in result ? result.error : undefined;

    const nextItems = job.items.map(item => {
        if (item.id !== itemId) return item;

        if (isSuccess) {
            return {
                ...item,
                status: "succeeded" as const,
                output: itemOutput,
                finishedAt: now,
            };
        } else {
            return {
                ...item,
                status: "failed" as const,
                error: sanitizeSensitiveText(itemError || "Unknown error", 80),
                finishedAt: now,
            };
        }
    });

    const success = nextItems.filter(i => i.status === "succeeded").length;
    const failure = nextItems.filter(i => i.status === "failed").length;
    const skipped = nextItems.filter(i => i.status === "skipped").length;
    const processed = success + failure + skipped;
    const pct = job.totalCount > 0 ? Math.round((processed / job.totalCount) * 100) : 100;

    const isAllDone = processed >= job.totalCount;
    let nextStatus: JobStatus = job.status;

    if (job.cancelRequested) {
        nextStatus = "cancelled";
    } else if (isAllDone) {
        nextStatus = failure > 0 && success === 0 ? "failed" : "completed";
    } else {
        nextStatus = "running";
    }

    return {
        ...job,
        status: nextStatus,
        items: nextItems,
        processedCount: processed,
        successCount: success,
        failureCount: failure,
        percentage: pct,
        finishedAt: isAllDone || nextStatus === "cancelled" ? now : undefined,
    };
}
