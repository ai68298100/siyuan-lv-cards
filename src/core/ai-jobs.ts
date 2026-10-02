/**
 * AI 批次作业状态机（AQ-17 / 候选 ADR-7 第 1 步，零依赖纯模块）。
 * 设计定稿见 docs/24 候选 ADR-7；本模块只负责状态迁移与数据清洗，
 * 不做任何网络调用/内核写入——接入层（向导 UI + 存储）按 ADR 实现顺序另行接线。
 *
 * 六态：drafting → generating → reviewing → committing → done；
 *       generating/committing 可落 failed；generating/committing/reviewing 可落 canceled。
 * 断点续传：逐卡 candidates[i].status（pending→created/failed），
 *           每卡成功即更新（调用方持久化），续传只处理 pending。
 */

export type AIJobStatus =
    | "drafting"
    | "generating"
    | "reviewing"
    | "committing"
    | "done"
    | "failed"
    | "canceled";

export interface AIJobCandidate {
    q: string;
    a: string;
    d?: number;
    keep: boolean;
    /** pending=未落块；created=已入组（blockID 记录）；failed=本次尝试失败；skipped=用户在预览中移除/取消勾选 */
    status: "pending" | "created" | "failed" | "skipped";
    blockID?: string;
    error?: string;
}

export interface AIJob {
    id: string;
    createdAt: number;
    updatedAt: number;
    /** 材料来源摘要（隐私边界：只存 type/label/前 200 字符，不存原文） */
    source: { type: string; label: string; excerpt: string };
    cfg: { count: number; language: string; type: "qa" | "cloze" };
    deckID: string;
    status: AIJobStatus;
    /** failed/canceled 时记录中断前所处状态，供「继续」回迁 */
    resumeTo?: Exclude<AIJobStatus, "failed" | "canceled">;
    candidates: AIJobCandidate[];
    error?: string;
}

export interface AIJobsData {
    version: 1;
    jobs: AIJob[];
}

/** 迁移事件（transition 的输入） */
export type AIJobEvent =
    | { type: "GENERATE_START" }
    | { type: "GENERATE_OK"; candidates: AIJobCandidate[] }
    | { type: "GENERATE_FAIL"; error: string }
    | { type: "COMMIT_START"; deckID: string }
    | { type: "CARD_CREATED"; index: number; blockID: string }
    | { type: "CARD_FAILED"; index: number; error: string }
    | { type: "CARD_SKIPPED"; index: number }
    | { type: "COMMIT_DONE" }
    | { type: "FAIL"; error: string }
    | { type: "CANCEL" }
    | { type: "RESUME" };

/** 迁移表：非法迁移返回 ok:false 且 job 原样返回（调用方记日志即可） */
type TransitionTarget = AIJobStatus | "resumeTo";
const TRANSITIONS: Record<AIJobStatus, Partial<Record<AIJobEvent["type"], TransitionTarget>>> = {
    drafting: { GENERATE_START: "generating" },
    generating: {
        GENERATE_OK: "reviewing",
        GENERATE_FAIL: "failed",
        CANCEL: "canceled",
        FAIL: "failed",
    },
    reviewing: { COMMIT_START: "committing", GENERATE_START: "generating", CANCEL: "canceled" },
    committing: {
        CARD_CREATED: "committing",
        CARD_FAILED: "committing",
        CARD_SKIPPED: "committing",
        COMMIT_DONE: "done",
        FAIL: "failed",
        CANCEL: "canceled",
    },
    done: {},
    failed: { RESUME: "resumeTo" },
    canceled: { RESUME: "resumeTo" },
};

export interface TransitionResult {
    job: AIJob;
    ok: boolean;
    reason?: string;
}

/** 纯状态迁移：不修改入参，返回新 job；非法迁移 ok:false（job 不变） */
export function transitionJob(job: AIJob, event: AIJobEvent): TransitionResult {
    const allowed = TRANSITIONS[job.status];
    const target = allowed?.[event.type];
    if (!target) {
        return { job, ok: false, reason: `illegal transition: ${event.type} on ${job.status}` };
    }
    const next: AIJob = { ...job, candidates: job.candidates.map(c => ({ ...c })), updatedAt: Date.now() };
    if (target === "resumeTo") {
        if (!next.resumeTo) {
            return { job, ok: false, reason: "no resumeTo recorded" };
        }
        next.status = next.resumeTo;
        next.resumeTo = undefined;
        next.error = undefined;
        return { job: next, ok: true };
    }
    next.status = target;
    switch (event.type) {
        case "GENERATE_OK":
            next.candidates = event.candidates.map(c => ({ ...c, status: "pending" }));
            break;
        case "GENERATE_FAIL":
        case "FAIL":
        case "CANCEL":
            next.error = event.type === "CANCEL" ? "canceled by user" : event.error.slice(0, 500);
            next.resumeTo = job.status as AIJob["resumeTo"];
            break;
        case "COMMIT_START":
            next.deckID = event.deckID;
            break;
        case "CARD_CREATED": {
            const c = next.candidates[event.index];
            if (!c) {
                return { job, ok: false, reason: `candidate index ${event.index} out of range` };
            }
            c.status = "created";
            c.blockID = event.blockID;
            c.error = undefined;
            break;
        }
        case "CARD_FAILED": {
            const c = next.candidates[event.index];
            if (!c) {
                return { job, ok: false, reason: `candidate index ${event.index} out of range` };
            }
            c.status = "failed";
            c.error = event.error.slice(0, 500);
            break;
        }
        case "CARD_SKIPPED": {
            const c = next.candidates[event.index];
            if (!c) {
                return { job, ok: false, reason: `candidate index ${event.index} out of range` };
            }
            if (c.status !== "pending") {
                return { job, ok: false, reason: `candidate ${event.index} not pending (status=${c.status})` };
            }
            c.status = "skipped";
            break;
        }
        case "COMMIT_DONE": {
            const pending = next.candidates.some(c => c.status === "pending");
            if (pending) {
                return { job, ok: false, reason: "COMMIT_DONE with pending candidates" };
            }
            break;
        }
    }
    return { job: next, ok: true };
}

