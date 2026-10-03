/**
 * BI-5 内容与学习双状态机——内容侧（纯逻辑，node 可单测）。
 * 学习侧（正式复习调度）由内核 riff 独占（ADR-3），本模块只记录「内容」自己的
 * 生命周期：来源 → 候选 → 已审核 → 已入库 → 正式复习 → 已应用 …，
 * 每次状态转移必须带原因与时间（验收硬性要求）。
 * 与 BI-4 收件箱分工：inbox 管「材料筛选队列」的轻量状态（inbox/staged/selected），
 * 本模块管「内容」全生命周期的权威轨迹；材料入选后在这里开档（source 起）。
 */

export const CONTENT_STATES = [
    "source",        // 来源：材料原文所在
    "candidate",     // 候选：进入加工视野
    "reviewed",      // 已审核：人工确认内容正确
    "stocked",       // 已入库：已产出卡片
    "inReview",      // 正式复习：卡片进入调度
    "applied",       // 已应用：输出/练习使用过
    "needsRevision", // 需修订：内容有问题待改
    "paused",        // 暂停：主动搁置
    "stale",         // 过时：来源内容已变化
    "archived",      // 归档：退出活跃生命周期
] as const;
export type ContentState = (typeof CONTENT_STATES)[number];

/** 合法转移表：from → 允许的 to 集合（archived 为终态，可解档回 source 重开） */
export const CONTENT_TRANSITIONS: Record<ContentState, readonly ContentState[]> = {
    source: ["candidate", "archived"],
    candidate: ["reviewed", "needsRevision", "archived"],
    reviewed: ["stocked", "needsRevision", "archived"],
    stocked: ["inReview", "needsRevision", "archived"],
    inReview: ["applied", "needsRevision", "paused", "stale", "archived"],
    applied: ["inReview", "needsRevision", "archived"],
    needsRevision: ["candidate", "paused", "archived"],
    paused: ["inReview", "archived"],
    stale: ["candidate", "archived"],
    archived: ["source"],
};

export interface ContentTransition {
    from: ContentState;
    to: ContentState;
    /** 转移原因（用户可见短语或操作键；「验收：状态转移有原因」） */
    reason: string;
    at: number;
}

export interface ContentLifecycle {
    blockID: string;
    state: ContentState;
    history: ContentTransition[];
    createdAt: number;
    updatedAt: number;
}

export function createLifecycle(blockID: string, now: number = Date.now()): ContentLifecycle {
    return { blockID, state: "source", history: [], createdAt: now, updatedAt: now };
}

/** 合法性查询（UI 可用其禁用不可达按钮） */
export function canTransition(from: ContentState, to: ContentState): boolean {
    return (CONTENT_TRANSITIONS[from] as readonly string[]).includes(to);
}

/** 状态转移：合法则追加轨迹并更新状态；非法/同状态返回 false（不写入） */
export function transition(lc: ContentLifecycle, to: ContentState, reason: string, now: number = Date.now()): boolean {
    if (!canTransition(lc.state, to) || lc.state === to || !reason) return false;
    lc.history.push({ from: lc.state, to, reason, at: now });
    lc.state = to;
    lc.updatedAt = now;
    return true;
}

/** 白名单清洗：状态/轨迹逐条校验，轨迹断裂时以最近合法轨迹末态为准 */
export function normalizeLifecycle(raw: unknown): ContentLifecycle | null {
    const r = raw as any;
    if (!r || typeof r !== "object" || typeof r.blockID !== "string" || !r.blockID) return null;
    const createdAt = Number.isFinite(Number(r.createdAt)) ? Number(r.createdAt) : Date.now();
    const lc = createLifecycle(r.blockID, createdAt);
    if (Array.isArray(r.history)) {
        for (const t of r.history) {
            if (!t || typeof t !== "object") continue;
            const from = asState(t.from);
            const to = asState(t.to);
            if (!from || !to || typeof t.reason !== "string" || !t.reason) continue;
            if (!canTransition(from, to)) continue;
            lc.history.push({ from, to, reason: t.reason, at: Number.isFinite(Number(t.at)) ? Number(t.at) : Date.now() });
        }
    }
    // 末态 = 最后一条合法轨迹的 to；无轨迹回 source
    const last = lc.history[lc.history.length - 1];
    lc.state = last ? last.to : "source";
    lc.updatedAt = Number.isFinite(Number(r.updatedAt)) ? Number(r.updatedAt) : (last?.at ?? createdAt);
    return lc;
}

function asState(v: unknown): ContentState | null {
    return typeof v === "string" && (CONTENT_STATES as readonly string[]).includes(v) ? (v as ContentState) : null;
}

/** 按状态分组统计（诊断/蓝图用） */
export function lifecycleStats(lcs: ContentLifecycle[]): Record<ContentState, number> {
    const out = Object.fromEntries(CONTENT_STATES.map(s => [s, 0])) as Record<ContentState, number>;
    for (const lc of lcs) out[lc.state]++;
    return out;
}
