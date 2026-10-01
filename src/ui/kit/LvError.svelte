<script lang="ts">
    /** 错误态卡（Kit）：内联错误信息 + 可选重试按钮，永不白屏（AJ11 配套） */
    let { message = "", onretry, retryLabel = "" }: {
        message: string;
        onretry?: () => void;
        retryLabel?: string;
    } = $props();
</script>

<div class="lv-card2 lv-error2" role="alert">
    <div class="lv-error2-msg">{message}</div>
    {#if onretry}
        <button class="b3-button b3-button--outline" onclick={onretry}>{retryLabel}</button>
    {/if}
</div>

<style>
    .lv-error2 {
        border-color: var(--lv-danger-border);
        background: var(--lv-danger-soft);
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
        flex-wrap: wrap;
    }
    .lv-error2-msg {
        color: var(--b3-theme-error);
        font-size: 13px;
        word-break: break-all;
        flex: 1;
        min-width: 200px;
    }
</style>
