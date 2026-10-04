/**
 * BU-31 AI 故障与安全事件处置（纯逻辑，node 可单测）。
 * 紧急停用（按 provider/model/task 目标）、撤销同意（AI 总闸）、隔离批次、清理待发——
 * 验收硬性要求：停用后无后台请求（generate 前置检查读取本状态）、事件记录不含敏感内容
 * （scope 仅存非明文键，不含材料摘录）。「恢复旧版本」需设置快照机制，登记为余项。
 * 存储：ai-killswitch.json（宿主经 STORE_KEYS 批量加载，本模块只做状态与判定）。
 */

export const AI_KILL_TARGET_KINDS = ["provider", "model", "task", "template"] as const;
export type AIKillTargetKind = (typeof AI_KILL_TARGET_KINDS)[number];

export interface SafetyEvent {
    at: number;
    kind: "disable" | "enable" | "revoke-consent" | "grant-consent" | "quarantine";
    /** 非明文作用域键（provider:<mode>:<endpoint> / model:<model> / task:<task> / job:<id>） */
    scope: string;
}

export interface AIKillSwitchData {
    version: 1;
    /** 撤销同意 = AI 总闸：true 时一切 AI 任务在组装前阻断 */
    revoked: boolean;
    /** 被紧急停用的目标键（provider:/model:/task:/template: 前缀） */
    disabledTargets: string[];
    /** 被隔离的 ai-job id（续传/恢复入口必须跳过） */
    quarantinedJobs: string[];
    /** 安全事件（最近 50 条，新在后） */
    events: SafetyEvent[];
}

export const KILL_EVENT_CAP = 50;

export function emptyKillSwitch(): AIKillSwitchData {
    return { version: 1, revoked: false, disabledTargets: [], quarantinedJobs: [], events: [] };
}

function pushEvent(data: AIKillSwitchData, kind: SafetyEvent["kind"], scope: string, now: number): void {
    data.events.push({ at: now, kind, scope });
    if (data.events.length > KILL_EVENT_CAP) {
        data.events = data.events.slice(-KILL_EVENT_CAP);
    }
}

function sanitizeScope(scope: string): string {
    return (scope || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function normalizeTargets(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    for (const t of raw) {
        if (typeof t === "string" && t && seen.size < 100) seen.add(sanitizeScope(t));
    }
    return [...seen];
}

/** 白名单清洗：结构非法落空库；事件限流；目标/隔离去重限量 */
export function normalizeKillSwitch(raw: unknown): AIKillSwitchData {
    const d = raw && typeof raw === "object" ? (raw as Partial<AIKillSwitchData>) : null;
    const out = emptyKillSwitch();
    if (!d) return out;
    out.revoked = d.revoked === true;
    out.disabledTargets = normalizeTargets(d.disabledTargets);
    out.quarantinedJobs = normalizeTargets(d.quarantinedJobs);
    if (Array.isArray(d.events)) {
        for (const e of d.events.slice(-KILL_EVENT_CAP)) {
            if (!e || typeof e !== "object") continue;
            if (typeof e.at !== "number" || !Number.isFinite(e.at)) continue;
            if (typeof e.scope !== "string") continue;
            out.events.push({ at: e.at, kind: e.kind ?? "disable", scope: sanitizeScope(e.scope) });
        }
    }
    return out;
}

/** 紧急停用目标（provider:/model:/task:/template: 键；幂等：重复停用不重复记事件） */
export function disableTarget(data: AIKillSwitchData, target: string, now: number = Date.now()): void {
    const t = sanitizeScope(target);
    if (!t || data.disabledTargets.includes(t)) return;
    data.disabledTargets.push(t);
    pushEvent(data, "disable", t, now);
}

/** 解除停用（幂等：不在册无操作） */
export function enableTarget(data: AIKillSwitchData, target: string, now: number = Date.now()): void {
    const t = sanitizeScope(target);
    const before = data.disabledTargets.length;
    data.disabledTargets = data.disabledTargets.filter(x => x !== t);
    if (data.disabledTargets.length !== before) {
        pushEvent(data, "enable", t, now);
    }
}

/** 撤销同意（AI 总闸开到关） */
export function revokeConsent(data: AIKillSwitchData, now: number = Date.now()): void {
    if (!data.revoked) {
        data.revoked = true;
        pushEvent(data, "revoke-consent", "ai", now);
    }
}

/** 重新授予同意（总闸关到开） */
export function grantConsent(data: AIKillSwitchData, now: number = Date.now()): void {
    if (data.revoked) {
        data.revoked = false;
        pushEvent(data, "grant-consent", "ai", now);
    }
}

/** 隔离批次（ai-job id；幂等：重复隔离不重复记事件） */
export function quarantineJob(data: AIKillSwitchData, jobId: string, now: number = Date.now()): void {
    const id = sanitizeScope(jobId.startsWith("job:") ? jobId : `job:${jobId}`);
    if (!id || data.quarantinedJobs.includes(id)) return;
    data.quarantinedJobs.push(id);
    pushEvent(data, "quarantine", id, now);
}

export type KillBlockReason = "consent-revoked" | "target-disabled";

/**
 * 阻断判定（generate 前置检查调用）：总闸优先；任一目标命中即阻断。
 * targets=本次请求涉及的目标键（provider:/model:/task:/template:）。
 */
export function killSwitchBlock(data: AIKillSwitchData, targets: string[]): KillBlockReason | null {
    if (data.revoked) return "consent-revoked";
    for (const t of targets) {
        if (data.disabledTargets.includes(sanitizeScope(t))) return "target-disabled";
    }
    return null;
}

/** 续传/恢复入口的跳过判定 */
export function isJobQuarantined(data: AIKillSwitchData, jobId: string): boolean {
    return data.quarantinedJobs.includes(`job:${jobId}`);
}
