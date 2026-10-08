<script lang="ts">
    // BI-4 材料筛选收件箱子页（Hub 懒加载 chunk，不占主包预算）。
    // 品质线对齐 manager 页：LvPage 页头 + LvSegmented 筛选 + 毛玻璃批量条（LvChip 计数）
    // + 行级 LvSkeleton 标题加载 + LvEmpty 空态 + LvLive 读屏播报 + 破坏性操作 confirmDialog
    // + 行内打开来源（BI-6 openSource 建议）。流转：inbox → staged → selected / dismissed；
    // 只读收集不产生 due。
    import { showMessage } from "siyuan";
    import { confirmDialog } from "@/libs/dialog";
    import LvPage from "./kit/LvPage.svelte";
    import LvSegmented from "./kit/LvSegmented.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvSkeleton from "./kit/LvSkeleton.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvLive from "./kit/LvLive.svelte";
    import type { InboxData, InboxItem, InboxStatus } from "@/core/inbox";

    let {
        i18n,
        inbox,
    }: {
        i18n: any;
        inbox: {
            get: () => InboxData;
            subscribe: (cb: () => void) => () => void;
            setStatus: (blockIDs: string[], status: InboxStatus) => InboxData;
            undoSelection: (blockIDs: string[]) => InboxData;
            remove: (blockIDs: string[]) => InboxData;
            add: (blockIDs: string[]) => number;
            makeCards: (blockIDs: string[]) => Promise<void>;
            openSource: (blockID: string) => Promise<void>;
            titles: (ids: string[]) => Promise<Map<string, string>>;
        };
    } = $props();

    const t = $derived(i18n.inbox);

    // BX-10：订阅收件箱变更（块菜单收集/其他入口），自动同步快照——不再依赖手动 ⟳
    $effect(() => {
        const unsub = inbox.subscribe(() => {
            snapshot = inbox.get();
        });
        return unsub;
    });

    const FILTERS: { id: InboxStatus; labelKey: string }[] = [
        { id: "inbox", labelKey: "tabInbox" },
        { id: "staged", labelKey: "tabStaged" },
        { id: "selected", labelKey: "tabSelected" },
        { id: "dismissed", labelKey: "tabDismissed" },
    ];

    // svelte-ignore state_referenced_locally -- 初值快照刻意的：后续变更经 inbox 订阅/操作回调整体替换 snapshot（BX-10）
    let snapshot = $state<InboxData>(inbox.get());
    let filter = $state<InboxStatus>("inbox");
    let checked = $state<string[]>([]);
    let titles = $state<Map<string, string>>(new Map());
    let making = $state(false);
    let live = $state("");

    const visible = $derived(
        snapshot.items
            .filter(i => i.status === filter)
            .sort((a, b) => a.addedAt - b.addedAt),
    );
    const counts = $derived(
        snapshot.items.reduce(
            (acc, i) => { acc[i.status]++; return acc; },
            { inbox: 0, staged: 0, selected: 0, dismissed: 0 } as Record<InboxStatus, number>,
        ),
    );
    const allChecked = $derived(visible.length > 0 && visible.every(i => checked.includes(i.blockID)));

    // 标题解析：块 content 首行（失败置空串→回退短 ID，行骨架随之解除）
    const pendingTitles = new Set<string>();
    $effect(() => {
        const missing = visible
            .map(i => i.blockID)
            .filter(id => !titles.has(id) && !pendingTitles.has(id));
        if (missing.length === 0) { return; }
        for (const id of missing) { pendingTitles.add(id); }
        inbox.titles(missing).then(m => {
            const merged = new Map(titles);
            for (const id of missing) {
                merged.set(id, m.get(id) ?? "");
                pendingTitles.delete(id);
            }
            titles = merged;
        }).catch(() => {
            const merged = new Map(titles);
            for (const id of missing) {
                merged.set(id, "");
                pendingTitles.delete(id);
            }
            titles = merged;
        });
    });

    function stripHtml(html: string): string {
        const div = document.createElement("div");
        div.innerHTML = html ?? "";
        return (div.textContent ?? "").trim();
    }

    function titleOf(item: InboxItem): string {
        const text = stripHtml(titles.get(item.blockID) ?? "");
        return text || item.blockID.slice(0, 8);
    }

    function snippetOf(item: InboxItem): string {
        const s = titleOf(item);
        return s.length > 80 ? `${s.slice(0, 80)}…` : s;
    }

    function announce(msg: string) {
        live = msg;
    }

    function toggle(id: string) {
        checked = checked.includes(id) ? checked.filter(x => x !== id) : [...checked, id];
    }

    function toggleAll() {
        checked = allChecked ? [] : visible.map(i => i.blockID);
    }

    function statusLabel(status: InboxStatus): string {
        const f = FILTERS.find(x => x.id === status);
        return f ? (t[f.labelKey] ?? status) : status;
    }

    function applyStatus(status: InboxStatus) {
        if (checked.length === 0) { return; }
        const n = checked.length;
        snapshot = inbox.setStatus(checked, status);
        checked = [];
        const msg = t.bulkDone.replace("${n}", String(n)).replace("${status}", statusLabel(status));
        showMessage(msg, 2000, "info");
        announce(msg);
    }

    function undoSel() {
        if (checked.length === 0) { return; }
        const n = checked.length;
        snapshot = inbox.undoSelection(checked);
        checked = [];
        const msg = t.undoneNotice.replace("${n}", String(n));
        showMessage(msg, 2000, "info");
        announce(msg);
    }

    function removeChecked() {
        if (checked.length === 0) { return; }
        const n = checked.length;
        confirmDialog({
            title: t.remove,
            content: `<div class="b3-typography">${t.deleteConfirm.replace("${n}", String(n))}</div>`,
            confirm: () => {
                snapshot = inbox.remove(checked);
                checked = [];
                showMessage(t.removedNotice, 2000, "info");
                announce(t.removedNotice);
            },
        });
    }

    // 送去制卡：向导成功回调里清收件箱；完成后手动刷新快照
    async function sendToCards() {
        if (checked.length === 0 || making) { return; }
        making = true;
        try {
            await inbox.makeCards(checked);
            checked = [];
            snapshot = inbox.get();
        } catch { /* 向导内部已提示错误 */ }
        making = false;
    }

    function refresh() {
        snapshot = inbox.get();
        checked = [];
        showMessage(t.refreshedNotice, 1500, "info");
    }
