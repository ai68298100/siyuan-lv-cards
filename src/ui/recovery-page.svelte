<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import LvPage from "./kit/LvPage.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvError from "./kit/LvError.svelte";
    import LvSkeleton from "./kit/LvSkeleton.svelte";

    type RecoverySnapshot = {
        aiJobs: {
            id: string; status: string; pending: number; failed: number; created: number; source: string;
            canReview: boolean; needsWriteCheck: boolean; deckID: string;
        }[];
        inboxCount: number;
        suspendedCount: number;
        session: { date: string; reviewed: number; skipped: number } | null;
    };

    let {
        i18n,
        load,
        openAI,
        openDeck,
        openInbox,
        openMaintenance,
        openReview,
        openOnboarding,
    }: {
        i18n: any;
        load: () => Promise<RecoverySnapshot>;
        openAI: (jobId?: string) => void;
        openDeck: (deckID: string) => void;
        openInbox: () => void;
        openMaintenance: () => void;
        openReview: () => void;
        openOnboarding: () => void;
    } = $props();

    const t = $derived(i18n.recoveryCenter);
    let snapshot = $state<RecoverySnapshot | null>(null);
    let loading = $state(true);
    let error = $state("");
    let disposed = false;
    let requestSeq = 0;

    onMount(() => { void refresh(); });
    onDestroy(() => { disposed = true; requestSeq++; });

    async function refresh() {
        if (loading && snapshot) return;
        const seq = ++requestSeq;
        loading = true;
        error = "";
        try {
            const next = await load();
            if (disposed || seq !== requestSeq) return;
            snapshot = next;
        } catch (e) {
            if (!disposed && seq === requestSeq) error = e instanceof Error ? e.message : String(e);
        } finally {
            if (!disposed && seq === requestSeq) loading = false;
        }
    }

    const hasItems = $derived(Boolean(snapshot && (
        snapshot.aiJobs.length > 0 || snapshot.inboxCount > 0 || snapshot.suspendedCount > 0 || snapshot.session
    )));

    function statusLabel(status: string): string {
        const labels: Record<string, string> = {
            drafting: t.statusDrafting,
            generating: t.statusGenerating,
            reviewing: t.statusReviewing,
            committing: t.statusCommitting,
            failed: t.statusFailed,
            canceled: t.statusCanceled,
            done: t.statusDone,
        };
        return labels[status] ?? status;
    }

    function dateLabel(date: string): string {
        const match = date.match(/^(\d{4})(\d{2})(\d{2})$/);
        return match ? `${match[1]}-${match[2]}-${match[3]}` : date || t.unknownDate;
    }
</script>

