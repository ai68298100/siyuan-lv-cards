<script lang="ts">
    import { onMount, tick } from "svelte";
    import { openTab, showMessage } from "siyuan";
    import { getRiffCards, removeRiffCards, resetRiffCards, type SearchBlock } from "@/api/riff";
    import { invalidateDueCache } from "@/api/due-shared";
    import { friendlyError } from "@/api/errors";
import { confirmDialog } from "@/libs/dialog";
    import { parseManagerView } from "@/core/settings";
    import { srExportLine, composeSrExport } from "@/core/obsidian-import";
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
        /** BI-17：管理器视图状态持久化（可选——旧宿主不传则不恢复筛选） */
        view?: { initial: string | null; save: (v: string) => void };
        app: any;
        openOnboarding?: () => void;
        savedFilters: () => { name: string; filter: string }[];
        saveFilter: (name: string, filter: string) => void;
        /** T05 分面（docs/40）：块学习记录与关联疑问（可选——旧宿主不传则分面显示空态） */
        getBlockHistory?: (blockID: string) => { rating: number; ts: number; dur: number | null }[];
        getBlockIssues?: (blockID: string) => { addedAt: number; status: string }[];
        /** T05 内容版本快照（最新在前；可选——旧宿主不传则不显示版本） */
        contentVersionsOf?: (blockID: string) => { md: string; at: number; via: "editor" | "ai"; accepted?: boolean }[];
        /** T05：用户核对确认某版本 */
        acceptContentAt?: (blockID: string, at: number) => void;
        deleteFilter: (name: string) => void;
        getLeechCards: () => { blockID: string; lapses: number }[];
        /** 状态过滤（M6·FR2）：新卡=本地 revlog 无记录 */
        isNewBlock: (blockID: string) => boolean;
        /** 遗忘次数映射（272）：lapses 排序用 */
        getLapsesMap: () => Record<string, number>;
        /** 今日到期块 ID 清单（内核到期卡片，含 blockID） */
        getDueBlockIDs: () => Promise<string[]>;
        /** 订阅跨前端存储重载事件，自动刷新当前分页与到期筛选 */
        onStoresChanged?: (cb: () => void) => () => void;
        /** 订阅评分事件，保持卡片状态/到期筛选与总览同一时点 */
        onReviewed?: (cb: () => void) => () => void;
        /** BK-2：关系视图/增删（v0.123.0；可选——旧宿主不传则详情不显示关系区） */
        relationsOfBlock?: (blockID: string) => { relation: { from: string; to: string; type: string; createdAt: number }; direction: "outgoing" | "incoming" }[];
        addRelation?: (from: string, to: string, type: string) => void;
        removeRelation?: (from: string, to: string, type: string) => void;
        /** BK-1：知识对象快照与操作（可选——旧宿主不传则详情不显示知识对象区） */
        ko?: {
            snapshot: (blockID: string) => { registered: boolean; fact: string; instances: { cardID: string; cardType: string; capability: string | null; disabled: boolean }[] };
            register: (blockID: string, fact: string) => void | Promise<void>;
            toggle: (blockID: string, cardID: string, disabled: boolean) => void | Promise<void>;
            remove: (blockID: string, cardID: string) => void | Promise<void>;
            derive: (blockID: string, cardType: string) => Promise<void>;
        };
        /** BI-5/6/7：内容状态生命周期（可选——旧宿主不传则详情不显示内容状态区） */
        lc?: {
            snapshot: (blockID: string) => import("@/core/content-lifecycle").ContentLifecycle | null;
            open: (blockID: string) => void | Promise<void>;
            transition: (blockID: string, to: import("@/core/content-lifecycle").ContentState, reason: string) => boolean | Promise<boolean>;
            /** cram=false 正式复习 / true 练习（突击）模式；blockID 传入时记 BI-3 卡片入口 */
            openReview: (cram: boolean, blockID?: string) => void;
            makeCards: (blockID: string, content: string) => void;
        };
        /** BX-2 W2：卡片内容读写（可选——旧宿主不传则详情不显示编辑入口） */
        blockContent?: (blockID: string) => Promise<string | null>;
        saveBlockContent?: (blockID: string, md: string) => Promise<boolean>;
        deckScope?: { id: string; name: string } | null;
        clearDeckScope?: () => void;
    }

    let { ctx }: { ctx: ManagerCtx } = $props();
    const t = $derived(ctx.i18n);
    // 详情面板 i18n 视图矫正（v0.206.12）：relations 实际在 review.relations（v0.11x 起的组路径漂移），
    // 面板内 34 处 t.relations/t.lc/t.editor 直读不改——在此构造兼容视图，缺组回落顶层
    const detailT = $derived.by(() => {
        const i = ctx.i18n as any;
        return new Proxy(i, {
            get(target, key: string) {
                if (key === "relations" && !target.relations) return target.review?.relations;
                return target[key];
            },
        });
    });

    const PAGE_SIZE = 20;
    let loading = $state(true);
    let page = $state(1);
    let viewReady = $state(false);
    let restorePositionOnLoad = false;
    let restoreScrollTop = 0;
    let restoreFocusId = "";
    let liveScrollTop = 0;
    let focusedControlId = "";
    let viewSaveTimer: ReturnType<typeof setTimeout> | null = null;
    let total = $state(0);
    let pageCount = $state(1);
    let blocks: SearchBlock[] = $state([]);
    let errorMsg = $state("");
    let filterText = $state("");
    /** 防抖后的过滤词（548）：输入停顿 200ms 才触发过滤重算 */
    let deferredFilter = $state("");
    let filterDirty = $state(false);
    let filterTimer: ReturnType<typeof setTimeout> | null = null;
    $effect(() => {
        const dirty = filterDirty;
        const nextFilter = filterText;
        if (filterTimer) { clearTimeout(filterTimer); }
        if (!dirty) return;
        filterTimer = setTimeout(() => {
            deferredFilter = nextFilter;
            // 搜索仅作用于内核返回的当前分页；切词后回到第 1 页并重新取数。
            page = 1;
            resetScrollPosition();
            filterDirty = false;
            void load();
        }, 200);
        return () => { if (filterTimer) { clearTimeout(filterTimer); } };
    });
    let sortMode = $state<"default" | "path" | "content" | "lapses">("default");
    let leechOnly = $state(false);
    let statusFilter = $state<"all" | "new" | "review" | "due">("all");
    let dueSet = new Set<string>();
    let loadSeq = 0;  // AR-6：分页/刷新请求序号
    let dueSeq = 0;   // AR-6：到期清单请求序号
    let dueLoading = $state(false);
    let dueError = $state("");
    let savedList = $state<{ name: string; filter: string }[]>([]);
    let pickedSaved = $state("");
    let selected: string[] = $state([]);
    let batchBusy = $state<"remove" | "reset" | null>(null);
    let batchError = $state("");
    let detail: SearchBlock | null = $state(null);
    let detailRelations: { relation: { from: string; to: string; type: string; createdAt: number }; direction: "outgoing" | "incoming" }[] = $state([]);
    let detailKo: { registered: boolean; fact: string; instances: { cardID: string; cardType: string; capability: string | null; disabled: boolean }[] } | null = $state(null);
    let koDeriving = $state(false);
    let detailLc: import("@/core/content-lifecycle").ContentLifecycle | null = $state(null);
    let storesChangedTimer: ReturnType<typeof setTimeout> | null = null;
    // svelte-ignore state_referenced_locally -- Hub creates a fresh Manager for each deck route.
    let deckScope = $state(ctx.deckScope ?? null);

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
        // 新请求对应新结果，旧页面的选择不能作用于新分页或筛选结果。
        selected = [];
        try {
            const cards = await getRiffCards(deckScope?.id ?? "", page, PAGE_SIZE);
            if (seq !== loadSeq) {
                return; // 旧页响应不覆盖筛选、页码与选择
            }
            const nextPageCount = Math.max(1, cards.pageCount);
            if (page > nextPageCount) {
                page = nextPageCount;
                void load();
                return;
            }
            // 同一块可同时属于内置卡组与自定义卡组（Svelte each 键不可重复）——按块 ID 去重，一行一内容
            const seen = new Set<string>();
            blocks = (cards.blocks ?? []).filter(b => {
                if (!b.id || seen.has(b.id)) return false;
                seen.add(b.id);
                return true;
            });
            selected = [];
            total = cards.total;
            pageCount = nextPageCount;
        } catch (e: any) {
            if (seq === loadSeq) {
                errorMsg = friendlyError(e, t);
            }
        } finally {
            if (seq === loadSeq) {
                loading = false;
                await restoreViewPosition();
            }
        }
    }

    async function restoreViewPosition() {
        if (!restorePositionOnLoad || loading || dueLoading || errorMsg || dueError) return;
        // 列表替换加载骨架后再恢复；到期筛选还需等其独立查询完成。
        await tick();
        if (!restorePositionOnLoad || loading || dueLoading) return;
        const pageEl = document.getElementById("lv-manager-page");
        if (pageEl) pageEl.scrollTop = restoreScrollTop;
        const focusEl = restoreFocusId ? document.getElementById(restoreFocusId) : null;
        if (focusEl instanceof HTMLElement && focusEl.isConnected) focusEl.focus({ preventScroll: true });
        restorePositionOnLoad = false;
    }

    function goto(p: number) {
        page = Math.min(Math.max(1, p), pageCount);
        resetScrollPosition();
        load();
    }

    function resetScrollPosition() {
        restorePositionOnLoad = false;
        liveScrollTop = 0;
        const pageEl = document.getElementById("lv-manager-page");
        if (pageEl) pageEl.scrollTop = 0;
    }

    function serializeView(): string {
        return JSON.stringify({
            filter: filterText,
            sort: sortMode,
            leechOnly,
            status: statusFilter,
            page,
            scrollTop: liveScrollTop,
            focusId: focusedControlId,
        });
    }

    function scheduleViewSave() {
        if (viewSaveTimer) clearTimeout(viewSaveTimer);
        viewSaveTimer = setTimeout(() => {
            viewSaveTimer = null;
            ctx.view?.save(serializeView());
        }, 180);
    }

    function capturePageScroll(event: Event) {
        liveScrollTop = (event.currentTarget as HTMLElement).scrollTop;
        scheduleViewSave();
    }

    function capturePageFocus(event: FocusEvent) {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const row = target?.closest<HTMLElement>("[data-manager-card-id]");
        focusedControlId = target?.id || row?.id || "";
        scheduleViewSave();
    }

    function clearDeckScope() {
        deckScope = null;
        ctx.clearDeckScope?.();
        page = 1;
        resetScrollPosition();
        void load();
    }

    function toggleSelect(id: string) {
        selected = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    }

    /** 「今日到期」切换过滤项时拉取内核到期清单（AR-6：每次切入都重拉，评分后 due 集不陈旧） */
    async function onStatusChange() {
        const seq = ++dueSeq;
        dueError = "";
        dueSet = new Set();
        if (statusFilter !== "due") {
            dueLoading = false;
            void load();
            return;
        }
        dueLoading = true;
        try {
            const ids = await ctx.getDueBlockIDs();
            if (seq === dueSeq && statusFilter === "due") {
                dueSet = new Set(ids);
                await load();
            }
        } catch (e: any) {
            if (seq === dueSeq && statusFilter === "due") {
                dueError = friendlyError(e, t) || t.manager.dueLoadFailed;
            }
        } finally {
            if (seq === dueSeq) {
                dueLoading = false;
                await restoreViewPosition();
            }
        }
    }

    function applyStatusFilter(event: Event) {
        // Svelte 的自定义 change 处理先于 bind:value，显式读取本次选择。
        statusFilter = (event.currentTarget as HTMLSelectElement).value as typeof statusFilter;
        page = 1;
        resetScrollPosition();
        selected = [];
        void onStatusChange();
    }

    function toggleLeechFilter() {
        leechOnly = !leechOnly;
        selected = [];
        page = 1;
        resetScrollPosition();
        void load();
    }

    function clearFilters() {
        if (filterTimer) {
            clearTimeout(filterTimer);
            filterTimer = null;
        }
        filterDirty = false;
        filterText = "";
        deferredFilter = "";
        statusFilter = "all";
        leechOnly = false;
        selected = [];
        page = 1;
        resetScrollPosition();
        // 使尚未完成的到期查询失效，避免旧结果重新打开到期过滤。
        dueSeq += 1;
        dueLoading = false;
        dueError = "";
        dueSet = new Set();
        void load();
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

    /** W3：选中卡导出 Obsidian SR markdown（qa→「问 :: 答 #flashcards」；多挖空/无标记→cloze 原样） */
    function exportObsidianSr() {
        if (selected.length === 0) { return; }
        const picked = blocks.filter(b => selected.includes(b.id));
        const lines = picked.map(b => srExportLine(stripHtml(b.content)));
        const md = composeSrExport(lines);
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lv-cards-obsidian-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showMessage(t.manager.obExportDone.replace("${n}", String(lines.filter(l => l.kind === "qa").length)).replace("${c}", String(lines.filter(l => l.kind === "cloze").length)), 2500, "info");
    }

    function batchRemove() {
        if (selected.length === 0 || batchBusy) return;
        confirmDialog({
            title: t.manager.batchRemove,
            content: `<div class="b3-typography">${t.manager.batchConfirm.replace("${n}", String(selected.length))}</div>`,
            confirm: async () => {
                const count = selected.length;
                batchBusy = "remove";
                batchError = "";
                try {
                    // 🧪 deckID 传空的跨集删除语义待 docs/18 实测
                    await removeRiffCards("", selected);
                    invalidateDueCache(); // AT-4：删卡改变到期数
                    selected = [];
                    showMessage(t.manager.batchDone.replace("${n}", String(count)), 2000, "info");
                    await load();
                } catch (e: any) {
                    batchError = friendlyError(e, t);
                    showMessage(batchError, 3500, "error");
                } finally {
                    batchBusy = null;
                }
            },
        });
    }

    function batchReset() {
        if (selected.length === 0 || batchBusy) return;
        confirmDialog({
            title: t.manager.batchReset,
            content: `<div class="b3-typography">${t.manager.batchConfirm.replace("${n}", String(selected.length))}</div>`,
            confirm: async () => {
                const count = selected.length;
                batchBusy = "reset";
                batchError = "";
                try {
                    // 🧪 type="0" + blockIDs 的块级重置语义待 docs/18 实测
                    await resetRiffCards("0", "", "", selected);
                    invalidateDueCache(); // AT-4：重置调度数据改变到期数
                    selected = [];
                    showMessage(t.manager.batchResetDone.replace("${n}", String(count)), 2000, "info");
                    await load();
                } catch (e: any) {
                    batchError = friendlyError(e, t);
                    showMessage(batchError, 3500, "error");
                } finally {
                    batchBusy = null;
                }
            },
        });
    }

    /** 键盘快捷删除当前焦点卡片；删除后把焦点留在相邻卡片，避免回到页面顶部。 */
    function removeOne(b: SearchBlock, rowIndex: number) {
        if (batchBusy) return;
        confirmDialog({
            title: t.manager.deleteCard,
            content: `<div class="b3-typography">${t.manager.deleteConfirm}</div>`,
            confirm: async () => {
                batchBusy = "remove";
                batchError = "";
                try {
                    await removeRiffCards("", [b.id]);
                    invalidateDueCache();
                    showMessage(t.manager.deleteDone, 2000, "info");
                    await load();
                    if (page > pageCount) {
                        page = pageCount;
                        await load();
                    }
                    await tick();
                    focusRowAt(Math.min(rowIndex, filteredBlocks.length - 1));
                } catch (e: any) {
                    batchError = friendlyError(e, t);
                    showMessage(batchError, 3500, "error");
                } finally {
                    batchBusy = null;
                }
            },
        });
    }

    function focusRowAt(index: number) {
        if (index < 0) return;
        const rows = Array.from(document.querySelectorAll<HTMLElement>(".lv-list .lv-row-main"));
        rows[index]?.focus({ preventScroll: true });
    }

    function onRowKeydown(event: KeyboardEvent, b: SearchBlock, rowIndex: number) {
        // 仅处理无修饰键的列表导航，避免抢占浏览器/宿主的组合快捷键。
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            focusRowAt(rowIndex + (event.key === "ArrowUp" ? -1 : 1));
        } else if (event.key === "Enter") {
            event.preventDefault();
            openDetail(b);
        } else if (event.key === "Delete") {
            event.preventDefault();
            removeOne(b, rowIndex);
        }
    }

    function openDetail(b: SearchBlock) {
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
        // BI-17：返回卡库时恢复筛选、排序、页码、滚动位置和最后焦点。
        const v = parseManagerView(ctx.view?.initial ?? undefined);
        if (v) {
            filterText = v.filter;
            deferredFilter = v.filter;
            sortMode = v.sort as typeof sortMode;
            leechOnly = v.leechOnly;
            statusFilter = v.status as typeof statusFilter;
            page = v.page;
            restoreScrollTop = v.scrollTop;
            restoreFocusId = v.focusId;
            liveScrollTop = v.scrollTop;
            focusedControlId = v.focusId;
            restorePositionOnLoad = true;
        }
        viewReady = true;
        if (statusFilter === "due") void onStatusChange();
        else void load();
        // 同步/其他窗口写入后，当前管理器保持筛选和页签位置但重读卡片快照。
        const offStores = ctx.onStoresChanged?.(() => {
            if (storesChangedTimer) clearTimeout(storesChangedTimer);
            storesChangedTimer = setTimeout(() => {
                storesChangedTimer = null;
                void load();
                if (statusFilter === "due") void onStatusChange();
            }, 180);
        });
        const offReviewed = ctx.onReviewed?.(() => {
            if (storesChangedTimer) clearTimeout(storesChangedTimer);
            storesChangedTimer = setTimeout(() => {
                storesChangedTimer = null;
                void load();
                if (statusFilter === "due") void onStatusChange();
            }, 180);
        });
        return () => {
            offStores?.();
            offReviewed?.();
            if (viewSaveTimer) {
                clearTimeout(viewSaveTimer);
                viewSaveTimer = null;
            }
            if (viewReady) ctx.view?.save(serializeView());
            if (storesChangedTimer) {
                clearTimeout(storesChangedTimer);
                storesChangedTimer = null;
            }
        };
    });

    // BI-17：视图变化即持久化（settings 走 saveSettingsSoon 防抖）
    $effect(() => {
        if (viewReady) ctx.view?.save(serializeView());
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
            selected = [];
            filterDirty = true;
        }
    }

    function deleteSaved() {
        if (!pickedSaved) return;
        const name = pickedSaved;
        confirmDialog({
            title: t.manager.deleteSaved,
            content: `<div class="b3-typography">${t.manager.deleteSavedConfirm ?? "确定删除已保存的筛选？此操作不可撤销。"}</div>`,
            confirm: () => {
                ctx.deleteFilter(pickedSaved);
                savedList = ctx.savedFilters();
                if (pickedSaved === name) pickedSaved = "";
            },
        });
    }
