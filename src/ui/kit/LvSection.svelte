<script lang="ts">
    import type { Snippet } from "svelte";

    let { title = "", sub = "", children }: {
        title?: string;
        sub?: string;
        children?: Snippet;
    } = $props();
</script>

<div class="lv-card2 lv-section2">
    {#if title}
        <div class="lv-secthead">
            {title}
            {#if sub}<span class="lv-secthead-sub">· {sub}</span>{/if}
        </div>
    {/if}
    {@render children?.()}
</div>

<style>
    .lv-section2 { margin-bottom: var(--lv-sp-4); }
</style>
