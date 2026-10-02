<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";
    import LvSection from "./kit/LvSection.svelte";
    import LvRow from "./kit/LvRow.svelte";
    import LvChip from "./kit/LvChip.svelte";

    let { i18n, initialSource = "", loadCurrentDoc, loadNotebookMaterial, generate, onCreate, onClose }: {
        i18n: any;
        /** 预填材料（leech 改写联动） */
        initialSource?: string;
        /** 调用方实现：构造 prompt → 调 AI → 解析卡片（含批次记录） */
        generate: (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }) => Promise<{ q: string; a: string }[]>;
        onCreate: (cards: { q: string; a: string }[], deckID: string, deckName: string) => Promise<void>;
        onClose: () => void;
        /** 载入当前打开文档（M2·FR6 输入源扩展；不可用时返回 null） */
        loadCurrentDoc?: () => Promise<{ name: string; content: string } | null>;
        /** 载入笔记本范围材料（M2·FR6 扩展） */
        loadNotebookMaterial?: (nbId: string) => Promise<string>;
    } = $props();
    const t = $derived(i18n);

    let step = $state(1);
    let source = $state(initialSource);
    let count = $state(10);
    let language = $state("中文");
    let cardType = $state<"qa" | "cloze">("qa");
    let decks: RiffDeck[] = $state([]);
    let selected = $state("");
    let newName = $state("");

    let candidates: { q: string; a: string; keep: boolean }[] = $state([]);
    let busy = $state(false);
    let creating = $state(false);
    let errorMsg = $state("");

    let loadDocBusy = $state(false);

    // 笔记本范围源（M2·FR6 扩展）
    let nbOptions = $state<{ id: string; name: string }[]>([]);
    let nbId = $state("");

    async function loadNotebookContent() {
        if (loadDocBusy || !loadNotebookMaterial || !nbId) {
            errorMsg = t.aiWizard.noNotebook;
            return;
        }
        loadDocBusy = true;
        try {
            const material = await loadNotebookMaterial(nbId);
            if (material) {
                source = source ? `${source}\n\n${material}` : material;
                errorMsg = "";
            } else {
                errorMsg = t.aiWizard.noDoc;
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            loadDocBusy = false;
        }
    }

    async function loadActiveDoc() {
        if (loadDocBusy || !loadCurrentDoc) {
            return;
        }
        loadDocBusy = true;
        try {
            const doc = await loadCurrentDoc();
            if (doc?.content) {
                source = source ? `${source}\n\n${doc.content}` : doc.content;
            } else {
                errorMsg = t.aiWizard.noDoc;
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            loadDocBusy = false;
        }
    }

    /** 载入选中文字（防御式：选区在思源主文档同 window，通常可取到；🧪 真机确认） */
    function loadSelection() {
        try {
            const sel = window.getSelection()?.toString().trim();
            if (sel) {
                source = source ? `${source}\n\n${sel}` : sel;
                errorMsg = "";
            } else {
                errorMsg = t.aiWizard.noSelection;
            }
        } catch {
            errorMsg = t.aiWizard.noSelection;
        }
    }

    /** 剪贴板导入（298）：粘贴字幕/讲义直通向导（权限拒绝时降级提示） */
    async function loadClipboard() {
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (text) {
                source = source ? `${source}\n\n${text}` : text;
                errorMsg = "";
            } else {
                errorMsg = t.aiWizard.noClipboard;
            }
        } catch {
            errorMsg = t.aiWizard.noClipboardPerm;
        }
    }

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

    async function run() {
        if (!source.trim() || busy) {
            return;
        }
        busy = true;
        errorMsg = "";
        try {
            const cards = await generate(source.trim(), { count, language, type: cardType });
            if (cards.length === 0) {
                throw new Error(t.aiWizard.emptyResult);
            }
            candidates = cards.map(c => ({ ...c, keep: true }));
            step = 2;
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            busy = false;
        }
    }

    async function importCards() {
        const picked = candidates.filter(c => c.keep);
        if (picked.length === 0 || creating) {
            return;
        }
        creating = true;
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
            await onCreate(picked.map(c => ({ q: c.q, a: c.a })), deckID, deckName);
            onClose();
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            creating = false;
        }
    }
</script>

