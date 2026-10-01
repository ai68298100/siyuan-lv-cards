<script lang="ts">
    import { onMount } from "svelte";
    import { openTab, showMessage } from "siyuan";
    import { getRiffCards, removeRiffCards, resetRiffCards, type SearchBlock } from "@/api/riff";
    import { confirmDialog } from "@/libs/dialog";
    import CardDetail from "./card-detail.svelte";
    import LvPage from "./kit/LvPage.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvChip from "./kit/LvChip.svelte";

    export interface ManagerCtx {
        i18n: any;
        app: any;
        savedFilters: () => { name: string; filter: string }[];
        saveFilter: (name: string, filter: string) => void;
        deleteFilter: (name: string) => void;
    }

    let { ctx }: { ctx: ManagerCtx } = $props();
    const t = $derived(ctx.i18n);

    const PAGE_SIZE = 20;
    let loading = $state(true);
    let page = $state(1);
    let total = $state(0);
    let pageCount = $state(1);
    let blocks: SearchBlock[] = $state([]);
    let errorMsg = $state("");
    let filterText = $state("");
    let sortMode = $state<"default" | "path" | "content">("default");
    let savedList = $state<{ name: string; filter: string }[]>([]);
    let pickedSaved = $state("");
    let selected: string[] = $state([]);
    let detail: SearchBlock | null = $state(null);

    let filteredBlocks = $derived(
        (() => {
            const arr = blocks.filter(b => !filterText || stripHtml(b.content).toLowerCase().includes(filterText.toLowerCase()));
            if (sortMode === "path") {
                return [...arr].sort((a, b) => ((a.hPath as string) ?? "").localeCompare((b.hPath as string) ?? ""));
            }
            if (sortMode === "content") {
                return [...arr].sort((a, b) => stripHtml(a.content).localeCompare(stripHtml(b.content)));
            }
            return arr;
        })()
    );

    function stripHtml(html: string): string {
        const div = document.createElement("div");
        div.innerHTML = html ?? "";
        return (div.textContent ?? "").trim();
    }

    async function load() {
        loading = true;
        errorMsg = "";
        try {
            const cards = await getRiffCards("", page, PAGE_SIZE);
            blocks = cards.blocks ?? [];
            selected = [];
            total = cards.total;
            pageCount = Math.max(1, cards.pageCount);
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            loading = false;
        }
    }

    function goto(p: number) {
        page = Math.min(Math.max(1, p), pageCount);
        load();
    }

    function toggleSelect(id: string) {
        selected = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    }

    function batchRemove() {
        if (selected.length === 0) return;
        confirmDialog({
            title: t.manager.batchRemove,
            content: `<div class="b3-typography">${t.manager.batchConfirm.replace("${n}", String(selected.length))}</div>`,
            confirm: async () => {
                // 🧪 deckID 传空的跨集删除语义待 docs/18 实测
                await removeRiffCards("", selected);
                showMessage(t.manager.batchDone.replace("${n}", String(selected.length)), 2000, "info");
                await load();
            },
        });
    }

    function batchReset() {
        if (selected.length === 0) return;
        confirmDialog({
            title: t.manager.batchReset,
            content: `<div class="b3-typography">${t.manager.batchConfirm.replace("${n}", String(selected.length))}</div>`,
            confirm: async () => {
                // 🧪 type="0" + blockIDs 的块级重置语义待 docs/18 实测
                await resetRiffCards("0", "", "", selected);
                showMessage(t.manager.batchResetDone.replace("${n}", String(selected.length)), 2000, "info");
                await load();
            },
        });
    }

    function onRowClick(e: MouseEvent, b: SearchBlock) {
        const el = e.target as HTMLElement;
        if (el.closest("input,button,a,select")) {
            return;
        }
        detail = b;
    }

    function openDoc(block: SearchBlock) {
        const rootId = (block.rootID as string) || block.id;
        openTab({ app: ctx.app, doc: { id: rootId } });
    }

    onMount(() => {
        savedList = ctx.savedFilters();
        load();
    });

    function saveCurrent() {
        if (!filterText.trim()) {
            return;
        }
        ctx.saveFilter(filterText.trim(), filterText.trim());
        savedList = ctx.savedFilters();
        pickedSaved = filterText.trim();
        showMessage(t.manager.filterSaved, 1500, "info");
    }

    function applySaved() {
        const f = savedList.find(x => x.name === pickedSaved);
        if (f) {
            filterText = f.filter;
        }
    }

    function deleteSaved() {
        if (pickedSaved) {
            ctx.deleteFilter(pickedSaved);
            savedList = ctx.savedFilters();
            pickedSaved = "";
            filterText = "";
        }
    }
</script>