<LvPage eyebrow="WORKSPACE / RECOVERY" title={t.title} subtitle={t.subtitle}>
    {#snippet actions()}
        <button class="b3-button b3-button--small b3-button--outline" disabled={loading} aria-busy={loading} onclick={refresh}>
            {loading ? t.refreshing : t.refresh}
        </button>
    {/snippet}

    {#if loading && !snapshot}
        <section class="lv-recovery-loading" aria-busy="true" aria-label={t.loading}>
            <LvSkeleton height={76} count={3} />
        </section>
    {:else if error && !snapshot}
        <LvError message={t.loadFailed.replace("${error}", error)} onretry={refresh} retryLabel={t.retry} />
    {:else if snapshot && !hasItems}
        <LvEmpty text={t.empty} actionLabel={t.startLearning} onaction={openOnboarding} />
    {:else if snapshot}
        {#if error}<LvError message={t.refreshFailed.replace("${error}", error)} onretry={refresh} retryLabel={t.retry} />{/if}

        {#if snapshot.session}
            <section class="lv-card2 lv-recovery-section" aria-labelledby="lv-recovery-session-title">
                <div class="lv-recovery-head">
                    <div><h3 id="lv-recovery-session-title">{t.sessionTitle}</h3><p>{t.sessionDate.replace("${date}", dateLabel(snapshot.session.date))}</p></div>
                    <LvChip tone="primary">{t.sessionProgress.replace("${reviewed}", String(snapshot.session.reviewed)).replace("${skipped}", String(snapshot.session.skipped))}</LvChip>
                </div>
                <p class="lv-recovery-copy">{t.sessionDescription}</p>
                <button class="b3-button lv-btn-primary" onclick={openReview}>{t.continueReview}</button>
            </section>
        {/if}

        {#if snapshot.aiJobs.length > 0}
            <section class="lv-card2 lv-recovery-section" aria-labelledby="lv-recovery-ai-title">
                <div class="lv-recovery-head">
                    <div><h3 id="lv-recovery-ai-title">{t.aiTitle}</h3><p>{t.aiCount.replace("${count}", String(snapshot.aiJobs.length))}</p></div>
                    <LvChip tone={snapshot.aiJobs.some(job => job.status === "failed" || job.failed > 0) ? "warn" : "primary"}>{t.needsReview}</LvChip>
                </div>
                <ul class="lv-recovery-jobs">
                    {#each snapshot.aiJobs as job (job.id)}
                        <li>
                            <div class="lv-recovery-job-head">
                                <span class="lv-recovery-job-source">{job.source || t.unknownSource}</span>
                                <span class="lv-recovery-job-state">{statusLabel(job.status)}</span>
                            </div>
                            <span class="lv-recovery-job-counts">{t.aiJobCounts.replace("${pending}", String(job.pending)).replace("${failed}", String(job.failed)).replace("${created}", String(job.created))}</span>
                            <p class="lv-recovery-copy">
                                {job.canReview ? t.aiReviewDescription
                                    : job.needsWriteCheck ? t.aiWriteCheckDescription
                                        : t.aiMaterialUnavailable}
                            </p>
                            <button
                                class="b3-button b3-button--small b3-button--outline"
                                aria-label={job.canReview
                                    ? `${t.resumeReview}：${job.source || t.unknownSource}`
                                    : job.needsWriteCheck && job.deckID
                                        ? `${t.openTargetDeck}：${job.source || t.unknownSource}`
                                        : `${t.openAI}：${job.source || t.unknownSource}`}
                                onclick={() => job.canReview
                                    ? openAI(job.id)
                                    : job.needsWriteCheck && job.deckID
                                        ? openDeck(job.deckID)
                                        : openAI()}
                            >{job.canReview ? t.resumeReview : job.needsWriteCheck && job.deckID ? t.openTargetDeck : t.openAI}</button>
                        </li>
                    {/each}
                </ul>
                <p class="lv-recovery-copy">{t.aiDescription}</p>
            </section>
        {/if}

        {#if snapshot.inboxCount > 0}
            <section class="lv-card2 lv-recovery-section" aria-labelledby="lv-recovery-inbox-title">
                <div class="lv-recovery-head"><div><h3 id="lv-recovery-inbox-title">{t.inboxTitle}</h3><p>{t.inboxCount.replace("${count}", String(snapshot.inboxCount))}</p></div><LvChip>{t.waiting}</LvChip></div>
                <p class="lv-recovery-copy">{t.inboxDescription}</p>
                <button class="b3-button b3-button--outline" onclick={openInbox}>{t.openInbox}</button>
            </section>
        {/if}

        {#if snapshot.suspendedCount > 0}
            <section class="lv-card2 lv-recovery-section" aria-labelledby="lv-recovery-suspended-title">
                <div class="lv-recovery-head"><div><h3 id="lv-recovery-suspended-title">{t.suspendedTitle}</h3><p>{t.suspendedCount.replace("${count}", String(snapshot.suspendedCount))}</p></div><LvChip tone="warn">{t.todayOnly}</LvChip></div>
                <p class="lv-recovery-copy">{t.suspendedDescription}</p>
                <button class="b3-button b3-button--outline" onclick={openMaintenance}>{t.openMaintenance}</button>
            </section>
        {/if}

        <p class="lv-recovery-footnote">{t.noUnknownRating}</p>
    {/if}
</LvPage>

<style>
    .lv-recovery-loading { display: grid; gap: var(--lv-sp-3); }
    .lv-recovery-section {
        margin-bottom: var(--lv-sp-4);
        padding: calc(var(--lv-space-unit) * 9) calc(var(--lv-space-unit) * 10);
        transition: transform var(--lv-dur-2) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);

        &:hover {
            transform: translateY(-1px);
            border-color: var(--lv-border-strong);
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
        }
    }
    .lv-recovery-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--lv-sp-3); }
    .lv-recovery-head h3 {
        margin: 0;
        font-size: var(--lv-type-title-size);
        font-weight: var(--lv-fw-heading);
        letter-spacing: -0.02em;
    }
    .lv-recovery-head p, .lv-recovery-copy {
        margin: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)) 0 0;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-body-size);
        line-height: 1.65;
    }
    .lv-recovery-section > button {
        margin-top: var(--lv-sp-3);
        min-height: 36px;
    }
    .lv-recovery-jobs { margin: var(--lv-sp-3) 0 0; padding: 0; list-style: none; }
    .lv-recovery-jobs li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: calc(var(--lv-space-unit) * 2) var(--lv-sp-3);
        padding: var(--lv-sp-3) 0;
        border-top: 1px solid var(--lv-border);
        font-size: var(--lv-type-control-size);
    }
    .lv-recovery-job-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--lv-sp-2); min-width: 0; }
    .lv-recovery-job-source { min-width: 0; overflow-wrap: anywhere; font-weight: var(--lv-fw-semibold); font-size: var(--lv-type-body-size); }
    .lv-recovery-job-state { color: var(--lv-color-brand); font-weight: var(--lv-fw-semibold); }
    .lv-recovery-job-counts, .lv-recovery-jobs li > p, .lv-recovery-jobs li > button { grid-column: 1 / -1; }
    .lv-recovery-job-counts { color: var(--lv-color-text-muted); font-variant-numeric: tabular-nums; }
    .lv-recovery-jobs li > button { justify-self: start; min-height: 32px; border-radius: var(--lv-r-m); }
    .lv-recovery-footnote { margin: var(--lv-sp-4) 0 0; color: var(--lv-color-text-muted); font-size: var(--lv-type-control-size); line-height: 1.6; }
</style>