<div class="lv-aiwiz b3-typography">
    <div class="lv-ob-head">
        <span class="lv-ob-step">{t.aiWizard.step} {step} / 2 · {step === 1 ? t.aiWizard.stepCfg : t.aiWizard.stepPreview}</span>
        <div class="fn__flex-1"></div>
        <button class="b3-button b3-button--small" onclick={onClose}>✕</button>
    </div>

    {#if step === 1}
        <div transition:fade={{ duration: 160 }}>
            <LvSection title={t.aiWizard.source}>
                <div style="margin-bottom: var(--lv-sp-2); display: flex; gap: var(--lv-sp-2); flex-wrap: wrap">
                    {#if loadCurrentDoc}
                        <button class="b3-button b3-button--small" onclick={loadActiveDoc}>{t.aiWizard.loadDoc}</button>
                    {/if}
                    {#if loadNotebookMaterial}
                        <button class="b3-button b3-button--small" onclick={loadNotebookContent}>{t.aiWizard.loadNotebook}</button>
                        <select class="b3-select" bind:value={nbId} style="max-width: 160px">
                            {#each nbOptions as n (n.id)}<option value={n.id}>{n.name}</option>{/each}
                        </select>
                    {/if}
                    <button class="b3-button b3-button--small" onclick={loadSelection}>{t.aiWizard.loadSelection}</button>
                    <button class="b3-button b3-button--small" onclick={loadClipboard}>{t.aiWizard.loadClipboard}</button>
                </div>
                {#if source}
                    <div class="ft__smaller ft__on-surface" style="margin-top: 4px">≈ {Math.ceil(source.length / 4)} tokens</div>
                {/if}
            </LvSection>
            <LvSection title={t.aiWizard.config}>
                <LvRow label={t.aiWizard.count}>
                    <select class="b3-select fn__size-60" bind:value={count}>
                        {#each [5, 10, 15, 20] as n (n)}<option value={n}>{n}</option>{/each}
                    </select>
                </LvRow>
                <LvRow label={t.aiWizard.language}>
                    <select class="b3-select fn__size-200" bind:value={language}>
                        <option value="中文">中文</option>
                        <option value="English">English</option>
                    </select>
                </LvRow>
                <LvRow label={t.aiWizard.cardType}>
                    <select class="b3-select fn__size-200" bind:value={cardType}>
                        <option value="qa">{t.aiWizard.typeQa}</option>
                        <option value="cloze">{t.aiWizard.typeCloze}</option>
                    </select>
                </LvRow>
            </LvSection>
            {#if errorMsg}
                <div class="ft__smaller" style="color: var(--b3-theme-error); margin-bottom: var(--lv-sp-2)">{errorMsg}</div>
            {/if}
            <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2)">
                <button class="b3-button b3-button--cancel" onclick={onClose}>{window.siyuan.languages.cancel}</button>
                <div class="fn__space"></div>
                <button class="b3-button b3-button--text lv-btn-primary" disabled={busy || !source.trim()} onclick={run}>
                    {busy ? t.aiWizard.generating : `${t.aiWizard.generate} →`}
                </button>
            </div>
        </div>
    {:else}
        <div transition:fade={{ duration: 160 }}>
            <div class="fn__flex" style="align-items: center; gap: var(--lv-sp-2); margin-bottom: var(--lv-sp-2)">
                <button class="b3-button b3-button--small" onclick={() => (step = 1)}>← {t.aiWizard.back}</button>
                <LvChip tone="primary">{candidates.filter(c => c.keep).length} / {candidates.length}</LvChip>
            </div>
            <div class="lv-aiwiz-list">
                {#each candidates as c, i (i)}
                    <div class="lv-card2 lv-aiwiz-card">
                        <label class="fn__flex" style="gap: var(--lv-sp-2); align-items: center">
                            <input type="checkbox" bind:checked={c.keep} />
                            <b class="ft__smaller">#{i + 1}</b>
                            <div class="fn__flex-1"></div>
                            <button class="b3-button b3-button--small" onclick={() => (candidates = candidates.filter((_, j) => j !== i))}>✕</button>
                        </label>
                        <textarea class="b3-text-field fn__block" rows="2" bind:value={c.q} placeholder={t.quickCardQ}></textarea>
                        <textarea class="b3-text-field fn__block" rows="2" bind:value={c.a} placeholder={t.quickCardA}></textarea>
                    </div>
                {/each}
            </div>
            {#if errorMsg}
                <div class="ft__smaller" style="color: var(--b3-theme-error); margin-bottom: var(--lv-sp-2)">{errorMsg}</div>
            {/if}
            <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-2)">
                <button class="b3-button b3-button--outline" onclick={() => (step = 1)}>{t.aiWizard.back}</button>
                <input class="b3-text-field" style="width: 180px" placeholder={t.deckNewName} bind:value={newName} />
                <select class="b3-select" style="max-width: 180px" bind:value={selected} disabled={decks.length === 0}>
                    {#each decks as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
                </select>
                <button class="b3-button b3-button--text lv-btn-primary" disabled={creating || candidates.filter(c => c.keep).length === 0} onclick={importCards}>
                    {creating ? "…" : `${t.aiWizard.import} (${candidates.filter(c => c.keep).length})`}
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .lv-aiwiz {
        padding: var(--lv-sp-4);
        max-width: 680px;
        margin: 0 auto;
        height: 100%;
        overflow: auto;
        box-sizing: border-box;
    }
    .lv-aiwiz .lv-ob-head {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-aiwiz .lv-ob-step {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        font-variant-numeric: tabular-nums;
    }
    .lv-aiwiz-list {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
        max-height: 46vh;
        overflow: auto;
        margin-bottom: var(--lv-sp-2);
    }
    .lv-aiwiz-card {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
    }
</style>
