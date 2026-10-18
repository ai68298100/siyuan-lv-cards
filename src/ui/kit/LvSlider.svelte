<script lang="ts">
    /** 滑杆（Kit）：数值区间选择，带当前值展示与可选后缀 */
    let { value, min = 0, max = 100, step = 1, suffix = "", ariaLabel = "", onchange = () => {} }: {
        value: number;
        min?: number;
        max?: number;
        step?: number;
        /** 值后缀（如 "s"、"张"） */
        suffix?: string;
        /** AS-10：读屏标签 */
        ariaLabel?: string;
        onchange?: (v: number) => void;
    } = $props();
</script>

<span class="lv-slider">
    <input
        type="range"
        {min}
        {max}
        {step}
        value={value}
        aria-label={ariaLabel || undefined}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={`${value}${suffix}`}
        oninput={(e) => onchange(Number((e.target as HTMLInputElement).value))}
    />
    <span class="lv-slider-val" aria-hidden="true">{value}{suffix}</span>
</span>

<style>
    .lv-slider {
        display: inline-flex;
        align-items: center;
        gap: var(--lv-sp-2, calc(var(--lv-space-unit) * 4));
    }
    .lv-slider input[type="range"] {
        width: 140px;
        accent-color: var(--lv-color-brand);
    }
    .lv-slider-val {
        font-size: var(--lv-type-control-size);
        font-variant-numeric: tabular-nums;
        color: var(--lv-color-text-muted);
        min-width: 34px;
        text-align: right;
    }
</style>
