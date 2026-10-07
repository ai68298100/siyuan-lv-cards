<script lang="ts">
    let { tabs, active, onchange, panelPrefix = "", panelId = "" }: {
        tabs: { id: string; label: string }[];
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
        if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
        else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        onchange(tabs[next].id);
        const el = document.getElementById(`lv-tab-${tabs[next].id}`);
        el?.focus();
    }
</script>

<div class="lv-tabs" role="tablist" aria-orientation="horizontal" tabindex="-1" onkeydown={onKeydown}>
    {#each tabs as tb, i (tb.id)}
        <button
            type="button"
            class="lv-tab"
            class:lv-tab-active={active === tb.id}
            role="tab"
            id={`lv-tab-${tb.id}`}
            aria-selected={active === tb.id}
            aria-controls={panelId || (panelPrefix ? `${panelPrefix}-${tb.id}` : undefined)}
            tabindex={active === tb.id || (i === 0 && !tabs.some(t => t.id === active)) ? 0 : -1}
            onclick={() => onchange(tb.id)}
        >{tb.label}</button>
    {/each}
</div>
