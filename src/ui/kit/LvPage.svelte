<script lang="ts">
    import type { Snippet } from "svelte";

    let { title = "", subtitle = "", dot = false, actions, children }: {
        /** 页题（空则不渲染页头） */
        title?: string;
        subtitle?: string;
        /** 呼吸点（表示"运行中"的页面级状态） */
        dot?: boolean;
        actions?: Snippet;
        children?: Snippet;
    } = $props();
</script>

<div class="lv-page">
    {#if title || actions}
        <div class="lv-pagehead">
            {#if dot}<span class="lv-dot"></span>{/if}
            {#if title}<span class="lv-pagehead-title">{title}</span>{/if}
            {#if subtitle}<span class="lv-pagehead-sub">{subtitle}</span>{/if}
            <div class="fn__flex-1"></div>
            {#if actions}{@render actions()}{/if}
        </div>
    {/if}
    {@render children?.()}
</div>
