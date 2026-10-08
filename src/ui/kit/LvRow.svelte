<script lang="ts">
    import type { Snippet } from "svelte";

    let { label, hint = "", children }: {
        label: string;
        hint?: string;
        children?: Snippet;
    } = $props();
</script>

<div class="lv-row2">
    <div class="lv-row2-label">
        <div class="lv-row2-name">{label}</div>
        {#if hint}<div class="ft__smaller ft__on-surface lv-row2-hint">{hint}</div>{/if}
    </div>
    <!-- AS-10：label 包裹实现与行内控件的隐式关联（点击标签聚焦首个可标注控件；对按钮类无副作用） -->
    <label class="lv-row2-control">
        {@render children?.()}
    </label>
</div>

<style>
    .lv-row2 {
        display: flex;
        gap: var(--lv-sp-3);
        align-items: center;
        padding: var(--lv-sp-2) 0;
        /* 控件过宽时 label 列保持可读宽度，控件行换行到下方（否则 hint 被挤成竖条） */
        flex-wrap: wrap;
    }
    .lv-row2-label {
        flex: 1 1 240px;
        min-width: 0;
    }
    .lv-row2-name {
        font-size: 13px;
        font-weight: 600;
    }
    .lv-row2-hint {
        margin-top: 2px;
        max-width: 34em;
        line-height: 1.6;
    }
    .lv-row2-control {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex: 0 1 auto;
        max-width: 100%;
        cursor: pointer;
    }
</style>
