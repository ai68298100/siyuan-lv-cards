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

<div class="lv-steps">
    {#each steps as label, i (label)}
        <button
            class="lv-step"
            class:lv-step--on={i === current}
            class:lv-step--done={i < current}
            disabled={!onclick}
            aria-current={i === current ? "step" : undefined}
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
        gap: var(--lv-sp-1, calc(var(--lv-space-unit) * 2));
    }
    .lv-step {
        display: flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 3);
        border: none;
        background: transparent;
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 3);
        cursor: default;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
    }
    .lv-step:not(:disabled) { cursor: pointer; }
    .lv-step-dot {
        width: 20px;
        height: 20px;
        line-height: var(--lv-lh-control-lg);
        border-radius: var(--lv-r-circle);
        text-align: center;
        font-size: var(--lv-type-meta-size);
        font-weight: var(--lv-fw-semibold);
        background: color-mix(in srgb, var(--lv-color-text) 8%, transparent);
        flex-shrink: 0;
    }
    .lv-step--on .lv-step-dot {
        background: var(--lv-color-brand);
        color: var(--lv-color-on-brand);
    }
    .lv-step--done .lv-step-dot {
        background: var(--lv-primary-soft, transparent);
        color: var(--lv-color-brand);
    }
    .lv-step--on { color: var(--lv-color-text); font-weight: 600; }
    .lv-step-line {
        width: 18px;
        height: 1px;
        background: var(--lv-border, rgba(128, 128, 128, 0.2));
        flex-shrink: 0;
    }
    .lv-step-line--done { background: var(--lv-color-brand); opacity: 0.5; }
</style>
