/**
 * 考试复盘与周期学习报告生成引擎（Report Writer Engine · M5/M7/T-周报）
 * 集中管理复盘报告 Markdown 渲染、分批来源块归属检索、落盘笔记本寻址与周报自动生成决策组装。
 */

import { daysLeft, examReportStats, type ExamPlan } from "./exam";
import { calcStreak, computeRetention, weekCompare, type RevlogData, type RevlogEntry } from "./revlog";
import { buildWeeklyReport, decideWeeklyReport } from "./weekly-report";

export interface TargetNotebookCandidate {
    id: string;
    name: string;
}

/**
 * 确定落盘目标笔记本（优先使用配置指定的笔记本，缺省回退首个可用笔记本）
 */
export function resolveTargetNotebook(
    notebooks: TargetNotebookCandidate[],
    targetNotebookId?: string,
): TargetNotebookCandidate | null {
    if (!notebooks || notebooks.length === 0) {
        return null;
    }
    return notebooks.find(n => n.id === targetNotebookId) ?? notebooks[0] ?? null;
}

/**
 * 分批按块 ID 检索属于指定笔记本的块 ID 集合（避免超长 SQL 溢出）
 */
export async function queryNotebookBlockIDs(
    nbId: string,
    blockIDs: string[],
    sqlExecutor: (sql: string) => Promise<Array<{ id?: string }>>,
): Promise<Set<string>> {
    const safe = nbId.replace(/'/g, "''");
    const out = new Set<string>();
    const chunkSize = 400;

    for (let i = 0; i < blockIDs.length; i += chunkSize) {
        const chunk = blockIDs
            .slice(i, i + chunkSize)
            .map(id => `'${id.replace(/'/g, "''")}'`)
            .join(",");
        if (!chunk) continue;
        const rows = await sqlExecutor(`SELECT id FROM blocks WHERE box='${safe}' AND id IN (${chunk})`);
        for (const r of rows) {
            if (r?.id) {
                out.add(String(r.id));
            }
        }
    }
    return out;
}

export interface ExamReportRenderParams {
    plan: ExamPlan;
    entries: RevlogEntry[];
    inScopeFilter?: (entry: { deckID?: string; blockID?: string }) => boolean;
    now?: Date;
}

/**
 * 组装考试复盘 Markdown 报告正文（纯函数）
 */
export function renderExamReportMarkdown(params: ExamReportRenderParams): string {
    const { plan, entries, inScopeFilter, now = new Date() } = params;
    const s = examReportStats(plan, entries, { inScope: inScopeFilter });
    const left = daysLeft(plan.examDate);
    const scopeLine = plan.scopeName || plan.scopeKind;

    const lines = [
        `# 考试复盘：${plan.name}`,
        `- 考试日期：${plan.examDate}（${left !== null && left < 0 ? "已结束" : `剩 ${left} 天`}）`,
        `- 范围：${scopeLine}`,
        `- 统计窗口：${new Date(s.windowFrom).toLocaleDateString()} 起（计划创建以来）`,
        `- 窗口内复习：${s.reviews} 次 / 遗忘：${s.forgets} 次 / 保持率：${s.reviews ? Math.round((1 - s.forgets / s.reviews) * 100) : "—"}%`,
        `- 活跃天数：${s.activeDays}`,
        `- 计划 cram 设置：考前 ${plan.cramDays} 天`,
    ];

    if (!s.hasData) {
        lines.push(`- ⚠️ 窗口内没有可核算的本地复习记录（本地日志起点晚于窗口或尚未复习），不将缺失计为 0`);
    }
    if (s.unattributed > 0) {
        lines.push(`- ⚠️ 另有 ${s.unattributed} 条窗口内记录缺卡组信息（原生复习界面），未计入上方统计`);
    }
    if (plan.scopeKind === "notebook") {
        lines.push(`- 口径：笔记本范围按来源块归属计算；已删除/移动的来源块无法归属，不计入`);
    }

    lines.push("", `> 由小驴闪卡（内测版）生成 · ${now.toLocaleString()}`);
    return lines.join("\n");
}

export interface WeeklyReportDecisionPayload {
    shouldWrite: boolean;
    docTitle?: string;
    markdown?: string;
    weekKey?: string;
}

/**
 * 组装学习周报自动写入决策与正文
 */
export function assembleWeeklyReportPayload(params: {
    now: Date;
    lastWeekKey?: string;
    enabled: boolean;
    revlog: RevlogData;
    i18n: Record<string, any>;
}): WeeklyReportDecisionPayload {
    const { now, lastWeekKey, enabled, revlog, i18n } = params;
    const decision = decideWeeklyReport(now, lastWeekKey, enabled);
    if (!decision.write) {
        return { shouldWrite: false };
    }

    const week = weekCompare(revlog);
    const retention = computeRetention(revlog);
    const wr = i18n as any;

    const md = buildWeeklyReport(
        {
            reviewed: week.thisWeek.review,
            reviewedPrev: week.lastWeek.review > 0 ? week.lastWeek.review : null,
            newCards: week.thisWeek.new,
            forgotten: week.thisWeek.forget,
            streak: calcStreak(revlog),
            retention: retention.mature.reviews > 0 ? Math.round((retention.mature.rate ?? 0) * 100) : null,
        },
        {
            title: wr.weeklyReport_title,
            reviewed: wr.weeklyReport_reviewed,
            newCards: wr.weeklyReport_newCards,
            forgotten: wr.weeklyReport_forgotten,
            streak: wr.weeklyReport_streak,
            retention: wr.weeklyReport_retention,
            unknown: wr.weeklyReport_unknown,
            lastWeek: wr.weeklyReport_lastWeek,
            footer: wr.weeklyReport_footer,
        },
    );

    return {
        shouldWrite: true,
        docTitle: `小驴闪卡/学习周报/${decision.rangeStart} ~ ${decision.rangeEnd}`,
        markdown: md,
        weekKey: decision.weekKey,
    };
}
