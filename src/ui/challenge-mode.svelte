<script lang="ts">
    import { onDestroy } from "svelte";
    import { fetchSyncPost } from "siyuan";
    import type { RiffDueCard } from "@/api/riff";

    let { i18n, onExit }: { i18n: any; onExit: () => void } = $props();
    const t = $derived(i18n);

    const DURATION = 180;
    let phase = $state<"idle" | "running" | "done">("idle");
    let remaining = $state(DURATION);
    let known = $state(0);
    let unknown = $state(0);
    let cards: { blockID: string; dom: string }[] = $state([]);
    let idx = $state(0);
    let timer: ReturnType<typeof setInterval> | null = null;

    onDestroy(() => { if (timer) clearInterval(timer); });

    async function fetchDom(blockID: string): Promise<string> {
        try {
            const r = await fetchSyncPost("/api/block/getBlockDOM", { id: blockID });
            return r?.data?.dom ?? "";
        } catch { return ""; }
    }

    async function start() {
        phase = "running";
        remaining = DURATION;
        known = 0; unknown = 0; idx = 0;
        try {
            const resp = await fetchSyncPost("/api/riff/getRiffDueCards", { deckID: "" });
            const due: RiffDueCard[] = resp?.data?.cards ?? [];
            const slice = due.slice(0, 30);
            const loaded: { blockID: string; dom: string }[] = [];
            for (const c of slice) {
                const dom = await fetchDom(c.blockID);
                loaded.push({ blockID: c.blockID, dom });
            }
            cards = loaded;
        } catch { /* 旁路 */ }
        if (cards.length === 0) finish();
    }

    function mark(ok: boolean) {
        if (ok) known += 1; else unknown += 1;
        idx += 1;
        if (idx >= cards.length) finish();
    }

    function finish() {
        if (timer) { clearInterval(timer); timer = null; }
        phase = "done";
    }
</script>

<div class="lv-chal b3-typography">
    {#if phase === "idle"}
        <div class="lv-chal-center">
            <div class="lv-chal-icon">⏱</div>
            <div class="lv-chal-title">{t.challenge.title}</div>
            <div class="lv-chal-desc">{t.challenge.desc.replace("${n}", "3")}</div>
            <button class="b3-button b3-button--text lv-btn-primary" onclick={start}>{t.challenge.start}</button>
            <div style="margin-top:var(--lv-sp-3)">
                <button class="b3-button b3-button--cancel" onclick={onExit}>{window.siyuan.languages.cancel}</button>
            </div>
        </div>
    {:else if phase === "running"}
        <div class="lv-chal-head">
            <span class="lv-chal-timer" class:lv-chal-low={remaining <= 30}>
                ⏱ {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </span>
            <span class="lv-chal-score">✓ {known} · ✗ {unknown}</span>
            <button class="b3-button b3-button--small" onclick={finish}>{t.challenge.stop}</button>
        </div>
        {#if cards[idx]}
            <div class="lv-chal-card lv-card2 b3-typography">
                {@html cards[idx].dom}
            </div>
            <div class="lv-chal-actions">
                <button class="b3-button lv-chal-btn lv-chal-unknown" onclick={() => mark(false)}>✗ {t.challenge.unknown}</button>
                <button class="b3-button lv-chal-btn lv-chal-known" onclick={() => mark(true)}>✓ {t.challenge.known}</button>
            </div>
        {:else}
            <div class="lv-chal-center">{t.challenge.loading}</div>
        {/if}
    {:else}
        <div class="lv-chal-center">
            <div class="lv-chal-icon">🏁</div>
            <div class="lv-chal-title">{t.challenge.doneTitle}</div>
            <div class="lv-chal-desc">
                ✓ {known} · ✗ {unknown} · {t.review.doneSkip} {t.challenge.skipped}
            </div>
            <button class="b3-button b3-button--text lv-btn-primary" onclick={onExit}>{t.challenge.closeBtn}</button>
        </div>
    {/if}
</div>

<style>
    .lv-chal { padding: var(--lv-sp-5); text-align: center; }
    .lv-chal-center { display: flex; flex-direction: column; align-items: center; gap: var(--lv-sp-3); padding: var(--lv-sp-5); }
    .lv-chal-icon { font-size: 32px; }
    .lv-chal-title { font-size: 18px; font-weight: 700; }
    .lv-chal-desc { color: var(--b3-theme-on-surface); margin-bottom: var(--lv-sp-3); }
    .lv-chal-head { display: flex; align-items: center; gap: var(--lv-sp-3); }
    .lv-chal-timer { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--b3-theme-primary); }
    .lv-chal-low { color: var(--b3-theme-error) !important; }
    .lv-chal-score { font-variant-numeric: tabular-nums; margin-left: auto; }
    .lv-chal-card { text-align: left; margin: var(--lv-sp-3) 0; }
    .lv-chal-actions { display: flex; gap: var(--lv-sp-3); justify-content: center; }
    .lv-chal-btn { flex: 1; max-width: 160px; font-weight: 600; }
    .lv-chal-known { background: var(--lv-primary-soft); color: var(--b3-theme-primary); }
    .lv-chal-unknown { background: var(--lv-danger-soft); color: var(--b3-theme-error); }
</style>
