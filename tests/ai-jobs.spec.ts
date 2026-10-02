import { describe, expect, it } from "vitest";
import {
    transitionJob, createJob, firstPendingIndex, normalizeAIJobs, pruneJobs,
    type AIJob, type AIJobCandidate,
} from "../src/core/ai-jobs";

const NOW = 1_800_000_000_000;
const mkJob = (over: Partial<AIJob> = {}): AIJob => ({
    id: "j1",
    createdAt: NOW,
    updatedAt: NOW,
    source: { type: "doc", label: "笔记 A", excerpt: "首段……" },
    cfg: { count: 5, language: "中文", type: "qa" },
    deckID: "",
    status: "drafting",
    candidates: [],
    ...over,
});
const cands = (n: number): AIJobCandidate[] =>
    Array.from({ length: n }, (_, i) => ({ q: `Q${i}`, a: `A${i}`, keep: true, status: "pending" as const }));

describe("AI 批次作业状态机（ADR-7 迁移表）", () => {
    it("主链：drafting→generating→reviewing→committing→done", () => {
        let j = createJob("j1", { type: "doc", label: "笔记 A", excerpt: "x" }, { count: 2, language: "中文", type: "qa" }, NOW);
        j = transitionJob(j, { type: "GENERATE_START" }).job;
        expect(j.status).toBe("generating");
        j = transitionJob(j, { type: "GENERATE_OK", candidates: cands(2) }).job;
        expect(j.status).toBe("reviewing");
        expect(j.candidates.every(c => c.status === "pending")).toBe(true);
        j = transitionJob(j, { type: "COMMIT_START", deckID: "d1" }).job;
        expect(j.deckID).toBe("d1");
        j = transitionJob(j, { type: "CARD_CREATED", index: 0, blockID: "b1" }).job;
        j = transitionJob(j, { type: "CARD_CREATED", index: 1, blockID: "b2" }).job;
        const done = transitionJob(j, { type: "COMMIT_DONE" });
        expect(done.ok).toBe(true);
        expect(done.job.status).toBe("done");
    });

    it("生成失败落 failed 并记录 resumeTo，RESUME 回迁", () => {
        let j = transitionJob(createJob("j", { type: "doc", label: "", excerpt: "" }, { count: 5, language: "中文", type: "qa" }, NOW), { type: "GENERATE_START" }).job;
        j = transitionJob(j, { type: "GENERATE_FAIL", error: "AI HTTP 500" }).job;
        expect(j.status).toBe("failed");
        expect(j.resumeTo).toBe("generating");
        expect(j.error).toBe("AI HTTP 500");
        const r = transitionJob(j, { type: "RESUME" });
        expect(r.ok).toBe(true);
        expect(r.job.status).toBe("generating");
        expect(r.job.error).toBeUndefined();
    });

    it("committing 中取消：已创建卡保留，RESUME 回 committing 续传", () => {
        let j = mkJob({ status: "reviewing", candidates: cands(3) });
        j = transitionJob(j, { type: "COMMIT_START", deckID: "d" }).job;
        j = transitionJob(j, { type: "CARD_CREATED", index: 0, blockID: "b0" }).job;
        j = transitionJob(j, { type: "CANCEL" }).job;
        expect(j.status).toBe("canceled");
        expect(j.resumeTo).toBe("committing");
        expect(j.candidates[0].status).toBe("created"); // 已创建如实保留
        j = transitionJob(j, { type: "RESUME" }).job;
        expect(j.status).toBe("committing");
        expect(firstPendingIndex(j)).toBe(1); // 续传只处理 pending
    });

    it("非法迁移返回 ok:false 且 job 不变", () => {
        const j = mkJob({ status: "drafting" });
        const r = transitionJob(j, { type: "COMMIT_DONE" });
        expect(r.ok).toBe(false);
        expect(r.reason).toContain("illegal");
        expect(r.job).toBe(j); // 原样返回
        const r2 = transitionJob(mkJob({ status: "done" }), { type: "RESUME" });
        expect(r2.ok).toBe(false);
    });

    it("CARD_CREATED 越界拒绝；有 pending 时 COMMIT_DONE 拒绝", () => {
        let j = mkJob({ status: "committing", candidates: cands(2), deckID: "d" });
        expect(transitionJob(j, { type: "CARD_CREATED", index: 5, blockID: "b" }).ok).toBe(false);
        const r = transitionJob(j, { type: "COMMIT_DONE" });
        expect(r.ok).toBe(false);
        expect(r.reason).toContain("pending");
    });

    it("transition 不修改入参（纯函数）", () => {
        const j = mkJob({ status: "reviewing", candidates: cands(1) });
        const snapshot = JSON.stringify(j);
        transitionJob(j, { type: "COMMIT_START", deckID: "d" });
        transitionJob(j, { type: "CANCEL" });
        expect(JSON.stringify(j)).toBe(snapshot);
    });
});

describe("ai-jobs 存储清洗与容量（ADR-7）", () => {
    it("normalize：非法 job/candidate 剔除，字段收敛", () => {
        const r = normalizeAIJobs({
            jobs: [
                { id: "ok", createdAt: NOW, updatedAt: NOW, status: "reviewing", candidates: [{ q: "q", a: "a", status: "pending" }] },
                { id: "" },                                  // 剔除
                { status: "done" },                           // 剔除（无 id）
                { id: "bad-status", status: "warp" },         // 状态白名单外 → failed
                { id: "bad-cand", status: "reviewing", candidates: [{ q: "", a: "" }, "junk"] },
            ],
        });
        expect(r.jobs.map(j => j.id)).toEqual(["ok", "bad-status", "bad-cand"]);
        expect(r.jobs[1].status).toBe("failed");
        expect(r.jobs[2].candidates).toEqual([]);
        expect(r.jobs[0].candidates[0].status).toBe("pending");
    });

    it("pruneJobs：超 20 个优先淘汰最旧 done/canceled", () => {
        const jobs: AIJob[] = [];
        for (let i = 0; i < 25; i++) {
            jobs.push(mkJob({ id: `j${i}`, updatedAt: NOW + i, status: i < 22 ? "done" : "reviewing" }));
        }
        const kept = pruneJobs(jobs);
        expect(kept).toHaveLength(20);
        expect(kept.filter(j => j.status === "reviewing")).toHaveLength(3); // 活动作业全保
        expect(kept.some(j => j.id === "j0")).toBe(false); // 最旧的 done 先淘汰
    });

    it("source 摘要边界：type/label/excerpt 截断，不存原文", () => {
        const j = createJob("j", { type: "doc", label: "很长的标签".repeat(100), excerpt: "原文".repeat(500) }, { count: 5, language: "中文", type: "qa" }, NOW);
        expect(j.source.label.length).toBeLessThanOrEqual(200);
        expect(j.source.excerpt.length).toBeLessThanOrEqual(200);
    });
});

describe("transitionJob GENERATE_OK 纯度", () => {
    it("替换 candidates 不突变入参 job", () => {
        const j = mkJob({ status: "generating", candidates: [{ q: "old", a: "old", keep: true, status: "pending" }] });
        const snapshot = JSON.stringify(j);
        const r = transitionJob(j, { type: "GENERATE_OK", candidates: [{ q: "new", a: "new", keep: true, status: "pending" }] });
        expect(r.ok).toBe(true);
        expect(r.job.candidates).toHaveLength(1);
        expect(JSON.stringify(j)).toBe(snapshot); // 入参原样
    });
});