</script>

<LvPage eyebrow="CAPTURE / INBOX" title={t.title} subtitle={`${t.tabInbox} ${counts.inbox} · ${t.tabStaged} ${counts.staged} · ${t.tabSelected} ${counts.selected} · ${t.tabDismissed} ${counts.dismissed}`}>
    {#snippet actions()}
        <LvSegmented
            options={FILTERS.map(f => ({ value: f.id, label: `${t[f.labelKey]} (${counts[f.id]})` }))}
            value={filter}
            onchange={(id: string) => { filter = id as InboxStatus; checked = []; }}
            ariaLabel={t.filterGroupLabel}
        />
        <button class="b3-button b3-button--small lv-btn-ghost" title={t.selectAll} disabled={visible.length === 0} onclick={toggleAll}>{allChecked ? t.unselectAll : t.selectAll}</button>
        <button class="b3-button b3-button--small lv-btn-ghost" title={t.refresh} onclick={refresh}>{t.refresh}</button>
    {/snippet}

    {#if visible.length === 0}
        <LvEmpty text={t.empty} />
    {:else}
        {#if checked.length > 0}
            <div class="lv-glass lv-batchbar">
                <LvChip tone="primary">{t.selectedCount.replace("${n}", String(checked.length))}</LvChip>
                <div class="fn__flex-1"></div>
                {#if filter === "inbox"}
                    <button class="b3-button b3-button--outline" onclick={() => applyStatus("staged")}>{t.stage}</button>
                    <button class="b3-button b3-button--outline" onclick={() => applyStatus("selected")}>{t.select}</button>
                    <button class="b3-button b3-button--outline" onclick={() => applyStatus("dismissed")}>{t.dismiss}</button>
                {:else if filter === "staged"}
                    <button class="b3-button b3-button--outline" onclick={() => applyStatus("selected")}>{t.select}</button>
                    <button class="b3-button b3-button--outline" onclick={() => applyStatus("dismissed")}>{t.dismiss}</button>
                    <button class="b3-button b3-button--outline" onclick={() => applyStatus("inbox")}>{t.back}</button>
                {:else if filter === "selected"}
                    <button class="b3-button b3-button--outline" disabled={making} onclick={sendToCards}>{t.sendToCards}</button>
                    <button class="b3-button b3-button--outline" onclick={undoSel}>{t.undoSelection}</button>
                {:else}
                    <button class="b3-button b3-button--outline" onclick={() => applyStatus("inbox")}>{t.restore}</button>
                    <button class="b3-button b3-button--outline" onclick={removeChecked}>{t.remove}</button>
                {/if}
                <button class="b3-button b3-button--small" onclick={() => (checked = [])}>{t.batchCancel}</button>
            </div>
        {/if}
        <div class="lv-list">
            {#each visible as item (item.blockID)}
                <div class="lv-row">
                    <input
                        type="checkbox"
                        class="lv-check"
                        aria-label={t.selectItem}
                        checked={checked.includes(item.blockID)}
                        onclick={(e: Event) => { e.stopPropagation(); toggle(item.blockID); }}
                    />
                    <button type="button" class="lv-content" onclick={() => toggle(item.blockID)}>
                        {#if titles.has(item.blockID)}
                            <div class="lv-text" title={titleOf(item)}>{snippetOf(item)}</div>
                        {:else}
                            <div class="lv-text"><LvSkeleton shape="row" count={1} height={14} /></div>
                        {/if}
                        <div class="lv-meta ft__smaller ft__on-surface">{new Date(item.addedAt).toLocaleString()}</div>
                    </button>
                    <button class="b3-button b3-button--small lv-btn-ghost" title={t.openSource} onclick={(e: Event) => { e.stopPropagation(); inbox.openSource(item.blockID); }}>{t.openSource}</button>
                </div>
            {/each}
        </div>
    {/if}
</LvPage>

<LvLive message={live} />

<style>
    .lv-batchbar {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        flex-wrap: wrap;
        padding: var(--lv-sp-2) var(--lv-sp-3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-list {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
    }
    .lv-row {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
        padding: var(--lv-sp-3) var(--lv-sp-4);
        /* R53 .panel 口径：纯 surface + 1px 派生描边，无静态阴影（阴影只给 hover） */
        background: var(--b3-theme-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        transition: border-color var(--lv-dur-2) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);
        position: relative;
        cursor: default;
    }
    .lv-row:hover {
        border-color: var(--lv-border-strong);
        box-shadow: var(--lv-shadow-1);
    }
    .lv-check { cursor: pointer; }
    .lv-content {
        flex: 1;
        min-width: 0;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
    }
    .lv-content:focus-visible {
        outline: 2px solid var(--b3-theme-primary);
        outline-offset: 2px;
        border-radius: var(--lv-r-s);
    }
    .lv-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lv-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
