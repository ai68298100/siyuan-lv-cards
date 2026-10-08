<script lang="ts">
    let { text, actionLabel = "", onaction }: {
        text: string;
        actionLabel?: string;
        onaction?: () => void;
    } = $props();
</script>

<div class="lv-card2 lv-empty">
    <div class="lv-empty-icon" aria-hidden="true">✦</div>
    <div class="lv-empty-text">{text}</div>
    {#if actionLabel && onaction}
        <button class="b3-button b3-button--outline" onclick={onaction}>{actionLabel}</button>
    {/if}
</div>

<style>
    .lv-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--lv-sp-2);
        padding: var(--lv-sp-5);
        text-align: center;
        color: var(--b3-theme-on-surface);
    }
    .lv-empty-icon {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--lv-primary-soft);
        color: var(--b3-theme-primary);
        font-size: 18px;
    }
    .lv-empty-text { font-size: 13px; }
</style>
