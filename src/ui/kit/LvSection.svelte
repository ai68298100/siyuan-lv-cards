<script lang="ts">
    import type { Snippet } from "svelte";

    let { title = "", sub = "", children, actions }: {
        title?: string;
        sub?: string;
        children?: Snippet;
        /** 头部右侧操作区（导出/开关等） */
        actions?: Snippet;
    } = $props();
</script>

<div class="lv-card2 lv-section2">
    {#if title}
        <div class="lv-secthead">
            <span>{title}
                {#if sub}<span class="lv-secthead-sub">· {sub}</span>{/if}
            </span>
            {#if actions}<span class="lv-secthead-actions">{@render actions()}</span>{/if}
        </div>
    {/if}
    {@render children?.()}
</div>

<style>
    .lv-section2 { margin-bottom: var(--lv-sp-4); }
    .lv-secthead { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-2); }
    .lv-secthead-actions { display: inline-flex; align-items: center; gap: var(--lv-sp-1); }
</style>
