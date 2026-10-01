<script lang="ts">
    import { onMount } from "svelte";
    import { fetchSyncPost } from "siyuan";
    import type { SearchBlock } from "@/api/riff";
    import LvDrawer from "./kit/LvDrawer.svelte";

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

<LvDrawer open title={t.manager.detailTitle} width="min(560px, 92vw)" onclose={onClose}>
    {#snippet actions()}
        <button class="b3-button b3-button--small" onclick={onOpenDoc}>{t.manager.openDoc}</button>
    {/snippet}
    <div class="lv-detail-preview">{@html html || (block.content ?? "")}</div>
    <div class="lv-detail-meta ft__smaller ft__on-surface">
        <div>{t.manager.detailBlockId}: {block.id}</div>
        {#if block.hPath}<div>{block.hPath}</div>{/if}
    </div>
</LvDrawer>

<style>
    .lv-detail-preview { margin-bottom: var(--lv-sp-4); }
    .lv-detail-meta div { padding: 2px 0; }
</style>
