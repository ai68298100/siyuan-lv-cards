/**
 * BL-12 长期运行健康仪表盘与系统健康巡检引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 覆盖七大长期运行健康维度：
 *    - 存储增长（storage-growth）
 *    - 失败写入（failed-writes）
 *    - 孤儿来源（orphan-sources）
 *    - 失效媒体（broken-media）
 *    - 过期模板（stale-templates）
 *    - 未处理候选（unprocessed-candidates）
 *    - 待复评后置项（pending-reassessments）；
 * 2. 验收硬性要求：每项健康异常均配备 修复（fix）、忽略（ignore）、导出（export）三项动作；
 * 3. 综合健康评分模型（0~100 分），分值客观真实，绝不粉饰太平；
 * 4. 纯函数设计，数据不可变隔离。
 */

export const HEALTH_METRIC_CATEGORIES = [
    "storage-growth",
    "failed-writes",
    "orphan-sources",
    "broken-media",
    "stale-templates",
    "unprocessed-candidates",
    "pending-reassessments",
] as const;

export type HealthMetricCategory = (typeof HEALTH_METRIC_CATEGORIES)[number];

export type HealthItemSeverity = "healthy" | "warning" | "critical";

export type HealthActionType = "fix" | "ignore" | "export";

/** 单项健康检查条目 */
export interface SystemHealthCheckItem {
    id: string;
    category: HealthMetricCategory;
    nameKey: string;
    descKey: string;
    severity: HealthItemSeverity;
    /** 检出的问题数量（0 表示健康） */
    issueCount: number;
    /** 脱敏摘要与度量指标说明 */
    summary: string;
    /** 是否被用户主动设为忽略 */
    ignored: boolean;
    /** 绑定的三项处置动作 */
    actions: HealthActionType[];
    /** 关联的修复动作标识 */
    remedyId?: string;
}

/** 巡检输入事实源 */
export interface SystemHealthFacts {
    /** 存储条目统计（如 revlog > 10000 警告，> 50000 严重） */
    totalRevlogEntries: number;
    /** 残留草稿或未完成事务数 */
    failedWritesCount: number;
    /** 孤儿卡片（来源笔记已删除）数 */
    orphanCardsCount: number;
    /** 404/缺失的媒体附件数 */
    brokenMediaCount: number;
    /** 使用已弃用提示词模板的卡片或批次数 */
    staleTemplatesCount: number;
    /** 收件箱中积压超过 14 天未处理的知识对象数 */
    unprocessedInboxCount: number;
    /** 前置概念发生变更后待复评的卡片数 */
    pendingReassessmentCount: number;
}

/** 系统综合健康评定报告 */
export interface SystemHealthReport {
    inspectedAt: number;
    overallScore: number; // 0 ~ 100
    grade: "optimal" | "good" | "fair" | "degraded";
    gradeKey: string;
    items: SystemHealthCheckItem[];
    totalIssues: number;
    criticalCount: number;
    warningCount: number;
}

/**
 * 执行系统健康深度巡检（纯函数）：
 * 对比输入的 7 大运行事实，输出结构化健康报告与评分。
 */
