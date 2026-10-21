<script lang="ts">
    /** 分段选择器（Kit）：互斥短选项组，替代两个以上 radio/switch 的场景 */
    let { options, value, onchange = () => {}, disabled = false, ariaLabel = "" }: {
        options: { value: string; label: string; title?: string }[];
        value: string;
        onchange?: (v: string) => void;
        disabled?: boolean;
        /** AS-10：无可见标签时为读屏提供组名 */
        ariaLabel?: string;
    } = $props();

    // AS-9 键盘模型（radio 惯例）：左右箭头在选择项间移动并选中
    function onKeydown(e: KeyboardEvent) {
        if (options.length === 0) return;
        const radios = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role=radio]")];
        const focused = (e.target as HTMLElement | null)?.closest<HTMLElement>("[role=radio]");
        const focusedIdx = focused ? radios.indexOf(focused) : -1;
        const idx = focusedIdx >= 0 ? focusedIdx : options.findIndex(o => o.value === value);
        if (idx < 0) return;
        let next: number | null = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + options.length) % options.length;
        if (next === null) return;
        e.preventDefault();
        onchange(options[next].value);
        const nextRadio = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role=radio]")[next];
        // Keep the radio keyboard model usable even while the controlled
        // `value` prop is waiting for the parent update: move focus to the
        // newly selected option immediately, then let the next render update
        // the roving tabindex.
        nextRadio?.focus({ preventScroll: true });
        nextRadio?.scrollIntoView({ block: "nearest" });
    }
</script>

<div class="lv-seg" class:lv-seg--disabled={disabled} role="radiogroup" tabindex="-1" aria-label={ariaLabel || undefined} onkeydown={onKeydown}>
    {#each options as o, i (o.value)}
        <button
            type="button"
            class="lv-seg-item"
            class:lv-seg-item--on={o.value === value}
            title={o.title ?? o.label}
            disabled={disabled}
            role="radio"
            aria-checked={o.value === value}
            tabindex={o.value === value || (i === 0 && !options.some(option => option.value === value)) ? 0 : -1}
            onclick={() => { if (o.value !== value) { onchange(o.value); } }}
        >{o.label}</button>
    {/each}
</div>

<style>
    .lv-seg {
        display: inline-flex;
        padding: 3px;
        border-radius: var(--lv-r-pill);
        background: color-mix(in srgb, var(--lv-color-text) 7%, transparent);
        border: 1px solid var(--lv-border);
        gap: 3px;
    }
    .lv-seg--disabled { opacity: 0.5; pointer-events: none; }
    .lv-seg-item {
        border: none;
        background: transparent;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        line-height: var(--lv-lh-tight);
        padding: 6px 14px;
        border-radius: var(--lv-r-pill);
        cursor: pointer;
        font-weight: var(--lv-fw-emphasis);
        transition: background var(--lv-dur-1, 120ms) var(--lv-ease, ease-out),
            color var(--lv-dur-1, 120ms) var(--lv-ease, ease-out),
            box-shadow var(--lv-dur-1, 120ms) var(--lv-ease, ease-out),
            transform var(--lv-dur-1, 120ms) var(--lv-ease, ease-out);
    }
    .lv-seg-item:hover:not(:disabled) {
        color: var(--lv-color-text);
        background: color-mix(in srgb, var(--lv-color-text) 4%, transparent);
    }
    .lv-seg-item--on {
        background: var(--lv-color-surface);
        color: var(--lv-color-brand);
        font-weight: var(--lv-fw-bold);
        box-shadow: 0 2px 8px color-mix(in srgb, black 6%, transparent), var(--lv-inset-shine);
    }
</style>
