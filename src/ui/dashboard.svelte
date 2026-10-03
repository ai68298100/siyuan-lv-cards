<script lang="ts">
    import { onMount } from "svelte";
    import { getRiffDecks, type RiffDeck } from "@/api/riff";
    import { dueCache } from "@/api/due-shared";
    import { getFlashcardStatistics, summarizeStatistics, type MigrationStatus } from "@/api/flashcardV2";
    import { calcStreak, lastNDays, localDate, studySecondsOn, coverageStats, deckCoverage, computeRetention, computeRetentionCurve, reviewStatsFor, weekCompare, calcMilestones, calcXp, type RevlogData, type RetentionResult, type CurvePoint, type WeekDelta, type Milestones, type XpResult, type CoverageStats, type DeckCoverage } from "@/core/revlog";
    import { openTab } from "siyuan";
    import LvPage from "./kit/LvPage.svelte";
    import LvSection from "./kit/LvSection.svelte";
    import LvStat from "./kit/LvStat.svelte";
    import LvHeatmap from "./kit/LvHeatmap.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvError from "./kit/LvError.svelte";

    export interface DashboardCtx {
        i18n: any;
        app: any;
        getRevlog: () => RevlogData;
        getV2Status: () => MigrationStatus | null;
        getDailyTargets: () => { new: number; review: number };
        openReview: () => void;
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
    }

    let { ctx }: { ctx: DashboardCtx } = $props();
    const t = $derived(ctx.i18n);

    let loading = $state(true);
    let decks: RiffDeck[] = $state([]);
    let dueCount = $state(0);
    let newCount = $state(0);
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
        const maxD = Math.max(...pts.map(p => p.days), 1);
        return pts.map(p => `${10 + (p.days / maxD) * 290},${90 - p.rate * 80}`).join(" ");
    }

    /** 理论参考线：固定衰减 R=exp(-t/5d)（个人化 S 待 V2 Stability） */
    function theoryPoints(pts: CurvePoint[]): string {
        const maxD = Math.max(...pts.map(p => p.days), 1);
        return pts.map(p => `${10 + (p.days / maxD) * 290},${90 - Math.exp(-p.days / 5) * 80}`).join(" ");
    }

    /** 构建 Markdown 报告内容（总览+复习集+曲线+AI 批次） */
    function buildReportMd(): string {
        const today = new Date().toLocaleDateString();
        const rows: string[] = [
            `# 小驴闪卡 · 学习报告（${today}）`, "",
            "## 总览", "",
            `- 今日到期：${dueCount}（新 ${newCount} / 复习 ${oldCount}）`,
            `- 今日已复习：${todayReview} / 目标 ${ctx.getDailyTargets().review}`,
            `- 连续天数：${streak}`,
            `- 卡片总数：${totalCards}`, "",
            "## 复习集", "",
        ];
        for (const d of decks) {
            rows.push(`- ${d.name}：${d.size} 张（更新 ${d.updated}）`);
        }
        if (curve.length >= 2) {
            rows.push("", "## 保持曲线（实测）", "");
            for (const p of curve) {
                rows.push(`- 间隔 ${p.days} 天：${Math.round(p.rate * 100)}%（n=${p.n}）`);
            }
        }
        if (aiQuality.length > 0) {
            rows.push("", "## AI 批次质量", "");
            for (const q of aiQuality) {
                rows.push(`- ${q.date}：${q.cards} 张 / 复习 ${q.reviews} / ${q.rate === null ? "样本积累中" : Math.round(q.rate * 100) + "%"}`);
            }
        }
        rows.push("", `> 由小驴闪卡生成 · ${new Date().toLocaleString()}`);
        return rows.join("\n");
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

    /** 数字滚动统一由 LvStat 的 animate 承担（reduced-motion 直落） */
    function targetPct(): number {
        const target = targets.review;
        if (target <= 0) {
            return -1;
        }
        return Math.min(100, Math.round((todayReview / target) * 100));
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
        try {
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
            docCov = ctx.getDocCoverage ? await ctx.getDocCoverage() : null;
            unfinishedAI = ctx.getUnfinishedAIJob?.() ?? null;
            // BJ-1：能力分布（可选 ctx；无实例返回空数组→区块隐藏）
            koStats = ctx.getCapabilityShare?.() ?? null;
            errStats = ctx.getErrorReasonStats?.() ?? null;
            if (seq !== refreshSeq) {
                return; // 文档归属查询期间用户已刷新（AR-6 generation 守卫）
            }
            dueCount = due.unreviewedCount;
            newCount = due.unreviewedNewCardCount;
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
            // 内核 V2（3.9.0）激活时，顺带拉取官方统计摘要（宽容解析，失败静默）
            const v2 = ctx.getV2Status();
            if (v2) {
                try {
                    const stats = await getFlashcardStatistics({});
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
                errorMsg = e?.message ?? String(e);
            }
        } finally {
            if (seq === refreshSeq) {
                loading = false;
            }
        }
    }

    onMount(() => {
        refresh();
        // 会话完成联动（549）+ 评分联动（AT-11）：跨页签失效总览缓存
        const offFinished = ctx.onSessionFinished?.(() => refresh());
        const offReviewed = ctx.onReviewed?.(() => scheduleRefresh());
        return () => {
            offFinished?.();
            offReviewed?.();
            if (reviewedTimer) {
                clearTimeout(reviewedTimer);
                reviewedTimer = null;
            }
        };
    });
</script>

<LvPage title={t.dashboard.title} subtitle={revlogNote ? `${t.dashboard.since} ${revlogNote}` : ""} dot>
    {#snippet actions()}
        <button class="b3-button b3-button--outline" onclick={downloadReport}>{t.dashboard.report}</button>
        <button class="b3-button b3-button--outline" onclick={() => ctx.writeReportDoc(buildReportMd())}>{t.dashboard.writeDoc}</button>
        <button class="b3-button b3-button--outline" onclick={() => ctx.openManager()}>{t.menuManager}</button>
        <button class="b3-button b3-button--text lv-btn-primary" onclick={() => ctx.openReview()}>{t.dashboard.openReview}</button>
        <button class="b3-button b3-button--outline" onclick={refresh}>{t.dashboard.refresh}</button>
    {/snippet}

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

    {#if loading}
        <div class="lv-card2 lv-loading">
            <div class="lv-skeleton" style="height: 96px"></div>
            <div class="lv-skeleton" style="height: 64px"></div>
            <div class="lv-skeleton" style="height: 64px"></div>
        </div>
    {:else}
        {#if errorMsg}
            <LvError message={errorMsg} onretry={refresh} retryLabel={t.dashboard.refresh} />
        {/if}

        <!-- ADR-7：未完成的 AI 导入提示——总览即可见，点击打开向导（恢复横幅在其中） -->
        {#if unfinishedAI}
            <button
                class="lv-card2 lv-unfinished-ai"
                onclick={() => ctx.openAIWizard?.()}
            >
                <span>⏳ {t.dashboard.unfinishedAI
                    .replace("${done}", String(unfinishedAI.done))
                    .replace("${total}", String(unfinishedAI.total))}</span>
            </button>
        {/if}

        <!-- AR-8 错误态优先级：首次加载失败（无任何成功数据）时只显示错误+重试，
             不同时展示「空库→引导」误导与全 0 统计；有旧数据时横幅叠加旧值可见（标注上次刷新） -->
        {#if totalCards === 0 && !errorMsg}
            <LvEmpty text={t.dashboard.onboardingHint} actionLabel={t.dashboard.onboardingStart} onaction={ctx.openOnboarding} />
        {/if}

        {#if totalCards > 0 || !errorMsg}
        <div class="fn__flex fn__flex-wrap lv-cards">
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat label={t.dashboard.todayDue} value={dueCount} tone="error" animate />
                </div>
            </div>
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat label={t.dashboard.newCards} value={newCount} tone="warn" animate />
                </div>
            </div>
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat label={t.dashboard.reviewCards} value={oldCount} tone="primary" animate />
                </div>
            </div>
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat
                        label={t.dashboard.todayDone}
                        value={todayReview}
                        denom={targets.review > 0 ? String(targets.review) : ""}
                        tone="primary"
                        progress={targetPct()}
                    />
                </div>
            </div>
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat label={t.dashboard.streak} value={streak} tone="warn" animate />
                </div>
            </div>
            {#if todayStudyMinutes > 0}
                <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                    <div style="flex: 1">
                        <!-- AQ-13：今日作答用时（仅统计带耗时的插件面板评分；原生无字段不补 0） -->
                        <LvStat label={t.dashboard.studyTime} value={todayStudyMinutes} tone="neutral" />
                    </div>
                </div>
            {/if}
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat label={t.dashboard.totalCards} value={totalCards} tone="neutral" animate />
                </div>
            </div>
        </div>
        {/if}

        <!-- AQ-12：本地证据口径的覆盖视图——覆盖率≠掌握率，分母=内核卡组规模合计，窗口=插件启用起 -->
        {#if coverage && coverage.coverage !== null}
            <div class="ft__smaller ft__on-surface" style="margin: calc(-1 * var(--lv-sp-2)) 0 var(--lv-sp-2); opacity: .85">
                {t.dashboard.coverageLine
                    .replace("${a}", String(coverage.seenCards))
                    .replace("${b}", String(coverage.totalCards))
                    .replace("${pct}", String(Math.round(coverage.coverage * 100)))
                    .replace("${since}", coverage.sinceDate ?? "")}
            </div>
            {#if deckCov && deckCov.decks.some(d => d.size !== null)}
                <!-- 卡组维度分解（AQ-12 剩余面）：有规模的卡组按 seen/size 展示 -->
                <div class="ft__smaller ft__on-surface" style="margin: 0 0 var(--lv-sp-2); opacity: .7; line-height: 1.7">
                    {#each [...deckCov.decks].filter(d => d.size !== null).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(0, 5) as dc (dc.deckID)}
                        <div>· {decks.find(d => d.id === dc.deckID)?.name ?? dc.deckID}：{dc.seen}/{dc.size} · {Math.round((dc.coverage ?? 0) * 100)}%</div>
                    {/each}
                    {#if deckCov.unattributedCards > 0}
                        <div>{t.dashboard.unattributedNote.replace("${n}", String(deckCov.unattributedCards))}</div>
                    {/if}
                </div>
            {/if}
            {#if docCov && docCov.docs.length > 0}
                <!-- 文档维度（AQ-12）：块归属查内核聚合，标题回源；仅展示 Top3 -->
                <div class="ft__smaller ft__on-surface" style="margin: 0 0 var(--lv-sp-2); opacity: .7; line-height: 1.7">
                    {#each docCov.docs.slice(0, 3) as dc (dc.docID)}
                        <div>📄 {dc.title || dc.docID.slice(0, 8)}：{t.dashboard.docCards.replace("${n}", String(dc.seen))}</div>
                    {/each}
                    {#if docCov.unattributed > 0}
                        <div>{t.dashboard.docUnattributedNote.replace("${n}", String(docCov.unattributed))}</div>
                    {/if}
                </div>
            {/if}
        {/if}

        <LvSection title={t.dashboard.heatmap} sub={revlogNote ? `${t.dashboard.since} ${revlogNote}` : ""}>
            <LvHeatmap days={heat} />
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
                    <polyline fill="none" stroke="var(--b3-theme-on-surface)" stroke-width="1" stroke-dasharray="4 3" opacity="0.5" points={theoryPoints(curve)} />
                    <polyline fill="none" stroke="var(--b3-theme-on-surface)" stroke-width="1" stroke-dasharray="4 3" opacity="0.5" points={theoryPoints(curve)} />
                    <polyline fill="none" stroke="var(--b3-theme-primary)" stroke-width="2" points={curvePoints(curve)} />
                    {#each curve as p (p.days)}
                        <circle cx={10 + (p.days / Math.max(...curve.map(q => q.days), 1)) * 290} cy={90 - p.rate * 80} r="2.5" class="lv-curve-dot">
                            <title>{p.days}天 · {Math.round(p.rate * 100)}% (n={p.n})</title>
                        </circle>
                    {/each}
                </svg>
                <div class="ft__smaller ft__on-surface" style="margin-top: 4px">{t.retention.theory}</div>
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

        {#if koStats && koStats.length > 0}
            <!-- BJ-1：能力分布（基于已登记知识对象实例；口径=插件侧标注覆盖） -->
            <LvSection title={t.capability.title} sub={t.capability.sub}>
                <div class="fn__flex fn__flex-wrap lv-caps">
                    {#each koStats as s (s.cap)}
                        <div class="lv-stat-mini">
                            <div class="lv-mini-label">{s.cap}</div>
                            <div class="lv-mini-num">{s.count} <span class="ft__smaller ft__on-surface">({s.pct}%)</span></div>
                        </div>
                    {/each}
                </div>
            </LvSection>
        {/if}

        {#if errStats && errStats.length > 0}
            <!-- BJ-4：错误原因分布（遗忘卡标注；口径=全量累计） -->
            <LvSection title={t.errReasons.title} sub={t.errReasons.sub}>
                <div class="fn__flex fn__flex-wrap lv-caps">
                    {#each errStats as s (s.reason)}
                        <div class="lv-stat-mini">
                            <div class="lv-mini-label">{t.errReasons[s.reason] ?? s.reason}</div>
                            <div class="lv-mini-num">{s.count}</div>
                        </div>
                    {/each}
                </div>
            </LvSection>
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

    .lv-cards { gap: var(--lv-sp-3); margin-bottom: var(--lv-sp-4); }
    .lv-unfinished-ai {
        display: block;
        width: 100%;
        text-align: left;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        border: 1px dashed var(--lv-primary-border, var(--b3-theme-primary));
        border-radius: var(--lv-r-m);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        margin-bottom: var(--lv-sp-3);
        cursor: pointer;
        &:hover { background: var(--lv-primary-softer, transparent); }
    }
    .lv-hint { color: var(--b3-theme-on-surface); }
    .lv-loading {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-3);
    }

    .lv-table .lv-deck-name .lv-arrow {
        display: inline-block;
        margin-left: 6px;
        color: var(--b3-theme-primary);
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
            .lv-mini-label { font-size: 11px; color: var(--b3-theme-on-surface); }
            .lv-mini-num { font-weight: 700; font-variant-numeric: tabular-nums; }
        }
    }

    .lv-ret {
        .lv-ret-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: var(--lv-sp-2) 0;
            border-bottom: 1px solid var(--lv-border);
            font-size: 13px;
        }
        .lv-ret-row:last-child { border-bottom: none; }
        .lv-ret-rate { font-variant-numeric: tabular-nums; font-weight: 600; }
    }

    .lv-weekdelta {
        margin-left: var(--lv-sp-1);
        font-variant-numeric: tabular-nums;
        &--good { color: var(--b3-theme-primary); }
        &--bad { color: var(--b3-theme-error); }
    }

    .lv-ms-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--lv-sp-2);
        text-align: center;
    }
    .lv-ms-num {
        font-size: 20px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--b3-theme-primary);
    }
    .lv-ms-label {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        margin-top: 2px;
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
        .lv-curve-dot { fill: var(--b3-theme-primary); }
    }
</style>
