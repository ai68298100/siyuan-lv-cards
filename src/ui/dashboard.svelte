<script lang="ts">
    import { onMount } from "svelte";
    import { getRiffDecks, getRiffDueCards, type RiffDeck } from "@/api/riff";
    import { getFlashcardStatistics, summarizeStatistics, type MigrationStatus } from "@/api/flashcardV2";
    import { calcStreak, lastNDays, computeRetention, type RevlogData, type RetentionResult } from "@/core/revlog";
    import LvPage from "./kit/LvPage.svelte";
    import LvSection from "./kit/LvSection.svelte";
    import LvStat from "./kit/LvStat.svelte";
    import LvHeatmap from "./kit/LvHeatmap.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";

    export interface DashboardCtx {
        i18n: any;
        getRevlog: () => RevlogData;
        getV2Status: () => MigrationStatus | null;
        getDailyTargets: () => { new: number; review: number };
        openReview: () => void;
        openManager: () => void;
        openOnboarding: () => void;
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
    let totalCards = $state(0);
    let heat: { date: string; stat: { new: number; review: number; forget: number } }[] = $state([]);
    let revlogNote = $state("");
    let errorMsg = $state("");
    let v2Stats: { key: string; value: string }[] = $state([]);
    let retention: RetentionResult | null = $state(null);

    /** 数字滚动（reduced-motion 时直接落值） */
    function tween(setter: (v: number) => void, to: number) {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || to === 0) {
            setter(to);
            return;
        }
        const dur = 420;
        const t0 = performance.now();
        const step = (now: number) => {
            const p = Math.min(1, (now - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            setter(Math.round(to * eased));
            if (p < 1) {
                requestAnimationFrame(step);
            }
        };
        requestAnimationFrame(step);
    }

    function targetPct(): number {
        const target = ctx.getDailyTargets().review;
        if (target <= 0) {
            return -1;
        }
        return Math.min(100, Math.round((todayReview / target) * 100));
    }

    async function refresh() {
        loading = true;
        errorMsg = "";
        try {
            const [deckList, due] = await Promise.all([
                getRiffDecks(),
                getRiffDueCards(""),
            ]);
            decks = deckList;
            totalCards = deckList.reduce((acc, d) => acc + (d.size ?? 0), 0);
            const revlog = ctx.getRevlog();
            streak = calcStreak(revlog);
            heat = lastNDays(revlog, 119);
            const todayKey = heat[heat.length - 1]?.date;
            const reviewedToday = todayKey ? (revlog.days[todayKey]?.review ?? 0) : 0;
            tween(v => (todayReview = v), reviewedToday);
            tween(v => (dueCount = v), due.unreviewedCount);
            tween(v => (newCount = v), due.unreviewedNewCardCount);
            tween(v => (oldCount = v), due.unreviewedOldCardCount);
            const first = revlog.entries[0]?.ts;
            revlogNote = first ? new Date(first).toLocaleDateString() : "";
            retention = computeRetention(revlog);
            // 内核 V2（3.9.0）激活时，顺带拉取官方统计摘要（宽容解析，失败静默）
            const v2 = ctx.getV2Status();
            if (v2) {
                try {
                    v2Stats = summarizeStatistics(await getFlashcardStatistics({}));
                } catch {
                    v2Stats = [];
                }
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            loading = false;
        }
    }

    onMount(refresh);
</script>

<LvPage title={t.dashboard.title} subtitle={revlogNote ? `${t.dashboard.since} ${revlogNote}` : ""} dot>
    {#snippet actions()}
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

    {#if loading}
        <div class="lv-card2 lv-loading">
            <div class="lv-skeleton" style="height: 96px"></div>
            <div class="lv-skeleton" style="height: 64px"></div>
            <div class="lv-skeleton" style="height: 64px"></div>
        </div>
    {:else}
        {#if errorMsg}
            <div class="lv-card2 lv-hint lv-error">{errorMsg}</div>
        {/if}

        {#if totalCards === 0}
            <LvEmpty text={t.dashboard.onboardingHint} actionLabel={t.dashboard.onboardingStart} onaction={ctx.openOnboarding} />
        {/if}

        <div class="fn__flex fn__flex-wrap lv-cards">
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat label={t.dashboard.todayDue} value={dueCount} tone="error" />
                </div>
            </div>
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat label={t.dashboard.newCards} value={newCount} tone="warn" />
                </div>
            </div>
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat label={t.dashboard.reviewCards} value={oldCount} tone="primary" />
                </div>
            </div>
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat
                        label={t.dashboard.todayDone}
                        value={todayReview}
                        denom={ctx.getDailyTargets().review > 0 ? String(ctx.getDailyTargets().review) : ""}
                        tone="primary"
                        progress={targetPct()}
                    />
                </div>
            </div>
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat label={t.dashboard.streak} value={streak} tone="warn" />
                </div>
            </div>
            <div class="fn__flex-1" style="min-width: 140px; display: flex;">
                <div style="flex: 1">
                    <LvStat label={t.dashboard.totalCards} value={totalCards} tone="neutral" />
                </div>
            </div>
        </div>

        <LvSection title={t.dashboard.heatmap} sub={revlogNote ? `${t.dashboard.since} ${revlogNote}` : ""}>
            <LvHeatmap days={heat} />
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
    .lv-hint { color: var(--b3-theme-on-surface); }
    .lv-error { color: var(--b3-theme-error); }

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
</style>
