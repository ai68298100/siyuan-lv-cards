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

export interface DashboardReportParams {
    todayDateStr?: string;
    dueCount: number;
    newCount: number;
    oldCount: number;
    todayReview: number;
    targetReview: number;
    streak: number;
    totalCards: number;
    decks: { name: string; size: number; updated: string }[];
    curve?: { days: number; rate: number; n: number }[];
    aiQuality?: { date: string; cards: number; reviews: number; rate: number | null }[];
    generatedAt?: Date;
}

/**
 * 组装主仪表盘学习报告 Markdown（纯函数，支持离线测试与格式定制）
 */
export function renderDashboardReportMarkdown(params: DashboardReportParams): string {
    const today = params.todayDateStr || (params.generatedAt ? params.generatedAt.toLocaleDateString() : new Date().toLocaleDateString());
    const now = params.generatedAt || new Date();
    const rows: string[] = [
        `# 小驴闪卡（内测版） · 学习报告（${today}）`, "",
        "## 总览", "",
        `- 今日到期：${params.dueCount}（新 ${params.newCount} / 复习 ${params.oldCount}）`,
        `- 今日已复习：${params.todayReview} / 目标 ${params.targetReview}`,
        `- 连续天数：${params.streak}`,
        `- 卡片总数：${params.totalCards}`, "",
        "## 复习集", "",
    ];
    for (const d of params.decks) {
        rows.push(`- ${d.name}：${d.size} 张（更新 ${d.updated}）`);
    }
    if (params.curve && params.curve.length >= 2) {
        rows.push("", "## 保持曲线（实测）", "");
        for (const p of params.curve) {
            rows.push(`- 间隔 ${p.days} 天：${Math.round(p.rate * 100)}%（n=${p.n}）`);
        }
    }
    if (params.aiQuality && params.aiQuality.length > 0) {
        rows.push("", "## AI 批次质量", "");
        for (const q of params.aiQuality) {
            rows.push(`- ${q.date}：${q.cards} 张 / 复习 ${q.reviews} / ${q.rate === null ? "样本积累中" : Math.round(q.rate * 100) + "%"}`);
        }
    }
    rows.push("", `> 由小驴闪卡（内测版）生成 · ${now.toLocaleString()}`);
    return rows.join("\n");
}

export interface WeekOverviewDay {
    date: Date;
    index: number;
    reviews: number;
    newCards: number;
    active: boolean;
    future: boolean;
    today: boolean;
}

export interface WeekOverviewResult {
    days: WeekOverviewDay[];
    start: Date;
    end: Date;
    activeDays: number;
    reviews: number;
}

/**
 * 计算星期一至星期日的本地周历复习分布（纯函数，不构造未来虚假数据）
 */
export function computeWeekOverview(params: {
    heat: { date: string; stat?: { review?: number; new?: number } }[];
    now?: Date;
    localDateKey?: (ts: number) => string;
}): WeekOverviewResult {
    const today = params.now ? new Date(params.now) : new Date();
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const weekday = (today.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - weekday);

    const defaultKey = (ts: number) => {
        const d = new Date(ts);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    };
    const keyFn = params.localDateKey || defaultKey;

    const days: WeekOverviewDay[] = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
        const key = keyFn(date.getTime());
        const stat = params.heat.find(item => item.date === key)?.stat;
        const reviews = stat?.review ?? 0;
        const newCards = stat?.new ?? 0;
        return {
            date,
            index,
            reviews,
            newCards,
            active: reviews + newCards > 0,
            future: index > weekday,
            today: index === weekday,
        };
    });

    return {
        days,
        start: days[0].date,
        end: days[6].date,
        activeDays: days.filter(day => day.active).length,
        reviews: days.reduce((sum, day) => sum + day.reviews, 0),
    };
}

/**
 * 计算记忆保持曲线与理论衰减参考线的 SVG 折线坐标点
 */
export function computeCurveSvgPaths(
    pts: { days: number; rate: number }[],
    options: { xMin?: number; xSpan?: number; yBase?: number; yAmp?: number } = {},
): { empirical: string; theoretical: string } {
    if (!pts || pts.length === 0) {
        return { empirical: "", theoretical: "" };
    }
    const xMin = options.xMin ?? 10;
    const xSpan = options.xSpan ?? 290;
    const yBase = options.yBase ?? 90;
    const yAmp = options.yAmp ?? 80;

    const maxD = Math.max(...pts.map(p => p.days), 1);
    const empirical = pts.map(p => `${xMin + (p.days / maxD) * xSpan},${yBase - p.rate * yAmp}`).join(" ");
    const theoretical = pts.map(p => `${xMin + (p.days / maxD) * xSpan},${yBase - Math.exp(-p.days / 5) * yAmp}`).join(" ");

    return { empirical, theoretical };
}

// ----------------------------------------------------------------------------
// AR-5 报告写入状态机与并发互斥控制器
// ----------------------------------------------------------------------------

export type ReportWriteStatus = "idle" | "busy" | "success" | "failed";

export type ReportWriteErrorType =
    | "no-notebook"
    | "permission-denied"
    | "syncing"
    | "timeout"
    | "network-failure"
    | "unknown";

/** 报告写入运行态上下文（单向不可变流动） */
export interface ReportWriteContext {
    status: ReportWriteStatus;
    inFlightTitle?: string;
    inFlightMarkdown?: string;
    draftTitle?: string;
    draftMarkdown?: string;
    errorType?: ReportWriteErrorType;
    errorI18nKey?: string;
    errorMessage?: string;
    lastSuccessDocId?: string;
    lastSuccessDocPath?: string;
    startedAt?: number;
    finishedAt?: number;
}

