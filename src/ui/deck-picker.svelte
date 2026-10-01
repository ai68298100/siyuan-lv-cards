<script lang="ts">
    import { onMount } from "svelte";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";

    let { newNamePlaceholder = "", confirmLabel = "OK", decks: initialDecks = null, onConfirm, onClose }: {
        newNamePlaceholder?: string;
        confirmLabel?: string;
        /** 调用方已持有卡组列表时直传，避免重复请求 */
        decks?: RiffDeck[] | null;
        onConfirm: (deckID: string, deckName: string) => void;
        onClose: () => void;
    } = $props();

    let decks: RiffDeck[] = $state(initialDecks ?? []);
    let selected = $state(initialDecks?.[0]?.id ?? "");
    let newName = $state("");
    let busy = $state(false);
    let loading = $state(!initialDecks);
    let errorMsg = $state("");

    onMount(async () => {
        if (initialDecks) {
            return;
        }
        try {
            decks = await getRiffDecks();
            if (decks.length > 0) {
                selected = decks[0].id;
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            loading = false;
        }
    });

    async function confirm() {
        if (busy) {
            return;
        }
        busy = true;
        errorMsg = "";
        try {
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
            onConfirm(deckID, deckName);
            onClose();
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
            {#if decks.length === 0}
                <div class="ft__smaller ft__on-surface">—</div>
            {/if}
        </div>
        <div class="lv-dp-new">
            <input class="b3-text-field fn__block" placeholder={newNamePlaceholder} bind:value={newName} />
        </div>
        {#if errorMsg}
            <div class="ft__smaller" style="color: var(--b3-theme-error)">{errorMsg}</div>
        {/if}
        <div class="b3-dialog__action">
            <button class="b3-button b3-button--cancel" onclick={onClose}>✕</button>
            <div class="fn__space"></div>
            <button class="b3-button b3-button--text lv-btn-primary" disabled={busy} onclick={confirm}>{confirmLabel} ↵</button>
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
