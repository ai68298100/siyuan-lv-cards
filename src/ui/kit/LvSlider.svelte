<script lang="ts">
    /** 滑杆（Kit）：数值区间选择，带当前值展示与可选后缀 */
    let { value, min = 0, max = 100, step = 1, suffix = "", onchange = () => {} }: {
        value: number;
        min?: number;
        max?: number;
        step?: number;
        /** 值后缀（如 "s"、"张"） */
        suffix?: string;
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
        oninput={(e) => onchange(Number((e.target as HTMLInputElement).value))}
    />
    <span class="lv-slider-val">{value}{suffix}</span>
</span>

<style>
    .lv-slider {
        display: inline-flex;
        align-items: center;
        gap: var(--lv-sp-2, 8px);
    }
    .lv-slider input[type="range"] {
        width: 140px;
        accent-color: var(--b3-theme-primary);
    }
    .lv-slider-val {
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        color: var(--b3-theme-on-surface);
        min-width: 34px;
        text-align: right;
    }
</style>
