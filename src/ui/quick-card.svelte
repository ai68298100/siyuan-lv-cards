<script lang="ts">
    import { onMount } from "svelte";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";
    import LvKbd from "./kit/LvKbd.svelte";

    let { i18n, onCreate, onClose }: {
        i18n: any;
        /** markdown（问题 + ==答案== 挖空式单块）与目标卡组 */
        onCreate: (markdown: string, deckID: string, deckName: string, q?: string, a?: string) => Promise<void>;
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

    const canCreateDeck = $derived(decks.some(d => d.id === selected) || !!newName.trim());

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
            if (!deckID || (!newName.trim() && !decks.some(d => d.id === deckID))) {
                errorMsg = t.quickCardNeedDeck;
                return;
            }
            await onCreate(`${q.trim()} ==${a.trim()}==`, deckID, deckName, q.trim(), a.trim());
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
        {#if decks.length === 0}
            <div class="ft__smaller ft__on-surface lv-qc-deck-hint">{t.quickCardNeedDeck}</div>
        {/if}
    </div>
    {#if errorMsg}
        <div class="ft__smaller lv-qc-error" role="alert">{errorMsg}</div>
    {/if}
    <div class="b3-dialog__action lv-qc-actions">
        <button class="b3-button b3-button--cancel" onclick={onClose}>{window.siyuan.languages.cancel}</button>
        <button class="b3-button lv-btn-primary" disabled={busy || !q.trim() || !a.trim() || !canCreateDeck} onclick={confirm}>
            {t.quickCardCreate} <LvKbd k="Ctrl ↵" />
        </button>
    </div>
</div>

<style>
    .lv-quickcard {
        padding: var(--lv-sp-4);
    }
    /* R53：表单控件撑满面板宽度（宿主 .b3-text-field 默认定宽） */
    .lv-quickcard :global(.b3-text-field),
    .lv-quickcard :global(.b3-select) {
        width: 100%;
    }
    .lv-quickcard .lv-qc-field { margin-bottom: var(--lv-sp-3); }
    .lv-quickcard .lv-qc-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        margin-bottom: var(--lv-sp-1);
    }
    .lv-quickcard .lv-qc-new { margin-top: var(--lv-sp-2); }
    .lv-quickcard .lv-qc-deck-hint { margin-top: var(--lv-sp-1); }
    .lv-quickcard .lv-qc-error {
        color: var(--b3-theme-error);
        margin-bottom: var(--lv-sp-2);
    }
    .lv-quickcard .lv-qc-actions {
        justify-content: flex-end;
        gap: var(--lv-sp-2);
    }
    .lv-quickcard .lv-qc-actions :global(.lv-kbd2) {
        margin-left: 6px;
        /* 宿主 b3-typography kbd 是白底——主按钮内回到透明 + on-primary 描边 */
        background: transparent;
        color: var(--b3-theme-on-primary);
        border-color: color-mix(in srgb, var(--b3-theme-on-primary) 40%, transparent);
        opacity: 0.9;
    }
    .lv-quickcard .b3-dialog__action { justify-content: flex-end; }
</style>
