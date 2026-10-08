<script lang="ts">
    import LvProgress from "./LvProgress.svelte";

    let { label, value, denom = "", tone = "primary", progress = -1, animate = false, spark = null }: {
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
        /** R53 迷你走势（真实近期数据才传；null 不渲染） */
        spark?: number[] | null;
    } = $props();

    const toneColor = {
        primary: "var(--b3-theme-primary)",
        error: "var(--b3-theme-error)",
        warn: "var(--b3-theme-warning)",
        neutral: "var(--b3-theme-on-surface)",
    };

    /** R53 sparkline（§3.4）：面积 8% 主色 + 30% ink 描边 + 末点 primary 实心；全 0 走势不渲染（平线无信息量） */
    const sparkPts = $derived.by(() => {
        if (!spark || spark.length < 2 || !spark.some(v => v > 0)) return null;
        const w = 76, h = 24;
        const max = Math.max(...spark, 1);
        const xy = spark.map((v, i) => `${(i / (spark.length - 1) * w).toFixed(1)},${(h - 4 - v / max * (h - 8)).toFixed(1)}`).join(" ");
        const last = xy.split(" ").pop()!.split(",");
        return { xy, last, w, h };
    });

    // 刻意捕获初值：animate 只对首次挂载的数值做滚动，后续由 $effect 跟随更新
    // svelte-ignore state_referenced_locally
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

    // 零值态（R53 .num.zero）：0 降透明度保留原位，不隐藏不误读
    const isZero = $derived(display === 0 || display === "0");
</script>

<div class="lv-card2 lv-stat">
    <div class="lv-stat-label">
        <span class="lv-stat-dot" style={`background:${toneColor[tone]}`}></span>{label}
    </div>
    <div class="lv-hero-num" class:lv-num-zero={isZero}>{display}{#if denom && denom !== "0"}<span class="lv-stat-denom">/ {denom}</span>{/if}</div>
    {#if progress >= 0}
        <div class="lv-stat-progress"><LvProgress value={progress} /></div>
    {/if}
    {#if sparkPts}
        <svg class="lv-stat-spark" width={sparkPts.w} height={sparkPts.h} viewBox={`0 0 ${sparkPts.w} ${sparkPts.h}`} aria-hidden="true">
            <polygon points={`0,${sparkPts.h} ${sparkPts.xy} ${sparkPts.w},${sparkPts.h}`} fill="color-mix(in srgb, var(--b3-theme-primary) 8%, transparent)" stroke="none"></polygon>
            <polyline points={sparkPts.xy} fill="none" stroke="color-mix(in srgb, var(--b3-theme-on-background) 30%, transparent)" stroke-width="1.5" stroke-linejoin="round"></polyline>
            <circle cx={sparkPts.last[0]} cy={sparkPts.last[1]} r="2.6" fill="var(--b3-theme-primary)"></circle>
        </svg>
    {/if}
</div>

<style>
    .lv-stat .lv-stat-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
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
    .lv-stat .lv-stat-spark { display: block; margin-top: var(--lv-sp-1); }
</style>