<LvPage title={t.manager.title} subtitle={`${t.manager.total}: ${total}`}>
    {#snippet actions()}
        <input class="b3-text-field lv-filter" type="text" placeholder={t.manager.filterPlaceholder} bind:value={filterText} />
        <button class="b3-button b3-button--small" title={t.manager.saveFilter} disabled={!filterText} onclick={saveCurrent}>★</button>
        {#if savedList.length > 0}
            <select class="b3-select lv-sort" bind:value={pickedSaved} onchange={applySaved}>
                <option value="" disabled>★ {t.manager.savedFilters}</option>
                {#each savedList as f (f.name)}<option value={f.name}>{f.name}</option>{/each}
            </select>
            {#if pickedSaved}
                <button class="b3-button b3-button--small" title={t.manager.deleteSaved} onclick={deleteSaved}>🗑</button>
            {/if}
        {/if}
        <select class="b3-select lv-sort" bind:value={sortMode} title={t.manager.sortLabel}>
            <option value="default">{t.manager.sortDefault}</option>
            <option value="path">{t.manager.sortPath}</option>
            <option value="content">{t.manager.sortContent}</option>
        </select>
        <button class="b3-button b3-button--outline" disabled={page <= 1} onclick={() => goto(page - 1)}>{t.manager.prev}</button>
        <span class="lv-pager">{page} / {pageCount}</span>
        <button class="b3-button b3-button--outline" disabled={page >= pageCount} onclick={() => goto(page + 1)}>{t.manager.next}</button>
        <button class="b3-button b3-button--outline" onclick={load}>{t.dashboard.refresh}</button>
    {/snippet}

    {#if selected.length > 0}
        <div class="lv-glass lv-batchbar">
            <LvChip tone="primary">{t.manager.batchSelected.replace("${n}", String(selected.length))}</LvChip>
            <div class="fn__flex-1"></div>
            <button class="b3-button b3-button--outline" onclick={batchReset}>{t.manager.batchReset}</button>
            <button class="b3-button b3-button--outline" onclick={batchRemove}>{t.manager.batchRemove}</button>
            <button class="b3-button b3-button--small" onclick={() => (selected = [])}>{t.manager.batchCancel}</button>
        </div>
    {/if}

    {#if loading}
        <div class="lv-card2 lv-loading">
            <div class="lv-skeleton" style="height: 44px"></div>
            <div class="lv-skeleton" style="height: 44px"></div>
            <div class="lv-skeleton" style="height: 44px"></div>
            <div class="lv-skeleton" style="height: 44px"></div>
        </div>
    {:else if errorMsg}
        <div class="lv-card2 lv-hint lv-error">{errorMsg}</div>
    {:else if filteredBlocks.length === 0}
        {#if filterText}
            <LvEmpty text={t.manager.filterEmpty} actionLabel={t.manager.filterClear} onaction={() => (filterText = "")} />
        {:else}
            <LvEmpty text={t.manager.empty} />
        {/if}
    {:else}
        <div class="lv-list">
            {#each filteredBlocks as b (b.id)}
                <div class="lv-row" role="presentation" onclick={(e: MouseEvent) => onRowClick(e, b)}>
                    <input
                        type="checkbox"
                        class="lv-check"
                        checked={selected.includes(b.id)}
                        onclick={(e: Event) => { e.stopPropagation(); toggleSelect(b.id); }}
                    />
                    <div class="lv-content">
                        <div class="lv-text">{stripHtml(b.content) || b.id}</div>
                        <div class="lv-meta ft__smaller ft__on-surface">{b.hPath ?? ""} {b.name ? "· " + b.name : ""}</div>
                    </div>
                    <span class="lv-arrow" aria-hidden="true">›</span>
                    <button class="b3-button b3-button--small" onclick={(e: Event) => { e.stopPropagation(); openDoc(b); }}>{t.manager.openDoc}</button>
                </div>
            {/each}
        </div>
    {/if}
</LvPage>

{#if detail}
    <CardDetail
        block={detail}
        {t}
        onOpenDoc={() => openDoc(detail!)}
        onClose={() => (detail = null)}
    />
{/if}

<style lang="scss">
    .lv-filter { width: 200px; border-radius: 999px; padding-left: 14px; }
    .lv-sort { font-size: 12px; padding: 4px 8px; }
    .lv-pager { font-size: 12px; color: var(--b3-theme-on-surface); font-variant-numeric: tabular-nums; }
    .lv-hint { color: var(--b3-theme-on-surface); }
    .lv-error { color: var(--b3-theme-error); }
    .lv-loading {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
    }

    .lv-batchbar {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        border: 1px solid var(--lv-primary-border);
        border-radius: var(--lv-r-m);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        margin-bottom: var(--lv-sp-2);
    }
    .lv-check { cursor: pointer; }

    .lv-list {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);

        .lv-row {
            display: flex; align-items: center; gap: var(--lv-sp-3);
            padding: var(--lv-sp-3) var(--lv-sp-4);
            background: var(--lv-surface-grad);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-m);
            box-shadow: var(--lv-shadow-1);
            transition: transform var(--lv-dur-2) var(--lv-ease),
                border-color var(--lv-dur-2) var(--lv-ease),
                box-shadow var(--lv-dur-2) var(--lv-ease);
            position: relative;

            &::before {
                content: "";
                position: absolute;
                left: 0; top: 20%; bottom: 20%;
                width: 3px;
                border-radius: 2px;
                background: var(--b3-theme-primary);
                opacity: 0;
                transition: opacity var(--lv-dur-2) var(--lv-ease);
            }

            &:hover {
                transform: translateY(-1px);
                border-color: var(--lv-border-strong);
                box-shadow: var(--lv-shadow-2);
                &::before { opacity: 1; }
                .lv-arrow { opacity: 1; transform: translateX(0); }
            }

            .lv-content { flex: 1; min-width: 0; }
            .lv-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .lv-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

            .lv-arrow {
                color: var(--b3-theme-primary);
                font-size: 16px;
                opacity: 0;
                transform: translateX(-4px);
                transition: opacity var(--lv-dur-2) var(--lv-ease), transform var(--lv-dur-2) var(--lv-ease);
            }
        }
    }
</style>
