<script lang="ts">
    import LvProgress from "./LvProgress.svelte";

    let { label, value, denom = "", tone = "primary", progress = -1, animate = false }: {
        label: string;
        value: number | string;
        /** 分母（如目标值），空则不显示 */
        denom?: string;
        /** 语义色点 */
        tone?: "primary" | "error" | "warn" | "neutral";
        /** 0-100，<0 不渲染进度条 */
        progress?: number;
        /** 数字滚动动画（reduced-motion 时直落） */
        animate?: boolean;
    } = $props();

    const toneColor = {
        primary: "var(--b3-theme-primary)",
        error: "var(--b3-theme-error)",
        warn: "var(--b3-theme-warning)",
        neutral: "var(--b3-theme-on-surface)",
    };

    let display = $state(value);

    $effect(() => {
        if (!animate || typeof value !== "number") {
            display = value;
            return;
        }
        if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            display = value;
            return;
        }
        const from = 0;
        const dur = 420;
        const t0 = performance.now();
        const step = (now: number) => {
            const p = Math.min(1, (now - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            display = Math.round(from + (value - from) * eased);
            if (p < 1) {
                requestAnimationFrame(step);
            }
        };
        requestAnimationFrame(step);
    });
</script>

<div class="lv-card2 lv-card2--hover lv-stat">
    <div class="lv-stat-label">
        <span class="lv-stat-dot" style={`background:${toneColor[tone]}`}></span>{label}
    </div>
    <div class="lv-hero-num">{display}{#if denom && denom !== "0"}<span class="lv-stat-denom">/ {denom}</span>{/if}</div>
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