export function createReportWriteContext(): ReportWriteContext {
    return {
        status: "idle",
    };
}

/**
 * 智能分类报告写入异常（无笔记本/权限不足/同步中/超时）
 */
export function classifyReportWriteError(err: unknown): {
    type: ReportWriteErrorType;
    i18nKey: string;
    message: string;
} {
    const rawMsg = err instanceof Error ? err.message : String(err ?? "");
    const lower = rawMsg.toLowerCase();

    if (lower.includes("no-notebook") || lower.includes("no notebook") || lower.includes("找不到笔记本") || lower.includes("未找到可用笔记本") || lower.includes("无可用笔记本") || (lower.includes("笔记本") && (lower.includes("未找到") || lower.includes("无") || lower.includes("缺失")))) {
        return {
            type: "no-notebook",
            i18nKey: "reportWriter.error.noNotebook",
            message: rawMsg || "未找到可用笔记本",
        };
    }

    if (lower.includes("permission") || lower.includes("read-only") || lower.includes("readonly") || lower.includes("权限不足") || lower.includes("只读")) {
        return {
            type: "permission-denied",
            i18nKey: "reportWriter.error.permissionDenied",
            message: rawMsg || "目标笔记本处于只读状态或权限不足",
        };
    }

    if (lower.includes("sync") || lower.includes("同步中") || lower.includes("busy") || lower.includes("锁定")) {
        return {
            type: "syncing",
            i18nKey: "reportWriter.error.syncing",
            message: rawMsg || "笔记本同步中，请稍后重试",
        };
    }

    if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("超时")) {
        return {
            type: "timeout",
            i18nKey: "reportWriter.error.timeout",
            message: rawMsg || "写入请求超时",
        };
    }

    if (lower.includes("network") || lower.includes("fetch") || lower.includes("econnrefused")) {
        return {
            type: "network-failure",
            i18nKey: "reportWriter.error.networkFailure",
            message: rawMsg || "网络连接异常",
        };
    }

    return {
        type: "unknown",
        i18nKey: "reportWriter.error.unknown",
        message: rawMsg || "写入报告发生未知错误",
    };
}

/**
 * 开始写入（加锁，防并发重入）：若当前已处于 busy 状态则抛出异常
 */
export function startReportWrite(
    ctx: ReportWriteContext,
    title: string,
    markdown: string,
    now: number = Date.now(),
): ReportWriteContext {
    if (ctx.status === "busy") {
        throw new Error("REPORT_WRITE_BUSY: another write is currently in-flight");
    }

    return {
        ...ctx,
        status: "busy",
        inFlightTitle: title,
        inFlightMarkdown: markdown,
        errorType: undefined,
        errorI18nKey: undefined,
        errorMessage: undefined,
        startedAt: now,
        finishedAt: undefined,
    };
}

/**
 * 成功完成写入：清空草稿与忙碌标记，记录落地文档 ID 与路径
 */
export function completeReportWrite(
    ctx: ReportWriteContext,
    docId: string,
    docPath: string,
    now: number = Date.now(),
): ReportWriteContext {
    return {
        ...ctx,
        status: "success",
        inFlightTitle: undefined,
        inFlightMarkdown: undefined,
        draftTitle: undefined,
        draftMarkdown: undefined,
        lastSuccessDocId: docId,
        lastSuccessDocPath: docPath,
        finishedAt: now,
    };
}

/**
 * 写入失败：将在途数据安全沉淀为草稿（draftMarkdown/draftTitle），分类并保存错误信息
 */
export function failReportWrite(
    ctx: ReportWriteContext,
    err: unknown,
    now: number = Date.now(),
): ReportWriteContext {
    const classification = classifyReportWriteError(err);

    return {
        ...ctx,
        status: "failed",
        draftTitle: ctx.inFlightTitle ?? ctx.draftTitle,
        draftMarkdown: ctx.inFlightMarkdown ?? ctx.draftMarkdown,
        inFlightTitle: undefined,
        inFlightMarkdown: undefined,
        errorType: classification.type,
        errorI18nKey: classification.i18nKey,
        errorMessage: classification.message,
        finishedAt: now,
    };
}

/**
 * 显式丢弃/清除已保留的草稿
 */
export function clearReportWriteDraft(ctx: ReportWriteContext): ReportWriteContext {
    return {
        ...ctx,
        draftTitle: undefined,
        draftMarkdown: undefined,
    };
}

/**
 * 受保护的报告写入高阶异步执行器：统一执行加锁、写入、成功与失败补偿
 */
export async function executeProtectedReportWrite(
    ctx: ReportWriteContext,
    params: {
        title: string;
        markdown: string;
        writeAction: (title: string, markdown: string) => Promise<{ docId: string; docPath: string }>;
        onStateChange?: (nextCtx: ReportWriteContext) => void;
        now?: number;
    },
): Promise<{ success: boolean; context: ReportWriteContext; docId?: string; docPath?: string }> {
    const initialNow = params.now ?? Date.now();
    let current = startReportWrite(ctx, params.title, params.markdown, initialNow);
    params.onStateChange?.(current);

    try {
        const res = await params.writeAction(params.title, params.markdown);
        current = completeReportWrite(current, res.docId, res.docPath, Date.now());
        params.onStateChange?.(current);
        return {
            success: true,
            context: current,
            docId: res.docId,
            docPath: res.docPath,
        };
    } catch (err) {
        current = failReportWrite(current, err, Date.now());
        params.onStateChange?.(current);
        return {
            success: false,
            context: current,
        };
    }
}

