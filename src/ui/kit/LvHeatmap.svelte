<script lang="ts">
    let { days }: {
        days: { date: string; stat: { new: number; review: number; forget: number } }[];
    } = $props();

    function heatColor(n: number): string {
        if (n <= 0) {
            return "transparent";
        }
        const alpha = n >= 30 ? 100 : n >= 15 ? 65 : n >= 5 ? 40 : 20;
        return `color-mix(in srgb, var(--b3-theme-primary) ${alpha}%, transparent)`;
    }
</script>

<div class="lv-heatmap-wrap">
    <div class="lv-heatmap">
        {#each days as d, i (d.date)}
            <div
                class="lv-cell"
                class:lv-cell-today={i === days.length - 1}
                style={`background:${heatColor(d.stat.review)}`}
                title={`${d.date}: ${d.stat.review}`}
            ></div>
        {/each}
    </div>
    <div class="lv-heat-legend ft__smaller ft__on-surface">
        <span class="lv-legend-cell" style="background: transparent; border: 1px solid var(--lv-border)"></span>
        <span class="lv-legend-cell" style="background: color-mix(in srgb, var(--b3-theme-primary) 20%, transparent)"></span>
        <span class="lv-legend-cell" style="background: color-mix(in srgb, var(--b3-theme-primary) 40%, transparent)"></span>
        <span class="lv-legend-cell" style="background: color-mix(in srgb, var(--b3-theme-primary) 65%, transparent)"></span>
        <span class="lv-legend-cell" style="background: var(--b3-theme-primary)"></span>
    </div>
</div>

<style>
    .lv-heatmap {
        display: grid;
        grid-template-rows: repeat(7, 12px);
        grid-auto-flow: column;
        grid-auto-columns: 12px;
        gap: 3px;
        width: fit-content;
    }
    .lv-cell {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        background-color: color-mix(in srgb, var(--b3-theme-on-background) 6%, transparent);
        transition: transform var(--lv-dur-1) var(--lv-ease), outline var(--lv-dur-1) var(--lv-ease);
        outline: 1px solid transparent;
    }
    .lv-cell:hover { transform: scale(1.15); outline-color: var(--lv-primary-border); }
    .lv-cell-today { outline: 2px solid var(--lv-primary-border); outline-offset: 1px; }
    .lv-heat-legend {
        display: flex;
        gap: 6px;
        align-items: center;
        margin-top: var(--lv-sp-2);
        justify-content: flex-end;
    }
    .lv-legend-cell { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
</style>
