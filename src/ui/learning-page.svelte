<script lang="ts">
    /** R54 学习页：回顾 / 目标与计划 / 学习日历。统计只使用本地正式记录。 */
    import { onDestroy, onMount } from "svelte";
    import { getRiffCards } from "@/api/riff";
    import { friendlyError } from "@/api/errors";
    import { buildForecast, buildMonthGrid, dueMapFromForecast, type CalendarCell, type ForecastResult } from "@/core/forecast";
    import { calcStreak, lastNDays, localDate, type RevlogData, type RevlogEntry } from "@/core/revlog";
    import LvPage from "./kit/LvPage.svelte";
    import LvStat from "./kit/LvStat.svelte";
    import LvCalendar from "./kit/LvCalendar.svelte";
    import LvTabs from "./kit/LvTabs.svelte";
    import GoalsPage from "./goals-page.svelte";

    type LearningTab = "recap" | "plans" | "calendar";
    const MAX_FORECAST_PAGES = 20;

    let {
        i18n,
        goals,
        getRevlog,
        getDailyTargets = () => ({ new: 0, review: 0 }),
        onReviewed,
        onGoToday,
        onOpenExam,
        onOpenBlock,
        initialTab = "recap",
        onTabChange,
    }: {
        i18n: any;
        goals: any;
        getRevlog: () => RevlogData;
        getDailyTargets?: () => { new: number; review: number };
        onReviewed?: (cb: () => void) => (() => void) | void;
        onGoToday?: () => void;
        onOpenExam?: () => void;
        onOpenBlock?: (blockID: string) => void;
        initialTab?: LearningTab;
        onTabChange?: (tab: LearningTab) => void;
    } = $props();

    const t = $derived(i18n.dashboard ?? {});
    const copy = $derived(i18n.learningPage ?? {});
    const tabLabels = $derived({
        recap: copy.recap ?? i18n.hubSecondaryRecap ?? "学习回顾",
        plans: copy.plans ?? i18n.goals?.title ?? "目标与计划",
        calendar: copy.calendar ?? t.calTitle ?? "学习日历",
    });
    const locale = typeof navigator !== "undefined" ? navigator.language : "zh-CN";

    // svelte-ignore state_referenced_locally -- deep-link value is copied once for this page instance.
    let selectedTab = $state<LearningTab>(initialTab);
    // svelte-ignore state_referenced_locally -- refreshed through the reviewed-store event.
    let revlog = $state<RevlogData>(getRevlog());
    let selectedDate = $state<string | null>(localDate(Date.now()));
    let calCells = $state<CalendarCell[]>([]);
    let calForecast = $state<ForecastResult | null>(null);
    let calLoading = $state(false);
    let calAttempted = $state(false);
    let calError = $state("");
    let calPartial = $state(false);
    let calPartialReason = $state("");
    let calSeq = 0;
    let disposed = false;
    let calRefreshPending = false;
    let unsubscribeReviewed: (() => void) | null = null;

    const recent = $derived(lastNDays(revlog, 7));
    const recentReviews = $derived(recent.reduce((sum, d) => sum + d.stat.review, 0));
    const recentNew = $derived(recent.reduce((sum, d) => sum + d.stat.new, 0));
    const recentActiveDays = $derived(recent.filter(d => d.stat.review + d.stat.new > 0).length);
    const recentSpark = $derived(recent.map(d => d.stat.review));
    const recentEntries = $derived(
        revlog.entries.filter(entry => entry.rating > 0).slice().sort((a, b) => b.ts - a.ts).slice(0, 12),
    );
    const selectedEntries = $derived(
        selectedDate ? revlog.entries.filter(entry => entry.rating > 0 && localDate(entry.ts) === selectedDate).sort((a, b) => b.ts - a.ts) : [],
    );
    const selectedDay = $derived(selectedDate ? revlog.days[selectedDate] : undefined);
    const selectedForecast = $derived(calForecast?.days.find(item => item.date === selectedDate));

    function monthLabel(): string {
        return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(new Date());
    }
    function dateLabel(date: string): string {
        const parsed = new Date(`${date}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(parsed);
    }
    function timeLabel(entry: RevlogEntry): string {
        return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.ts));
    }
    function ratingLabel(entry: RevlogEntry): string {
        const labels = [copy.skipped, copy.forgot, copy.hard, copy.good, copy.easy];
        return labels[entry.rating] ?? String(entry.rating);
    }
    function localError(error: unknown): string {
        const detail = friendlyError(error, i18n);
        return (copy.calendarError ?? t.requestNetwork ?? "读取学习日历失败，请稍后重试。${error}").replace("${error}", detail);
    }
    function rebuildCalendar() {
        if (disposed) return;
        const now = new Date();
        const reviews = new Map(Object.entries(revlog.days).map(([date, stat]) => [date, stat.review]));
        calCells = buildMonthGrid(now.getFullYear(), now.getMonth() + 1, now, reviews, dueMapFromForecast(calForecast?.days ?? []));
    }
    function invalidateCalendar() {
        calSeq += 1;
        calForecast = null;
        calPartial = false;
        calPartialReason = "";
        calError = "";
        calAttempted = false;
        rebuildCalendar();
    }
    async function loadCalendar() {
        if (disposed || calLoading || calAttempted) return;
        const seq = ++calSeq;
        calAttempted = true;
        calLoading = true;
        calError = "";
        calPartial = false;
        calPartialReason = "";
        try {
            const cards: { due: string; state: number }[] = [];
            let page = 1;
            let pageCount: number | null = null;
            let pageCountKnown = false;
            while (page <= MAX_FORECAST_PAGES) {
                if (disposed || seq !== calSeq) return;
                const result = await getRiffCards("", page, 100);
                if (disposed || seq !== calSeq) return;
                const candidate = Number(result.pageCount);
                if (!pageCountKnown) {
                    pageCountKnown = Number.isSafeInteger(candidate) && candidate >= 1;
                    pageCount = pageCountKnown ? candidate : null;
                }
                for (const block of result.blocks ?? []) {
                    const card = (block as any).riffCard ?? (block as any).RiffCard;
                    if (card) cards.push({ due: String(card.due ?? ""), state: Number(card.state ?? 0) });
                }
                if ((pageCountKnown && page >= (pageCount ?? page)) || (!pageCountKnown && (result.blocks ?? []).length < 100)) break;
                page += 1;
            }
            if (pageCount !== null && pageCount > MAX_FORECAST_PAGES) {
                calPartial = true;
                calPartialReason = (copy.partialPages ?? "仅读取前 ${n} 页，范围可能不完整。单页上限为 ${max} 页。").replace("${n}", String(MAX_FORECAST_PAGES)).replace("${max}", String(MAX_FORECAST_PAGES));
            } else if (!pageCountKnown) {
                calPartial = true;
                calPartialReason = copy.unknownPages ?? "内核未返回总页数，当前仅显示已读取范围。";
            }
            if (disposed || seq !== calSeq) return;
            calForecast = buildForecast(cards, { today: new Date(), horizonDays: 14, dailyNewTarget: getDailyTargets().new });
            rebuildCalendar();
        } catch (error) {
            if (disposed || seq !== calSeq) return;
            calError = localError(error);
            calForecast = null;
            rebuildCalendar();
        } finally {
            if (disposed) return;
            // A review event invalidates the in-flight snapshot. Stop its loading
            // state and start one fresh request after the old promise settles.
            if (seq !== calSeq) {
                if (calRefreshPending) {
                    calRefreshPending = false;
                    calLoading = false;
                    calAttempted = false;
                    void loadCalendar();
                }
                return;
            }
            calLoading = false;
            if (calRefreshPending) {
                calRefreshPending = false;
                calAttempted = false;
                void loadCalendar();
            }
        }
    }
    function selectTab(tab: LearningTab) {
        selectedTab = tab;
        onTabChange?.(tab);
        if (tab === "calendar") void loadCalendar();
    }
    function refreshFromStore() {
        if (disposed) return;
        revlog = getRevlog();
        rebuildCalendar();
        if (selectedTab === "calendar") {
            calRefreshPending = calLoading;
            calSeq += 1;
            calAttempted = false;
            if (!calLoading) void loadCalendar();
        }
    }
    onMount(() => {
        const unsubscribe = onReviewed?.(refreshFromStore);
        unsubscribeReviewed = typeof unsubscribe === "function" ? unsubscribe : null;
        rebuildCalendar();
        if (selectedTab === "calendar") void loadCalendar();
    });
    onDestroy(() => {
        disposed = true;
        calSeq += 1;
        unsubscribeReviewed?.();
    });
</script>

<LvPage eyebrow="LEARNING" title={copy.title ?? i18n.hubPrimaryLearning ?? "学习"} subtitle={copy.subtitle ?? "看见进展，安排下一步。"}>
    {#snippet actions()}
        <div class="lv-learning-tabs" aria-label={i18n.hubSecondaryLabel ?? "学习分面"}>
            <LvTabs tabs={[{ id: "recap", label: tabLabels.recap }, { id: "plans", label: tabLabels.plans }, { id: "calendar", label: tabLabels.calendar }]} active={selectedTab} onchange={(id) => selectTab(id as LearningTab)} panelId="lv-learning-panel" />
        </div>
    {/snippet}
    <div id="lv-learning-panel" role="tabpanel" aria-labelledby={`lv-tab-${selectedTab}`} tabindex="0">
        {#if selectedTab === "recap"}
            <div class="lv-learning-columns">
                <section class="lv-card2 lv-learning-trend" aria-label={copy.trendTitle ?? "近 7 天正式评分趋势"}>
                    <div class="lv-section-heading"><h2>{copy.trendTitle ?? "近 7 天正式评分趋势"}</h2><span>{copy.formalOnly ?? "正式复习记录"}</span></div>
                    <div class="lv-learning-metrics">
                        <LvStat label={copy.weekReviews ?? "正式评分"} value={recentReviews} detail={copy.reviewCount ?? "近 7 天"} spark={recentSpark} />
                        <LvStat label={copy.newCount ?? "新卡"} value={recentNew} detail={copy.newCountDetail ?? "近 7 天首次记录"} />
                        <LvStat label={copy.activeDays ?? "有学习记录的天数"} value={recentActiveDays} detail={copy.activeDaysDetail ?? "近 7 天"} />
                        <LvStat label={copy.streak ?? "连续天数"} value={calcStreak(revlog)} detail={copy.streakDetail ?? "当前连续记录"} />
                    </div>
                    <ul class="lv-learning-trend-list">{#each recent as day (day.date)}<li><span>{dateLabel(day.date)}</span><strong>{day.stat.review}</strong><small>{copy.reviewUnit ?? "次正式评分"}</small></li>{/each}</ul>
                </section>
                <section class="lv-card2 lv-learning-records" aria-label={copy.recentTitle ?? "最近正式评分记录"}>
                    <div class="lv-section-heading"><h2>{copy.recentTitle ?? "最近正式评分记录"}</h2><span>{copy.formalOnly ?? "正式复习记录"}</span></div>
                    {#if recentEntries.length === 0}<div class="lv-learning-empty"><p>{copy.recentEmpty ?? "暂无正式评分记录。"}</p><button type="button" class="b3-button b3-button--small" onclick={() => onGoToday?.()}>{copy.goToday ?? "回到今日"}</button></div>{:else}<ul class="lv-learning-entry-list">{#each recentEntries as entry (entry.ts + entry.cardID)}<li><div><strong>{dateLabel(localDate(entry.ts))}</strong><span>{timeLabel(entry)} · {ratingLabel(entry)}</span></div>{#if entry.blockID && onOpenBlock}<button type="button" class="lv-link-button" onclick={() => onOpenBlock?.(entry.blockID)}>{copy.openSource ?? "回源"}</button>{/if}</li>{/each}</ul>{/if}
                </section>
            </div>
            <div class="lv-learning-actions"><button type="button" class="b3-button b3-button--small" onclick={() => selectTab("plans")}>{copy.viewPlans ?? "查看目标与计划"}</button></div>
        {:else if selectedTab === "plans"}
            <div class="lv-learning-columns"><section class="lv-learning-plan"><GoalsPage {i18n} {goals} embedded={true} /></section><aside class="lv-card2 lv-learning-tool"><h2>{copy.examTitle ?? "考试与低频工具"}</h2><p>{copy.examBody ?? "确定范围与截止日期，再核对每天投入。"}</p><button type="button" class="b3-button b3-button--small" disabled={!onOpenExam} onclick={() => onOpenExam?.()}>{copy.openExam ?? "查看考试计划"}</button></aside></div>
        {:else}
            <div class="lv-learning-columns"><section class="lv-card2 lv-learning-calendar" aria-label={tabLabels.calendar}>
                {#if calLoading}<div class="lv-learning-status" role="status" aria-live="polite">{copy.calendarLoading ?? "正在读取学习日历…"}</div>{/if}
                {#if calError}<div class="lv-learning-error" role="alert">{calError}</div>{/if}
                <LvCalendar
                    monthLabel={monthLabel()}
                    cells={calCells}
                    forecast={calForecast?.days ?? []}
                    loading={calLoading && calCells.length === 0}
                    selectedDate={selectedDate}
                    onselect={(date) => (selectedDate = date)}
                    weekDays={locale.startsWith("en") ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["一", "二", "三", "四", "五", "六", "日"]}
                    dateLabel={(date) => {
                        const stat = revlog.days[date];
                        const dayForecast = calForecast?.days.find(item => item.date === date);
                        const score = stat ? `${copy.reviewCount ?? "正式评分"} ${stat.review}` : (copy.noRecords ?? "暂无记录");
                        const due = dayForecast ? `${copy.forecastDue ?? "预测到期"} ${dayForecast.reviews + dayForecast.news}` : (copy.forecastUnknown ?? "预测未知");
                        return `${date} · ${score} · ${due}`;
                    }}
                    forecastDayLabel={(day) => `${day.date} · ${copy.forecastDue ?? "预测到期"} ${day.reviews + day.news}`}
                    labels={{ few: t.calFew, many: t.calMany, note: t.calNote, forecastTitle: t.calForecastTitle, empty: t.calEmpty }}
                    caption={calForecast ? `${dateLabel(selectedDate ?? localDate(Date.now()))} · ${copy.reviewCount ?? "正式评分"} ${selectedDay?.review ?? 0} · ${copy.forecastDue ?? "预测到期"} ${selectedForecast ? selectedForecast.reviews + selectedForecast.news : "—"}` : `${dateLabel(selectedDate ?? localDate(Date.now()))} · ${copy.forecastUnknown ?? "预测未知"} —`}
                />
                {#if calPartial}<p class="lv-learning-warning" role="status">{calPartialReason}</p>{/if}
                <div class="lv-learning-calendar-foot"><span>{copy.calendarSub ?? t.calSub ?? "过去为复习热力，未来为到期预测——只读，不改变内核调度"}</span>{#if calError || (!calLoading && !calForecast)}<button type="button" class="b3-button b3-button--small" onclick={() => { invalidateCalendar(); void loadCalendar(); }}>{copy.retry ?? t.refresh ?? "刷新"}</button>{/if}</div>
            </section><aside class="lv-card2 lv-learning-day" aria-label={copy.dayDetails ?? "日期详情"}><div class="lv-section-heading"><h2>{dateLabel(selectedDate ?? localDate(Date.now()))}</h2><span>{selectedEntries.length > 0 ? copy.formalOnly ?? "正式复习记录" : copy.noRecords ?? "暂无记录"}</span></div>{#if selectedEntries.length === 0}<p class="lv-learning-empty-copy">{copy.dayEmpty ?? "这一天没有正式评分记录。"}</p>{:else}<ul class="lv-learning-entry-list">{#each selectedEntries as entry (entry.ts + entry.cardID)}<li><div><strong>{timeLabel(entry)}</strong><span>{ratingLabel(entry)}</span></div>{#if entry.blockID && onOpenBlock}<button type="button" class="lv-link-button" onclick={() => onOpenBlock?.(entry.blockID)}>{copy.openSource ?? "回源"}</button>{/if}</li>{/each}</ul>{/if}</aside></div>
        {/if}
    </div>
</LvPage>

<style>
    .lv-learning-tabs { max-width: 100%; overflow-x: auto; padding: calc(var(--lv-space-unit) * 1) 0; }
    :global(.lv-learning-tabs .lv-tabs) { min-width: max-content; }
    :global(.lv-learning-tabs .lv-tab) { min-height: 44px; }
    .lv-learning-columns { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(300px, .85fr); gap: var(--lv-sp-4); align-items: start; }
    .lv-learning-trend, .lv-learning-records, .lv-learning-calendar, .lv-learning-day, .lv-learning-tool { min-width: 0; padding: var(--lv-sp-4); }
    .lv-section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--lv-sp-3); margin-bottom: var(--lv-sp-3); }
    .lv-section-heading h2 { margin: 0; font-size: var(--lv-type-title-md-size); }
    .lv-section-heading span, .lv-learning-calendar-foot, .lv-learning-entry-list span, .lv-learning-trend-list small { color: var(--lv-color-text-muted); font-size: var(--lv-type-meta-size); }
    .lv-learning-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--lv-sp-2); }
    .lv-learning-trend-list, .lv-learning-entry-list { list-style: none; padding: 0; margin: var(--lv-sp-3) 0 0; }
    .lv-learning-trend-list li, .lv-learning-entry-list li { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-2); min-height: 38px; border-top: 1px solid var(--lv-border); }
    .lv-learning-trend-list li { justify-content: flex-start; }
    .lv-learning-trend-list strong { min-width: 26px; text-align: right; }
    .lv-learning-entry-list li > div { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
    .lv-learning-entry-list strong { font-size: var(--lv-type-body-size); }
    .lv-link-button { flex: none; border: 0; background: transparent; color: var(--lv-color-brand); cursor: pointer; font-size: var(--lv-type-meta-size); }
    .lv-link-button:focus-visible { outline: 2px solid var(--lv-color-brand); outline-offset: 2px; }
    .lv-learning-empty, .lv-learning-empty-copy { color: var(--lv-color-text-muted); }
    .lv-learning-empty { display: grid; gap: var(--lv-sp-3); justify-items: start; padding: var(--lv-sp-5) 0; }
    .lv-learning-actions { display: flex; justify-content: flex-end; margin-top: var(--lv-sp-4); }
    .lv-learning-plan :global(.lv-page) { padding: 0; }
    .lv-learning-plan :global(.lv-pagehead) { display: none; }
    .lv-learning-tool h2 { margin: 0 0 var(--lv-sp-2); font-size: var(--lv-type-title-md-size); }
    .lv-learning-tool p { color: var(--lv-color-text-muted); line-height: var(--lv-lh-relaxed); }
    .lv-learning-status { margin-bottom: var(--lv-sp-3); color: var(--lv-color-text-muted); font-size: var(--lv-type-meta-size); }
    .lv-learning-error { margin-bottom: var(--lv-sp-3); color: var(--lv-color-danger); }
    .lv-learning-warning { margin: var(--lv-sp-3) 0 0; color: var(--lv-color-warning); font-size: var(--lv-type-meta-size); }
    .lv-learning-calendar-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-3); margin-top: var(--lv-sp-3); }
    @container lv-hub (max-width: 740px) { .lv-learning-columns { grid-template-columns: 1fr; } }
    @media (max-width: 740px) { .lv-learning-columns { grid-template-columns: 1fr; } .lv-learning-calendar-foot { align-items: flex-start; flex-direction: column; } }
</style>
