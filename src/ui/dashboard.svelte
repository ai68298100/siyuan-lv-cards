<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { getRiffDecks, getRiffCards, getRiffDueCards, type RiffDeck } from "@/api/riff";
    import { dueCache } from "@/api/due-shared";
    import { isSessionLive, type EndReason } from "@/core/session-state";
    import { decideTodayAction } from "@/core/today-decision";
    import { buildDeckDashboard, type DeckDashboardRow } from "@/core/deck-dashboard";
    import { srExportLine, composeSrExport } from "@/core/obsidian-import";
    import { getFlashcardStatistics, summarizeStatistics, type MigrationStatus } from "@/api/flashcardV2";
    import { calcStreak, lastNDays, localDate, studySecondsOn, coverageStats, deckCoverage, computeRetention, computeRetentionCurve, reviewStatsFor, weekCompare, calcMilestones, calcXp, type RevlogData, type RetentionResult, type CurvePoint, type WeekDelta, type Milestones, type XpResult, type CoverageStats, type DeckCoverage } from "@/core/revlog";
    import { buildForecast, buildMonthGrid, dueMapFromForecast, type ForecastResult, type CalendarCell } from "@/core/forecast";
    import { renderDashboardReportMarkdown, computeWeekOverview, computeCurveSvgPaths } from "@/core/report-writer";
    import { openTab, showMessage } from "siyuan";
    import { friendlyError } from "@/api/errors";
    import { getMotionDuration } from "./kit/motion";
    import LvPage from "./kit/LvPage.svelte";
    import LvSection from "./kit/LvSection.svelte";
    import LvStat from "./kit/LvStat.svelte";
    import LvHeatmap from "./kit/LvHeatmap.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvError from "./kit/LvError.svelte";
    import LvCalendar from "./kit/LvCalendar.svelte";

    export interface DashboardCtx {
        i18n: any;
        app: any;
        getRevlog: () => RevlogData;
        getV2Status: () => MigrationStatus | null;
        getDailyTargets: () => { new: number; review: number };
        openReview: () => void;
        /** 空库时的直接制卡入口；与上手引导并列，避免新用户只能先看说明。 */
        openQuickCard?: () => void;
        openManagerDeck?: (deckID: string, deckName: string) => void;
        openManager: () => void;
        openOnboarding: () => void;
        getAIBatches: () => { id: string; date: string; deckID: string; blockIDs: string[]; tokens?: number }[];
        getLeechCards: () => { blockID: string; lapses: number }[];
        rewriteWithAI: (blockID: string) => void;
        writeReportDoc: (md: string) => Promise<void>;
        getExamCountdown: () => { name: string; days: number } | null;
        /** XP 激励开关（M8·FR3） */
        getXpEnabled: () => boolean;
        /** 订阅会话完成事件（549）：复习结束后跨页签刷新总览，返回取消函数 */
        onSessionFinished?: (cb: () => void) => () => void;
        /** 订阅评分事件（AT-11）：原生/插件两路评分统一经此失效统计缓存，返回取消函数 */
        onReviewed?: (cb: () => void) => () => void;
        /** 订阅跨前端存储重载事件：同步/其他窗口写入后刷新当前总览 */
        onStoresChanged?: (cb: () => void) => () => void;
        /** 文档维度覆盖（AQ-12）：块归属查内核后聚合；null=查询失败隐藏 */
        getDocCoverage?: () => Promise<{ docs: { docID: string; title: string; seen: number }[]; unattributed: number } | null>;
        /** 未完成的 AI 导入（ADR-7）：null=无 */
        getUnfinishedAIJob?: () => { id: string; done: number; total: number } | null;
        /** 打开 AI 向导（未完成导入的续传入口在其中） */
        openAIWizard?: () => void;
        /** 热力图范围周数（439） */
        getHeatmapWeeks: () => number;
        /** BJ-1：能力分布统计（基于已登记知识对象实例；口径=插件侧标注覆盖） */
        getCapabilityShare?: () => { cap: string; count: number; pct: number }[];
        /** BJ-4：错误原因分布统计（遗忘卡标注；口径=当日或全量） */
        getErrorReasonStats?: () => { reason: string; count: number }[];
        /** T01 今日行动 hero（docs/39 批 2）：当日会话状态（续场判断；可缺省） */
        getSessionState?: () => { date: string; reviewedIDs?: string[]; skippedIDs?: string[]; counters: { new: number; review: number; forget: number; skip: number }; endReason?: EndReason | null; completed?: boolean };
        /** T01 可用时间（docs/40）：hero 选择落偏好，复习开场默认预算 */
        getSessionBudget?: () => number;
        setSessionBudget?: (min: number) => void;
        /** T01 深度统计展开态持久化 */
        getDeepStatsOpen?: () => boolean;
        setDeepStatsOpen?: (open: boolean) => void;
        /** T08 待处理聚合（docs/40 批 5 简化版） */
        getInboxOpenCount?: () => number;
        getSuspendedCount?: () => number;
        getMaintenanceDebtCount?: () => number;
        restoreSuspendedToday?: () => Promise<number>;
        /** 直达 hub 其他页签（收件箱等） */
        openHubTab?: (id: string) => void;
        /** 把可信的今日到期数同步给 Hub 导航；读取开始/失败时传 null，避免显示过期数字。 */
        onDueCount?: (count: number | null) => void;
    }

    let { ctx }: { ctx: DashboardCtx } = $props();
    const t = $derived(ctx.i18n);

    let loading = $state(true);
    let decks: RiffDeck[] = $state([]);
    let dueCount = $state(0);
    let newCount = $state(0);
    // T01（docs/39 批 2）：今日行动 hero——当日未收场会话可「继续本场」；深度统计默认折叠
    let sessReps = $state(0);
    let sessLive = $state(false);
    let deepOpen = $state(false);
    // T01 可用时间（docs/40）：hero 选择，落偏好并在复习开场生效
    let sessionBudget = $state(15);
    const BUDGET_CHOICES = [0, 5, 15, 30, 60] as const;
    // 本地日期跨午夜后驱动页眉与本周视图重算；避免长时间驻留时“今日”停在前一天。
    let dayTick = $state(Date.now());
    let dayBoundaryTimer: ReturnType<typeof setTimeout> | null = null;
    // T08 待处理聚合（docs/40 批 5 简化版）：疑问/暂停/续传
    let inboxOpen = $state(0);
    let suspended = $state(0);
    let suspendedRestoreBusy = $state(false);
    let suspendedRestoreError = $state("");
    // 页眉日期（R53 .page-head eyebrow 口径）：本地日期 YYYY.MM.DD
    function heroDateText(): string {
        void dayTick;
        const d = new Date();
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    }
    let oldCount = $state(0);
    let streak = $state(0);
    let todayReview = $state(0);
    /** 今日作答用时分钟（AQ-13）：无 dur 记录时为 0 不展示 */
    let todayStudyMinutes = $state(0);
    /** 卡片覆盖（AQ-12 本地证据口径）：分母缺失时为 null 不展示 */
    let coverage = $state<CoverageStats | null>(null);
    /** 卡组维度覆盖（AQ-12 剩余面）：按 revlog.deckID 归属，原生缺 deckID 进 unattributed */
    let deckCov = $state<DeckCoverage | null>(null);
    /** 文档维度覆盖（AQ-12）：null=查询失败/未提供，隐藏该区 */
    let docCov = $state<{ docs: { docID: string; title: string; seen: number }[]; unattributed: number } | null>(null);
    /** 未完成的 AI 导入（ADR-7）：null=无 */
    let unfinishedAI = $state<{ id: string; done: number; total: number } | null>(null);
    /** BJ-1：能力分布（知识对象实例标注；null=宿主未提供或无数据） */
    let koStats = $state<{ cap: string; count: number; pct: number }[] | null>(null);
    /** BJ-4：错误原因分布（遗忘卡标注；null=宿主未提供或无数据） */
    let errStats = $state<{ reason: string; count: number }[] | null>(null);
    let totalCards = $state(0);
    let heat: { date: string; stat: { new: number; review: number; forget: number } }[] = $state([]);
    let revlogNote = $state("");
    let errorMsg = $state("");
    let hasLoadedSnapshot = $state(false);
    let lastSuccessfulAt = $state(0);
    let v2Stats: { key: string; value: string }[] = $state([]);
    let retention: RetentionResult | null = $state(null);
    let curve: CurvePoint[] = $state([]);
    let week: WeekDelta | null = $state(null);
    let milestones: Milestones | null = $state(null);
    let xp: XpResult | null = $state(null);
    let curveEl: SVGSVGElement | null = $state(null);

    /** 图表导出 PNG（M5）：SVG→canvas，CSS 变量先解析为具体色值（独立渲染无级联上下文） */
    function exportCurvePng() {
        if (!curveEl) return;
        const clone = curveEl.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const srcEls = Array.from(curveEl.querySelectorAll("*"));
        Array.from(clone.querySelectorAll("*")).forEach((el, i) => {
            const src = srcEls[i] as HTMLElement | SVGElement | undefined;
            if (!src) return;
            const cs = getComputedStyle(src);
            for (const prop of ["stroke", "fill", "stroke-width", "stroke-dasharray", "opacity"] as const) {
                const val = cs.getPropertyValue(prop);
                if (val && (el.getAttribute(prop) !== null || prop === "stroke" || prop === "fill")) {
                    el.setAttribute(prop, val.trim());
                }
            }
        });
        // 底色填充，避免透明背景导出后不可见
        const bg = getComputedStyle(document.body).getPropertyValue("--b3-theme-surface").trim() || "#ffffff";
        const xml = new XMLSerializer().serializeToString(clone);
        const rect = `<rect x="0" y="0" width="100%" height="100%" fill="${bg}"/>`;
        const svgWithBg = xml.replace(/(<svg[^>]*>)/, `$1${rect}`);
        const url = URL.createObjectURL(new Blob([svgWithBg], { type: "image/svg+xml;charset=utf-8" }));
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 960;
            canvas.height = 300;
            const c = canvas.getContext("2d");
            if (!c) { URL.revokeObjectURL(url); return; }
            c.fillStyle = bg;
            c.fillRect(0, 0, canvas.width, canvas.height);
            c.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(blob => {
                if (!blob) return;
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `lv-cards-curve-${localDate(Date.now())}.png`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            });
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
    }
    let aiQuality = $state<{ date: string; cards: number; reviews: number; rate: number | null }[]>([]);
    /** AI 累计 token 消耗（299） */
    let tokensTotal = $state(0);
    let leech: { blockID: string; lapses: number }[] = $state([]);
    let examChip = $state<{ name: string; days: number } | null>(null);
    let targets = $state({ new: 0, review: 0 });

    function curvePoints(pts: CurvePoint[]): string {
        return computeCurveSvgPaths(pts).empirical;
    }

    /** 理论参考线：固定衰减 R=exp(-t/5d)（个人化 S 待 V2 Stability） */
    function theoryPoints(pts: CurvePoint[]): string {
        return computeCurveSvgPaths(pts).theoretical;
    }

    /** 构建 Markdown 报告内容（总览+复习集+曲线+AI 批次） */
    function buildReportMd(): string {
        return renderDashboardReportMarkdown({
            dueCount,
            newCount,
            oldCount,
            todayReview,
            targetReview: ctx.getDailyTargets().review,
            streak,
            totalCards,
            decks,
            curve,
            aiQuality,
        });
    }

    /** 学习报告下载 Markdown 文件 */
    function downloadReport() {
        const md = buildReportMd();
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lv-cards-report-${localDate(Date.now())}.md`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** AR-5：报告写入文档——busy 防重复点击 + catch 展示原因（报告纯函数随时可重试） */
    let writeBusy = $state(false);
    let writeError = $state("");
    async function writeDocReport() {
        if (writeBusy) {
            return;
        }
        writeBusy = true;
        writeError = "";
        try {
            await ctx.writeReportDoc(buildReportMd());
        } catch (e: any) {
            writeError = friendlyError(e, t);
        } finally {
            writeBusy = false;
        }
    }

    /** 数字滚动统一由 LvStat 的 animate 承担（reduced-motion 直落） */
    function targetPct(): number {
        const target = targets.review;
        if (target <= 0) {
            return -1;
        }
        return Math.min(100, Math.round((todayReview / target) * 100));
    }

    const todayDecision = $derived.by(() => {
        // 宿主的本地存储 getter 本身不是响应式源，每次成功快照和跨日后重新判定。
        void lastSuccessfulAt;
        void dayTick;
        const revlog = ctx.getRevlog();
        const lastEntry = revlog?.entries?.[revlog.entries.length - 1];
        const daysGap = lastEntry?.ts ? Math.floor((Date.now() - lastEntry.ts) / 86400000) : null;
        const maintDebt = ctx.getMaintenanceDebtCount ? ctx.getMaintenanceDebtCount() : 0;
        return decideTodayAction({
            dueCount,
            unknownDue: Boolean(errorMsg),
            hasLiveSession: sessLive,
            sessionReviewedCount: sessReps,
            daysGap,
            inboxCount: inboxOpen,
            maintenanceDebtCount: maintDebt,
            suspendedCount: suspended,
        }, t);
    });

    function heroActionLabel(): string {
        if (totalCards === 0 && ctx.openQuickCard) return t.cmdQuickCard ?? "快速制卡";
        return todayDecision.primaryActionLabel;
    }

    function heroAction(): void {
        if (todayDecision.actionDisabled) return;
        if (totalCards === 0 && ctx.openQuickCard) {
            ctx.openQuickCard();
            return;
        }
        if (todayDecision.primaryAction === "continue-review" || todayDecision.primaryAction === "start-review") {
            ctx.openReview();
        } else if (todayDecision.primaryAction === "open-inbox") {
            if (ctx.openHubTab) ctx.openHubTab("inbox");
            else ctx.openManager();
        } else if (todayDecision.primaryAction === "open-maintenance") {
            if (ctx.openHubTab) ctx.openHubTab("maintenance");
            else ctx.openManager();
        } else if (todayDecision.primaryAction === "open-library") {
            ctx.openManager();
        }
    }

    async function restoreSuspendedToday() {
        if (suspendedRestoreBusy || !ctx.restoreSuspendedToday) return;
        suspendedRestoreBusy = true;
        suspendedRestoreError = "";
        try {
            suspended = await ctx.restoreSuspendedToday();
        } catch (e) {
            const detail = friendlyError(e, t);
            suspendedRestoreError = t.dashboard.todoSuspendedFailed.replace("${error}", detail);
        } finally {
            suspendedRestoreBusy = false;
        }
    }

    /** hero 环首绘（灵动感）：先画 0 弧，下一帧过渡到目标值；reduced-motion 时 --lv-dur-3=0 直落 */
    let ringDrawn = $state(false);
    onMount(() => {
        requestAnimationFrame(() => {
            ringDrawn = true;
        });
    });

    /** R53 统计瓦片走势（docs/42 §3.4）：近 7 天正式复习量——只喂真实数据，无记录不补 0 走势 */
    function studySpark(): number[] {
        return heat.slice(-7).map(h => h.stat.review);
    }

    /** 本周星期一至星期日的本地记录；未来日期和未知记录保持为空，不补造学习量。 */
    function weekOverview() {
        void dayTick;
        return computeWeekOverview({ heat, localDateKey: localDate });
    }
    const currentWeek = $derived(weekOverview());
    const weekDateLabel = $derived.by(() => {
        const format = (date: Date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        return t.dashboard.weekSubtitle
            .replace("${start}", format(currentWeek.start))
            .replace("${end}", format(currentWeek.end));
    });

    // ---- T14 学习日历与负载预测（docs/41 P0 · docs/42 §4）：深度统计区内懒加载，预测只读不改调度 ----
    let calForecast = $state<ForecastResult | null>(null);
    let calCells = $state<CalendarCell[]>([]);
    let calLoading = $state(false);
    let calLoadedOnce = $state(false);
    let calAttempted = $state(false);
    let calError = $state("");
    let calSeq = 0;

    // 首次展开深度统计时拉取一次；此后随 refresh() 的 heat 更新不再自动重拉（预测是旁路增强）
    $effect(() => {
        if (deepOpen && !calAttempted) void loadForecast();
        if (deepOpen && !ddAttempted && decks.length > 0) void loadDeckDashboard();
    });

    // T-卡组仪表盘（docs/41 P1）：近 30 天本地日志按卡组聚合；到期/新卡来自内核实时（每卡组一次，上限 12 组）
    let ddRows = $state<DeckDashboardRow[]>([]);
    let ddLoading = $state(false);
    let ddAttempted = $state(false);
    let ddError = $state("");
    let ddSeq = 0;

    function ddStripHtml(html: string): string {
        const div = document.createElement("div");
        div.innerHTML = html ?? "";
        return (div.textContent ?? "").trim();
    }

    /** T-分享包（docs/41 P1）：整卡组导出为 Obsidian SR markdown——可用本插件导入器回导（卡组同名映射） */
    let ddExportBusy = $state(false);
    async function exportDeckShare(deckID: string, deckName: string) {
        if (ddExportBusy) return;
        ddExportBusy = true;
        try {
            const lines: ReturnType<typeof srExportLine>[] = [];
            let page = 1;
            let pageCount = 1;
            do {
                const r = await getRiffCards(deckID, page, 100);
                pageCount = Number(r.pageCount ?? 1);
                for (const b of r.blocks ?? []) lines.push(srExportLine(ddStripHtml(b.content), { deckHint: deckName }));
                page += 1;
            } while (page <= pageCount && page <= 20);
            if (lines.length === 0) {
                showMessage(t.dashboard.ddShareEmpty, 2000, "info");
                return;
            }
            const md = composeSrExport(lines);
            const blob = new Blob([md], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `分享包-${deckName}-${new Date().toISOString().slice(0, 10)}.md`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showMessage(t.dashboard.ddShareDone
                .replace("${qa}", String(lines.filter(l => l.kind === "qa").length))
                .replace("${c}", String(lines.filter(l => l.kind === "cloze").length)), 2500, "info");
        } catch (e) {
            showMessage(friendlyError(e, t), 3500, "error");
        } finally {
            ddExportBusy = false;
        }
    }

    async function loadDeckDashboard() {
        if (ddLoading || decks.length === 0) return;
        const seq = ++ddSeq;
        ddAttempted = true;
        ddLoading = true;
        ddError = "";
        try {
            const dueByDeck = new Map<string, { due: number; newCards: number }>();
            const top = [...decks].sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(0, 12);
            const dueResults = await Promise.all(top.map(async d => {
                const due = await getRiffDueCards(d.id, []);
                return [d.id, { due: due.unreviewedOldCardCount ?? 0, newCards: due.unreviewedNewCardCount ?? 0 }] as const;
            }));
            if (seq !== ddSeq) return;
            for (const [id, due] of dueResults) {
                dueByDeck.set(id, due);
            }
            ddRows = buildDeckDashboard(ctx.getRevlog().entries, decks.map(d => d.id), dueByDeck, { now: new Date() });
        } catch (e) {
            if (seq === ddSeq) {
                ddError = friendlyError(e, t);
                ddRows = [];
            }
        } finally {
            if (seq === ddSeq) ddLoading = false;
        }
    }

    async function loadForecast() {
        if (calLoading) return;
        const seq = ++calSeq;
        calAttempted = true;
        calLoading = true;
        calError = "";
        try {
            const now = new Date();
            const cards: { due: string; state: number }[] = [];
            // 分页拉全量（上限 20 页 × 100）：页脚标注覆盖面，超出部分不进预测
            let page = 1;
            let pageCount = 1;
            do {
                const r = await getRiffCards("", page, 100);
                pageCount = Number(r.pageCount ?? 1);
                for (const b of r.blocks ?? []) {
                    const rc = (b as any).riffCard ?? (b as any).RiffCard;
                    if (rc) cards.push({ due: String(rc.due ?? ""), state: Number(rc.state ?? 0) });
                }
                page += 1;
            } while (page <= pageCount && page <= 20);
            if (seq !== calSeq) return;
            calForecast = buildForecast(cards, { today: now, horizonDays: 14, dailyNewTarget: targets.new });
            const dueByDate = dueMapFromForecast(calForecast.days);
            const reviewsByDate = new Map(heat.map(h => [h.date, h.stat.review]));
            calCells = buildMonthGrid(now.getFullYear(), now.getMonth() + 1, now, reviewsByDate, dueByDate);
            calLoadedOnce = true;
        } catch (e) {
            if (seq === calSeq) calError = friendlyError(e, t);
        }
        finally {
            if (seq === calSeq) calLoading = false;
        }
    }

    /** AR-6：刷新 generation——手动刷新/session-finished/reviewed 并发时旧响应不覆盖新状态 */
    let refreshSeq = 0;
    let reviewedTimer: ReturnType<typeof setTimeout> | null = null;

    /** AT-11：评分高频（连刷几张）时合并为一次刷新，保留用户当前页不闪动 */
    function scheduleRefresh() {
        if (reviewedTimer) {
            clearTimeout(reviewedTimer);
        }
        reviewedTimer = setTimeout(() => {
            reviewedTimer = null;
            refresh();
        }, 800);
    }

    async function refresh() {
        const seq = ++refreshSeq;
        loading = true;
        errorMsg = "";
        ctx.onDueCount?.(null);
        try {
            // 性能（docs/40 收尾）：三个异步源并行——文档归属/V2 统计的 SQL 不再串行阻塞
            // hero 统计（到期数等）的渲染；快路径先行呈现，慢面板就绪后渐进补齐
            const docCovPromise: Promise<{ docs: { docID: string; title: string; seen: number }[]; unattributed: number } | null> =
                ctx.getDocCoverage ? ctx.getDocCoverage().catch(() => null) : Promise.resolve(null);
            const v2StatsPromise: Promise<any[]> = ctx.getV2Status()
                ? getFlashcardStatistics({}).then((s) => s as unknown as any[]).catch(() => [])
                : Promise.resolve([]);
            const [deckList, due] = await Promise.all([
                getRiffDecks(),
                dueCache.get(""), // AT-4：与 badge/挑战/配对等并发读取共享缓存，评分后经 invalidate 拉新
            ]);
            if (seq !== refreshSeq) {
                return; // 旧响应：不改统计与到期数
            }
            decks = deckList;
            totalCards = deckList.reduce((acc, d) => acc + (d.size ?? 0), 0);
            const revlog = ctx.getRevlog();
            streak = calcStreak(revlog);
            heat = lastNDays(revlog, Math.max(4, ctx.getHeatmapWeeks()) * 7);
            const todayKey = heat[heat.length - 1]?.date;
            const reviewedToday = todayKey ? (revlog.days[todayKey]?.review ?? 0) : 0;
            todayReview = reviewedToday;
            todayStudyMinutes = Math.round(studySecondsOn(revlog, localDate(Date.now())) / 60);
            coverage = coverageStats(revlog, totalCards || undefined);
            deckCov = deckCoverage(revlog, deckList.map(d => ({ id: d.id, size: d.size })));
            unfinishedAI = ctx.getUnfinishedAIJob?.() ?? null;
            // BJ-1：能力分布（可选 ctx；无实例返回空数组→区块隐藏）
            koStats = ctx.getCapabilityShare?.() ?? null;
            errStats = ctx.getErrorReasonStats?.() ?? null;
            dueCount = due.unreviewedCount;
            ctx.onDueCount?.(due.unreviewedCount);
            newCount = due.unreviewedNewCardCount;
            const sess = ctx.getSessionState?.();
            const d = new Date();
            const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            sessLive = isSessionLive(sess, localToday);
            sessReps = sessLive ? sess!.counters.new + sess!.counters.review + sess!.counters.forget : 0;
            sessionBudget = ctx.getSessionBudget?.() ?? 15;
            deepOpen = ctx.getDeepStatsOpen?.() ?? false;
            inboxOpen = ctx.getInboxOpenCount?.() ?? 0;
            suspended = ctx.getSuspendedCount?.() ?? 0;
            oldCount = due.unreviewedOldCardCount;
            const first = revlog.entries[0]?.ts;
            revlogNote = first ? new Date(first).toLocaleDateString() : "";
            retention = computeRetention(revlog);
            curve = computeRetentionCurve(revlog);
            week = weekCompare(revlog);
            milestones = calcMilestones(revlog);
            xp = ctx.getXpEnabled() ? calcXp(revlog) : null;
            aiQuality = ctx
                .getAIBatches()
                .filter(b => b.blockIDs.length > 0)
                .slice(-5)
                .reverse()
                .map(b => {
                    const stat = reviewStatsFor(revlog, b.blockIDs);
                    return { date: b.date, cards: b.blockIDs.length, reviews: stat.reviews, rate: stat.rate };
                });
            // token 消耗历史（299）：全部批次累计（旧批次无 tokens 字段按 0 计）
            tokensTotal = ctx.getAIBatches().reduce((acc, b) => acc + (b.tokens ?? 0), 0);
            leech = ctx.getLeechCards().slice(0, 8);
            examChip = ctx.getExamCountdown();
            targets = ctx.getDailyTargets();
            // 快路径完成：hero 与统计立即可见（慢面板就绪后渐进补齐）
            hasLoadedSnapshot = true;
            lastSuccessfulAt = Date.now();
            loading = false;
            const nextDocCov = await docCovPromise;
            if (seq !== refreshSeq) {
                return; // 文档归属查询期间用户已刷新（AR-6 generation 守卫）
            }
            docCov = nextDocCov;
            // 内核 V2（3.9.0）激活时，顺带拉取官方统计摘要（宽容解析，失败静默）
            if (ctx.getV2Status()) {
                try {
                    const stats = await v2StatsPromise;
                    if (seq === refreshSeq) {
                        v2Stats = summarizeStatistics(stats);
                    }
                } catch {
                    if (seq === refreshSeq) {
                        v2Stats = [];
                    }
                }
            }
        } catch (e: any) {
            if (seq === refreshSeq) {
                errorMsg = friendlyError(e, t);
            }
        } finally {
            if (seq === refreshSeq) {
                loading = false;
            }
        }
    }

    onMount(() => {
        refresh();
        const scheduleDayBoundary = () => {
            const now = new Date();
            const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const delay = Math.max(1_000, next.getTime() - now.getTime() + 50);
            dayBoundaryTimer = setTimeout(() => {
                dayBoundaryTimer = null;
                dayTick = Date.now();
                void refresh();
                scheduleDayBoundary();
            }, delay);
        };
        scheduleDayBoundary();
        // 会话完成联动（549）+ 评分联动（AT-11）：跨页签失效总览缓存
        const offFinished = ctx.onSessionFinished?.(() => refresh());
        const offReviewed = ctx.onReviewed?.(() => scheduleRefresh());
        const offStores = ctx.onStoresChanged?.(() => scheduleRefresh());
        return () => {
            refreshSeq += 1;
            calSeq += 1;
            ddSeq += 1;
            offFinished?.();
            offReviewed?.();
            offStores?.();
            if (reviewedTimer) {
                clearTimeout(reviewedTimer);
                reviewedTimer = null;
            }
            if (dayBoundaryTimer) {
                clearTimeout(dayBoundaryTimer);
                dayBoundaryTimer = null;
            }
        };
    });
</script>

<LvPage eyebrow={`TODAY / ${heroDateText()}`} title={t.dashboard.title} subtitle={revlogNote ? `${t.dashboard.since} ${revlogNote}` : ""}>
    {#snippet actions()}
        <!-- R53 动作组：次级动作全部 ghost（主动作唯一——hero CTA）；报告/写入/管理器/刷新 -->
        <button class="b3-button b3-button--small lv-btn-ghost" disabled={loading && !hasLoadedSnapshot} onclick={downloadReport}>{t.dashboard.report}</button>
        <!-- AR-5：写入中禁点；失败原因就近展示（报告可重试，草稿不丢） -->
        <button class="b3-button b3-button--small lv-btn-ghost" disabled={writeBusy || (loading && !hasLoadedSnapshot)} title={writeError || undefined} onclick={writeDocReport}>{writeBusy ? "…" : t.dashboard.writeDoc}</button>
        <button class="b3-button b3-button--small lv-btn-ghost" onclick={() => ctx.openManager()}>{t.menuManager}</button>
        <button class="b3-button b3-button--small lv-btn-ghost" disabled={loading} onclick={refresh}>{loading ? t.dashboard.loading : t.dashboard.refresh}</button>
    {/snippet}

    {#if writeError}
        <!-- AR-5：写入失败原因就近展示（按钮 title 同步提示） -->
        <div class="lv-glass" style="border-color: var(--lv-color-danger); padding: 6px 10px; margin-bottom: calc(var(--lv-space-unit) * 4)">
            <span class="ft__smaller" style="color: var(--lv-color-danger)">{writeError}</span>
        </div>
    {/if}
    {#if ctx.getV2Status()}
        <div class="lv-glass lv-v2banner">
            <span class="lv-dot"></span>
            <LvChip tone="primary">V2 · {ctx.getV2Status()!.state}</LvChip>
            <span class="ft__smaller ft__on-surface">{t.dashboard.v2Active}</span>
        </div>
    {/if}
    {#if examChip}
        <div class="lv-glass lv-v2banner">
            <LvChip tone={examChip.days <= 7 ? "error" : "warn"}>🎓 {examChip.name} · {t.exam.daysLeft.replace("${n}", String(examChip.days))}</LvChip>
            <span class="ft__smaller ft__on-surface">{t.exam.examChipHint}</span>
        </div>
    {/if}

    {#if loading && !hasLoadedSnapshot}
        <!-- 感知性能：骨架对位真实布局（hero + 四瓦片），加载完成不跳动 -->
        <div class="lv-loading" aria-busy="true">
            <div class="lv-skeleton lv-sk-hero"></div>
            <div class="lv-sk-tiles">
                {#each [0, 1, 2, 3] as i (i)}
                    <div class="lv-skeleton lv-sk-tile"></div>
                {/each}
            </div>
        </div>
    {:else if errorMsg && !hasLoadedSnapshot}
        <LvError message={errorMsg} onretry={refresh} retryLabel={t.dashboard.refresh} />
    {:else if totalCards === 0}
        {#if errorMsg}<LvError message={errorMsg} onretry={refresh} retryLabel={t.dashboard.refresh} />{/if}
        {#if loading}<div class="lv-refresh-status" role="status" aria-live="polite">{t.dashboard.refreshing ?? t.dashboard.loading}</div>{/if}
        <section class="lv-first-use" aria-labelledby="lv-first-use-title">
            <div class="lv-eyebrow">{t.hubPrimaryToday ?? "今日"}</div>
            <h2 id="lv-first-use-title">{t.dashboard.emptyStateTitle ?? "让第一张卡，简单一点"}</h2>
            <p>{t.dashboard.emptyStateDesc ?? t.dashboard.onboardingHint}</p>
            <div class="lv-empty-note-card">
                <div class="lv-empty-note-icon" aria-hidden="true">💡</div>
                <div class="lv-empty-note-content">
                    <strong>{t.dashboard.emptyGuideTitle ?? "思源笔记即是闪卡"}</strong>
                    <p>{t.dashboard.emptyGuideDesc ?? "无需单独录入卡片。在文档中选中文本打上 ==挖空==，或点击段落块图标「制作闪卡」，即可自动生成复习卡片。"}</p>
                </div>
            </div>
            <div class="lv-first-use-actions">
                {#if ctx.openQuickCard}
                <button class="b3-button lv-btn-primary" disabled={!ctx.openQuickCard} aria-describedby={!ctx.openQuickCard ? "lv-first-use-title" : undefined} onclick={() => ctx.openQuickCard?.()}>{t.dashboard.emptyStateCreate ?? t.cmdQuickCard ?? "新建闪卡"}</button>
                {/if}
                <button class="b3-button b3-button--outline" onclick={ctx.openOnboarding}>{t.dashboard.emptyGuideTour ?? t.dashboard.emptyStateTry ?? t.dashboard.onboardingStart}</button>
            </div>
            <div class="lv-first-use-steps">
                <div><span>1</span><p>{t.dashboard.emptyStepSource ?? "选一段值得记住的内容"}</p></div>
                <div><span>2</span><p>{t.dashboard.emptyStepQuestion ?? "写一个清楚的问题"}</p></div>
                <div><span>3</span><p>{t.dashboard.emptyStepRecall ?? "先回忆，再对照答案"}</p></div>
            </div>
        </section>
    {:else}
        {#if loading}
            <div class="lv-refresh-status" role="status" aria-live="polite">{t.dashboard.refreshing ?? t.dashboard.loading}</div>
        {/if}
        {#if errorMsg}
            <LvError message={errorMsg} onretry={refresh} retryLabel={t.dashboard.refresh} />
        {/if}
        {#if !errorMsg || hasLoadedSnapshot}
        {#if errorMsg && hasLoadedSnapshot}
            <div class="lv-notice lv-notice--warn" role="status">
                {t.dashboard.staleData.replace("${time}", new Date(lastSuccessfulAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}
            </div>
        {/if}

        <!-- AI 写入状态可能未知；所有入口统一进入恢复中心核对。 -->
        {#if unfinishedAI}
            <button
                class="lv-card2 lv-unfinished-ai"
                onclick={() => ctx.openHubTab ? ctx.openHubTab("recovery") : ctx.openAIWizard?.()}
            >
                <span>⏳ {t.dashboard.unfinishedAI
                    .replace("${done}", String(unfinishedAI.done))
                    .replace("${total}", String(unfinishedAI.total))}</span>
            </button>
        {/if}

        <!-- AR-8 错误态优先级：首次加载失败（无任何成功数据）时只显示错误+重试，
             不同时展示「空库→引导」误导与全 0 统计；有旧数据时横幅叠加旧值可见（标注上次刷新） -->
        <!-- T01 今日行动 hero（R52 .hero 结构）：徽章行 / 大标题 / muted 描述 / CTA 行 -->
        <div class="lv-today-overview">
        <div class="lv-today-primary">
        <div class="lv-hero">
            <div class="lv-hero-text">
                <div class="lv-hero-badge-row">
                    <span class="lv-tag lv-tag--brand">{todayDecision.tag}</span>
                    <!-- T01 可用时间（R52 hero「可用时间 [15 分钟▾]」）：选择落偏好，复习开场生效；
                         日期 eyebrow 已上移页头，无续场时徽章行只留预算选择（不重复日期） -->
                    <div class="fn__flex" style="gap: calc(var(--lv-space-unit) * 3); align-items: center">
                        <span class="ft__smaller ft__on-surface">{t.dashboard.heroTimeBudget}</span>
                        <select
                            class="b3-select"
                            style="font-size: var(--lv-type-control-size); padding: 2px 8px"
                            aria-label={t.dashboard.heroTimeBudget}
                            value={String(sessionBudget)}
                            onchange={(e) => ctx.setSessionBudget?.(Number((e.currentTarget as HTMLSelectElement).value))}
                        >
                            {#each BUDGET_CHOICES as m (m)}
                                <option value={String(m)}>{m === 0 ? t.dashboard.heroTimeOff : t.dashboard.heroTimeMin.replace("${n}", String(m))}</option>
                            {/each}
                        </select>
                    </div>
                </div>
                <div class="lv-hero-title">
                    {totalCards === 0 ? (t.dashboard.emptyHeroTitle ?? t.dashboard.heroStartTitle) : todayDecision.title}
                </div>
                <p class="lv-hero-desc">
                    {todayDecision.summary}
                </p>
                <div class="lv-hero-cta">
                    <button class="b3-button lv-btn-primary" disabled={todayDecision.actionDisabled || (loading && !hasLoadedSnapshot)} onclick={heroAction}>
                        {heroActionLabel()}
                    </button>
                    <!-- R53 .hero .cta 右侧说明：有到期或目标才展示（不堆 0 值） -->
                    {#if dueCount > 0 || targets.review > 0}
                <span class="lv-hero-remaining">{t.dashboard.todayDue} {dueCount}{#if targets.review > 0} · {targetPct()}%{/if}</span>
                    {/if}
                </div>
                <p class="ft__smaller ft__on-surface" style="margin-top: 8px; opacity: 0.85;">{todayDecision.reason}</p>
            </div>
            <!-- R54 矢量工坊艺术图元：半透明交叠纸质闪卡与金色点缀，营造纸质温度感 -->
            <div class="lv-hero-art" aria-hidden="true">
                <svg viewBox="0 0 220 220" fill="none" focusable="false">
                    <circle cx="132" cy="119" r="83" fill="currentColor" opacity=".05"/>
                    <path d="M55 187h132" stroke="currentColor" opacity=".16" stroke-linecap="round"/>
                    <g transform="rotate(12 145 115)">
                        <rect x="93" y="47" width="93" height="129" rx="14" fill="var(--lv-color-surface)" stroke="currentColor" stroke-opacity=".14"/>
                        <path d="M110 69h39M110 79h24" stroke="currentColor" opacity=".2" stroke-width="5" stroke-linecap="round"/>
                        <circle cx="139" cy="125" r="25" fill="#f6c779"/>
                        <path d="M130 124l6 6 12-14" stroke="#8c5818" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                    </g>
                    <g transform="rotate(-12 86 128)">
                        <rect x="40" y="73" width="91" height="125" rx="14" fill="var(--lv-color-surface)" stroke="currentColor" stroke-opacity=".18"/>
                        <rect x="55" y="88" width="61" height="44" rx="9" fill="currentColor" opacity=".09"/>
                        <path d="M66 110h38M77 102v16M93 102v16" stroke="currentColor" opacity=".55" stroke-width="3" stroke-linecap="round"/>
                        <path d="M57 151h41M57 163h27" stroke="currentColor" opacity=".2" stroke-width="5" stroke-linecap="round"/>
                    </g>
                    <path d="M180 33v14M173 40h14M30 62v10M25 67h10" stroke="currentColor" opacity=".55" stroke-width="3" stroke-linecap="round"/>
                    <circle cx="172" cy="190" r="5" fill="#f6c779"/>
                    <path d="M28 165c-11-16-6-25 4-30 9 15 5 23-4 30z" fill="currentColor" opacity=".22"/>
                </svg>
            </div>
            <!-- R53 hero 目标环（docs/42 §4 T01）：今日目标完成度，无目标时不渲染 -->
            {#if targetPct() >= 0}
                <div class="lv-hero-ring" aria-hidden="true">
                    <svg viewBox="0 0 92 92">
                        <circle class="lv-hero-ring-track" cx="46" cy="46" r="40"></circle>
                        <circle
                            class="lv-hero-ring-fill"
                            cx="46" cy="46" r="40"
                            stroke-dasharray={`${(2 * Math.PI * 40 * Math.min(100, targetPct()) / 100 * (ringDrawn ? 1 : 0)).toFixed(1)} ${(2 * Math.PI * 40).toFixed(1)}`}
                        ></circle>
                    </svg>
                    <b>{targetPct()}%<i>{t.dashboard.heroRingLabel}</i></b>
                </div>
            {/if}
        </div>

        <div class="lv-today-stats">
            <div class="lv-stat-cell">
                <LvStat label={t.dashboard.todayDue} detail={t.dashboard.dueCountDetail} value={dueCount} tone="primary" animate />
            </div>
            <div class="lv-stat-cell">
                <LvStat label={t.dashboard.newCards} detail={t.dashboard.newCardsDetail} value={newCount} tone="warn" animate />
            </div>
            <div class="lv-stat-cell">
                <LvStat label={t.dashboard.reviewCards} detail={t.dashboard.reviewCardsDetail} value={oldCount} tone="primary" animate />
            </div>
            <div class="lv-stat-cell">
                <LvStat
                    label={t.dashboard.todayDone}
                    value={todayReview}
                    denom={targets.review > 0 ? String(targets.review) : ""}
                    tone="primary"
                    progress={targetPct()}
                    spark={studySpark()}
                />
            </div>
        </div>
        </div>
        <section class="lv-today-week lv-card2" aria-labelledby="lv-today-week-title">
            <div class="lv-today-week-head">
                <h2 id="lv-today-week-title">{t.dashboard.weekTitle}</h2>
                <span aria-hidden="true">⌁</span>
            </div>
            <p class="lv-today-week-range">{weekDateLabel}</p>
            <div class="lv-today-week-grid" role="list" aria-label={t.dashboard.weekDaysLabel}>
                {#each currentWeek.days as day (day.index)}
                    {@const label = t.dashboard.weekdays[day.index]}
                    <div class="lv-today-week-day" class:lv-today-week-day-active={day.active} class:lv-today-week-day-today={day.today} class:lv-today-week-day-future={day.future} role="listitem" aria-label={t.dashboard.weekDayAria.replace("${weekday}", label).replace("${date}", String(day.date.getDate())).replace("${state}", day.active ? t.dashboard.weekDayActivity.replace("${review}", String(day.reviews)).replace("${new}", String(day.newCards)) : day.future ? t.dashboard.weekFuture : t.dashboard.weekDayEmpty)}>
                        <span>{label}</span>
                        <i aria-hidden="true">{day.active ? "✓" : day.today ? day.date.getDate() : "·"}</i>
                    </div>
                {/each}
            </div>
            <div class="lv-today-week-summary">
                <span>{t.dashboard.weekActiveDays.replace("${n}", String(currentWeek.activeDays))}</span>
                <strong>{currentWeek.reviews} <small>{t.dashboard.weekReviews}</small></strong>
            </div>
            <div class="lv-today-week-note">
                <strong>{t.dashboard.weekPaceTitle}</strong>
                <p>{t.dashboard.weekPaceDesc}</p>
            </div>
        </section>
        </div>

        {#if ctx.openManagerDeck && decks.length > 0}
            <section class="lv-today-decks" aria-labelledby="lv-today-decks-title">
                <div class="lv-today-decks-head">
                    <h3 id="lv-today-decks-title">{t.dashboard.decksToday ?? "我的卡组"}</h3>
                    <button class="b3-button b3-button--text" onclick={() => ctx.openManager()}>{t.dashboard.decksViewAll ?? t.hubTabManage}</button>
                </div>
                <div class="lv-today-decks-list">
                    {#each [...decks].sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(0, 4) as deck (deck.id)}
                        <button class="lv-today-deck" aria-label={`${deck.name}, ${t.dashboard.deckCardCount.replace("${n}", String(deck.size ?? 0))}`} onclick={() => ctx.openManagerDeck?.(deck.id, deck.name)}>
                            <span class="lv-today-deck-name">{deck.name}</span>
                            <span class="lv-today-deck-count">{t.dashboard.deckCardCount.replace("${n}", String(deck.size ?? 0))}</span>
                        </button>
                    {/each}
                </div>
            </section>
        {/if}

        <!-- AQ-12：本地证据口径的覆盖视图——首屏只留一行 caption；分卡组/分文档明细在深度统计区 -->
        {#if coverage && coverage.coverage !== null}
            <div class="ft__smaller ft__on-surface lv-cov-line">
                {t.dashboard.coverageLine
                    .replace("${a}", String(coverage.seenCards))
                    .replace("${b}", String(coverage.totalCards))
                    .replace("${pct}", String(Math.round(coverage.coverage * 100)))
                    .replace("${since}", coverage.sinceDate ?? "")}
            </div>
        {/if}

        <!-- T08 待处理与恢复（docs/40 批 5 简化聚合）：只聚合不重做；恢复幂等 -->
        <LvSection title={t.dashboard.todoTitle}>
            {#if inboxOpen === 0 && suspended === 0 && !unfinishedAI}
                <div class="lv-hint">{t.dashboard.todoNone}</div>
            {:else}
                {#if inboxOpen > 0}
                    <div class="lv-todo-row">
                        <span>{t.dashboard.todoInbox.replace("${n}", String(inboxOpen))}</span>
                        {#if ctx.openHubTab}<button class="b3-button b3-button--small" onclick={() => ctx.openHubTab?.("inbox")}>{t.dashboard.todoAct}</button>{/if}
                    </div>
                {/if}
                {#if suspended > 0}
                    <div class="lv-todo-row">
                        <span>{t.dashboard.todoSuspended.replace("${n}", String(suspended))}</span>
                        {#if ctx.restoreSuspendedToday}
                            <button class="b3-button b3-button--small" disabled={suspendedRestoreBusy} aria-busy={suspendedRestoreBusy} onclick={restoreSuspendedToday}>{suspendedRestoreBusy ? t.dashboard.todoSuspendedSaving : t.dashboard.todoSuspendedAct}</button>
                        {/if}
                    </div>
                    {#if suspendedRestoreError}
                        <div class="lv-todo-error">
                            <LvError message={suspendedRestoreError} onretry={suspendedRestoreBusy ? undefined : restoreSuspendedToday} retryLabel={t.dashboard.todoSuspendedRetry} />
                        </div>
                    {/if}
                {/if}
                {#if unfinishedAI}
                    <div class="lv-todo-row">
                        <span>{t.dashboard.todoAI.replace("${n}", String(unfinishedAI.total - unfinishedAI.done))}</span>
                        {#if ctx.openHubTab}<button class="b3-button b3-button--small" onclick={() => ctx.openHubTab?.("recovery")}>{t.dashboard.todoAIAct}</button>
                        {:else if ctx.openAIWizard}<button class="b3-button b3-button--small" onclick={() => ctx.openAIWizard?.()}>{t.dashboard.todoAIAct}</button>{/if}
                    </div>
                {/if}
            {/if}
        </LvSection>

        <!-- T01 渐进展开（docs/13 §1.3）：行动与今日统计留在首屏，深度统计默认折叠 -->
        <button class="b3-button b3-button--outline lv-deep-toggle" onclick={() => { deepOpen = !deepOpen; ctx.setDeepStatsOpen?.(deepOpen); }}>
            {t.dashboard.deepToggle} {deepOpen ? "▴" : "▾"}
        </button>
        {#if deepOpen}
        <!-- 展开入场：180ms 单次淡入（R53 动效纪律），折叠即时收起不打断 -->
        <div in:fade={{ duration: getMotionDuration("emphasis") }}>
        <!-- 深度统计首行：连续/用时/总量瓦片（R53 T01 上限 4——次级指标折叠在此） -->
        <div class="fn__flex fn__flex-wrap lv-cards">
            <div class="lv-stat-cell">
                <LvStat label={t.dashboard.streak} value={streak} tone="warn" animate badge={streak >= 3 ? "🔥" : undefined} />
            </div>
            {#if todayStudyMinutes > 0}
                <div class="lv-stat-cell">
                    <!-- AQ-13：今日作答用时（仅统计带耗时的插件面板评分；原生无字段不补 0） -->
                    <LvStat label={t.dashboard.studyTime} value={todayStudyMinutes} tone="neutral" />
                </div>
            {/if}
            <div class="lv-stat-cell">
                <LvStat label={t.dashboard.totalCards} value={totalCards} tone="neutral" animate />
            </div>
        </div>

        <LvSection title={t.dashboard.heatmap} sub={revlogNote ? `${t.dashboard.since} ${revlogNote}` : ""}>
            <LvHeatmap days={heat} />
        </LvSection>

        <!-- AQ-12 覆盖明细（首屏 caption 的展开面）：卡组/文档两维度，行 + 迷你进度 -->
        {#if coverage && coverage.coverage !== null && ((deckCov && deckCov.decks.some(d => d.size !== null)) || (docCov && docCov.docs.length > 0))}
            <LvSection title={t.dashboard.coverageDetail}>
                {#if deckCov && deckCov.decks.some(d => d.size !== null)}
                    {#each [...deckCov.decks].filter(d => d.size !== null).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(0, 5) as dc (dc.deckID)}
                        <div class="lv-cov-row">
                            <span class="lv-cov-name">{decks.find(d => d.id === dc.deckID)?.name ?? dc.deckID}</span>
                            <span class="lv-cov-seen ft__smaller ft__on-surface">{dc.seen}/{dc.size}</span>
                            <div class="lv-mini-track lv-cov-track"><div class="lv-mini-fill" style={`width:${Math.round((dc.coverage ?? 0) * 100)}%`}></div></div>
                            <span class="lv-cov-pct ft__smaller">{Math.round((dc.coverage ?? 0) * 100)}%</span>
                        </div>
                    {/each}
                    {#if deckCov.unattributedCards > 0}
                        <div class="ft__smaller ft__on-surface" style="margin-top: var(--lv-sp-2)">{t.dashboard.unattributedNote.replace("${n}", String(deckCov.unattributedCards))}</div>
                    {/if}
                {/if}
                {#if docCov && docCov.docs.length > 0}
                    <div class="lv-cov-docs ft__smaller ft__on-surface">
                        {#each docCov.docs.slice(0, 3) as dc (dc.docID)}
                            <div>📄 {dc.title || dc.docID.slice(0, 8)} · {t.dashboard.docCards.replace("${n}", String(dc.seen))}</div>
                        {/each}
                        {#if docCov.unattributed > 0}
                            <div>{t.dashboard.docUnattributedNote.replace("${n}", String(docCov.unattributed))}</div>
                        {/if}
                    </div>
                {/if}
            </LvSection>
        {/if}

        <!-- T14 学习日历与负载预测（docs/41 P0）：过去=复习热力，未来=到期负载；首次展开拉取，只读不改调度 -->
        <LvSection title={t.dashboard.calTitle} sub={t.dashboard.calSub}>
            {#if calError}
                <LvError message={calError} onretry={calLoading ? undefined : loadForecast} retryLabel={t.dashboard.refresh} />
            {/if}
            <LvCalendar
                monthLabel={`${new Date().getFullYear()} ${t.dashboard.calMonth} ${new Date().getMonth() + 1}`}
                cells={calCells}
                forecast={calForecast?.days ?? []}
                loading={calLoading && !calLoadedOnce}
                labels={{
                    few: t.dashboard.calFew,
                    many: t.dashboard.calMany,
                    note: t.dashboard.calNote,
                    forecastTitle: t.dashboard.calForecastTitle,
                    empty: t.dashboard.calEmpty,
                }}
                caption={calForecast
                    ? t.dashboard.calCoverage.replace("${c}", String(calForecast.coveredTotal)).replace("${t}", String(calForecast.coveredTotal + calForecast.skippedTotal))
                        + (calForecast.skippedTotal > 0 ? " · " + t.dashboard.calSkipped.replace("${n}", String(calForecast.skippedTotal)) : "")
                    : ""}
            />
        </LvSection>

        <!-- T-卡组仪表盘（docs/41 P1）：近 30 天本地日志按卡组聚合的排行表 -->
        <LvSection title={t.dashboard.ddTitle} sub={t.dashboard.ddSub}>
            {#if ddError}
                <LvError message={ddError} onretry={ddLoading ? undefined : loadDeckDashboard} retryLabel={t.dashboard.refresh} />
            {:else if ddRows.length === 0}
                <div class="hint">{ddLoading ? t.dashboard.loading : t.dashboard.ddEmpty}</div>
            {:else}
                <table class="lv-table">
                    <thead>
                        <tr>
                            <th>{t.dashboard.ddDeck}</th>
                            <th style="text-align:right">{t.dashboard.ddDue}</th>
                            <th style="text-align:right">{t.dashboard.ddNew}</th>
                            <th style="text-align:right">{t.dashboard.ddReviews7}</th>
                            <th style="text-align:right">{t.dashboard.ddRetention}</th>
                            <th style="text-align:right">{t.dashboard.ddLeeches}</th>
                            <th style="text-align:right">{t.dashboard.ddShare}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each ddRows as row (row.deckID)}
                            <tr>
                                <td>{decks.find(d => d.id === row.deckID)?.name ?? row.deckID}</td>
                                <td style="text-align:right;font-variant-numeric:tabular-nums">{row.dueToday}</td>
                                <td style="text-align:right;font-variant-numeric:tabular-nums">{row.newCount}</td>
                                <td style="text-align:right;font-variant-numeric:tabular-nums">{row.reviews7}</td>
                                <td style="text-align:right;font-variant-numeric:tabular-nums">{row.retention === null ? t.dashboard.unknown : row.retention + "%"}</td>
                                <td style="text-align:right;font-variant-numeric:tabular-nums">{row.leeches}</td>
                                <td style="text-align:right"><button class="b3-button b3-button--small lv-btn-ghost" disabled={ddExportBusy} onclick={() => exportDeckShare(row.deckID, decks.find(d => d.id === row.deckID)?.name ?? row.deckID)}>{t.dashboard.ddShareBtn}</button></td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
                <p class="tiny" style="margin: calc(var(--lv-space-unit) * 4) 0 0">{t.dashboard.ddNote}</p>
            {/if}
        </LvSection>

        <LvSection title={t.weekcmp.title} sub={t.weekcmp.sub}>
            {#if week && (week.thisWeek.new + week.thisWeek.review + week.lastWeek.new + week.lastWeek.review) > 0}
                <div class="lv-ret">
                    {#each [
                        { label: t.weekcmp.new, cur: week.thisWeek.new, prev: week.lastWeek.new, d: week.delta.new, good: 1 },
                        { label: t.weekcmp.review, cur: week.thisWeek.review, prev: week.lastWeek.review, d: week.delta.review, good: 1 },
                        { label: t.weekcmp.forget, cur: week.thisWeek.forget, prev: week.lastWeek.forget, d: week.delta.forget, good: -1 },
                    ] as row (row.label)}
                        <div class="lv-ret-row">
                            <span>{row.label}</span>
                            <span class="lv-ret-rate">
                                {row.cur}
                                <span class="ft__smaller ft__on-surface" style="opacity:.65">({t.weekcmp.last} {row.prev})</span>
                                {#if row.d !== 0}
                                    <span
                                        class="ft__smaller lv-weekdelta"
                                        class:lv-weekdelta--good={row.d * row.good > 0}
                                        class:lv-weekdelta--bad={row.d * row.good < 0}
                                    >{row.d > 0 ? "+" : ""}{row.d}</span>
                                {/if}
                            </span>
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="lv-hint">{t.weekcmp.none}</div>
            {/if}
        </LvSection>

        <LvSection title={t.milestones.title} sub={t.milestones.sub}>
            {#snippet actions()}
                {#if xp}
                    <span title={t.milestones.xpTip.replace("${n}", String(xp.toNext))}>
                        <LvChip tone="warn">Lv.{xp.level} · {xp.xp} XP</LvChip>
                    </span>
                {/if}
            {/snippet}
            {#if milestones && milestones.totalReviews > 0}
                <div class="lv-ms-grid">
                    <div class="lv-ms-cell">
                        <div class="lv-ms-num">{milestones.totalReviews}</div>
                        <div class="lv-ms-label">{t.milestones.total}</div>
                    </div>
                    <div class="lv-ms-cell">
                        <div class="lv-ms-num">{milestones.longestStreak}</div>
                        <div class="lv-ms-label">{t.milestones.longest}</div>
                    </div>
                    <div class="lv-ms-cell">
                        <div class="lv-ms-num">{milestones.daysActive}</div>
                        <div class="lv-ms-label">{t.milestones.active}</div>
                    </div>
                    <div class="lv-ms-cell">
                        <div class="lv-ms-num">{milestones.bestDay ? milestones.bestDay.count : 0}</div>
                        <div class="lv-ms-label">{t.milestones.best}</div>
                    </div>
                </div>
                {#if milestones.nextGoal}
                    <div class="lv-hint" style="margin-top: var(--lv-sp-2)">
                        {t.milestones.goal.replace("${a}", String(milestones.nextGoal.at)).replace("${n}", String(milestones.nextGoal.remaining))}
                    </div>
                {/if}
            {:else}
                <div class="lv-hint">{t.milestones.none}</div>
            {/if}
        </LvSection>

        <LvSection title={t.retention.title} sub={t.retention.sub}>
            {#if retention}
                <div class="lv-ret">
                    {#each [
                        { label: t.retention.first, tier: retention.new },
                        { label: t.retention.young, tier: retention.young },
                        { label: t.retention.mature, tier: retention.mature },
                    ] as row (row.label)}
                        <div class="lv-ret-row">
                            <span>{row.label}</span>
                            <span class="lv-ret-rate">
                                {row.tier.rate === null ? "—" : Math.round(row.tier.rate * 100) + "%"}
                                <span class="ft__smaller ft__on-surface">({row.tier.reviews})</span>
                            </span>
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="lv-hint">{t.retention.none}</div>
            {/if}
        </LvSection>

        <LvSection title={t.retention.curve} sub={t.retention.curveSub}>
            {#snippet actions()}
                {#if curve.length >= 2}
                    <button class="b3-button b3-button--small" title={t.retention.exportPng} onclick={exportCurvePng}>⬇ PNG</button>
                {/if}
            {/snippet}
            {#if curve.length >= 2}
                <svg viewBox="0 0 320 100" class="lv-curve" bind:this={curveEl}>
                    <line x1="8" y1="90" x2="312" y2="90" class="lv-curve-axis" />
                    <polyline fill="none" stroke="var(--lv-color-text-muted)" stroke-width="1" stroke-dasharray="4 3" opacity="0.5" points={theoryPoints(curve)} />
                    <polyline fill="none" stroke="var(--lv-color-brand)" stroke-width="2" points={curvePoints(curve)} />
                    {#each curve as p (p.days)}
                        <circle cx={10 + (p.days / Math.max(...curve.map(q => q.days), 1)) * 290} cy={90 - p.rate * 80} r="2.5" class="lv-curve-dot">
                            <title>{p.days}天 · {Math.round(p.rate * 100)}% (n={p.n})</title>
                        </circle>
                    {/each}
                </svg>
                <div class="ft__smaller ft__on-surface" style="margin-top: calc(var(--lv-space-unit) * 2)">{t.retention.theory}</div>
            {:else}
                <div class="lv-hint">{t.retention.curveNone}</div>
            {/if}
        </LvSection>

        <LvSection title={t.aiQuality.title} sub={t.aiQuality.sub}>
            {#snippet actions()}
                {#if tokensTotal > 0}
                    <span class="ft__smaller ft__on-surface" title={t.aiQuality.tokensTip}>≈{tokensTotal} tokens</span>
                {/if}
            {/snippet}
            {#if aiQuality.length === 0}
                <div class="lv-hint">{t.aiQuality.none}</div>
            {:else}
                {#each aiQuality as q (q.date)}
                    <div class="fn__flex lv-airow">
                        <span class="ft__smaller">{q.date}</span>
                        <div class="fn__flex-1"></div>
                        <span class="ft__smaller ft__on-surface">{t.aiQuality.cards}: {q.cards}</span>
                        <div class="lv-mini-track" style="width: 120px">
                            <div class="lv-mini-fill" style={`width:${q.rate === null ? 0 : Math.round(q.rate * 100)}%`}></div>
                        </div>
                        <span class="ft__smaller lv-ai-rate">
                            {q.rate === null ? t.aiQuality.noSample : `${Math.round(q.rate * 100)}%`} · {t.aiQuality.reviews}: {q.reviews}
                        </span>
                    </div>
                {/each}
            {/if}
        </LvSection>

        <LvSection title={t.leech.title} sub={t.leech.sub}>
            {#if leech.length === 0}
                <div class="lv-hint">{t.leech.none}</div>
            {:else}
                {#each leech as l (l.blockID)}
                    <div class="fn__flex lv-airow">
                        <span class="ft__smaller ft__on-surface">ID {l.blockID.slice(0, 8)}…</span>
                        <div class="fn__flex-1"></div>
                        <LvChip tone={l.lapses >= 12 ? "error" : "warn"}>{t.leech.lapses}: {l.lapses}</LvChip>
                        <button class="b3-button b3-button--small" onclick={() => ctx.rewriteWithAI(l.blockID)}>{t.leech.rewriteAI}</button>
                        <button class="b3-button b3-button--small" onclick={() => openTab({ app: ctx.app, doc: { id: l.blockID, zoomIn: true } })}>
                            {t.leech.rewrite}
                        </button>
                    </div>
                {/each}
            {/if}
        </LvSection>

        <LvSection title={t.dashboard.decks}>
            {#if decks.length === 0}
                <div class="lv-hint">{t.dashboard.noDecks}</div>
            {:else}
                <table class="lv-table">
                    <thead>
                        <tr>
                            <th>{t.dashboard.deckName}</th>
                            <th class="lv-num-col">{t.dashboard.deckSize}</th>
                            <th class="lv-num-col">{t.dashboard.deckUpdated}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each decks as d (d.id)}
                            <tr>
                                <td class="lv-deck-name">{d.name}<span class="lv-arrow" aria-hidden="true">›</span></td>
                                <td class="lv-num-col">{d.size}</td>
                                <td class="lv-num-col ft__smaller ft__on-surface">{d.updated}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </LvSection>

        <LvSection title={t.dashboard.forecast}>
            {#if v2Stats.length > 0}
                <div class="fn__flex fn__flex-wrap lv-v2stats">
                    {#each v2Stats as s (s.key)}
                        <div class="lv-stat-mini">
                            <div class="lv-mini-label">{s.key}</div>
                            <div class="lv-mini-num">{s.value}</div>
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="lv-hint">{t.dashboard.forecastTbd}</div>
            {/if}
        </LvSection>

        {#if koStats && koStats.some(s => s.count > 0)}
            <!-- BJ-1：能力分布（基于已登记知识对象实例；口径=插件侧标注覆盖；全 0 不展示——未知不显示为 0） -->
            <LvSection title={t.capability?.title ?? "Capability"} sub={t.capability?.sub ?? ""}>
                <div class="fn__flex fn__flex-wrap lv-caps">
                    {#each koStats.filter(s => s.count > 0) as s (s.cap)}
                        <div class="lv-stat-mini">
                            <div class="lv-mini-label">{t.capability?.labels?.[s.cap] ?? s.cap}</div>
                            <div class="lv-mini-num">{s.count} <span class="ft__smaller ft__on-surface">({s.pct}%)</span></div>
                        </div>
                    {/each}
                </div>
            </LvSection>
        {/if}

        {#if errStats && errStats.length > 0}
            <!-- BJ-4：错误原因分布（遗忘卡标注；口径=全量累计） -->
            <LvSection title={t.errReasons?.title ?? "Error reasons"} sub={t.errReasons?.sub ?? ""}>
                <div class="fn__flex fn__flex-wrap lv-caps">
                    {#each errStats as s (s.reason)}
                        <div class="lv-stat-mini">
                            <div class="lv-mini-label">{t.errReasons?.[s.reason] ?? s.reason}</div>
                            <div class="lv-mini-num">{s.count}</div>
                        </div>
                    {/each}
                </div>
            </LvSection>
        {/if}
        </div>
        {/if}
    {/if}
        {/if}
</LvPage>

<style lang="scss">
    .lv-v2banner {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        margin-bottom: var(--lv-sp-4);
    }

    .lv-today-overview { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, 274px); align-items: stretch; gap: var(--lv-sp-5); }
    .lv-today-primary { min-width: 0; }
    .lv-today-primary .lv-hero { margin-bottom: var(--lv-sp-4); }
    .lv-today-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--lv-sp-3); }
    .lv-today-stats .lv-stat-cell { min-width: 0; max-width: none; }
    :global(.lv-today-stats .lv-stat-cell .lv-card2) { min-width: 0; padding: 15px 14px; }
    .lv-today-week {
        display: flex;
        min-width: 0;
        flex-direction: column;
        padding: 22px;
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
    }
    .lv-today-week-head { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-2); }
    .lv-today-week-head h2 { font-size: var(--lv-type-label-size); line-height: 1.5; font-weight: var(--lv-fw-heading); }
    .lv-today-week-head > span { color: var(--lv-color-text-muted); }
    .lv-today-week-range { margin-top: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)); color: var(--lv-color-text-muted); font-size: var(--lv-type-meta-size); }
    .lv-today-week-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)); margin: 19px 0 16px; }
    .lv-today-week-day { display: flex; min-width: 0; align-items: center; flex-direction: column; gap: calc(var(--lv-space-unit) * 4 + var(--lv-space-hairline)); color: var(--lv-color-text-muted); font-size: var(--lv-type-caption-size); }
    .lv-today-week-day i { display: grid; width: 26px; height: 26px; place-items: center; border-radius: var(--lv-r-circle); background: var(--lv-primary-softer); font-size: var(--lv-type-meta-size); font-style: normal; transition: all var(--lv-dur-1) var(--lv-ease); }
    .lv-today-week-day-active i { background: var(--lv-primary-soft); color: var(--lv-color-brand); font-weight: 600; box-shadow: 0 1px 3px color-mix(in srgb, var(--lv-color-brand) 20%, transparent); }
    .lv-today-week-day-today i { outline: 2px solid var(--lv-color-brand); outline-offset: 1px; }
    .lv-today-week-day-future { opacity: .62; }
    .lv-today-week-summary { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-2); font-size: var(--lv-type-control-size); }
    .lv-today-week-summary strong { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .lv-today-week-summary small { color: var(--lv-color-text-muted); font-size: 10px; font-weight: var(--lv-fw-normal); }
    .lv-today-week-note {
        margin-top: auto;
        padding: 14px;
        border-radius: var(--lv-r-m);
        background: var(--lv-warn-soft);
        color: var(--lv-color-text);
        border: 1px solid color-mix(in srgb, var(--lv-color-warning) 24%, transparent);
        box-shadow: var(--lv-shadow-card);
    }
    .lv-today-week-note strong { font-size: var(--lv-type-body-size); }
    .lv-today-week-note p { margin: calc(var(--lv-space-unit) * 2) 0 0; color: var(--lv-color-text-muted); font-size: var(--lv-type-meta-size); line-height: 1.6; }
    .lv-cards { gap: var(--lv-sp-3); margin-bottom: var(--lv-sp-4); }
    .lv-first-use {
        max-width: 860px;
        margin: calc(var(--lv-space-unit) * 18) auto;
        padding: clamp(calc(var(--lv-space-unit) * 11), 4vw, calc(var(--lv-space-unit) * 21));
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        background: var(--lv-color-surface);
        text-align: center;
    }
    .lv-first-use h2 { margin: calc(var(--lv-space-unit) * 4) 0; font-size: 24px; line-height: var(--lv-lh-body); }
    .lv-first-use > p { max-width: 560px; margin: 0 auto; color: var(--lv-color-text-muted); font-size: 14px; line-height: var(--lv-lh-relaxed); }
    .lv-empty-note-card {
        display: flex;
        align-items: flex-start;
        gap: calc(var(--lv-space-unit) * 4);
        max-width: 600px;
        margin: calc(var(--lv-space-unit) * 8) auto 0;
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 6);
        border: 1px solid var(--lv-primary-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-primary-soft);
        text-align: left;
    }
    .lv-empty-note-icon {
        font-size: 20px;
        line-height: 1.2;
        flex-shrink: 0;
    }
    .lv-empty-note-content strong {
        display: block;
        color: var(--lv-color-brand);
        font-size: var(--lv-type-body-size);
        font-weight: var(--lv-fw-semibold);
        margin-bottom: 2px;
    }
    .lv-empty-note-content p {
        margin: 0;
        color: var(--lv-color-text);
        font-size: var(--lv-type-control-size);
        line-height: var(--lv-lh-reading);
        opacity: 0.9;
    }
    .lv-first-use-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: var(--lv-sp-2); margin: calc(var(--lv-space-unit) * 11) 0 calc(var(--lv-space-unit) * 13); }
    .lv-first-use-actions button { min-height: 44px; }
    .lv-first-use-steps {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--lv-sp-3);
        text-align: left;
    }
    .lv-first-use-steps > div {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: var(--lv-sp-3);
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 5);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
        transition: transform var(--lv-dur-1) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-1) var(--lv-ease);

        &:hover {
            transform: translateY(-1px);
            border-color: var(--lv-border-strong);
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
        }
    }
    .lv-first-use-steps span {
        display: grid;
        width: 28px;
        height: 28px;
        flex: none;
        place-items: center;
        border-radius: 50%;
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-size: var(--lv-type-control-size);
        font-weight: 700;
    }
    .lv-first-use-steps p {
        margin: 0;
        color: var(--lv-color-text);
        font-size: 13px;
        line-height: var(--lv-lh-meta);
    }
    .lv-refresh-status { margin: 0 0 var(--lv-sp-2); color: var(--lv-color-text-muted); font-size: var(--lv-type-control-size); }
    .lv-today-decks { margin: var(--lv-sp-4) 0; }
    .lv-today-decks-head { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-2); margin-bottom: var(--lv-sp-2); }
    .lv-today-decks-head h3 { margin: 0; font-size: 14px; }
    .lv-today-decks-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--lv-sp-2); }
    .lv-today-deck {
        display: flex;
        min-width: 0;
        min-height: 56px;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        padding: calc(var(--lv-space-unit) * 5) calc(var(--lv-space-unit) * 6 + var(--lv-space-hairline));
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
        text-align: left;
        cursor: pointer;
        transition: transform var(--lv-dur-2) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            background var(--lv-dur-1) var(--lv-ease);

        &:hover {
            transform: translateY(-1px);
            border-color: var(--lv-color-brand);
            background: color-mix(in srgb, var(--lv-primary-soft) 40%, var(--lv-color-surface));
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
        }
        &:active {
            transform: translateY(1px);
        }
    }
    .lv-today-deck:focus-visible { outline: 2px solid var(--lv-color-brand); outline-offset: 2px; }
    .lv-today-deck-name { min-width: 0; overflow-wrap: anywhere; font-size: var(--lv-type-body-size); font-weight: 600; }
    .lv-today-deck-count { flex: none; color: var(--lv-color-text-muted); font-size: var(--lv-type-control-size); font-variant-numeric: tabular-nums; }

    @container lv-hub (max-width: 900px) {
        .lv-today-overview { grid-template-columns: minmax(0, 1fr) 250px; gap: var(--lv-sp-4); }
        .lv-today-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @container lv-hub (max-width: 780px) {
        .lv-today-overview { grid-template-columns: minmax(0, 1fr); }
        .lv-today-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .lv-today-week { min-height: 230px; }
    }
    @container lv-hub (max-width: 560px) {
        .lv-today-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .lv-first-use-steps { grid-template-columns: 1fr; }
    }

    /* AQ-12 覆盖：首屏一行 caption + 深度区行明细 */
    .lv-cov-line {
        margin: calc(-1 * var(--lv-sp-2)) 0 var(--lv-sp-3);
        opacity: 0.85;
    }
    .lv-cov-row {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
        padding: var(--lv-sp-2) 0;
        border-bottom: 1px solid var(--lv-border);
        font-size: var(--lv-type-body-size);
        &:last-of-type { border-bottom: none; }
        .lv-cov-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lv-cov-seen { font-variant-numeric: tabular-nums; }
        .lv-cov-track { width: 120px; flex: none; }
        .lv-cov-pct { width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
    }
    .lv-cov-docs {
        margin-top: var(--lv-sp-2);
        display: flex;
        flex-direction: column;
        gap: calc(var(--lv-space-unit) * 1);
    }

    /* T08 待处理行（docs/40 批 5）：行式布局 + 右侧动作 */
    .lv-todo-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        font-size: var(--lv-type-body-size);
        /* R52 .row：16px 行距 + 发丝分隔线（末行无线） */
        padding: var(--lv-sp-4) 0;
        border-bottom: 1px solid var(--lv-border);
    }
    .lv-todo-row:last-child { border-bottom: none; }
    .lv-todo-error { margin-top: var(--lv-sp-2); }
    .lv-unfinished-ai {
        display: block;
        width: 100%;
        text-align: left;
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
        border: 1px dashed var(--lv-primary-border, var(--lv-color-brand));
        border-radius: var(--lv-r-m);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        margin-bottom: var(--lv-sp-3);
        cursor: pointer;
        &:hover { background: var(--lv-primary-softer, transparent); }
    }
    .lv-hint { color: var(--lv-color-text-muted); }
    .lv-loading {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-3);
        .lv-sk-hero { height: 172px; border-radius: var(--lv-r-l); }
        .lv-sk-tiles { display: flex; gap: var(--lv-sp-3); }
        .lv-sk-tile { flex: 1; height: 96px; border-radius: var(--lv-r-m); }
        @container lv-hub (max-width: 740px) {
            .lv-sk-tiles { flex-wrap: wrap; }
            .lv-sk-tile { flex: 1 1 40%; }
        }
    }
    @container lv-hub (max-width: 620px) {
        .lv-first-use { margin: var(--lv-sp-3) 0; }
        .lv-first-use-steps { grid-template-columns: 1fr; gap: 0; }
        .lv-first-use-steps > div { padding: var(--lv-sp-2) 0; }
    }

    .lv-table .lv-deck-name .lv-arrow {
        display: inline-block;
        margin-left: calc(var(--lv-space-unit) * 3);
        color: var(--lv-color-brand);
        opacity: 0;
        transform: translateX(-4px);
        transition: opacity var(--lv-dur-2) var(--lv-ease), transform var(--lv-dur-2) var(--lv-ease);
    }

    .lv-table tbody tr:hover .lv-arrow {
        opacity: 1;
        transform: translateX(0);
    }

    .lv-v2stats { gap: var(--lv-sp-3);
        .lv-stat-mini {
            flex: 1 1 110px;
            padding: var(--lv-sp-3);
            background: var(--lv-primary-softer);
            border-radius: var(--lv-r-m);
            .lv-mini-label { font-size: var(--lv-type-meta-size); color: var(--lv-color-text-muted); }
            .lv-mini-num { font-weight: var(--lv-fw-bold); font-variant-numeric: tabular-nums; }
        }
    }

    .lv-ret {
        .lv-ret-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: var(--lv-sp-2) 0;
            border-bottom: 1px solid var(--lv-border);
            font-size: var(--lv-type-body-size);
        }
        .lv-ret-row:last-child { border-bottom: none; }
        .lv-ret-rate { font-variant-numeric: tabular-nums; font-weight: 600; }
    }

    .lv-weekdelta {
        margin-left: var(--lv-sp-1);
        font-variant-numeric: tabular-nums;
        &--good { color: var(--lv-color-brand); }
        &--bad { color: var(--lv-color-danger); }
    }

    .lv-ms-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--lv-sp-2);
        text-align: center;
    }
    .lv-ms-num {
        font-size: var(--lv-type-heading-size);
        font-weight: var(--lv-fw-bold);
        font-variant-numeric: tabular-nums;
        color: var(--lv-color-brand);
    }
    .lv-ms-label {
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
        margin-top: calc(var(--lv-space-unit) * 1);
    }

    .lv-airow {
        align-items: center;
        gap: var(--lv-sp-3);
        padding: var(--lv-sp-2) 0;
        border-bottom: 1px solid var(--lv-border);
        &:last-child { border-bottom: none; }
        .lv-ai-rate { font-variant-numeric: tabular-nums; }
    }

    .lv-curve {
        width: 100%;
        max-width: 420px;
        .lv-curve-axis { stroke: var(--lv-border-strong); stroke-width: 1; }
        .lv-curve-dot { fill: var(--lv-color-brand); }
    }
</style>
