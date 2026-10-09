<script lang="ts">
    import { onMount } from "svelte";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";

    let { newNamePlaceholder = "", firstDeckNamePlaceholder = newNamePlaceholder, emptyDeckText = "", retryLabel = "Retry", confirmLabel = "OK", decks: initialDecks = null, onBeforeConfirm = () => undefined, onConfirm, onClose }: {
        newNamePlaceholder?: string;
        firstDeckNamePlaceholder?: string;
        emptyDeckText?: string;
        retryLabel?: string;
        confirmLabel?: string;
        /** 调用方已持有卡组列表时直传，避免重复请求 */
        decks?: RiffDeck[] | null;
        /** AR-2：支持 Promise——成功后才关闭，失败保留选择与输入 */
        onBeforeConfirm?: () => void | boolean | Promise<void | boolean>;
        onConfirm: (deckID: string, deckName: string) => void | boolean | Promise<void | boolean>;
        onClose: () => void;
    } = $props();

    // 初值语义：调用方可直传卡组列表避免重复请求，挂载后不更新
    // svelte-ignore state_referenced_locally
    let decks: RiffDeck[] = $state(initialDecks ?? []);
    // svelte-ignore state_referenced_locally
    let selected = $state(initialDecks?.[0]?.id ?? "");
    let newName = $state("");
    let busy = $state(false);
    // svelte-ignore state_referenced_locally
    let loading = $state(!initialDecks);
    let errorMsg = $state("");
    let loadError = $state("");

    async function loadDecks() {
        loading = true;
        loadError = "";
        try {
            decks = await getRiffDecks();
            selected = decks[0]?.id ?? "";
        } catch (e: any) {
            loadError = e?.message ?? String(e);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        if (initialDecks) {
            return;
        }
        void loadDecks();
    });

    async function confirm() {
        if (busy) {
            return;
        }
        busy = true;
        errorMsg = "";
        try {
            const proceed = await onBeforeConfirm?.();
            if (proceed === false) {
                return;
            }
            let deckID = selected;
            let deckName = decks.find(d => d.id === deckID)?.name ?? "";
            if (newName.trim()) {
                const deck = await createRiffDeck(newName.trim());
                deckID = deck.id;
                deckName = deck.name;
            }
            if (!deckID) {
                return;
            }
            // AR-2：等写入成功才关闭；失败/取消保留编辑内容与选择
            const result = await onConfirm(deckID, deckName);
            if (result !== false) {
                onClose();
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            busy = false;
        }
    }
</script>

<div class="lv-deckpicker b3-typography">
    {#if loading}
        <div class="ft__on-surface">…</div>
    {:else}
        <div class="lv-dp-list" role="radiogroup">
            {#each decks as d (d.id)}
                <label class="fn__flex lv-dp-row">
                    <input type="radio" name="lv-deck" value={d.id} bind:group={selected} />
                    <span class="fn__flex-1">{d.name}</span>
                    <span class="ft__smaller ft__on-surface">{d.size}</span>
                </label>
            {/each}
            {#if loadError}
                <div class="ft__smaller" style="color: var(--b3-theme-error)" role="alert">{loadError}</div>
                <button class="b3-button b3-button--small" disabled={loading || busy} onclick={loadDecks}>{retryLabel}</button>
            {:else if decks.length === 0}
                <div class="ft__smaller ft__on-surface">{emptyDeckText}</div>
            {/if}
        </div>
        <div class="lv-dp-new">
            <input class="b3-text-field fn__block" placeholder={decks.length === 0 ? firstDeckNamePlaceholder : newNamePlaceholder} bind:value={newName} />
        </div>
        {#if errorMsg}
            <div class="ft__smaller" style="color: var(--b3-theme-error)" role="alert">{errorMsg}</div>
        {/if}
        <div class="b3-dialog__action">
            <button class="b3-button b3-button--cancel" aria-label={window.siyuan.languages.cancel} disabled={busy} onclick={onClose}>✕</button>
            <div class="fn__space"></div>
            <button class="b3-button b3-button--text lv-btn-primary" disabled={busy || !!loadError || (!selected && !newName.trim())} onclick={confirm}>{confirmLabel} ↵</button>
        </div>
    {/if}
</div>

<style>
    .lv-deckpicker .lv-dp-list {
        max-height: 200px;
        overflow: auto;
        margin-bottom: var(--lv-sp-3);
    }
    .lv-deckpicker .lv-dp-row {
        gap: var(--lv-sp-2);
        align-items: center;
        padding: var(--lv-sp-2);
        border-radius: var(--lv-r-s);
        cursor: pointer;
    }
    .lv-deckpicker .lv-dp-row:hover { background: var(--lv-primary-softer); }
    .lv-deckpicker .lv-dp-new { margin-bottom: var(--lv-sp-2); }
    .lv-deckpicker .b3-dialog__action { justify-content: flex-end; }
</style>
