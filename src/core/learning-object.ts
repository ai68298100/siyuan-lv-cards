/**
 * BI-19 学习对象生命周期状态机（纯逻辑，node 可单测）。
 * 统一学习对象的九态轨迹：captured → clarified → candidate → committed → practiced
 * → applied → maintained（/stale/retired）。与 BI-5 内容生命周期分工：BI-5 管「材料内容」
 * （来源→候选→入库→复习→应用），本模块管「学习对象」（捕获→澄清→承诺→练习→应用→维护）
 * 的学习旅程本身；两者并行记录互不替代。
 * 验收硬性要求：每次转移必带 **触发（trigger）、责任模块（owner）、可见原因（reasonKey）、
 * 撤销策略（undo）**——转移表即契约，缺任一元数据的转移不合法。
 */

export const LO_STATES = [
    "captured",   // 已捕获：进入收集范围（收件箱/快速捕获）
    "clarified",  // 已澄清：弄清了它是什么/为何学
    "candidate",  // 候选：值得制卡的确认
    "committed",  // 已承诺：已产出卡片并进入正式学习
    "practiced",  // 已练习：练习/突击过（未进正式调度口径）
    "applied",    // 已应用：在输出/真实任务中使用过
    "maintained", // 维护中：进入长期维持节奏
    "stale",      // 过时：内容或目标变化使其失效
    "retired",    // 退役：退出学习旅程（可重新捕获）
] as const;
export type LOState = (typeof LO_STATES)[number];

/** 撤销策略：none=不可撤销（终态/外部事实）；previous=可回退上一态；explicit=需显式反向操作 */
export type LOUndo = "none" | "previous" | "explicit";

export interface LOTransitionMeta {
    /** 触发（哪个动作/模块导致转移，非自由文本——枚举键） */
    trigger: string;
    /** 责任模块（登记在 TASK_REGISTRY/AO 的模块键） */
    owner: string;
    /** 可见原因 i18n 键（loState.reason.<key>）——不裸露内部枚举 */
    reasonKey: string;
    undo: LOUndo;
}

export interface LOTransitionRecord {
    from: LOState;
    to: LOState;
    at: number;
    trigger: string;
    owner: string;
    reasonKey: string;
    undo: LOUndo;
}

export interface LearningObject {
    id: string;
    state: LOState;
    history: LOTransitionRecord[];
    createdAt: number;
    updatedAt: number;
}

/** 合法转移表：from → to 必须带完整元数据（触发/责任/原因/撤销）——缺任一字段的转移不合法 */
export const LO_TRANSITIONS: Record<LOState, Partial<Record<LOState, LOTransitionMeta>>> = {
    captured: {
        clarified: { trigger: "clarify", owner: "capture", reasonKey: "loState.clarified", undo: "previous" },
        retired: { trigger: "discard", owner: "capture", reasonKey: "loState.retired.discarded", undo: "explicit" },
    },
    clarified: {
        candidate: { trigger: "mark-candidate", owner: "capture", reasonKey: "loState.candidate", undo: "previous" },
        stale: { trigger: "mark-stale", owner: "capture", reasonKey: "loState.stale", undo: "explicit" },
    },
    candidate: {
        committed: { trigger: "cards-created", owner: "wizard", reasonKey: "loState.committed", undo: "explicit" },
        stale: { trigger: "mark-stale", owner: "capture", reasonKey: "loState.stale", undo: "explicit" },
    },
    committed: {
        practiced: { trigger: "cram-review", owner: "review", reasonKey: "loState.practiced", undo: "none" },
        maintained: { trigger: "formal-review", owner: "review", reasonKey: "loState.maintained", undo: "none" },
        stale: { trigger: "mark-stale", owner: "review", reasonKey: "loState.stale", undo: "explicit" },
    },
    practiced: {
        committed: { trigger: "back-to-deck", owner: "review", reasonKey: "loState.backToCommitted", undo: "none" },
        applied: { trigger: "apply-output", owner: "review", reasonKey: "loState.applied", undo: "previous" },
        maintained: { trigger: "formal-review", owner: "review", reasonKey: "loState.maintained", undo: "none" },
    },
    applied: {
        maintained: { trigger: "formal-review", owner: "review", reasonKey: "loState.maintained", undo: "none" },
        practiced: { trigger: "re-practice", owner: "review", reasonKey: "loState.rePracticed", undo: "none" },
    },
    maintained: {
        applied: { trigger: "apply-output", owner: "review", reasonKey: "loState.applied", undo: "none" },
        stale: { trigger: "mark-stale", owner: "review", reasonKey: "loState.stale", undo: "explicit" },
    },
    stale: {
        captured: { trigger: "re-capture", owner: "capture", reasonKey: "loState.reCaptured", undo: "none" },
        retired: { trigger: "retire", owner: "review", reasonKey: "loState.retired.stale", undo: "explicit" },
    },
    retired: {
        captured: { trigger: "re-capture", owner: "capture", reasonKey: "loState.reCaptured", undo: "none" },
    },
};

