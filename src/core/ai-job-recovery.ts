/**
 * AI 批次作业状态机与断点恢复管理引擎（ADR-7 / BU-31）
 * 集中管理未完成作业判定、可恢复审核候选检索、多作业状态流转与紧急熔断取消。
 */

import { transitionJob, type AIJob } from "./ai-jobs";

export interface UnfinishedJobSummary {
    id: string;
    done: number;
    total: number;
    failed: Array<{ index: number; q: string; error: string }>;
}

/**
 * 检索写入阶段的未完成作业（用于总览页与工作台提示）
 */
export function findUnfinishedAIJob(jobs: AIJob[]): UnfinishedJobSummary | null {
    const j = jobs.find(job =>
        (job.status === "committing" || job.status === "failed" || job.status === "canceled")
        && job.candidates.some(c => c.status === "pending"),
    );
    if (!j) {
        return null;
    }
    return {
        id: j.id,
        done: j.candidates.filter(c => c.status === "created").length,
        total: j.candidates.length,
        failed: j.candidates
            .map((c, index) => ({ index, q: c.q, error: c.error ?? "" }))
            .filter(c => c.error !== ""),
    };
}

/**
 * 校验作业是否处于可恢复审核状态（未落盘且所有候选均为 pending）
 */
export function isJobReviewable(job: AIJob): boolean {
    const reviewState = job.status === "reviewing"
        || ((job.status === "failed" || job.status === "canceled") && job.resumeTo === "reviewing");
    return reviewState && job.candidates.length > 0
        && job.candidates.every(candidate => candidate.status === "pending");
}

export interface RecoverableJobSummary {
    id: string;
    status: string;
    pending: number;
    failed: number;
    created: number;
    source: string;
    canReview: boolean;
    needsWriteCheck: boolean;
    deckID: string;
}

/**
 * 获取可恢复作业摘要列表（按最后更新时间倒序排序，不向宿主外泄候选明文）
 */
export function getRecoverableJobSummaries(jobs: AIJob[], unknownLabel = "unknown"): RecoverableJobSummary[] {
    return jobs
        .filter(job => job.status !== "done")
        .map(job => ({
            id: job.id,
            status: job.status,
            pending: job.candidates.filter(candidate => candidate.status === "pending").length,
            failed: job.candidates.filter(candidate => candidate.status === "failed").length,
            created: job.candidates.filter(candidate => candidate.status === "created").length,
            source: job.source.label || job.source.type || unknownLabel,
            canReview: isJobReviewable(job),
            needsWriteCheck: job.status === "committing"
                || ((job.status === "failed" || job.status === "canceled") && job.resumeTo === "committing"),
            deckID: job.deckID,
            updatedAt: job.updatedAt,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(({ updatedAt: _updatedAt, ...job }) => job);
}

export interface ReviewableJobPayload {
    job: AIJob;
    resumed: boolean;
    view: {
        id: string;
        sourceLabel: string;
        candidates: Array<{
            q: string;
            a: string;
            d?: any;
            origIndex: number;
        }>;
    };
}

/**
 * 准备作业进入审核状态（若处于 failed/canceled 则自动推进状态机为 reviewing）
 */
export function prepareReviewableJob(job: AIJob, unknownLabel = "unknown"): ReviewableJobPayload | null {
    if (!isJobReviewable(job)) {
        return null;
    }
    let targetJob = job;
    let resumed = false;
    if (targetJob.status !== "reviewing") {
        const transitionResult = transitionJob(targetJob, { type: "RESUME" });
        if (!transitionResult.ok) {
            return null;
        }
        targetJob = transitionResult.job;
        resumed = true;
    }
    return {
        job: targetJob,
        resumed,
        view: {
            id: targetJob.id,
            sourceLabel: targetJob.source.label || targetJob.source.type || unknownLabel,
            candidates: targetJob.candidates.map((candidate, origIndex) => ({
                q: candidate.q,
                a: candidate.a,
                ...(candidate.d ? { d: candidate.d } : {}),
                origIndex,
            })),
        },
    };
}

export interface CancelJobsResult {
    modified: boolean;
    canceledCount: number;
    jobs: AIJob[];
}

/**
 * 取消所有活动状态的作业（BU-31 紧急停用/清理待发队列）
 */
export function cancelAllActiveJobs(jobs: AIJob[]): CancelJobsResult {
    let canceledCount = 0;
    const nextJobs = jobs.map(job => {
        if (["drafting", "generating", "reviewing", "committing"].includes(job.status)) {
            const res = transitionJob(job, { type: "CANCEL" });
            if (res.ok) {
                canceledCount++;
                return res.job;
            }
        }
        return job;
    });
    return {
        modified: canceledCount > 0,
        canceledCount,
        jobs: nextJobs,
    };
}
