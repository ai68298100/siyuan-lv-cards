<script lang="ts">
    // T14 学习日历（docs/42 §3.11/§4）：过去=复习热力，未来=到期负载；数据由宿主注入。
    import type { CalendarCell, ForecastDay } from "@/core/forecast";
    import LvSkeleton from "./LvSkeleton.svelte";

    const DEFAULT_WEEK_DAYS = ["一", "二", "三", "四", "五", "六", "日"];

    let {
        monthLabel,
        cells,
        forecast,
        labels = {},
        weekDays = DEFAULT_WEEK_DAYS,
        dateLabel,
        forecastDayLabel,
        caption = "",
        loading = false,
        selectedDate = null,
        onselect,
    }: {
        /** 标题「2026 年 10 月」 */
        monthLabel: string;
        cells: CalendarCell[];
        forecast: ForecastDay[];
        labels?: { few?: string; many?: string; note?: string; forecastTitle?: string; empty?: string };
        /** Optional localized weekday labels, in Monday-first order. */
        weekDays?: string[];
        /** Optional complete accessible name for each date cell. */
        dateLabel?: (date: string, cell: CalendarCell) => string;
        /** Optional localized accessible name for each forecast bar. */
        forecastDayLabel?: (day: ForecastDay) => string;
        caption?: string;
        loading?: boolean;
        /** 可选的受控选中日期（YYYY-MM-DD）；未提供时不显示选中态。 */
        selectedDate?: string | null;
        /** 提供后，日期格变为可键盘操作的按钮并在选中时回调日期。 */
        onselect?: (date: string) => void;
    } = $props();

    const displayedWeekDays = $derived(weekDays.length === 7 ? weekDays : DEFAULT_WEEK_DAYS);
    const maxLoad = $derived(Math.max(1, ...forecast.map(d => d.reviews + d.news)));
    const isEmpty = $derived(forecast.every(d => d.reviews + d.news === 0));

    function selectDate(date: string | null) {
        if (date) onselect?.(date);
    }

    function accessibleDateLabel(cell: CalendarCell): string {
        if (!cell.date) return "";
        return dateLabel?.(cell.date, cell) ?? cell.date;
    }

    function accessibleForecastLabel(day: ForecastDay): string {
        return forecastDayLabel?.(day) ?? `${day.date} · ${day.reviews + day.news}`;
    }
</script>