export function inspectSystemHealth(
    facts: SystemHealthFacts,
    ignoredIds: ReadonlySet<string> = new Set(),
    now: number = Date.now(),
): SystemHealthReport {
    const items: SystemHealthCheckItem[] = [];

    // 1. 存储增长（storage-growth）
    let storageSeverity: HealthItemSeverity = "healthy";
    let storageSummary = "存储规模正常在轨";
    if (facts.totalRevlogEntries > 30000) {
        storageSeverity = "critical";
        storageSummary = `复习日志条目庞大（${facts.totalRevlogEntries} 条），建议归档陈旧数据`;
    } else if (facts.totalRevlogEntries > 10000) {
        storageSeverity = "warning";
        storageSummary = `复习日志累积较多（${facts.totalRevlogEntries} 条）`;
    }
    items.push({
        id: "health-storage-growth",
        category: "storage-growth",
        nameKey: "systemHealth.metric.storageGrowth.name",
        descKey: "systemHealth.metric.storageGrowth.desc",
        severity: storageSeverity,
        issueCount: facts.totalRevlogEntries > 10000 ? 1 : 0,
        summary: storageSummary,
        ignored: ignoredIds.has("health-storage-growth"),
        actions: ["fix", "ignore", "export"],
        remedyId: "archive-stale-revlog",
    });

    // 2. 失败写入（failed-writes）
    const failedSeverity: HealthItemSeverity =
        facts.failedWritesCount > 5 ? "critical" : facts.failedWritesCount > 0 ? "warning" : "healthy";
    items.push({
        id: "health-failed-writes",
        category: "failed-writes",
        nameKey: "systemHealth.metric.failedWrites.name",
        descKey: "systemHealth.metric.failedWrites.desc",
        severity: failedSeverity,
        issueCount: facts.failedWritesCount,
        summary: facts.failedWritesCount > 0 ? `检测到 ${facts.failedWritesCount} 处写入残留或草稿` : "无残留写入故障",
        ignored: ignoredIds.has("health-failed-writes"),
        actions: ["fix", "ignore", "export"],
        remedyId: "clean-or-retry-failed-writes",
    });

    // 3. 孤儿来源（orphan-sources）
    const orphanSeverity: HealthItemSeverity =
        facts.orphanCardsCount > 10 ? "critical" : facts.orphanCardsCount > 0 ? "warning" : "healthy";
    items.push({
        id: "health-orphan-sources",
        category: "orphan-sources",
        nameKey: "systemHealth.metric.orphanSources.name",
        descKey: "systemHealth.metric.orphanSources.desc",
        severity: orphanSeverity,
        issueCount: facts.orphanCardsCount,
        summary: facts.orphanCardsCount > 0 ? `发现 ${facts.orphanCardsCount} 张卡片原笔记已脱节` : "卡片与笔记来源完好关联",
        ignored: ignoredIds.has("health-orphan-sources"),
        actions: ["fix", "ignore", "export"],
        remedyId: "relink-or-archive-orphans",
    });

    // 4. 失效媒体（broken-media）
    const mediaSeverity: HealthItemSeverity =
        facts.brokenMediaCount > 5 ? "critical" : facts.brokenMediaCount > 0 ? "warning" : "healthy";
    items.push({
        id: "health-broken-media",
        category: "broken-media",
        nameKey: "systemHealth.metric.brokenMedia.name",
        descKey: "systemHealth.metric.brokenMedia.desc",
        severity: mediaSeverity,
        issueCount: facts.brokenMediaCount,
        summary: facts.brokenMediaCount > 0 ? `存在 ${facts.brokenMediaCount} 个失效媒体资源链接` : "全部媒体引用完好",
        ignored: ignoredIds.has("health-broken-media"),
        actions: ["fix", "ignore", "export"],
        remedyId: "probe-and-fix-media",
    });

    // 5. 过期模板（stale-templates）
    const tplSeverity: HealthItemSeverity = facts.staleTemplatesCount > 0 ? "warning" : "healthy";
    items.push({
        id: "health-stale-templates",
        category: "stale-templates",
        nameKey: "systemHealth.metric.staleTemplates.name",
        descKey: "systemHealth.metric.staleTemplates.desc",
        severity: tplSeverity,
        issueCount: facts.staleTemplatesCount,
        summary: facts.staleTemplatesCount > 0 ? `${facts.staleTemplatesCount} 个配置使用了过时模板` : "提示词模板均为最新版本",
        ignored: ignoredIds.has("health-stale-templates"),
        actions: ["fix", "ignore", "export"],
        remedyId: "upgrade-stale-templates",
    });

    // 6. 未处理候选（unprocessed-candidates）
    const inboxSeverity: HealthItemSeverity =
        facts.unprocessedInboxCount > 20 ? "warning" : "healthy";
    items.push({
        id: "health-unprocessed-candidates",
        category: "unprocessed-candidates",
        nameKey: "systemHealth.metric.unprocessedCandidates.name",
        descKey: "systemHealth.metric.unprocessedCandidates.desc",
        severity: inboxSeverity,
        issueCount: facts.unprocessedInboxCount,
        summary: facts.unprocessedInboxCount > 0 ? `收件箱有 ${facts.unprocessedInboxCount} 条滞留候选` : "收件箱无过期积压",
        ignored: ignoredIds.has("health-unprocessed-candidates"),
        actions: ["fix", "ignore", "export"],
        remedyId: "batch-triage-inbox",
    });

    // 7. 待复评后置项（pending-reassessments）
    const reassessSeverity: HealthItemSeverity =
        facts.pendingReassessmentCount > 10 ? "warning" : "healthy";
    items.push({
        id: "health-pending-reassessments",
        category: "pending-reassessments",
        nameKey: "systemHealth.metric.pendingReassessments.name",
        descKey: "systemHealth.metric.pendingReassessments.desc",
        severity: reassessSeverity,
        issueCount: facts.pendingReassessmentCount,
        summary: facts.pendingReassessmentCount > 0 ? `有 ${facts.pendingReassessmentCount} 张卡片因先修变更待复评` : "无待复评后置项",
        ignored: ignoredIds.has("health-pending-reassessments"),
        actions: ["fix", "ignore", "export"],
        remedyId: "batch-reassess-downstream",
    });

    // --- 计算综合评分与风险等级 ---
    let deduction = 0;
    let criticalCount = 0;
    let warningCount = 0;

    for (const item of items) {
        if (item.ignored) continue; // 用户忽略的项不扣分

        if (item.severity === "critical") {
            deduction += 20;
            criticalCount++;
        } else if (item.severity === "warning") {
            deduction += 8;
            warningCount++;
        }
    }

    const overallScore = Math.max(0, Math.min(100, 100 - deduction));
    let grade: "optimal" | "good" | "fair" | "degraded" = "optimal";
    let gradeKey = "systemHealth.grade.optimal";

    if (overallScore < 60) {
        grade = "degraded";
        gradeKey = "systemHealth.grade.degraded";
    } else if (overallScore < 75) {
        grade = "fair";
        gradeKey = "systemHealth.grade.fair";
    } else if (overallScore < 90) {
        grade = "good";
        gradeKey = "systemHealth.grade.good";
    }

    const totalIssues = items.reduce((sum, i) => sum + (i.ignored ? 0 : i.issueCount), 0);

    return {
        inspectedAt: now,
        overallScore,
        grade,
        gradeKey,
        items,
        totalIssues,
        criticalCount,
        warningCount,
    };
}

/** 导出脱敏的巡检 Markdown 报告 */
export function exportHealthReportToMarkdown(report: SystemHealthReport): string {
    const lines = [
        `# 小驴闪卡 · 系统健康巡检报告`,
        `- 巡检时间：${new Date(report.inspectedAt).toISOString()}`,
        `- 综合健康分：${report.overallScore} / 100（等级：${report.grade}）`,
        `- 检出总隐患：${report.totalIssues} 项（严重：${report.criticalCount}，警告：${report.warningCount}）`,
        "",
        `## 详细指标诊断清单`,
    ];

    for (const item of report.items) {
        const flag = item.ignored
            ? "[已忽略]"
            : item.severity === "critical"
            ? "[严重]"
            : item.severity === "warning"
            ? "[警告]"
            : "[健康]";
        lines.push(`- ${flag} ${item.id}: ${item.summary} (问题数: ${item.issueCount})`);
    }

    return lines.join("\n");
}
