<script lang="ts">
    import { onMount } from "svelte";
    import { openTab, showMessage } from "siyuan";
    import { getRiffCards, removeRiffCards, resetRiffCards, type SearchBlock } from "@/api/riff";
    import { invalidateDueCache } from "@/api/due-shared";
    import { confirmDialog } from "@/libs/dialog";
    import CardDetail from "./card-detail.svelte";
    import LvPage from "./kit/LvPage.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvError from "./kit/LvError.svelte";
    import LvSkeleton from "./kit/LvSkeleton.svelte";
    import LvChip from "./kit/LvChip.svelte";

    export interface ManagerCtx {
        i18n: any;
        /** BI-14：界面模式（simple=隐藏高级批量操作；显示性控制，不删配置） */
        uiMode?: "simple" | "advanced";
        app: any;
        savedFilters: () => { name: string; filter: string }[];
        saveFilter: (name: string, filter: string) => void;
        deleteFilter: (name: string) => void;
        getLeechCards: () => { blockID: string; lapses: number }[];
        /** 状态过滤（M6·FR2）：新卡=本地 revlog 无记录 */
        isNewBlock: (blockID: string) => boolean;
        /** 遗忘次数映射（272）：lapses 排序用 */
        getLapsesMap: () => Record<string, number>;
        /** 今日到期块 ID 清单（内核到期卡片，含 blockID） */
        getDueBlockIDs: () => Promise<string[]>;
        /** BK-2：关系视图/增删（v0.123.0；可选——旧宿主不传则详情不显示关系区） */
        relationsOfBlock?: (blockID: string) => { relation: { from: string; to: string; type: string; createdAt: number }; direction: "outgoing" | "incoming" }[];
        addRelation?: (from: string, to: string, type: string) => void;
        removeRelation?: (from: string, to: string, type: string) => void;
        /** BK-1：知识对象快照与操作（可选——旧宿主不传则详情不显示知识对象区） */
        ko?: {
            snapshot: (blockID: string) => { registered: boolean; fact: string; instances: { cardID: string; cardType: string; capability: string | null; disabled: boolean }[] };
            register: (blockID: string, fact: string) => void;
            toggle: (blockID: string, cardID: string, disabled: boolean) => void;
            remove: (blockID: string, cardID: string) => void;
            derive: (blockID: string, cardType: string) => Promise<void>;
        };
        /** BI-5/6/7：内容状态生命周期（可选——旧宿主不传则详情不显示内容状态区） */
        lc?: {
            snapshot: (blockID: string) => import("@/core/content-lifecycle").ContentLifecycle | null;
            open: (blockID: string) => void;
            transition: (blockID: string, to: import("@/core/content-lifecycle").ContentState, reason: string) => boolean;
            /** cram=false 正式复习 / true 练习（突击）模式；blockID 传入时记 BI-3 卡片入口 */
            openReview: (cram: boolean, blockID?: string) => void;
            makeCards: (blockID: string, content: string) => void;
        };
        /** BX-2 W2：卡片内容读写（可选——旧宿主不传则详情不显示编辑入口） */
        blockContent?: (blockID: string) => Promise<string | null>;
        saveBlockContent?: (blockID: string, md: string) => Promise<boolean>;
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
    /** 防抖后的过滤词（548）：输入停顿 200ms 才触发过滤重算 */
    let deferredFilter = $state("");
    let filterTimer: ReturnType<typeof setTimeout> | null = null;
    $effect(() => {
        filterText;
        if (filterTimer) { clearTimeout(filterTimer); }
        filterTimer = setTimeout(() => { deferredFilter = filterText; }, 200);
        return () => { if (filterTimer) { clearTimeout(filterTimer); } };
    });
    let sortMode = $state<"default" | "path" | "content" | "lapses">("default");
    let leechOnly = $state(false);
    let statusFilter = $state<"all" | "new" | "review" | "due">("all");
    let dueSet = new Set<string>();
    let loadSeq = 0;  // AR-6：分页/刷新请求序号
    let dueSeq = 0;   // AR-6：到期清单请求序号
    let savedList = $state<{ name: string; filter: string }[]>([]);
    let pickedSaved = $state("");
    let selected: string[] = $state([]);
    let detail: SearchBlock | null = $state(null);
    let detailRelations: { relation: { from: string; to: string; type: string; createdAt: number }; direction: "outgoing" | "incoming" }[] = $state([]);
    let detailKo: { registered: boolean; fact: string; instances: { cardID: string; cardType: string; capability: string | null; disabled: boolean }[] } | null = $state(null);
    let koDeriving = $state(false);
    let detailLc: import("@/core/content-lifecycle").ContentLifecycle | null = $state(null);

    let filteredBlocks = $derived(
        (() => {
            let arr = blocks.filter(b => !deferredFilter || stripHtml(b.content).toLowerCase().includes(deferredFilter.toLowerCase()));
            if (leechOnly) {
                const leechSet = new Set(ctx.getLeechCards().map(l => l.blockID));
                arr = arr.filter(b => leechSet.has(b.id));
            }
            if (statusFilter === "new") {
                arr = arr.filter(b => ctx.isNewBlock(b.id));
            } else if (statusFilter === "review") {
                arr = arr.filter(b => !ctx.isNewBlock(b.id));
            } else if (statusFilter === "due") {
                arr = arr.filter(b => dueSet.has(b.id));
            }
            if (sortMode === "path") {
                return [...arr].sort((a, b) => ((a.hPath as string) ?? "").localeCompare((b.hPath as string) ?? ""));
            }
            if (sortMode === "content") {
                return [...arr].sort((a, b) => stripHtml(a.content).localeCompare(stripHtml(b.content)));
            }
            if (sortMode === "lapses") {
                // 遗忘次数降序（272）：烂卡优先
                const lapses = ctx.getLapsesMap();
                return [...arr].sort((a, b) => (lapses[b.id] ?? 0) - (lapses[a.id] ?? 0));
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
        // AR-6：快速分页/刷新并发时只接受最后一次响应
        const seq = ++loadSeq;
        loading = true;
        errorMsg = "";
        try {
            const cards = await getRiffCards("", page, PAGE_SIZE);
            if (seq !== loadSeq) {
                return; // 旧页响应不覆盖筛选、页码与选择
            }
            blocks = cards.blocks ?? [];
            selected = [];
            total = cards.total;
            pageCount = Math.max(1, cards.pageCount);
        } catch (e: any) {
            if (seq === loadSeq) {
                errorMsg = e?.message ?? String(e);
            }
        } finally {
            if (seq === loadSeq) {
                loading = false;
            }
        }
    }

    function goto(p: number) {
        page = Math.min(Math.max(1, p), pageCount);
        load();
    }

    function toggleSelect(id: string) {
        selected = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    }

    /** 「今日到期」切换过滤项时拉取内核到期清单（AR-6：每次切入都重拉，评分后 due 集不陈旧） */
    async function onStatusChange() {
        if (statusFilter === "due") {
            const seq = ++dueSeq;
            try {
                const ids = await ctx.getDueBlockIDs();
                if (seq === dueSeq) {
                    dueSet = new Set(ids);
                    load();
                }
            } catch { /* 到期清单失败按空集处理，仅影响该过滤项 */ }
        }
    }

    /** 选中卡导出 CSV（274）：blockID,路径,内容（引号转义，BOM 便于 Excel） */
    function exportSelected() {
        if (selected.length === 0) { return; }
        const picked = blocks.filter(b => selected.includes(b.id));
        const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const rows = ["blockID,path,content"];
        for (const b of picked) {
            rows.push(`${b.id},${esc((b.hPath as string) ?? "")},${esc(stripHtml(b.content))}`);
        }
        const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lv-cards-selected-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function batchRemove() {
        if (selected.length === 0) return;
        confirmDialog({
            title: t.manager.batchRemove,
            content: `<div class="b3-typography">${t.manager.batchConfirm.replace("${n}", String(selected.length))}</div>`,
            confirm: async () => {
                // 🧪 deckID 传空的跨集删除语义待 docs/18 实测
                await removeRiffCards("", selected);
                invalidateDueCache(); // AT-4：删卡改变到期数
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
                invalidateDueCache(); // AT-4：重置调度数据改变到期数
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
        // BK-2：详情打开时载入该块的关系视图（本地镜像，增删后经 ctx 刷新）
        detailRelations = ctx.relationsOfBlock?.(b.id) ?? [];
        detailKo = ctx.ko ? ctx.ko.snapshot(b.id) : null;
        // BI-5：详情打开时载入内容状态快照（null=未开档）
        detailLc = ctx.lc ? ctx.lc.snapshot(b.id) : null;
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
            <option value="lapses">{t.manager.sortLapses}</option>
        </select>
        <select class="b3-select lv-sort" bind:value={statusFilter} onchange={onStatusChange} title={t.manager.statusLabel}>
            <option value="all">{t.manager.statusAll}</option>
            <option value="new">{t.manager.statusNew}</option>
            <option value="review">{t.manager.statusReview}</option>
            <option value="due">{t.manager.statusDue}</option>
        </select>
        {#if ctx.uiMode !== "simple"}
            <button class="b3-button b3-button--small" class:lv-btn-primary={leechOnly} onclick={() => (leechOnly = !leechOnly)}>
                {t.manager.leechFilter}
            </button>
        {/if}
        <button class="b3-button b3-button--outline" disabled={page <= 1} onclick={() => goto(page - 1)}>{t.manager.prev}</button>
        <span class="lv-pager">{page} / {pageCount}</span>
        <button class="b3-button b3-button--outline" disabled={page >= pageCount} onclick={() => goto(page + 1)}>{t.manager.next}</button>
        <button class="b3-button b3-button--outline" onclick={load}>{t.dashboard.refresh}</button>
    {/snippet}

    {#if selected.length > 0}
        <div class="lv-glass lv-batchbar">
            <LvChip tone="primary">{t.manager.batchSelected.replace("${n}", String(selected.length))}</LvChip>
            <div class="fn__flex-1"></div>
            {#if ctx.uiMode !== "simple"}
                <button class="b3-button b3-button--outline" onclick={exportSelected}>{t.manager.exportCsv}</button>
                <button class="b3-button b3-button--outline" onclick={batchReset}>{t.manager.batchReset}</button>
            {/if}
            <button class="b3-button b3-button--outline" onclick={batchRemove}>{t.manager.batchRemove}</button>
            <button class="b3-button b3-button--small" onclick={() => (selected = [])}>{t.manager.batchCancel}</button>
        </div>
    {/if}

    {#if loading}
        <div class="lv-card2 lv-loading">
            <LvSkeleton shape="row" count={4} height={44} />
        </div>
    {:else if errorMsg}
        <LvError message={errorMsg} onretry={load} retryLabel={t.dashboard.refresh} />
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
        lcCtx={ctx.lc ? {
            snapshot: detailLc,
            onopen: () => {                ctx.lc!.open(detail!.id);
                detailLc = ctx.lc!.snapshot(detail!.id);
            },
            ontransition: (to, reason) => {
                const ok = ctx.lc!.transition(detail!.id, to, reason);
                detailLc = ctx.lc!.snapshot(detail!.id);
                return ok;
            },
            // BI-6：建议动作 → 经理页真实入口（建议可跳过，点击才执行；无隐式写入）
            onaction: (action) => {
                const b = detail;
                if (!b) return;
                if (action === "openSource" || action === "explain" || action === "revise") {
                    // 经理页无独立解释/修订入口，统一回落原文（阅读理解与修订都在编辑器完成）
                    openDoc(b);
                } else if (action === "makeCards") {
                    ctx.lc!.makeCards(b.id, b.content ?? "");
                } else if (action === "formalReview") {
                    ctx.lc!.openReview(false, b.id);
                } else if (action === "practice") {
                    ctx.lc!.openReview(true, b.id);
                } else if (action === "wrapUp") {
                    detail = null;
                }
            },
        } : undefined}
        relationsCtx={ctx.relationsOfBlock ? {
            relations: detailRelations,
            onadd: (f, to, ty) => {
                ctx.addRelation?.(f, to, ty);
                detailRelations = ctx.relationsOfBlock?.(detail!.id) ?? [];
            },
            onremove: (f, to, ty) => {
                ctx.removeRelation?.(f, to, ty);
                detailRelations = ctx.relationsOfBlock?.(detail!.id) ?? [];
            },
        } : undefined}
        koCtx={ctx.ko ? {
            snapshot: detailKo ?? { registered: false, fact: "", instances: [] },
            deriving: koDeriving,
            onregister: () => {
                ctx.ko?.register(detail!.id, detail!.content ?? "");
                detailKo = ctx.ko!.snapshot(detail!.id);
            },
            ontoggle: (cardID, disabled) => {
                ctx.ko?.toggle(detail!.id, cardID, disabled);
                detailKo = ctx.ko!.snapshot(detail!.id);
            },
            onremove: (cardID) => {
                ctx.ko?.remove(detail!.id, cardID);
                detailKo = ctx.ko!.snapshot(detail!.id);
            },
            onderive: async (cardType) => {
                koDeriving = true;
                try {
                    await ctx.ko?.derive(detail!.id, cardType);
                } finally {
                    koDeriving = false;
                    detailKo = ctx.ko!.snapshot(detail!.id);
                }
            },
        } : undefined}
        editorCtx={ctx.blockContent && ctx.saveBlockContent ? {
            load: () => ctx.blockContent!(detail!.id),
            save: (md) => ctx.saveBlockContent!(detail!.id, md),
        } : undefined}
    />
{/if}

<style lang="scss">
    .lv-filter { width: 200px; border-radius: 999px; padding-left: 14px; }
    .lv-sort { font-size: 12px; padding: 4px 8px; }
    .lv-pager { font-size: 12px; color: var(--b3-theme-on-surface); font-variant-numeric: tabular-nums; }
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
