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
    }
    .lv-row2-control {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        cursor: pointer;
    }
</style>
