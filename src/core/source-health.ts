/**
 * BI-20 来源与卡片双向健康状态（纯逻辑，node 可单测）。
 * 来源的移动/删除/版本变化/媒体失效/许可变化分别标记影响——
 * 验收硬性要求：健康问题不冒充记忆失败（affectsScheduling 恒 false，统计归统计、健康归健康），
 * 修复保留历史（resolution 只追加不覆盖）。
 * 事实由调用方采集（SQL 存在性/归属、内容指纹、媒体探测），本模块只做分类与历史。
 */

export const HEALTH_KINDS = ["deleted", "moved", "changed", "media-broken", "license-changed"] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number];

/** 建档时记录的来源指纹（调用方在建卡/开档时落盘） */
export interface SourceFingerprint {
    blockID: string;
    rootID: string;
    /** 内容指纹（调用方对 markdown 归一化后取哈希/原文均可——本模块只做等值比较） */
    contentHash: string;
    /** 媒体引用键列表（如 assets/xxx.png） */
    mediaRefs: string[];
    license?: string;
}

/** 当前事实（null = 查无此块，按已删除处理） */
export interface SourceCurrentFacts {
    rootID: string;
    contentHash: string;
    mediaPresent: Record<string, boolean>;
    license?: string;
}

export interface HealthIssue {
    kind: HealthKind;
    detail: string;
    /** 影响说明 i18n 键（sourceHealth.impact.<kind>） */
    impactKey: string;
    /** 恒 false：健康问题不是记忆失败，不进任何复习统计（验收硬性要求） */
    affectsScheduling: false;
}

export interface SourceHealthRecord {
    at: number;
    kind: HealthKind;
    /** true=已修复/已确认 */
    resolved: boolean;
    detail: string;
}

/** 健康评估：按验收列举顺序（移动→删除→版本→媒体→许可）输出问题；无问题=healthy */
export function evalSourceHealth(recorded: SourceFingerprint, current: SourceCurrentFacts | null): { issues: HealthIssue[]; healthy: boolean } {
    const issues: HealthIssue[] = [];
    if (!current) {
        issues.push({ kind: "deleted", detail: recorded.blockID, impactKey: "sourceHealth.impact.deleted", affectsScheduling: false });
        return { issues, healthy: false };
    }
    if (current.rootID !== recorded.rootID) {
        issues.push({ kind: "moved", detail: `${recorded.rootID} → ${current.rootID}`, impactKey: "sourceHealth.impact.moved", affectsScheduling: false });
    }
    if (current.contentHash !== recorded.contentHash) {
        issues.push({ kind: "changed", detail: `${recorded.contentHash.slice(0, 12)} → ${current.contentHash.slice(0, 12)}`, impactKey: "sourceHealth.impact.changed", affectsScheduling: false });
    }
    const broken = recorded.mediaRefs.filter(ref => current.mediaPresent[ref] === false);
    if (broken.length > 0) {
        issues.push({ kind: "media-broken", detail: broken.join(", "), impactKey: "sourceHealth.impact.media", affectsScheduling: false });
    }
    if (recorded.license && current.license !== undefined && current.license !== recorded.license) {
        issues.push({ kind: "license-changed", detail: `${recorded.license} → ${current.license}`, impactKey: "sourceHealth.impact.license", affectsScheduling: false });
    }
    return { issues, healthy: issues.length === 0 };
}

/** 健康史：问题记录追加（首次发现） */
export function recordIssues(history: SourceHealthRecord[], issues: HealthIssue[], now: number = Date.now()): SourceHealthRecord[] {
    const next = [...history];
    for (const i of issues) {
        if (!next.some(h => h.kind === i.kind && !h.resolved)) {
            next.push({ at: now, kind: i.kind, resolved: false, detail: i.detail });
        }
    }
    return next;
}

/** 修复确认：原地标记 resolved（原发现记录保留在史中不删除）；无未解决记录时追加一条解决档案 */
export function resolveIssue(history: SourceHealthRecord[], kind: HealthKind, now: number = Date.now()): SourceHealthRecord[] {
    const openIdx = history.findIndex(h => h.kind === kind && !h.resolved);
    if (openIdx >= 0) {
        return history.map((h, i) => (i === openIdx ? { ...h, resolved: true } : h));
    }
    return [...history, { at: now, kind, resolved: true, detail: "resolved" }];
}

/** 当前未解决的健康问题（存在未解决记录 或 调用方用最新评估结果对照） */
export function openIssues(history: SourceHealthRecord[]): SourceHealthRecord[] {
    const latest = new Map<HealthKind, SourceHealthRecord>();
    for (const h of history) latest.set(h.kind, h);
    return [...latest.values()].filter(h => !h.resolved);
}
