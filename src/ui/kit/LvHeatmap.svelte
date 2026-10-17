<script lang="ts">
    let { days }: {
        days: { date: string; stat: { new: number; review: number; forget: number } }[];
    } = $props();

    function heatColor(n: number): string {
        if (n <= 0) {
            return "transparent";
        }
        const alpha = n >= 30 ? 100 : n >= 15 ? 65 : n >= 5 ? 40 : 20;
        return `color-mix(in srgb, var(--lv-color-brand) ${alpha}%, transparent)`;
    }

    function cellTitle(d: { date: string; stat: { new: number; review: number; forget: number } }): string {
        const parts = [`${d.date}: ${d.stat.review}`];
        if (d.stat.new > 0) parts.push(`+${d.stat.new}`);
        if (d.stat.forget > 0) parts.push(`-${d.stat.forget}`);
        return parts.join(" · ");
    }
</script>

<div class="lv-heatmap-wrap">
    <!-- 周数大时网格远超卡宽：横向滚动（GitHub 式），避免溢出卡片 -->
    <div class="lv-heat-scroll">
        <div class="lv-heatmap">
            {#each days as d, i (d.date)}
                <div
                    class="lv-cell"
                    class:lv-cell-today={i === days.length - 1}
                    style={`background: ${heatColor(d.stat.review)}`}
                    title={cellTitle(d)}
                ></div>
            {/each}
        </div>
    </div>
    <div class="lv-heat-legend ft__smaller ft__on-surface">
        <span class="lv-legend-cell" style="background: transparent; border: 1px solid var(--lv-border)"></span>
        <span class="lv-legend-cell" style="background: color-mix(in srgb, var(--lv-color-brand) 20%, transparent)"></span>
        <span class="lv-legend-cell" style="background: color-mix(in srgb, var(--lv-color-brand) 40%, transparent)"></span>
        <span class="lv-legend-cell" style="background: color-mix(in srgb, var(--lv-color-brand) 65%, transparent)"></span>
        <span class="lv-legend-cell" style="background: var(--lv-color-brand)"></span>
    </div>
</div>

<style>
    .lv-heatmap-wrap { min-width: 0; }
    .lv-heat-scroll {
        max-width: 100%;
        overflow-x: auto;
        padding-bottom: calc(var(--lv-space-unit) * 2);
        scrollbar-width: thin;
        scrollbar-color: var(--lv-border-strong, transparent) transparent;
    }
    .lv-heatmap {
        display: grid;
        grid-template-rows: repeat(7, 12px);
        grid-auto-flow: column;
        grid-auto-columns: 12px;
        gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
        width: fit-content;
    }
    .lv-cell {
        width: 12px;
        height: 12px;
        border-radius: var(--lv-r-optical);
        /* 空格可见度：6% 在白卡上近乎隐形，整图只剩一簇数据——提到 10% 让网格形态完整可读 */
        background-color: color-mix(in srgb, var(--lv-color-text) 10%, transparent);
        transition: transform var(--lv-dur-1) var(--lv-ease), outline var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);
        outline: 1px solid transparent;
        position: relative;
    }
    .lv-cell:hover {
        transform: scale(1.3);
        z-index: 2;
        outline-color: var(--lv-primary-border);
        box-shadow: 0 2px 6px color-mix(in srgb, var(--lv-color-brand) 30%, transparent);
    }
    .lv-cell-today { outline: 2px solid var(--lv-primary-border); outline-offset: 1px; }
    .lv-heat-legend {
        display: flex;
        gap: calc(var(--lv-space-unit) * 3);
        align-items: center;
        margin-top: var(--lv-sp-2);
        justify-content: flex-end;
    }
    .lv-legend-cell { width: 10px; height: 10px; border-radius: var(--lv-r-optical); display: inline-block; }
</style>
