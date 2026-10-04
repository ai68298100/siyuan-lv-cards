/**
 * BI-10 长期返场检查（纯逻辑，node 可单测）。
 * 长间隔返场先做四查——目标（BI-1 活跃/临期）、材料版本（BI-5 过时/待修订积压）、
 * 学习积压（到期量与间隔天数）、设备状态（时钟回拨/跨设备恢复）——全部只读：
 * 不写内核、不改调度、不自动重建计划（验收硬性要求：可只读预览，重建前显示影响）。
 * 输入只依赖各纯模块的统计事实，不读内核；重建影响是契约声明（due/revlog 保留），
 * 真正的重建批次属 BI-28 只读影响模拟，本模块不执行。
 */

export const RETURN_CHECK_KEYS = ["goal", "material", "backlog", "device"] as const;
export type ReturnCheckKey = (typeof RETURN_CHECK_KEYS)[number];

/** 返场事实（调用方从 learning-goals/content-lifecycles/due 缓存/时钟聚合，本模块不采集） */
export interface ReturnCheckFacts {
    /** BI-1：活跃目标数与最近截止天数（无目标=0/null） */
    activeGoals: number;
    nearestDeadlineDays: number | null;
    /** BI-5：内容侧待处理量（过时 / 需修订） */
    staleCount: number;
    needsRevisionCount: number;
    /** 学习积压：当前到期总数；距上次有学习记录的天数（无历史=null） */
    dueCount: number;
    daysSinceLastStudy: number | null;
    /** 设备侧：系统时间早于最近写入（时钟回拨可疑）/ 跨设备恢复标记 */
    clockSkewSuspect: boolean;
    crossDeviceRestore: boolean;
}

export interface ReturnCheckItem {
    key: ReturnCheckKey;
    ok: boolean;
    /** info=提示性（不阻断返场），warn=建议先处理再进入正式复习 */
    level: "info" | "warn";
    /** 展示 i18n 键（returnCheck.<key>.<ok|gap|stale|backlog|skew|restore>） */
    whyKey: string;
}

/** 积压阈值：到期超过该数视为大积压（提示缩小范围，不自动清） */
export const BACKLOG_DUE_WARN = 100;
/** 长间隔阈值：超过该天数未学习视为长间隔返场 */
export const GAP_DAYS_WARN = 7;

/** 长期返场触发判定（阈值单一事实源）：长间隔或大积压才弹出检查横幅，日常返场不打扰 */
export function isLongReturn(f: Pick<ReturnCheckFacts, "dueCount" | "daysSinceLastStudy">): boolean {
    return f.dueCount > BACKLOG_DUE_WARN
        || (f.daysSinceLastStudy !== null && f.daysSinceLastStudy > GAP_DAYS_WARN);
}

/** 四查（只读）：每查给出 ok/level 与 i18n 解释键；无异常时 allOk=true */
export function returnCheck(f: ReturnCheckFacts): { items: ReturnCheckItem[]; allOk: boolean } {
    const items: ReturnCheckItem[] = [];

    // 目标：有活跃目标即过；全部过期/无目标→提示先定方向（BI-1 向导），临期仅提示
    if (f.activeGoals > 0) {
        items.push({
            key: "goal",
            ok: true,
            level: "info",
            whyKey: f.nearestDeadlineDays !== null && f.nearestDeadlineDays <= 3
                ? "returnCheck.goal.dueSoon"
                : "returnCheck.goal.ok",
        });
    } else {
        items.push({ key: "goal", ok: false, level: "info", whyKey: "returnCheck.goal.none" });
    }

    // 材料版本：有过时/待修订→warn（BI-7 语义：健康问题不冒充记忆失败）
    const materialPending = f.staleCount + f.needsRevisionCount;
    items.push(materialPending === 0
        ? { key: "material", ok: true, level: "info", whyKey: "returnCheck.material.ok" }
        : { key: "material", ok: false, level: "warn", whyKey: "returnCheck.material.stale" });

    // 积压：大积压或长间隔→warn（提示缩小范围/只做高优先级，不自动补齐逾期）
    const bigBacklog = f.dueCount > BACKLOG_DUE_WARN;
    const longGap = f.daysSinceLastStudy !== null && f.daysSinceLastStudy > GAP_DAYS_WARN;
    items.push(!bigBacklog && !longGap
        ? { key: "backlog", ok: true, level: "info", whyKey: "returnCheck.backlog.ok" }
        : { key: "backlog", ok: false, level: "warn", whyKey: longGap ? "returnCheck.backlog.gap" : "returnCheck.backlog.backlog" });

    // 设备：时钟回拨→warn（影响到期判定可信度）；跨设备恢复→info（冲突保留两侧，BI-30）
    if (f.clockSkewSuspect) {
        items.push({ key: "device", ok: false, level: "warn", whyKey: "returnCheck.device.skew" });
    } else if (f.crossDeviceRestore) {
        items.push({ key: "device", ok: true, level: "info", whyKey: "returnCheck.device.restore" });
    } else {
        items.push({ key: "device", ok: true, level: "info", whyKey: "returnCheck.device.ok" });
    }

    return { items, allOk: items.every(i => i.ok) };
}

/** 重建计划影响（只读预览，永远不自动执行）：重建作废什么、保留什么 */
export interface RebuildImpact {
    /** 重建会作废的现场（i18n 键） */
    discards: string[];
    /** 重建不触碰的事实源（i18n 键） */
    preserves: string[];
}

/**
 * 重建影响预览（契约声明，无副作用）：
 * - 保留：内核 due/revlog（调度事实源，ADR-3）、学习目标档案、内容生命周期轨迹；
 * - 作废：当日会话现场（已评/跳过集合与计数——重建后按新范围重开）。
 * 验收「重建计划前显示影响」由 UI 渲染本预览并在用户确认后才进入 BI-28 的可撤销批次。
 */
export function rebuildImpactPreview(): RebuildImpact {
    return {
        discards: ["returnCheck.rebuild.session"],
        preserves: [
            "returnCheck.rebuild.due",
            "returnCheck.rebuild.goals",
            "returnCheck.rebuild.lifecycle",
        ],
    };
}
