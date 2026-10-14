<script lang="ts">
    import LvIcon, { type LvIconName } from "./LvIcon.svelte";

    let { tabs, active, onchange, panelPrefix = "", panelId = "", orientation = "horizontal" }: {
        tabs: { id: string; label: string; icon?: LvIconName; badge?: string | number; badgeLabel?: string }[];
        active: string;
        onchange: (id: string) => void;
        /**
         * Prefix used to link each tab to its tabpanel. The host should render
         * `<section id="${panelPrefix}-${id}" role="tabpanel" ...>` for each
         * active tab. Set to an empty string only for a tablist without panels.
         */
        panelPrefix?: string;
        /** A single live panel can be reused when the host mounts only active content. */
        panelId?: string;
        /** Vertical sidebars use Up/Down navigation and expose the matching ARIA orientation. */
        orientation?: "horizontal" | "vertical";
    } = $props();

    // AS-9 键盘模型（WAI-ARIA Tabs）：左右箭头/Home/End 在页签间移动焦点并激活，
    // roving tabindex——仅当前页签可 Tab 进入。页签 id = `lv-tab-${id}`，
    // 宿主可用同名 aria-controls 关联内容面板。
    function onKeydown(e: KeyboardEvent) {
        // Prefer the focused tab so a key press remains correct while the
        // parent's active prop is updating asynchronously.
        const focused = (e.target as HTMLElement | null)?.closest<HTMLElement>("[role=tab]");
        const focusedId = focused?.id.startsWith("lv-tab-") ? focused.id.slice("lv-tab-".length) : "";
        const idx = tabs.findIndex(t => t.id === (focusedId || active));
        if (idx < 0) return;
        let next: number | null = null;
        if (orientation === "vertical" && e.key === "ArrowDown") next = (idx + 1) % tabs.length;
        else if (orientation === "vertical" && e.key === "ArrowUp") next = (idx - 1 + tabs.length) % tabs.length;
        else if (orientation === "horizontal" && e.key === "ArrowRight") next = (idx + 1) % tabs.length;
        else if (orientation === "horizontal" && e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        onchange(tabs[next].id);
        const el = document.getElementById(`lv-tab-${tabs[next].id}`);
        el?.focus();
    }
</script>

<div class="lv-tabs" role="tablist" aria-orientation={orientation} tabindex="-1" onkeydown={onKeydown}>
    {#each tabs as tb, i (tb.id)}
        <button
            type="button"
            class="lv-tab"
            class:lv-tab-active={active === tb.id}
            role="tab"
            id={`lv-tab-${tb.id}`}
            aria-selected={active === tb.id}
            aria-label={tb.badgeLabel ? `${tb.label}，${tb.badgeLabel}` : undefined}
            aria-controls={panelId || (panelPrefix ? `${panelPrefix}-${tb.id}` : undefined)}
            tabindex={active === tb.id || (i === 0 && !tabs.some(t => t.id === active)) ? 0 : -1}
            onclick={() => onchange(tb.id)}
        >
            {#if tb.icon}<LvIcon name={tb.icon} size={18} />{/if}
            <span class="lv-tab-label">{tb.label}</span>
            {#if tb.badge !== undefined}<span class="lv-tab-badge" title={tb.badgeLabel}>{tb.badge}</span>{/if}
        </button>
    {/each}
</div>

<style>
    .lv-tab-label { min-width: 0; }
    .lv-tab-badge {
        display: inline-flex;
        min-width: 19px;
        min-height: 19px;
        align-items: center;
        justify-content: center;
        margin-left: auto;
        padding: 0 calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline));
        border-radius: var(--lv-r-pill);
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-size: var(--lv-type-caption-size);
        font-variant-numeric: tabular-nums;
        line-height: var(--lv-lh-tight);
    }
</style>
