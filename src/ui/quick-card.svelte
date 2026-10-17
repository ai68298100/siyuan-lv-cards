<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";
    import { serializeQaCard, validateQaDraft } from "@/core/flashcard-quality";
    import LvKbd from "./kit/LvKbd.svelte";

    let { i18n, onCreate, onClose, embedded = false }: {
        i18n: any;
        /** markdown（问题 + ==答案== 挖空式单块）与目标卡组 */
        onCreate: (markdown: string, deckID: string, deckName: string, q?: string, a?: string, docID?: string) => Promise<{ docID: string; blockID: string } | void>;
        onClose: () => void;
        embedded?: boolean;
    } = $props();
    const t = $derived(i18n);

    let q = $state("");
    let a = $state("");
    let decks: RiffDeck[] = $state([]);
    let selected = $state("");
    let newName = $state("");
    let busy = $state(false);
    let deckLoadBusy = $state(false);
    let deckLoadError = $state("");
    let errorMsg = $state("");
    let template = $state<"qa" | "cloze">("qa");
    let isBidirectional = $state(false);
    let previewAnswer = $state(false);
    let createdNotice = $state("");
    let editorRoot: HTMLDivElement;
    let disposed = false;
    onDestroy(() => { disposed = true; });

    const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");

    const canCreateDeck = $derived(decks.some(d => d.id === selected) || !!newName.trim());
    const clozeParts = $derived(q.split("____"));
    const hasClozeMarker = $derived(clozeParts.length > 1);
    const draftIssues = $derived(validateQaDraft(q, a));
    const canSubmit = $derived(!busy && draftIssues.length === 0 && canCreateDeck && (template !== "cloze" || hasClozeMarker));

    function setTemplate(value: "qa" | "cloze") {
        template = value;
        previewAnswer = false;
    }

    async function loadDecks() {
        if (deckLoadBusy) return;
        deckLoadBusy = true;
        deckLoadError = "";
        try {
            const loadedDecks = await getRiffDecks();
            if (disposed) return;
            decks = [...loadedDecks, ...decks.filter(deck => !loadedDecks.some(loaded => loaded.id === deck.id))];
            if (decks.length > 0 && !decks.some(d => d.id === selected)) {
                selected = decks[0].id;
            }
        } catch (e: any) {
            if (disposed) return;
            deckLoadError = e?.message ?? String(e);
        } finally {
            if (!disposed) deckLoadBusy = false;
        }
    }

    onMount(() => { void loadDecks(); });

    async function confirm() {
        if (!canSubmit) {
            return;
        }
        busy = true;
        errorMsg = "";
        createdNotice = "";
        try {
            let deckID = selected;
            let deckName = decks.find(d => d.id === deckID)?.name ?? "";
            if (newName.trim()) {
                const deck = await createRiffDeck(newName.trim());
                deckID = deck.id;
                deckName = deck.name;
                decks = [...decks, deck];
                selected = deckID;
                newName = "";
            }
            if (!deckID || (!newName.trim() && !decks.some(d => d.id === deckID))) {
                errorMsg = t.quickCardNeedDeck;
                return;
            }
            const question = q.trim();
            const answer = a.trim();
            if (template === "qa" && isBidirectional) {
                // 双向卡片：互为问答生成两张卡片（A -> B 与 B -> A）
                // 生产回调返回首面落点后，第二面复用同一文档；旧宿主/组件测试
                // 返回 void 时仍保持兼容，但生产路径不会再次 createDocWithMd。
                const first = await onCreate(serializeQaCard(question, answer), deckID, deckName, question, answer);
                if (first && first.docID) {
                    await onCreate(serializeQaCard(answer, question), deckID, deckName, answer, question, first.docID);
                } else {
                    await onCreate(serializeQaCard(answer, question), deckID, deckName, answer, question);
                }
                if (disposed) return;
                if (embedded) {
                    q = "";
                    a = "";
                    isBidirectional = false;
                    previewAnswer = false;
                    createdNotice = t.quickCardBidiDone ?? "双向卡片已生成（2 张）并加入卡组";
                } else {
                    onClose();
                }
            } else {
                const markdown = template === "cloze"
                    ? question.split("____").join(`==${answer}==`)
                    : serializeQaCard(question, answer);
                await onCreate(markdown, deckID, deckName, question, answer);
                if (disposed) return;
                if (embedded) {
                    q = "";
                    a = "";
                    previewAnswer = false;
                    createdNotice = t.quickCardDone;
                } else {
                    onClose();
                }
            }
        } catch (e: any) {
            if (disposed) return;
            errorMsg = e?.message ?? String(e);
        } finally {
            if (!disposed) busy = false;
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.repeat && !e.defaultPrevented && canSubmit
            && e.target instanceof Node && editorRoot?.contains(e.target) && !editorRoot.closest("[hidden], [inert]")) {
            e.preventDefault();
            confirm();
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="lv-quickcard b3-typography" bind:this={editorRoot}>
    <div class="lv-qc-toolbar">
        <div class="lv-qc-template" role="group" aria-label={t.quickCardTemplateLabel}>
            <button type="button" class:lv-qc-template-active={template === "qa"} aria-pressed={template === "qa"} disabled={busy} onclick={() => setTemplate("qa")}>
                <strong>💬 {t.quickCardTemplateQA}</strong><span>{t.quickCardTemplateQADesc}</span>
            </button>
            <button type="button" class:lv-qc-template-active={template === "cloze"} aria-pressed={template === "cloze"} disabled={busy} onclick={() => setTemplate("cloze")}>
                <strong>✏️ {t.quickCardTemplateCloze}</strong><span>{t.quickCardTemplateClozeDesc}</span>
            </button>
        </div>
        <div class="lv-qc-field lv-qc-deck">
            <div class="lv-qc-label">{t.deckPickerTitle}</div>
            <select class="b3-select fn__block" aria-label={t.deckPickerTitle} bind:value={selected} disabled={busy || decks.length === 0}>
                {#each decks as d (d.id)}
                    <option value={d.id}>{d.name}</option>
                {/each}
            </select>
            <input class="b3-text-field fn__block lv-qc-new" aria-label={t.deckNewName} placeholder={t.deckNewName} bind:value={newName} disabled={busy} />
            {#if deckLoadBusy}
                <div class="ft__smaller ft__on-surface" role="status" aria-busy="true">{t.quickCardDeckLoading ?? "正在读取卡组…"}</div>
            {:else if deckLoadError}
                <div class="lv-qc-deck-error" role="alert">
                    <span>{(t.quickCardDeckLoadFail ?? "读取卡组失败：${error}").replace("${error}", deckLoadError)}</span>
                    <button type="button" class="b3-button b3-button--small" disabled={deckLoadBusy} onclick={() => void loadDecks()}>{t.quickCardDeckRetry ?? "重试"}</button>
                </div>
            {/if}
            {#if decks.length === 0}
                <div class="ft__smaller ft__on-surface lv-qc-deck-hint">{deckLoadError ? (t.quickCardDeckFallback ?? "也可以直接输入新卡组名称继续。") : t.quickCardNeedDeck}</div>
            {/if}
        </div>
    </div>
    <div class="lv-qc-content">
        <section class="lv-qc-editor" aria-label={t.quickCardEditorLabel}>
            <label class="lv-qc-field">
                <div class="lv-qc-label">{t.quickCardQ}</div>
                <textarea class="b3-text-field fn__block" aria-label={t.quickCardQ} rows="4" bind:value={q} placeholder={template === "cloze" ? t.quickCardClozeHint : t.quickCardQ} disabled={busy}></textarea>
                {#if template === "cloze"}<div class="ft__smaller ft__on-surface lv-qc-help">{t.quickCardClozeHint}</div>{/if}
            </label>
            <label class="lv-qc-field">
                <div class="lv-qc-label">{t.quickCardA}</div>
                <textarea class="b3-text-field fn__block" aria-label={t.quickCardA} rows="4" bind:value={a} placeholder={t.quickCardA} disabled={busy}></textarea>
            </label>
            {#if template === "qa"}
                <label class="lv-qc-bidi-toggle">
                    <input type="checkbox" class="lv-check" bind:checked={isBidirectional} disabled={busy} />
                    <span>{t.quickCardBidiLabel ?? "生成双向卡片（互为问答 A ↔ B）"}</span>
                </label>
            {/if}
            <p class="lv-qc-guidance">{t.quickCardOneFactHint}</p>
        </section>
        <section class="lv-qc-preview" aria-label={t.quickCardPreviewTitle}>
            <div class="lv-qc-preview-heading">
                <div class="lv-qc-preview-tags">
                    <span>{t.quickCardPreviewTitle}</span>
                    <span class="lv-chip2 lv-chip2--default">
                        {#if template === "qa" && isBidirectional}⇄ {t.cardTypeBadgeBidi ?? "双向"}
                        {:else if template === "cloze"}✏️ {t.cardTypeBadgeCloze ?? "挖空"}
                        {:else}💬 {t.cardTypeBadgeQA ?? "问答"}
                        {/if}
                    </span>
                </div>
                <span>{t.quickCardPreviewNote}</span>
            </div>
            <div class="lv-qc-preview-face lv-unified-face" id="lv-qc-preview-face">
                <span class="lv-qc-preview-label">{t.quickCardPreviewFront}</span>
                {#if q.trim()}
                    {#if template === "cloze" && hasClozeMarker}
                        <p>{#each clozeParts as part, i (i)}{part}{#if i < clozeParts.length - 1}<span class="lv-qc-mask">{t.quickCardHiddenAnswer}</span>{/if}{/each}</p>
                    {:else}
                        <p>{q}{#if template === "qa" && a.trim()}<span class="lv-qc-mask">{t.quickCardHiddenAnswer}</span>{/if}</p>
                    {/if}
                {:else}
                    <p class="lv-qc-placeholder">{t.quickCardPreviewEmpty}</p>
                {/if}
                {#if previewAnswer}
                    <div class="lv-qc-preview-answer">
                        <span class="lv-qc-preview-label">{t.quickCardPreviewBack}</span>
                        {#if template === "cloze" && hasClozeMarker && a.trim()}
                            <p>{q.split("____").join(a)}</p>
                        {:else if a.trim()}
                            <p>{a}</p>
                        {:else}
                            <p class="lv-qc-placeholder">{t.quickCardPreviewEmpty}</p>
                        {/if}
                    </div>
                {/if}
            </div>
            <button type="button" class="b3-button b3-button--outline lv-qc-reveal" aria-expanded={previewAnswer} aria-controls="lv-qc-preview-face" onclick={() => (previewAnswer = !previewAnswer)}>
                {previewAnswer ? t.quickCardHideAnswer : t.quickCardShowAnswer}
            </button>
        </section>
    </div>
    {#if createdNotice}<div class="lv-qc-success" role="status">{createdNotice}</div>{/if}
    {#if errorMsg}
        <div class="ft__smaller lv-qc-error" role="alert">{errorMsg}</div>
    {/if}
    <div class="b3-dialog__action lv-qc-actions">
        {#if !embedded}<button class="b3-button b3-button--cancel" disabled={busy} onclick={onClose}>{window.siyuan.languages.cancel}</button>{/if}
        <button class="b3-button lv-btn-primary" disabled={!canSubmit} onclick={confirm}>
            {t.quickCardCreate} <LvKbd k={isMac ? "⌘ ↵" : "Ctrl ↵"} />
        </button>
    </div>
</div>

<style>
    .lv-quickcard {
        padding: var(--lv-sp-4);
        container: lv-quickcard / inline-size;
    }
    .lv-qc-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: var(--lv-sp-4); }
    .lv-qc-template { display: flex; flex: 0 0 auto; gap: calc(var(--lv-space-unit) * 3); }
    .lv-qc-template button {
        display: flex; min-width: 132px; min-height: 68px; flex: 1 1 132px; align-items: flex-start; justify-content: center; flex-direction: column; gap: 3px;
        padding: calc(var(--lv-space-unit) * 4 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 6 + var(--lv-space-hairline)); border: 1px solid var(--lv-border); border-radius: var(--lv-r-control);
        background: var(--lv-color-surface); color: var(--lv-color-text-muted); text-align: left; cursor: pointer;
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
        transition: transform var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);
    }
    .lv-qc-template button:hover:not(:disabled) {
        border-color: var(--lv-border-strong);
        transform: translateY(-1px);
        box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
    }
    .lv-qc-template button span { color: var(--lv-color-text-muted); font-size: 11px; font-weight: var(--lv-fw-normal); line-height: 1.4; }
    .lv-qc-template button:focus-visible,
    .lv-qc-reveal:focus-visible,
    .lv-qc-toolbar :global(input:focus-visible),
    .lv-qc-toolbar :global(select:focus-visible),
    .lv-qc-editor :global(textarea:focus-visible) { outline: 2px solid var(--lv-color-brand); outline-offset: 2px; }
    .lv-qc-template button:disabled { cursor: not-allowed; opacity: .55; }
    .lv-qc-template button.lv-qc-template-active {
        border-color: var(--lv-color-brand);
        color: var(--lv-color-brand);
        background: var(--lv-primary-soft);
        box-shadow: 0 0 0 1px var(--lv-color-brand), var(--lv-shadow-card);
    }
    .lv-qc-content { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--lv-sp-4); align-items: start; }
    .lv-qc-editor { min-width: 0; }
    .lv-qc-deck { flex: 1 1 300px; max-width: 480px; margin: 0; }
    /* R53：表单控件撑满面板宽度（宿主 .b3-text-field 默认定宽） */
    .lv-quickcard :global(.b3-text-field),
    .lv-quickcard :global(.b3-select) {
        width: 100%;
    }
    .lv-quickcard .lv-qc-field { margin-bottom: var(--lv-sp-3); }
    .lv-qc-bidi-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--lv-sp-2);
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
        cursor: pointer;
        margin-bottom: var(--lv-sp-2);
        user-select: none;
        &:hover { color: var(--lv-color-text); }
    }
    .lv-quickcard .lv-qc-label {
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-semibold);
        color: var(--lv-color-text-muted);
        margin-bottom: var(--lv-sp-1);
    }
    .lv-quickcard .lv-qc-new { margin-top: var(--lv-sp-2); }
    .lv-quickcard .lv-qc-deck-hint { margin-top: var(--lv-sp-1); }
    .lv-qc-deck-error { display: flex; align-items: center; gap: var(--lv-sp-2); margin-top: var(--lv-sp-1); color: var(--lv-color-danger); font-size: 12px; overflow-wrap: anywhere; }
    .lv-quickcard .lv-qc-help { margin-top: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)); }
    .lv-qc-guidance { margin: 0; color: var(--lv-color-text-muted); font-size: var(--lv-type-control-size); line-height: 1.65; }
    .lv-qc-preview { display: flex; min-width: 0; flex-direction: column; gap: var(--lv-sp-3); margin: 0; }
    .lv-qc-preview-heading { display: flex; justify-content: space-between; align-items: center; gap: calc(var(--lv-space-unit) * 5); font-size: 13px; font-weight: var(--lv-fw-semibold); }
    .lv-qc-preview-tags { display: inline-flex; align-items: center; gap: var(--lv-sp-2); }
    .lv-qc-preview-heading span + span { color: var(--lv-color-text-muted); font-size: 11px; font-weight: var(--lv-fw-normal); }
    .lv-qc-preview-face {
        min-width: 0;
        min-height: 258px;
        padding: calc(var(--lv-space-unit) * 12);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-dialog);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-review-card), var(--lv-inset-shine);
        display: flex;
        flex-direction: column;
        justify-content: center;
        transition: box-shadow var(--lv-dur-2) var(--lv-ease), border-color var(--lv-dur-2) var(--lv-ease);
    }
    .lv-qc-preview-label { color: var(--lv-color-text-muted); font-size: 10px; }
    .lv-qc-preview-face p { margin: calc(var(--lv-space-unit) * 8) 0 0; font-size: 18px; line-height: var(--lv-lh-loose); white-space: pre-wrap; overflow-wrap: anywhere; }
    .lv-qc-preview-answer { margin-top: calc(var(--lv-space-unit) * 9); padding-top: 16px; border-top: 1px solid var(--lv-border); }
    .lv-qc-preview-answer p { margin-top: calc(var(--lv-space-unit) * 4); }
    .lv-qc-mask {
        display: inline-block;
        margin-left: 4px;
        padding: var(--lv-space-hairline) calc(var(--lv-space-unit) * 3);
        border-radius: var(--lv-r-tag);
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
        font-size: var(--lv-type-meta-size);
        font-weight: var(--lv-fw-emphasis);
        border: 1px dashed var(--lv-primary-border);
    }
    .lv-qc-placeholder { color: var(--lv-color-text-muted); opacity: .65; }
    .lv-qc-reveal { align-self: flex-start; min-height: 44px; }
    .lv-qc-success { margin: var(--lv-sp-2) 0; color: var(--lv-color-success); font-size: var(--lv-type-control-size); }
    @container lv-quickcard (min-width: 781px) {
        .lv-qc-content { grid-template-columns: minmax(0, 1fr) minmax(300px, .88fr); gap: 20px; }
        .lv-qc-preview { position: sticky; top: var(--lv-sp-4); }
    }
    @container lv-quickcard (max-width: 780px) {
        .lv-qc-toolbar { flex-direction: column; }
        .lv-qc-deck { width: 100%; max-width: none; }
        .lv-qc-preview-face { min-height: 220px; }
    }
    @container lv-quickcard (max-width: 480px) {
        .lv-qc-preview-heading { flex-direction: column; gap: 3px; }
        .lv-qc-preview-face { padding: calc(var(--lv-space-unit) * 10); }
    }
    .lv-quickcard .lv-qc-error {
        color: var(--lv-color-danger);
        margin-bottom: var(--lv-sp-2);
    }
    .lv-quickcard .lv-qc-actions {
        justify-content: flex-end;
        gap: var(--lv-sp-2);
    }
    .lv-quickcard .lv-qc-actions :global(.lv-kbd2) {
        margin-left: calc(var(--lv-space-unit) * 3);
        /* 宿主 b3-typography kbd 是白底——主按钮内回到透明 + on-primary 描边 */
        background: transparent;
        color: var(--lv-color-on-brand);
        border-color: color-mix(in srgb, var(--lv-color-on-brand) 40%, transparent);
        opacity: 0.9;
    }
    .lv-quickcard .b3-dialog__action { justify-content: flex-end; }
</style>
