<script lang="ts">
    // T14 学习日历（docs/42 §3.11/§4）：过去=复习热力，未来=到期负载；纯展示，数据由宿主注入。
    import type { CalendarCell, ForecastDay } from "@/core/forecast";

    let {
        monthLabel,
        cells,
        forecast,
        labels = {},
        caption = "",
        loading = false,
    }: {
        /** 标题「2026 年 10 月」 */
        monthLabel: string;
        cells: CalendarCell[];
        forecast: ForecastDay[];
        labels?: { few?: string; many?: string; note?: string; forecastTitle?: string; empty?: string };
        caption?: string;
        loading?: boolean;
    } = $props();

    const weekDays = ["一", "二", "三", "四", "五", "六", "日"];
    const maxLoad = $derived(Math.max(1, ...forecast.map(d => d.reviews + d.news)));
    const isEmpty = $derived(forecast.every(d => d.reviews + d.news === 0));
</script>

<div class="lv-cal">
    {#if loading}
        <div class="lv-skeleton" style="height: 180px"></div>
    {:else}
        <div class="lv-cal-grid" aria-label={monthLabel}>
            {#each weekDays as d (d)}
                <span class="lv-cal-wd">{d}</span>
            {/each}
            {#each cells as c, i (i)}
                {#if c.date === null}
                    <span class="lv-cal-day lv-cal-off"></span>
                {:else}
                    <span class={`lv-cal-day ${c.tone}`} title={c.date}>
                        <b>{c.day}</b>
                    </span>
                {/if}
            {/each}
        </div>
        <div class="lv-cal-legend">
            <span class="hint">{labels.few ?? ""}</span>
            <span style="display:flex;gap:3px">
                {#each [1, 2, 3] as lvl (lvl)}
                    <span class={`lv-cal-sw past${lvl}`}></span>
                {/each}
                <span class="lv-cal-sw future2"></span>
            </span>
            <span class="hint">{labels.many ?? ""}</span>
            <span class="hint" style="margin-left:auto">{labels.note ?? ""}</span>
        </div>
        {#if forecast.length > 0}
            <div class="divider"></div>
            <div class="lv-cal-forecast">
                <div class="lv-secthead"><span>{labels.forecastTitle ?? ""}</span></div>
                {#if isEmpty}
                    <div class="hint">{labels.empty ?? ""}</div>
                {:else}
                    <div class="lv-forecast">
                        {#each forecast as d (d.date)}
                            <i
                                class:lv-forecast-hi={d.reviews + d.news >= 18}
                                style={`height:${Math.max(6, Math.round((d.reviews + d.news) / maxLoad * 100))}%`}
                                title={`${d.date} · ${d.reviews + d.news}`}
                            ></i>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
        {#if caption}<p class="tiny" style="margin:10px 0 0">{caption}</p>{/if}
    {/if}
</div>

<style>
    .lv-cal-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 5px;
        margin-top: 8px;
        /* 密度护栏：撑满 1200px 卡时格子会变成 158×117 的巨块——限宽保持原型 .cal 的紧凑比例 */
        max-width: 640px;
    }
    .lv-cal-wd {
        font-size: 10px;
        letter-spacing: 0.1em;
        color: var(--b3-theme-on-surface);
        text-align: center;
        font-weight: 650;
        padding: 3px 0;
    }
    .lv-cal-day {
        aspect-ratio: 1.35;
        border: 1px solid var(--lv-border);
        border-radius: 8px;
        padding: 5px 7px;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        font-variant-numeric: tabular-nums;
        background: var(--b3-theme-surface);
        min-height: 34px;
        box-sizing: border-box;
    }
    .lv-cal-day b { font-size: 12px; color: var(--b3-theme-on-background); font-weight: 600; }
    .lv-cal-off { border-color: transparent; background: transparent; }
    .lv-cal-day.past1 { background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-surface)); }
    .lv-cal-day.past2 { background: color-mix(in srgb, var(--b3-theme-primary) 26%, var(--b3-theme-surface)); }
    .lv-cal-day.past3 { background: color-mix(in srgb, var(--b3-theme-primary) 42%, var(--b3-theme-surface)); }
    .lv-cal-day.past2 b, .lv-cal-day.past3 b { color: var(--b3-theme-primary); }
    .lv-cal-day.today { border: 2px solid var(--b3-theme-primary); }
    .lv-cal-day.future1 { background: color-mix(in srgb, var(--b3-theme-warning) 14%, var(--b3-theme-surface)); }
    .lv-cal-day.future2 { background: color-mix(in srgb, var(--b3-theme-warning) 26%, var(--b3-theme-surface)); }
    .lv-cal-day.future3 { background: color-mix(in srgb, var(--b3-theme-warning) 40%, var(--b3-theme-surface)); }
    .lv-cal-legend {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        flex-wrap: wrap;
    }
    .lv-cal-sw {
        width: 14px;
        height: 14px;
        border-radius: 4px;
        display: inline-block;
        border: 1px solid var(--lv-border);
    }
    .lv-cal-sw.past1 { background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-surface)); }
    .lv-cal-sw.past2 { background: color-mix(in srgb, var(--b3-theme-primary) 26%, var(--b3-theme-surface)); }
    .lv-cal-sw.past3 { background: color-mix(in srgb, var(--b3-theme-primary) 42%, var(--b3-theme-surface)); }
    .lv-cal-sw.future2 { background: color-mix(in srgb, var(--b3-theme-warning) 24%, var(--b3-theme-surface)); }
    .lv-forecast {
        display: flex;
        gap: 4px;
        align-items: flex-end;
        height: 74px;
        margin-top: 10px;
    }
    .lv-forecast i {
        flex: 1;
        background: color-mix(in srgb, var(--b3-theme-warning) 22%, var(--b3-theme-surface));
        border-top: 2px solid var(--b3-theme-warning);
        border-radius: 4px 4px 0 0;
        min-height: 6px;
    }
    .lv-forecast i.lv-forecast-hi {
        background: color-mix(in srgb, var(--b3-theme-warning) 40%, var(--b3-theme-surface));
    }
    @media (max-width: 740px) {
        .lv-cal-day { padding: 3px 4px; min-height: 26px; }
        .lv-cal-day b { font-size: 10px; }
    }
</style>
