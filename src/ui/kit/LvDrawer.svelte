<script lang="ts">
    import type { Snippet } from "svelte";
    import { fade } from "svelte/transition";
    import { trapFocus, type FocusTrap } from "@/libs/focus-trap";

    /** 抽屉（Kit）：右侧滑出面板，焦点限制在面板内，遮罩点击关闭 */
    let { open = false, title = "", width = "min(480px, 92vw)", closeLabel = "close", children, actions, onclose }: {
        open: boolean;
        title?: string;
        width?: string;
        /** 关闭按钮的可访问名称，由宿主按当前语言传入。 */
        closeLabel?: string;
        children?: Snippet;
        /** 头部操作区（关闭按钮左侧） */
        actions?: Snippet;
        onclose: () => void;
    } = $props();

    let drawerEl = $state<HTMLElement | null>(null);

    // 抽屉打开后把焦点移入并限制 Tab 循环；销毁时由 focus-trap 归还原焦点。
    $effect(() => {
        if (!open || !drawerEl) return;
        const trap: FocusTrap = trapFocus(drawerEl, { onEscape: onclose });
        return () => trap.release();
    });
</script>

{#if open}
    <div class="lv-drawer-mask" transition:fade={{ duration: 120 }} onclick={onclose} role="presentation"></div>
    <!-- AS-1：焦点由 focus-trap 限制在模态抽屉内，标题通过 labelledby 关联。 -->
    <div
        class="lv-drawer b3-typography"
        style={`width:${width}`}
        transition:fade={{ duration: 150 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "lv-drawer-title" : undefined}
        aria-label={title ? undefined : "Drawer"}
        tabindex="-1"
        bind:this={drawerEl}
    >
        <div class="lv-drawer-head">
            <span id="lv-drawer-title" class="lv-drawer-title">{title}</span>
            <span class="lv-drawer-actions">
                {#if actions}{@render actions()}{/if}
                <button class="b3-button b3-button--small" onclick={onclose} aria-label={closeLabel}>✕</button>
            </span>
        </div>
        <div class="lv-drawer-body">
            {@render children?.()}
        </div>
    </div>
{/if}

<style>
    .lv-drawer-mask {
        position: fixed;
        inset: 0;
        background: color-mix(in srgb, black 32%, transparent);
        z-index: var(--lv-z-drawer, 300);
    }
    .lv-drawer {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: calc(var(--lv-z-drawer, 300) + 1);
        display: flex;
        flex-direction: column;
        background: var(--b3-theme-surface);
        border-left: 1px solid var(--lv-border, rgba(128, 128, 128, 0.15));
        box-shadow: var(--lv-shadow-2, 0 2px 6px rgba(0, 0, 0, 0.08));
    }
    .lv-drawer-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2, 8px);
        padding: var(--lv-sp-3, 12px) var(--lv-sp-4, 16px);
        border-bottom: 1px solid var(--lv-border, rgba(128, 128, 128, 0.15));
    }
    .lv-drawer-title { font-weight: 700; }
    .lv-drawer-actions { display: inline-flex; align-items: center; gap: var(--lv-sp-2, 8px); }
    .lv-drawer-body {
        flex: 1;
        overflow: auto;
        padding: var(--lv-sp-4, 16px);
    }
</style>
