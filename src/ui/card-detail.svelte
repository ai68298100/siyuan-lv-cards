<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { fetchSyncPost } from "siyuan";
    import type { SearchBlock } from "@/api/riff";

    let { block, t, onOpenDoc, onClose }: {
        block: SearchBlock;
        t: any;
        onOpenDoc: () => void;
        onClose: () => void;
    } = $props();

    let html = $state("");
    let loadSeq = 0;

    onMount(async () => {
        const seq = ++loadSeq;
        try {
            const resp = await fetchSyncPost("/api/block/getBlockDOM", { id: block.id });
            if (seq === loadSeq) {
                html = resp?.data?.dom ?? "";
            }
        } catch {
            if (seq === loadSeq) {
                html = "";
            }
        }
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="lv-detail-glass lv-glass" transition:fade={{ duration: 160 }} onclick={(e: Event) => e.stopPropagation()}>
    <div class="lv-detail-head">
        <span class="lv-detail-title">{t.manager.detailTitle}</span>
        <div class="fn__flex-1"></div>
        <button class="b3-button b3-button--small" onclick={onOpenDoc}>{t.manager.openDoc}</button>
        <button class="b3-button b3-button--small" onclick={onClose}>✕</button>
    </div>
    <div class="lv-detail-body b3-typography">
        <div class="lv-detail-preview">{@html html || (block.content ?? "")}</div>
        <div class="lv-detail-meta ft__smaller ft__on-surface">
            <div>{t.manager.detailBlockId}: {block.id}</div>
            {#if block.hPath}<div>{block.hPath}</div>{/if}
        </div>
    </div>
</div>

<style>
    .lv-detail-glass {
        position: fixed;
        inset: 0;
        z-index: 30;
        display: flex;
        flex-direction: column;
        padding: var(--lv-sp-5);
    }
    .lv-detail-head {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-detail-title { font-weight: 700; }
    .lv-detail-body {
        flex: 1;
        min-height: 0;
        overflow: auto;
        background: var(--lv-surface-grad);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-2);
        padding: var(--lv-sp-4);
        max-width: 880px;
        margin: 0 auto;
        width: 100%;
    }
    .lv-detail-preview { margin-bottom: var(--lv-sp-4); }
    .lv-detail-meta div { padding: 2px 0; }
</style>
