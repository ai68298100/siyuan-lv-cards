import { describe, expect, it } from "vitest";
import {
    cancelAllActiveJobs,
    findUnfinishedAIJob,
    getRecoverableJobSummaries,
    isJobReviewable,
    prepareReviewableJob,
} from "../src/core/ai-job-recovery";
import { createJob, type AIJob } from "../src/core/ai-jobs";

describe("ai-job-recovery 作业状态机与断点恢复引擎", () => {
    const makeJob = (overrides: Partial<AIJob> = {}): AIJob => {
        const id = overrides.id ?? `job-${Math.random().toString(36).slice(2)}`;
        const base = createJob(
            id,
            { type: "doc", label: "测试材料", excerpt: "材料摘要" },
            { provider: "siyuan", model: "default", count: 5, language: "zh-CN", type: "qa" },
        );
        return { ...base, ...overrides };
    };

    describe("findUnfinishedAIJob 写入未完成判定", () => {
        it("无未完成作业时返回 null", () => {
            const jobs = [
                makeJob({ status: "done" }),
                makeJob({ status: "drafting" }),
            ];
            expect(findUnfinishedAIJob(jobs)).toBeNull();
        });

        it("检测到 committing 状态且有 pending 候选的作业并统计完成与失败数", () => {
            const job = makeJob({
                id: "job-committing-1",
                status: "committing",
                candidates: [
                    { q: "q1", a: "a1", status: "created" },
                    { q: "q2", a: "a2", status: "failed", error: "写入错误" },
                    { q: "q3", a: "a3", status: "pending" },
                ],
            });
            const result = findUnfinishedAIJob([job]);
            expect(result).not.toBeNull();
            expect(result?.id).toBe("job-committing-1");
            expect(result?.done).toBe(1);
            expect(result?.total).toBe(3);
            expect(result?.failed).toEqual([{ index: 1, q: "q2", error: "写入错误" }]);
        });
    });

    describe("isJobReviewable 可恢复审核状态校验", () => {
        it("处于 reviewing 且全部候选为 pending 时返回 true", () => {
            const job = makeJob({
                status: "reviewing",
                candidates: [
                    { q: "q1", a: "a1", status: "pending" },
                    { q: "q2", a: "a2", status: "pending" },
                ],
            });
            expect(isJobReviewable(job)).toBe(true);
        });

        it("处于 failed/canceled 且断点目标为 reviewing 时返回 true", () => {
            const job = makeJob({
                status: "canceled",
                resumeTo: "reviewing",
                candidates: [{ q: "q1", a: "a1", status: "pending" }],
            });
            expect(isJobReviewable(job)).toBe(true);
        });

        it("候选存在已落盘 created 或已有失败记录时不满足全量待审要求", () => {
            const job = makeJob({
                status: "reviewing",
                candidates: [
                    { q: "q1", a: "a1", status: "created" },
                    { q: "q2", a: "a2", status: "pending" },
                ],
            });
            expect(isJobReviewable(job)).toBe(false);
        });
    });

    describe("getRecoverableJobSummaries 作业摘要提取与排序", () => {
        it("过滤已完成作业并按更新时间倒序排序", () => {
            const jobOld = makeJob({
                id: "j-old",
                status: "committing",
                updatedAt: 1000,
                candidates: [{ q: "q1", a: "a1", status: "pending" }],
            });
            const jobNew = makeJob({
                id: "j-new",
                status: "reviewing",
                updatedAt: 2000,
                candidates: [{ q: "q2", a: "a2", status: "pending" }],
            });
            const jobDone = makeJob({ id: "j-done", status: "done", updatedAt: 3000 });

            const summaries = getRecoverableJobSummaries([jobOld, jobNew, jobDone]);
            expect(summaries.map(s => s.id)).toEqual(["j-new", "j-old"]);
            expect(summaries[0].canReview).toBe(true);
            expect(summaries[1].needsWriteCheck).toBe(true);
        });
    });

    describe("prepareReviewableJob 准备恢复审核", () => {
        it("对 canceled 状态的作业进行断点 RESUME 流转", () => {
            const job = makeJob({
                id: "j-canceled",
                status: "canceled",
                resumeTo: "reviewing",
                candidates: [{ q: "q1", a: "a1", status: "pending" }],
            });

            const prepared = prepareReviewableJob(job);
            expect(prepared).not.toBeNull();
            expect(prepared?.resumed).toBe(true);
            expect(prepared?.job.status).toBe("reviewing");
            expect(prepared?.view.candidates).toHaveLength(1);
            expect(prepared?.view.candidates[0].origIndex).toBe(0);
        });

        it("不可恢复作业返回 null", () => {
            const job = makeJob({ status: "done" });
            expect(prepareReviewableJob(job)).toBeNull();
        });
    });

    describe("cancelAllActiveJobs 紧急取消所有活动作业", () => {
        it("将处于活动状态的作业批量流转为 canceled", () => {
            const j1 = makeJob({ id: "j1", status: "generating" });
            const j2 = makeJob({ id: "j2", status: "reviewing" });
            const j3 = makeJob({ id: "j3", status: "done" });

            const result = cancelAllActiveJobs([j1, j2, j3]);
            expect(result.modified).toBe(true);
            expect(result.canceledCount).toBe(2);
            expect(result.jobs.find(j => j.id === "j1")?.status).toBe("canceled");
            expect(result.jobs.find(j => j.id === "j2")?.status).toBe("canceled");
            expect(result.jobs.find(j => j.id === "j3")?.status).toBe("done");
        });
    });
});
