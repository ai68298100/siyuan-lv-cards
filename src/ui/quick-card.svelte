<script lang="ts">
    import { onMount } from "svelte";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";

    let { i18n, onCreate, onClose }: {
        i18n: any;
        /** markdown（问题 + ==答案== 挖空式单块）与目标卡组 */
        onCreate: (markdown: string, deckID: string, deckName: string) => Promise<void>;
        onClose: () => void;
    } = $props();
    const t = $derived(i18n);

    let q = $state("");
    let a = $state("");
    let decks: RiffDeck[] = $state([]);
    let selected = $state("");
    let newName = $state("");
    let busy = $state(false);
    let errorMsg = $state("");

    onMount(async () => {
        try {
            decks = await getRiffDecks();
            if (decks.length > 0) {
                selected = decks[0].id;
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        }
    });

    async function confirm() {
        if (!q.trim() || !a.trim() || busy) {
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
                errorMsg = t.quickCardNeedDeck;
                return;
            }
            await onCreate(`${q.trim()} ==${a.trim()}==`, deckID, deckName);
            onClose();
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            busy = false;
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            confirm();
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="lv-quickcard b3-typography">
    <label class="lv-qc-field">
        <div class="lv-qc-label">{t.quickCardQ}</div>
        <textarea class="b3-text-field fn__block" rows="3" bind:value={q} placeholder={t.quickCardQ}></textarea>
    </label>
    <label class="lv-qc-field">
        <div class="lv-qc-label">{t.quickCardA}</div>
        <textarea class="b3-text-field fn__block" rows="2" bind:value={a} placeholder={t.quickCardA}></textarea>
    </label>
    <div class="lv-qc-field">
        <div class="lv-qc-label">{t.deckPickerTitle}</div>
        <select class="b3-select fn__block" bind:value={selected} disabled={decks.length === 0}>
            {#each decks as d (d.id)}
                <option value={d.id}>{d.name}</option>
            {/each}
        </select>
        <input class="b3-text-field fn__block lv-qc-new" placeholder={t.deckNewName} bind:value={newName} />
    </div>
    {#if errorMsg}
        <div class="ft__smaller" style="color: var(--b3-theme-error)">{errorMsg}</div>
    {/if}
    <div class="b3-dialog__action">
        <button class="b3-button b3-button--cancel" onclick={onClose}>{window.siyuan.languages.cancel}</button>
        <div class="fn__space"></div>
        <button class="b3-button b3-button--text lv-btn-primary" disabled={busy || !q.trim() || !a.trim()} onclick={confirm}>
            {t.quickCardCreate} <span class="ft__smaller">Ctrl+↵</span>
        </button>
    </div>
</div>

<style>
    .lv-quickcard {
        padding: var(--lv-sp-4);
    }
    .lv-quickcard .lv-qc-field { margin-bottom: var(--lv-sp-3); }
    .lv-quickcard .lv-qc-label {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        margin-bottom: var(--lv-sp-1);
    }
    .lv-quickcard .lv-qc-new { margin-top: var(--lv-sp-2); }
    .lv-quickcard .b3-dialog__action { justify-content: flex-end; }
</style>
