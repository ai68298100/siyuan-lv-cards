<script lang="ts">
    import type { Snippet } from "svelte";

    let { eyebrow = "", title = "", subtitle = "", actions, children }: {
        /** 页眉线（如 TODAY / 2026.10.07），R53 .page-head 的 eyebrow 层 */
        eyebrow?: string;
        /** 页题（空则不渲染页头） */
        title?: string;
        subtitle?: string;
        actions?: Snippet;
        children?: Snippet;
    } = $props();
</script>

<div class="lv-page">
    {#if title || actions}
        <div class="lv-pagehead">
            <div class="lv-pagehead-main">
                {#if eyebrow}<div class="lv-eyebrow">{eyebrow}</div>{/if}
                {#if title}<div class="lv-pagehead-title">{title}</div>{/if}
                {#if subtitle}<p class="lv-pagehead-sub">{subtitle}</p>{/if}
            </div>
            {#if actions}
                <div class="lv-pagehead-actions">{@render actions()}</div>
            {/if}
        </div>
    {/if}
    {@render children?.()}
</div>
