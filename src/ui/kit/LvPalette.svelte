<script lang="ts">
    // T13 ⌘K 命令面板（docs/42 §3.10）：输入过滤 + 分组结果 + ↑↓/Enter/Esc 键盘流。
    // 纯展示组件：命令表与执行回调由宿主注入（core/palette.ts 承担过滤逻辑）。
    import { filterPaletteCommands, flattenPaletteGroups, type PaletteCommand } from "@/core/palette";

    let {
        commands,
        placeholder = "",
        groupNames = {},
        labels = {},
        onrun,
        onClose,
    }: {
        commands: PaletteCommand[];
        placeholder?: string;
        /** 组键 → 展示名 */
        groupNames?: Record<string, string>;
        labels?: { empty?: string; foot?: string };
        onrun: (cmd: PaletteCommand) => void;
        onClose: () => void;
    } = $props();

    let query = $state("");
    let selected = $state(0);

    const groups = $derived(filterPaletteCommands(commands, query));
    const flat = $derived(flattenPaletteGroups(groups));

    // 查询变化后选中项回到首个可见项
    $effect(() => {
        query;
        selected = 0;
    });

    function runAt(index: number) {
        const cmd = flat[index];
        if (!cmd) return;
        onrun(cmd);
        onClose();
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (flat.length > 0) selected = (selected + 1) % flat.length;
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (flat.length > 0) selected = (selected - 1 + flat.length) % flat.length;
        } else if (e.key === "Enter") {
            e.preventDefault();
            runAt(selected);
        } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
    }
</script>

<div class="lv-palette" role="dialog" aria-label={placeholder} tabindex="-1" onkeydown={onKeydown}>
    <!-- svelte-ignore a11y_autofocus -->
    <input
        type="text"
        bind:value={query}
        {placeholder}
        autofocus
        aria-label={placeholder}
        onkeydown={(e: KeyboardEvent) => { e.stopPropagation(); onKeydown(e); }}
    />
    <div class="lv-palette-body" role="listbox" aria-label={placeholder}>
        {#if flat.length === 0}
            <div class="lv-palette-empty">{labels.empty ?? ""}</div>
        {:else}
            {#each groups as g (g.group)}
                <div class="lv-palette-group">{groupNames[g.group] ?? g.group}</div>
                {#each g.items as cmd (cmd.id)}
                    {@const index = flat.indexOf(cmd)}
                    <button
                        type="button"
                        class="lv-palette-item"
                        class:lv-palette-sel={index === selected}
                        role="option"
                        aria-selected={index === selected}
                        onmouseenter={() => (selected = index)}
                        onclick={() => runAt(index)}
                    >
                        <span class="lv-palette-label">{cmd.label}</span>
                        {#if cmd.hint}<span class="lv-palette-hint">{cmd.hint}</span>{/if}
                    </button>
                {/each}
            {/each}
        {/if}
    </div>
    {#if labels.foot}
        <div class="lv-palette-foot"><span>↑↓</span> {labels.foot}</div>
    {/if}
</div>

<style>
    .lv-palette {
        display: flex;
        flex-direction: column;
        width: 100%;
        min-width: 0;
        min-height: 120px;
    }
    .lv-palette input {
        width: 100%;
        border: 0;
        border-bottom: 1px solid var(--lv-border);
        border-radius: 0;
        padding: calc(var(--lv-space-unit) * 6 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 8);
        font-size: var(--lv-type-body-sm-size);
        background: transparent;
    }
    .lv-palette input:focus-visible {
        outline: 2px solid var(--lv-color-brand);
        outline-offset: -2px;
        box-shadow: inset 0 0 0 1px var(--lv-color-brand);
    }
    .lv-palette-body {
        max-height: 320px;
        overflow: auto;
        padding: calc(var(--lv-space-unit) * 3) 0 calc(var(--lv-space-unit) * 5);
    }
    .lv-palette-group {
        font-size: var(--lv-type-caption-size);
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--lv-color-text-muted);
        font-weight: var(--lv-fw-heading);
        margin: calc(var(--lv-space-unit) * 5) calc(var(--lv-space-unit) * 7) calc(var(--lv-space-unit) * 2);
    }
    .lv-palette-item {
        display: flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 5);
        width: 100%;
        min-height: 44px;
        padding: calc(var(--lv-space-unit) * 4 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 7);
        border: 0;
        border-radius: 0;
        background: transparent;
        font-size: var(--lv-type-body-size);
        text-align: left;
        transition: background var(--lv-dur-1) var(--lv-ease);
    }
    .lv-palette-item:hover { background: transparent; color: inherit; }
    .lv-palette-item:focus-visible {
        outline: 2px solid var(--lv-color-brand);
        outline-offset: -2px;
    }
    .lv-palette-sel,
    .lv-palette-sel:hover {
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        box-shadow: inset 2px 0 0 var(--lv-color-brand);
    }
    .lv-palette-label { min-width: 0; flex: 1; }
    .lv-palette-hint { font-size: var(--lv-type-meta-size); color: var(--lv-color-text-muted); font-variant-numeric: tabular-nums; }
    .lv-palette-empty {
        padding: calc(var(--lv-space-unit) * 11) calc(var(--lv-space-unit) * 8);
        text-align: center;
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
    }
    .lv-palette-foot {
        display: flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 3);
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 7);
        border-top: 1px solid var(--lv-border);
        font-size: var(--lv-type-meta-size);
        color: var(--lv-color-text-muted);
    }
</style>
