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
        color: var(--lv-color-text-muted);
    }
    .lv-empty-icon {
        width: 48px;
        height: 48px;
        border-radius: var(--lv-r-circle);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-size: var(--lv-type-section-size);
        box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-color-brand) 16%, transparent);
        border: 1px solid var(--lv-primary-border);
    }
    .lv-empty-text { font-size: var(--lv-type-body-size); }
</style>
