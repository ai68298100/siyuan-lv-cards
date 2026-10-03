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
        const idx = options.findIndex(o => o.value === value);
        if (idx < 0) return;
        let next: number | null = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + options.length) % options.length;
        if (next === null) return;
        e.preventDefault();
        onchange(options[next].value);
        (e.currentTarget as HTMLElement).querySelectorAll("[role=radio]")[next]?.scrollIntoView({ block: "nearest" });
    }
</script>

<div class="lv-seg" class:lv-seg--disabled={disabled} role="radiogroup" tabindex="-1" aria-label={ariaLabel || undefined} onkeydown={onKeydown}>
    {#each options as o (o.value)}
        <button
            type="button"
            class="lv-seg-item"
            class:lv-seg-item--on={o.value === value}
            title={o.title ?? o.label}
            disabled={disabled}
            role="radio"
            aria-checked={o.value === value}
            onclick={() => { if (o.value !== value) { onchange(o.value); } }}
        >{o.label}</button>
    {/each}
</div>

<style>
    .lv-seg {
        display: inline-flex;
        padding: 2px;
        border-radius: var(--lv-r-s, 8px);
        background: color-mix(in srgb, var(--b3-theme-on-background) 6%, transparent);
        gap: 2px;
    }
    .lv-seg--disabled { opacity: 0.5; pointer-events: none; }
    .lv-seg-item {
        border: none;
        background: transparent;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        line-height: 1;
        padding: 6px 10px;
        border-radius: calc(var(--lv-r-s, 8px) - 2px);
        cursor: pointer;
        transition: background var(--lv-dur-1, 120ms) var(--lv-ease, ease-out), color var(--lv-dur-1, 120ms) var(--lv-ease, ease-out);
    }
    .lv-seg-item:hover { color: var(--b3-theme-on-background); }
    .lv-seg-item--on {
        background: var(--b3-theme-surface);
        color: var(--b3-theme-primary);
        font-weight: 600;
        box-shadow: var(--lv-shadow-1, 0 1px 2px rgba(0, 0, 0, 0.06));
    }
</style>