export function createLearningObject(id: string, now: number = Date.now()): LearningObject {
    return { id, state: "captured", history: [], createdAt: now, updatedAt: now };
}

/** 合法性查询（UI 可用其禁用不可达按钮） */
export function canLoTransition(from: LOState, to: LOState): boolean {
    return Boolean(LO_TRANSITIONS[from]?.[to]);
}

/** 转移元数据（UI 展示触发/责任/原因/撤销策略用） */
export function loTransitionMeta(from: LOState, to: LOState): LOTransitionMeta | null {
    return LO_TRANSITIONS[from]?.[to] ?? null;
}

/** 转移：查表校验 + 元数据随轨迹落档；非法/缺元数据返回 false 不写入 */
export function loTransition(lo: LearningObject, to: LOState, now: number = Date.now()): boolean {
    const meta = LO_TRANSITIONS[lo.state]?.[to];
    if (!meta || !meta.trigger || !meta.owner || !meta.reasonKey || !meta.undo) return false;
    lo.history.push({
        from: lo.state, to, at: now,
        trigger: meta.trigger, owner: meta.owner, reasonKey: meta.reasonKey, undo: meta.undo,
    });
    lo.state = to;
    lo.updatedAt = now;
    return true;
}

/** 撤销：按最近一次转移的撤销策略执行——previous=回退上一态（直接落 undo 反向记录，不受正向表约束）；none/explicit=拒绝 */
export function undoLastLoTransition(lo: LearningObject, now: number = Date.now()): boolean {
    const last = lo.history[lo.history.length - 1];
    if (!last || last.undo !== "previous") return false;
    lo.history.push({
        from: lo.state, to: last.from, at: now,
        trigger: "undo", owner: "user", reasonKey: "loState.undone", undo: "none",
    });
    lo.state = last.from;
    lo.updatedAt = now;
    return true;
}

const LO_HISTORY_CAP = 50;

/** 白名单清洗：轨迹必须与转移表一致或为 undo 反向记录，且元数据齐全（非空）；末态取最后合法轨迹 */
export function normalizeLearningObject(raw: unknown, now: number = Date.now()): LearningObject | null {
    const r = raw as any;
    if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id) return null;
    const lo = createLearningObject(r.id, Number.isFinite(Number(r.createdAt)) ? Number(r.createdAt) : now);
    if (Array.isArray(r.history)) {
        for (const t of r.history) {
            if (!t || typeof t !== "object") continue;
            const from = t.from, to = t.to;
            const forward = LO_TRANSITIONS[from as LOState]?.[to as LOState];
            const isUndo = t.trigger === "undo";
            if (!forward && !isUndo) continue; // 非法轨迹剔除
            if (typeof t.trigger !== "string" || !t.trigger || typeof t.owner !== "string" || !t.owner ||
                typeof t.reasonKey !== "string" || !t.reasonKey) continue; // 四元数据缺一剔除
            lo.history.push({
                from, to, at: Number.isFinite(Number(t.at)) ? Number(t.at) : now,
                trigger: t.trigger, owner: t.owner, reasonKey: t.reasonKey, undo: forward ? forward.undo : "none",
            });
            lo.state = to as LOState;
            if (lo.history.length >= LO_HISTORY_CAP) break;
        }
    }
    lo.updatedAt = Number.isFinite(Number(r.updatedAt)) ? Number(r.updatedAt) : lo.updatedAt;
    return lo;
}