/** 新建 drafting 作业（id 由调用方生成以保证可测） */
export function createJob(
    id: string,
    source: AIJob["source"],
    cfg: AIJob["cfg"],
    now = Date.now(),
): AIJob {
    return {
        id,
        createdAt: now,
        updatedAt: now,
        source: {
            type: String(source.type ?? "").slice(0, 50),
            label: String(source.label ?? "").slice(0, 200),
            excerpt: String(source.excerpt ?? "").slice(0, 200),
        },
        cfg: { ...cfg },
        deckID: "",
        status: "drafting",
        candidates: [],
    };
}

/** 续传视角：首个未落块的候选下标；全部处理完返回 -1 */
export function firstPendingIndex(job: AIJob): number {
    return job.candidates.findIndex(c => c.status === "pending");
}

export function emptyAIJobs(): AIJobsData {
    return { version: 1, jobs: [] };
}

const STATUS_WHITELIST: readonly AIJobStatus[] = [
    "drafting", "generating", "reviewing", "committing", "done", "failed", "canceled",
];

function sanitizeCandidate(raw: any): AIJobCandidate | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const q = String(raw.q ?? "").trim();
    const a = String(raw.a ?? "").trim();
    if (!q || !a) {
        return null;
    }
    const d = Number(raw.d);
    const status = raw.status === "created" || raw.status === "failed" || raw.status === "skipped" ? raw.status : "pending";
    return {
        q,
        a,
        ...(Number.isInteger(d) && d >= 1 && d <= 3 ? { d } : {}),
        keep: raw.keep === true,
        status,
        ...(typeof raw.blockID === "string" && raw.blockID ? { blockID: raw.blockID } : {}),
        ...(typeof raw.error === "string" && raw.error ? { error: raw.error.slice(0, 500) } : {}),
    };
}

function sanitizeJob(raw: any): AIJob | null {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id) {
        return null;
    }
    const candidates = Array.isArray(raw.candidates)
        ? raw.candidates.map(sanitizeCandidate).filter((c): c is AIJobCandidate => c !== null)
        : [];
    const status = STATUS_WHITELIST.includes(raw.status) ? raw.status : "failed";
    const createdAt = Number(raw.createdAt);
    const updatedAt = Number(raw.updatedAt);
    return {
        id: raw.id,
        createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
        updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
        source: {
            type: typeof raw.source?.type === "string" ? raw.source.type.slice(0, 50) : "",
            label: typeof raw.source?.label === "string" ? raw.source.label.slice(0, 200) : "",
            excerpt: typeof raw.source?.excerpt === "string" ? raw.source.excerpt.slice(0, 200) : "",
        },
        cfg: {
            count: Number.isInteger(raw.cfg?.count) ? raw.cfg.count : 10,
            language: typeof raw.cfg?.language === "string" ? raw.cfg.language : "中文",
            type: raw.cfg?.type === "cloze" ? "cloze" : "qa",
        },
        deckID: typeof raw.deckID === "string" ? raw.deckID : "",
        status,
        resumeTo: STATUS_WHITELIST.includes(raw.resumeTo) && raw.resumeTo !== "failed" && raw.resumeTo !== "canceled"
            ? raw.resumeTo
            : undefined,
        candidates,
        ...(typeof raw.error === "string" && raw.error ? { error: raw.error.slice(0, 500) } : {}),
    };
}

/** 运行时清洗（TypedStore 口径）：非法 job/candidate 剔除；上限 20 个，超限淘汰最旧已结作业 */
export function normalizeAIJobs(raw: unknown): AIJobsData {
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).jobs)) {
        return emptyAIJobs();
    }
    const jobs = ((raw as any).jobs as any[])
        .map(sanitizeJob)
        .filter((j): j is AIJob => j !== null)
        .slice(-20);
    return { version: 1, jobs };
}

/** 容量维护：超过 20 个时优先淘汰最旧的 done/canceled；仍超则淘汰最旧 */
export function pruneJobs(jobs: AIJob[]): AIJob[] {
    if (jobs.length <= 20) {
        return jobs;
    }
    const settled = jobs.filter(j => j.status === "done" || j.status === "canceled");
    const active = jobs.filter(j => j.status !== "done" && j.status !== "canceled");
    let kept = [...active, ...settled].sort((a, b) => a.updatedAt - b.updatedAt);
    while (kept.length > 20) {
        const idx = kept.findIndex(j => j.status === "done" || j.status === "canceled");
        kept.splice(idx >= 0 ? idx : 0, 1);
    }
    return kept.sort((a, b) => a.updatedAt - b.updatedAt);
}