</script>

<LvPage
    pageId="lv-manager-page"
    onscroll={capturePageScroll}
    onfocusin={capturePageFocus}
    eyebrow="OBJECT / MAINTAIN"
    title={t.manager.title}
    subtitle={t.manager.scopeNote}
>
    {#snippet actions()}
        <input id="lv-manager-filter" class="b3-text-field lv-filter" type="text" aria-label={t.manager.filterLabel} placeholder={t.manager.filterPlaceholder} bind:value={filterText} oninput={() => { selected = []; filterDirty = true; }} />
        <button class="b3-button b3-button--small lv-btn-ghost" disabled={loading || batchBusy !== null} onclick={load}>{t.dashboard.refresh}</button>
    {/snippet}

    <!-- T-管理器 R53 工具行：排序/筛选/保存独立于页头搜索 -->
    <div class="lv-mgr-toolbar">
        {#if filterText}
            <button class="b3-button b3-button--small lv-btn-ghost" title={t.manager.saveFilter} disabled={!filterText.trim()} onclick={saveCurrent}>★ {t.manager.saveFilter}</button>
        {/if}
        {#if savedList.length > 0 || filterText}
            <select class="b3-select lv-sort" bind:value={pickedSaved} onchange={applySaved}>
                <option value="" disabled>★ {t.manager.savedFilters}</option>
                {#each savedList as f (f.name)}<option value={f.name}>{f.name}</option>{/each}
            </select>
            {#if pickedSaved}
                <button class="b3-button b3-button--small lv-btn-ghost" title={t.manager.deleteSaved} aria-label={t.manager.deleteSaved} onclick={deleteSaved}>🗑</button>
            {/if}
        {/if}
        <select class="b3-select lv-sort" bind:value={sortMode} onchange={() => (selected = [])} title={t.manager.sortLabel}>
            <option value="default">{t.manager.sortDefault}</option>
            <option value="path">{t.manager.sortPath}</option>
            <option value="content">{t.manager.sortContent}</option>
            <option value="lapses">{t.manager.sortLapses}</option>
        </select>
        <select class="b3-select lv-sort" bind:value={statusFilter} disabled={loading || dueLoading} onchange={applyStatusFilter} title={t.manager.statusLabel}>
            <option value="all">{t.manager.statusAll}</option>
            <option value="new">{t.manager.statusNew}</option>
            <option value="review">{t.manager.statusReview}</option>
            <option value="due">{t.manager.statusDue}</option>
        </select>
        {#if ctx.uiMode !== "simple"}
            <button
                class="lv-chipbtn"
                class:lv-chipbtn-active={leechOnly}
                title={t.manager.leechFilter}
                onclick={toggleLeechFilter}
            >{t.manager.leechFilter}</button>
        {/if}
        <span class="lv-toolbar-caption">{t.manager.total}: {total}</span>
    </div>
    {#if deckScope}
        <div class="lv-mgr-deck-scope" role="status">
            <span>{t.manager.deckScopeLabel ?? "当前卡组"}：<strong>{deckScope.name}</strong></span>
            <button class="b3-button b3-button--text" onclick={clearDeckScope}>{t.manager.deckScopeClear ?? "查看全部卡组"}</button>
        </div>
    {/if}

    {#if selected.length > 0}
        <div class="lv-glass lv-batchbar">
            <LvChip tone="primary">{t.manager.batchSelected.replace("${n}", String(selected.length))}</LvChip>
            {#if batchError}<span class="lv-batch-error" role="alert">{batchError}</span>{/if}
            <div class="fn__flex-1"></div>
            {#if ctx.uiMode !== "simple"}
                <button class="b3-button b3-button--outline" disabled={batchBusy !== null} onclick={exportSelected}>{t.manager.exportCsv}</button>
                <!-- W3：导出 Obsidian SR markdown（qa/挖空自动分型；可用我们的导入器回导） -->
                <button class="b3-button b3-button--outline" disabled={batchBusy !== null} title={t.manager.obExportHint} onclick={exportObsidianSr}>{t.manager.obExport}</button>
                <button class="b3-button b3-button--outline" disabled={batchBusy !== null} onclick={batchReset}>{batchBusy === "reset" ? t.dashboard.loading : t.manager.batchReset}</button>
            {/if}
            <button class="b3-button b3-button--outline" disabled={batchBusy !== null} onclick={batchRemove}>{batchBusy === "remove" ? t.dashboard.loading : t.manager.batchRemove}</button>
            <button class="b3-button b3-button--small" disabled={batchBusy !== null} onclick={() => (selected = [])}>{t.manager.batchCancel}</button>
        </div>
    {/if}

    {#if loading}
        <div class="lv-card2 lv-loading">
            <LvSkeleton shape="row" count={4} height={44} />
        </div>
    {:else if errorMsg}
        <LvError message={errorMsg} onretry={load} retryLabel={t.dashboard.refresh} />
    {:else if dueError}
        <LvError message={dueError} onretry={() => { void onStatusChange(); }} retryLabel={t.dashboard.refresh} />
    {:else if filteredBlocks.length === 0}
        {#if filterText || statusFilter !== "all" || leechOnly}
            <LvEmpty
                text={t.manager.filterEmptyCurrentPage ?? "当前页无匹配项，筛选仅作用于已加载页。 / No matches on this page; filters apply only to the loaded page."}
                actionLabel={t.manager.filterClear}
                onaction={clearFilters}
            />
        {:else}
            <!-- 宿主未提供上手入口时不渲染看似可点但无动作的按钮。 -->
            <LvEmpty
                text={t.manager.empty}
                actionLabel={ctx.openOnboarding ? t.dashboard.onboardingStart : ""}
                onaction={ctx.openOnboarding ? () => ctx.openOnboarding!() : undefined}
            />
        {/if}
    {:else}
        <div class="lv-list" role="list" aria-label={t.manager.title}>
            {#each filteredBlocks as b, rowIndex (b.id)}
                <div
                    class="lv-row"
                    role="listitem"
                >
                    <input
                        type="checkbox"
                        class="lv-check"
                        aria-label={(t.manager.selectCard ?? "Select card ${id}").replace("${id}", b.id)}
                        checked={selected.includes(b.id)}
                        onclick={(e: Event) => { e.stopPropagation(); toggleSelect(b.id); }}
                    />
                    <button
                        type="button"
                        class="lv-row-main"
                        id={`lv-manager-card-${encodeURIComponent(b.id)}`}
                        data-manager-card-id
                        aria-keyshortcuts="ArrowUp ArrowDown Delete Enter"
                        disabled={batchBusy !== null}
                        onclick={() => openDetail(b)}
                        onkeydown={(event) => onRowKeydown(event, b, rowIndex)}
                    >
                        <span class="lv-content">
                            <span class="lv-text">{stripHtml(b.content) || t.manager.emptyContentFallback}</span>
                            <span class="lv-meta ft__smaller ft__on-surface">{b.hPath ?? ""} {b.name ? "· " + b.name : ""}</span>
                        </span>
                        <span class="lv-arrow" aria-hidden="true">›</span>
                    </button>
                    <button class="b3-button b3-button--small" onclick={(e: Event) => { e.stopPropagation(); openDoc(b); }}>{t.manager.openDoc}</button>
                </div>
            {/each}
        </div>
        <!-- T-管理器 R53：分页在列表底部 -->
        {#if pageCount > 1}
            <div class="lv-mgr-pager">
                <button class="b3-button b3-button--outline b3-button--small" disabled={page <= 1} onclick={() => goto(page - 1)}>{t.manager.prev}</button>
                <span class="lv-pager">{page} / {pageCount}</span>
                <button class="b3-button b3-button--outline b3-button--small" disabled={page >= pageCount} onclick={() => goto(page + 1)}>{t.manager.next}</button>
            </div>
        {/if}
    {/if}
</LvPage>

{#if detail}
    <CardDetail
        block={detail}
        t={detailT}
        onOpenDoc={() => openDoc(detail!)}
        onClose={() => (detail = null)}
        historyEntries={ctx.getBlockHistory?.(detail!.id) ?? []}
        issues={ctx.getBlockIssues?.(detail!.id) ?? []}
        versions={ctx.contentVersionsOf?.(detail!.id) ?? []}
        acceptVersion={(at) => ctx.acceptContentAt?.(detail!.id, at)}
        lcCtx={ctx.lc ? {
            snapshot: detailLc,
            onopen: async () => {
                const blockID = detail?.id;
                if (!blockID) return;
                await ctx.lc!.open(blockID);
                if (detail?.id === blockID) detailLc = ctx.lc!.snapshot(blockID);
            },
            ontransition: async (to, reason) => {
                const blockID = detail?.id;
                if (!blockID) return false;
                const ok = await ctx.lc!.transition(blockID, to, reason);
                if (detail?.id === blockID) detailLc = ctx.lc!.snapshot(blockID);
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
            onadd: async (f, to, ty) => {
                await ctx.addRelation?.(f, to, ty);
                const blockID = detail?.id;
                if (blockID) detailRelations = ctx.relationsOfBlock?.(blockID) ?? [];
            },
            onremove: async (f, to, ty) => {
                const blockID = detail?.id;
                if (!blockID) return;
                await ctx.removeRelation?.(f, to, ty);
                if (detail?.id === blockID) detailRelations = ctx.relationsOfBlock?.(blockID) ?? [];
            },
        } : undefined}
        koCtx={ctx.ko ? {
            snapshot: detailKo ?? { registered: false, fact: "", instances: [] },
            deriving: koDeriving,
            onregister: async () => {
                const blockID = detail?.id;
                if (!blockID) return;
                await ctx.ko?.register(blockID, detail?.content ?? "");
                if (detail?.id === blockID) detailKo = ctx.ko!.snapshot(blockID);
            },
            ontoggle: async (cardID, disabled) => {
                const blockID = detail?.id;
                if (!blockID) return;
                await ctx.ko?.toggle(blockID, cardID, disabled);
                if (detail?.id === blockID) detailKo = ctx.ko!.snapshot(blockID);
            },
            onremove: async (cardID) => {
                const blockID = detail?.id;
                if (!blockID) return;
                await ctx.ko?.remove(blockID, cardID);
                if (detail?.id === blockID) detailKo = ctx.ko!.snapshot(blockID);
            },
            onderive: async (cardType) => {
                const blockID = detail?.id;
                if (!blockID) return;
                koDeriving = true;
                try {
                    await ctx.ko?.derive(blockID, cardType);
                } finally {
                    koDeriving = false;
                    if (detail?.id === blockID) detailKo = ctx.ko!.snapshot(blockID);
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
    .lv-filter { width: 200px; border-radius: 999px; padding-left: calc(var(--lv-space-unit) * 7); }
    .lv-sort { font-size: var(--lv-type-control-size); padding: 4px 8px; }
    .lv-pager { font-size: var(--lv-type-control-size); color: var(--lv-color-text-muted); font-variant-numeric: tabular-nums; }
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
    .lv-batch-error {
        color: var(--lv-color-danger);
        font-size: var(--lv-type-control-size);
        max-width: min(42vw, 420px);
        overflow-wrap: anywhere;
    }
    .lv-check { cursor: pointer; }

    /* T-管理器 R53 工具行：排序/筛选独立于页头（与 .lv-list 同级） */
    .lv-mgr-toolbar {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
        margin-bottom: var(--lv-sp-3);

        .lv-sort { max-width: 140px; font-size: 12px; padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 4); }
        .lv-toolbar-caption { margin-left: auto; font-size: 12px; color: var(--lv-color-text-muted); font-variant-numeric: tabular-nums; }
    }
    .lv-mgr-deck-scope {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: calc(var(--lv-space-unit) * 6);
        margin: 0 0 calc(var(--lv-space-unit) * 6);
        padding: calc(var(--lv-space-unit) * 4 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 6);
        border-left: 3px solid var(--lv-color-brand);
        background: var(--lv-color-surface);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
    }
    .lv-mgr-deck-scope strong { color: var(--lv-color-text); overflow-wrap: anywhere; }

    /* T-管理器 R53 分页：列表底部居中（与 .lv-list 同级） */
    .lv-mgr-pager {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--lv-sp-3);
        margin-top: var(--lv-sp-4);
        padding-top: var(--lv-sp-3);
        border-top: 1px solid var(--lv-border);
        .lv-pager { font-size: var(--lv-type-control-size); color: var(--lv-color-text-muted); font-variant-numeric: tabular-nums; }
    }

    .lv-list {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);

        .lv-row {
            display: flex; align-items: center; gap: var(--lv-sp-3);
            padding: var(--lv-sp-3) var(--lv-sp-4);
            background: var(--lv-color-surface);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-m);
            transition: transform var(--lv-dur-2) var(--lv-ease),
                border-color var(--lv-dur-2) var(--lv-ease),
                box-shadow var(--lv-dur-2) var(--lv-ease);
            position: relative;

            &::before {
                content: "";
                position: absolute;
                left: 0; top: 20%; bottom: 20%;
                width: 3px;
                border-radius: var(--lv-r-track);
                background: var(--lv-color-brand);
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

            .lv-row-main {
                display: flex;
                align-items: center;
                gap: var(--lv-sp-3);
                flex: 1;
                min-width: 0;
                margin: calc(var(--lv-sp-3) * -1) 0;
                padding: var(--lv-sp-3) 0;
                border: 0;
                background: transparent;
                color: inherit;
                text-align: left;
                cursor: pointer;

                &:focus-visible {
                    outline: 2px solid var(--lv-color-brand);
                    outline-offset: 2px;
                    border-radius: var(--lv-r-s);
                }
            }

            /* span 需块化，否则 overflow:hidden 不生效——窄屏文字会压到行内按钮上 */
            .lv-content { flex: 1; min-width: 0; }
            .lv-text, .lv-meta { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

            .lv-arrow {
                color: var(--lv-color-brand);
                font-size: var(--lv-type-title-size);
                opacity: 0;
                transform: translateX(-4px);
                transition: opacity var(--lv-dur-2) var(--lv-ease), transform var(--lv-dur-2) var(--lv-ease);
            }
        }
    }

    /* 窄屏工具栏：搜索、筛选和批量动作分行，避免中文按钮互相挤压。 */
    @container lv-hub (max-width: 740px) {
        .lv-filter {
            width: min(100%, 320px);
            flex: 1 1 180px;
        }
        .lv-mgr-toolbar {
            align-items: stretch;
            .lv-sort { flex: 1 1 135px; max-width: none; }
            .lv-chipbtn { flex: 0 1 auto; }
            .lv-toolbar-caption { width: 100%; margin-left: 0; }
        }
        .lv-batchbar {
            align-items: stretch;
            .fn__flex-1 { display: none; }
            > .b3-button { flex: 1 1 auto; }
        }
        .lv-row { flex-wrap: wrap; }
        .lv-list .lv-row > .b3-button { margin-left: calc(var(--lv-space-unit) * 14); }
    }

    @container lv-hub (max-width: 420px) {
        .lv-mgr-toolbar {
            .lv-sort { flex-basis: 100%; }
            .lv-chipbtn { width: 100%; justify-content: center; }
        }
        .lv-batchbar {
            > .b3-button { flex-basis: 45%; white-space: normal; }
        }
        .lv-list .lv-row {
            padding: var(--lv-sp-2) var(--lv-sp-3);
            gap: var(--lv-sp-2);
            .lv-row-main { flex-basis: calc(100% - 28px); }
            > .b3-button { width: calc(100% - 28px); margin-left: 28px; }
        }
    }
</style>
