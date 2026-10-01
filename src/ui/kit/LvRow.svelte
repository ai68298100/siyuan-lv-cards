<script lang="ts">
    import type { Snippet } from "svelte";

    let { label, hint = "", children }: {
        label: string;
        hint?: string;
        children?: Snippet;
    } = $props();
</script>

<div class="lv-row2">
    <div class="fn__flex-1">
        <div>{label}</div>
        {#if hint}<div class="ft__smaller ft__on-surface">{hint}</div>{/if}
    </div>
    {@render children?.()}
</div>

<style>
    .lv-row2 {
        display: flex;
        gap: var(--lv-sp-3);
        align-items: center;
        padding: var(--lv-sp-2) 0;
    }
</style>
