<script lang="ts">
    // BI-4 材料筛选收件箱子页（Hub 懒加载 chunk，不占主包预算）
    // 流转：inbox → staged → selected（正向）；任意 → dismissed（淘汰，可恢复/彻底删除）；
    // 选中可撤销（打回 staged）。只读收集不产生 due。
    import LvSegmented from "./kit/LvSegmented.svelte";
    import type { InboxData, InboxItem, InboxStatus } from "@/core/inbox";

    let {
        i18n,
        inbox,
    }: {
        i18n: any;
        inbox: {
            get: () => InboxData;
            setStatus: (blockIDs: string[], status: InboxStatus) => InboxData;
            undoSelection: (blockIDs: string[]) => InboxData;
            remove: (blockIDs: string[]) => InboxData;
            add: (blockIDs: string[]) => number;
            makeCards: (blockIDs: string[]) => Promise<void>;
            titles: (ids: string[]) => Promise<Map<string, string>>;
        };
    } = $props();

    const FILTERS: { id: InboxStatus; labelKey: string }[] = [
        { id: "inbox", labelKey: "inbox.tabInbox" },
        { id: "staged", labelKey: "inbox.tabStaged" },
        { id: "selected", labelKey: "inbox.tabSelected" },
        { id: "dismissed", labelKey: "inbox.tabDismissed" },
    ];

    let snapshot = $state<InboxData>(inbox.get());
    let filter = $state<InboxStatus>("inbox");
    let checked = $state<string[]>([]);
    let titles = $state<Map<string, string>>(new Map());
    let notice = $state("");
    let making = $state(false);

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

    // 标题解析：块 content 首行；失败回退短 ID（异步，不阻塞列表）
    $effect(() => {
        const ids = visible.map(i => i.blockID).filter(id => !titles.has(id));
        if (ids.length === 0) { return; }
        inbox.titles(ids).then(m => {
            titles = new Map([...titles, ...m]);
        }).catch(() => { /* 标题解析失败静默，列表仍可用 */ });
    });

    function titleOf(item: InboxItem): string {
        return titles.get(item.blockID) || item.blockID.slice(0, 8);
    }

    function toggle(id: string) {
        checked = checked.includes(id) ? checked.filter(x => x !== id) : [...checked, id];
    }

    function toggleAll() {
        checked = allChecked ? [] : visible.map(i => i.blockID);
    }

    function flash(msg: string) {
        notice = msg;
    }

    function applyStatus(status: InboxStatus) {
        if (checked.length === 0) { return; }
        snapshot = inbox.setStatus(checked, status);
        flash(`${checked.length} → ${i18n.inbox["tab" + status.charAt(0).toUpperCase() + status.slice(1)] ?? status}`);
        checked = [];
    }

    function undo() {
        if (checked.length === 0) { return; }
        snapshot = inbox.undoSelection(checked);
        flash(i18n.inbox.undoneNotice);
        checked = [];
    }

    function removeChecked() {
        if (checked.length === 0) { return; }
        snapshot = inbox.remove(checked);
        flash(i18n.inbox.removedNotice);
        checked = [];
    }

    // 送去制卡：向导成功回调里清收件箱；对话框关闭后手动刷新快照
    async function sendToCards() {
        if (checked.length === 0 || making) { return; }
        making = true;
        try {
            await inbox.makeCards(checked);
            checked = [];
        } catch { /* 向导内部已提示错误 */ }
        making = false;
    }

    function refresh() {
        snapshot = inbox.get();
        checked = [];
        flash(i18n.inbox.refreshedNotice);
    }
</script>

<div class="lv-inbox-page">
    <div class="lv-inbox-bar">
        <LvSegmented
            options={FILTERS.map(f => ({ value: f.id, label: `${i18n[f.labelKey]} (${counts[f.id]})` }))}
            value={filter}
            onchange={(id: string) => { filter = id as InboxStatus; checked = []; }}
            ariaLabel={i18n.inbox.filterGroupLabel}
        />
    </div>

    {#if visible.length === 0}
        <div class="lv-card2 lv-inbox-empty">{i18n.inbox.empty}</div>
    {:else}
        <div class="lv-card2 lv-inbox-actions">
            <label class="b3-form__icon fn__flex fn__align-center" style="gap: 6px; cursor: pointer">
                <input type="checkbox" checked={allChecked} onchange={toggleAll} />
                <span style="font-size: 12px">{i18n.inbox.selectAll}</span>
            </label>
            {#if filter === "inbox"}
                <button class="b3-button b3-button--small" disabled={!checked.length} onclick={() => applyStatus("staged")}>{i18n.inbox.stage}</button>
                <button class="b3-button b3-button--small" disabled={!checked.length} onclick={() => applyStatus("selected")}>{i18n.inbox.select}</button>
                <button class="b3-button b3-button--small" disabled={!checked.length} onclick={() => applyStatus("dismissed")}>{i18n.inbox.dismiss}</button>
            {:else if filter === "staged"}
                <button class="b3-button b3-button--small" disabled={!checked.length} onclick={() => applyStatus("selected")}>{i18n.inbox.select}</button>
                <button class="b3-button b3-button--small" disabled={!checked.length} onclick={() => applyStatus("dismissed")}>{i18n.inbox.dismiss}</button>
                <button class="b3-button b3-button--small" disabled={!checked.length} onclick={() => applyStatus("inbox")}>{i18n.inbox.back}</button>
            {:else if filter === "selected"}
                <button class="b3-button b3-button--small" disabled={!checked.length || making} onclick={sendToCards}>{i18n.inbox.sendToCards}</button>
                <button class="b3-button b3-button--small" disabled={!checked.length} onclick={undo}>{i18n.inbox.undoSelection}</button>
            {:else}
                <button class="b3-button b3-button--small" disabled={!checked.length} onclick={() => applyStatus("inbox")}>{i18n.inbox.restore}</button>
                <button class="b3-button b3-button--small" disabled={!checked.length} onclick={removeChecked}>{i18n.inbox.remove}</button>
            {/if}
            {#if notice}
                <span class="lv-inbox-notice">{notice}</span>
            {/if}
            <span style="flex: 1"></span>
            <button class="b3-button b3-button--text" onclick={refresh}>{i18n.inbox.refresh}</button>
        </div>
        <div class="lv-inbox-list">
            {#each visible as item (item.blockID)}
                <div class="lv-card2 lv-inbox-row">
                    <input
                        type="checkbox"
                        checked={checked.includes(item.blockID)}
                        onchange={() => toggle(item.blockID)}
                    />
                    <span class="lv-inbox-title">{titleOf(item)}</span>
                    <span class="lv-inbox-date">{new Date(item.addedAt).toLocaleDateString()}</span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .lv-inbox-page {
        height: 100%;
        overflow: auto;
        padding: var(--lv-sp-3) var(--lv-sp-5) var(--lv-sp-5);
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-3);
    }
    .lv-inbox-bar {
        flex: none;
    }
    .lv-inbox-empty {
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        text-align: center;
        padding: var(--lv-sp-6) var(--lv-sp-4);
    }
    .lv-inbox-actions {
        display: flex;
        gap: var(--lv-sp-2);
        align-items: center;
        padding: var(--lv-sp-2) var(--lv-sp-3);
        flex-wrap: wrap;
    }
    .lv-inbox-notice {
        color: var(--b3-theme-primary);
        font-size: 12px;
    }
    .lv-inbox-list {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
    }
    .lv-inbox-row {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
        padding: var(--lv-sp-2) var(--lv-sp-3);
    }
    .lv-inbox-title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
    }
    .lv-inbox-date {
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        flex: none;
    }
</style>
