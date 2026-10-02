<script lang="ts">
    /** 步骤指示器（Kit，339）：向导/引导的进度条——圆点 + 连接线 + 标签 */
    let { steps, current, onclick }: {
        steps: string[];
        /** 当前步骤（0 起） */
        current: number;
        /** 可选：点按步骤回跳（不给则只展示） */
        onclick?: (i: number) => void;
    } = $props();
</script>

<div class="lv-steps" role="list">
    {#each steps as label, i (label)}
        <button
            class="lv-step"
            class:lv-step--on={i === current}
            class:lv-step--done={i < current}
            disabled={!onclick}
            role="listitem"
            onclick={() => onclick?.(i)}
        >
            <span class="lv-step-dot">{i < current ? "✓" : i + 1}</span>
            <span class="lv-step-label">{label}</span>
        </button>
        {#if i < steps.length - 1}
            <span class="lv-step-line" class:lv-step-line--done={i < current}></span>
        {/if}
    {/each}
</div>

<style>
    .lv-steps {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-1, 4px);
    }
    .lv-step {
        display: flex;
        align-items: center;
        gap: 6px;
        border: none;
        background: transparent;
        padding: 4px 6px;
        cursor: default;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
    }
    .lv-step:not(:disabled) { cursor: pointer; }
    .lv-step-dot {
        width: 20px;
        height: 20px;
        line-height: 20px;
        border-radius: 50%;
        text-align: center;
        font-size: 11px;
        font-weight: 600;
        background: color-mix(in srgb, var(--b3-theme-on-background) 8%, transparent);
        flex-shrink: 0;
    }
    .lv-step--on .lv-step-dot {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
    }
    .lv-step--done .lv-step-dot {
        background: var(--lv-primary-soft, transparent);
        color: var(--b3-theme-primary);
    }
    .lv-step--on { color: var(--b3-theme-on-background); font-weight: 600; }
    .lv-step-line {
        width: 18px;
        height: 1px;
        background: var(--lv-border, rgba(128, 128, 128, 0.2));
        flex-shrink: 0;
    }
    .lv-step-line--done { background: var(--b3-theme-primary); opacity: 0.5; }
</style>
