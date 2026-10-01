<script lang="ts">
    import LvProgress from "./LvProgress.svelte";

    let { label, value, denom = "", tone = "primary", progress = -1 }: {
        label: string;
        value: number | string;
        /** 分母（如目标值），空则不显示 */
        denom?: string;
        /** 语义色点 */
        tone?: "primary" | "error" | "warn" | "neutral";
        /** 0-100，<0 不渲染进度条 */
        progress?: number;
    } = $props();

    const toneColor = {
        primary: "var(--b3-theme-primary)",
        error: "var(--b3-theme-error)",
        warn: "var(--b3-theme-warning)",
        neutral: "var(--b3-theme-on-surface)",
    };
</script>

<div class="lv-card2 lv-card2--hover lv-stat">
    <div class="lv-stat-label">
        <span class="lv-stat-dot" style={`background:${toneColor[tone]}`}></span>{label}
    </div>
    <div class="lv-hero-num">{value}{#if denom}<span class="lv-stat-denom">/ {denom}</span>{/if}</div>
    {#if progress >= 0}
        <div class="lv-stat-progress"><LvProgress value={progress} /></div>
    {/if}
</div>

<style>
    .lv-stat .lv-stat-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        margin-bottom: var(--lv-sp-1);
    }
    .lv-stat .lv-stat-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .lv-stat .lv-stat-denom {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        background: none;
        -webkit-background-clip: initial;
        background-clip: initial;
        margin-left: 4px;
    }
    .lv-stat .lv-stat-progress { margin-top: var(--lv-sp-2); }
</style>