<div class="lv-cal">
    {#if loading}
        <LvSkeleton count={1} height={180} />
    {:else}
        <div class="lv-cal-grid" aria-label={monthLabel}>
            {#each displayedWeekDays as d, i (i)}
                <span class="lv-cal-wd">{d}</span>
            {/each}
            {#each cells as c, i (i)}
                {#if c.date === null}
                    <span class="lv-cal-day lv-cal-off"></span>
                {:else if onselect}
                    <button
                        type="button"
                        class={`lv-cal-day ${c.tone}`}
                        title={c.date}
                        aria-label={accessibleDateLabel(c)}
                        aria-pressed={selectedDate === c.date}
                        onclick={() => selectDate(c.date)}
                    >
                        <b>{c.day}</b>
                    </button>
                {:else}
                    <span class={`lv-cal-day ${c.tone}`} title={c.date} aria-label={accessibleDateLabel(c)}>
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
            <span class="hint" style="margin-left: auto">{labels.note ?? ""}</span>
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
                            {@const forecastLabel = accessibleForecastLabel(d)}
                            <i
                                aria-hidden="true"
                                class:lv-forecast-hi={d.reviews + d.news >= 18}
                                style={`height:${Math.max(6, Math.round((d.reviews + d.news) / maxLoad * 100))}%`}
                                title={forecastLabel}
                                aria-label={forecastLabel}
                                role="img"
                            ><span class="lv-visually-hidden">{forecastLabel}</span></i>
                        {/each}
                    </div>
                    <ul class="lv-cal-forecast-text lv-visually-hidden" aria-label={labels.forecastTitle ?? "Forecast"}>
                        {#each forecast as d (d.date)}
                            <li>{d.date}: {d.reviews + d.news}</li>
                        {/each}
                    </ul>
                {/if}
            </div>
        {/if}
        {#if caption}<p class="tiny" style="margin: calc(var(--lv-space-unit) * 5) 0 0">{caption}</p>{/if}
    {/if}
</div>

<style>
    .lv-cal { container-type: inline-size; min-width: 0; }
    .lv-cal-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline));
        margin-top: calc(var(--lv-space-unit) * 4);
        /* 密度护栏：撑满 1200px 卡时格子会变成 158×117 的巨块——限宽保持原型 .cal 的紧凑比例 */
        max-width: 640px;
        width: 100%;
        min-width: 0;
    }
    .lv-cal-wd {
        font-size: var(--lv-type-caption-size);
        letter-spacing: 0.1em;
        color: var(--lv-color-text-muted);
        text-align: center;
        font-weight: var(--lv-fw-heading);
        padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) 0;
    }
    .lv-cal-day {
        aspect-ratio: 1.35;
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-s);
        padding: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 3 + var(--lv-space-hairline));
        font-size: var(--lv-type-meta-size);
        color: var(--lv-color-text-muted);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        font-variant-numeric: tabular-nums;
        background: var(--lv-color-surface);
        font: inherit;
        text-align: left;
        min-height: 44px;
        box-sizing: border-box;
        transition: transform var(--lv-dur-1) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-1) var(--lv-ease);

        &:not(.lv-cal-off):hover {
            transform: scale(1.08);
            border-color: var(--lv-border-strong);
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
            z-index: 1;
        }
    }
    button.lv-cal-day {
        cursor: pointer;
        appearance: none;
    }
    button.lv-cal-day:focus-visible {
        outline: 2px solid var(--lv-color-brand);
        outline-offset: 2px;
        z-index: 2;
    }
    button.lv-cal-day[aria-pressed="true"] {
        box-shadow: inset 0 0 0 2px var(--lv-color-brand), var(--lv-inset-shine);
    }
    .lv-cal-day b { font-size: var(--lv-type-control-size); color: var(--lv-color-text); font-weight: var(--lv-fw-semibold); }
    .lv-cal-off { border-color: transparent; background: transparent; }
    .lv-cal-day.past1 { background: color-mix(in srgb, var(--lv-color-brand) 12%, var(--lv-color-surface)); }
    .lv-cal-day.past2 { background: color-mix(in srgb, var(--lv-color-brand) 26%, var(--lv-color-surface)); }
    .lv-cal-day.past3 { background: color-mix(in srgb, var(--lv-color-brand) 42%, var(--lv-color-surface)); }
    .lv-cal-day.past2 b, .lv-cal-day.past3 b { color: var(--lv-color-brand); }
    .lv-cal-day.today { border: 2px solid var(--lv-color-brand); }
    .lv-cal-day.future1 { background: color-mix(in srgb, var(--lv-color-warning) 14%, var(--lv-color-surface)); }
    .lv-cal-day.future2 { background: color-mix(in srgb, var(--lv-color-warning) 26%, var(--lv-color-surface)); }
    .lv-cal-day.future3 { background: color-mix(in srgb, var(--lv-color-warning) 40%, var(--lv-color-surface)); }
    .lv-cal-legend {
        display: flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 4);
        margin-top: calc(var(--lv-space-unit) * 6);
        flex-wrap: wrap;
    }
    .lv-cal-sw {
        width: 14px;
        height: 14px;
        border-radius: var(--lv-r-xs);
        display: inline-block;
        border: 1px solid var(--lv-border);
    }
    .lv-cal-sw.past1 { background: color-mix(in srgb, var(--lv-color-brand) 12%, var(--lv-color-surface)); }
    .lv-cal-sw.past2 { background: color-mix(in srgb, var(--lv-color-brand) 26%, var(--lv-color-surface)); }
    .lv-cal-sw.past3 { background: color-mix(in srgb, var(--lv-color-brand) 42%, var(--lv-color-surface)); }
    .lv-cal-sw.future2 { background: color-mix(in srgb, var(--lv-color-warning) 24%, var(--lv-color-surface)); }
    .lv-forecast {
        display: flex;
        gap: calc(var(--lv-space-unit) * 2);
        align-items: flex-end;
        height: 74px;
        margin-top: calc(var(--lv-space-unit) * 5);
    }
    .lv-forecast i {
        flex: 1;
        background: color-mix(in srgb, var(--lv-color-warning) 22%, var(--lv-color-surface));
        border-top: 2px solid var(--lv-color-warning);
        border-radius: var(--lv-r-xs) var(--lv-r-xs) 0 0;
        min-height: 6px;
        transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease);
        cursor: pointer;

        &:hover {
            transform: scaleY(1.08);
            background: color-mix(in srgb, var(--lv-color-warning) 45%, var(--lv-color-surface));
        }
    }
    .lv-forecast i.lv-forecast-hi {
        background: color-mix(in srgb, var(--lv-color-warning) 40%, var(--lv-color-surface));
    }
    .lv-visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
    }

    /* The Hub owns the responsive container; keep this component usable in a
       narrow embedded panel even when the viewport itself is wide. */
    .lv-cal { min-width: 0; container-type: inline-size; }
    @container (max-width: 480px) {
        .lv-cal-grid { gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)); }
        .lv-cal-day { padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 1); }
        .lv-cal-day b { font-size: var(--lv-type-caption-size); }
    }
</style>
