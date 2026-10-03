/**
 * BI-9 中断恢复分支（纯逻辑，node 可单测）。
 * 会话中断（关窗/崩溃/跨天）后，按现场快照推导可选恢复分支：
 * 继续原场 / 只看摘要 / 缩小范围 / 结束——四选一，用户拍板，
 * 不自动重复评分、不自动写卡（验收硬性要求）。
 * 输入是 SessionState（session-state.json）形状的快照，本模块不改它。
 */

export const RECOVERY_BRANCHES = ["resume", "summary", "narrow", "end"] as const;
export type RecoveryBranch = (typeof RECOVERY_BRANCHES)[number];

/** 恢复决策所需的最小现场（来自 session-state.json 快照） */
export interface RecoverySnapshot {
    /** 快照所属日期（本地时区 YYYYMMDD 形式由调用方给） */
    date: string;
    /** 快照日期（本地时区 YYYY-MM-DD） */
    today: string;
    reviewedCount: number;
    skippedCount: number;
    /** 队列剩余（-1 = 未知，视为不可续） */
    queueRemaining: number;
}

export interface RecoveryOption {
    branch: RecoveryBranch;
    labelKey: string;
    /** 分支当前是否可选（不可选仍在列表展示但禁用，保证四分支语义完整） */
    enabled: boolean;
    /** 禁用原因 i18n 键（enabled 时为 null） */
    disabledWhyKey: string | null;
}

/**
 * 推导恢复分支可用性：
 * - 跨天快照：继续原场不可用（当日计数已失效），摘要/结束可用；
 * - 零进度：摘要/缩小范围不可用（无内容可看/可缩）；
 * - 队列未知或已清空：继续原场不可用（无事可续）；
 * - 结束永远可用（用户随时可以只收工）。
 */
export function recoveryOptions(snap: RecoverySnapshot): RecoveryOption[] {
    const stale = snap.date !== snap.today;
    const noProgress = snap.reviewedCount <= 0 && snap.skippedCount <= 0;
    const nothingToContinue = stale || snap.queueRemaining === 0 || snap.queueRemaining < 0;
    return [
        {
            branch: "resume",
            labelKey: "recovery.resume",
            enabled: !nothingToContinue,
            disabledWhyKey: nothingToContinue ? (stale ? "recovery.disabledStale" : "recovery.disabledEmpty") : null,
        },
        {
            branch: "summary",
            labelKey: "recovery.summary",
            enabled: !noProgress,
            disabledWhyKey: noProgress ? "recovery.disabledNoProgress" : null,
        },
        {
            branch: "narrow",
            labelKey: "recovery.narrow",
            enabled: !noProgress && !nothingToContinue,
            disabledWhyKey: noProgress ? "recovery.disabledNoProgress" : (nothingToContinue ? "recovery.disabledEmpty" : null),
        },
        { branch: "end", labelKey: "recovery.end", enabled: true, disabledWhyKey: null },
    ];
}

/** 可选分支数（诊断/测试用） */
export function enabledBranches(opts: RecoveryOption[]): RecoveryBranch[] {
    return opts.filter(o => o.enabled).map(o => o.branch);
}
