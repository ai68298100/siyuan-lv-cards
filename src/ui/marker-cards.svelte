<script lang="ts">
    /** 标记符制卡预览（M2·FR4）：勾选扫描结果 → 确认制卡（:: 问答新建块，？整块直加） */
    import LvKbd from "./kit/LvKbd.svelte";

    export interface MarkerItem {
        blockID: string;
        kind: "qa" | "whole";
        front: string;
        back: string;
    }

    let { i18n, items, onCreate, onClose }: {
        i18n: any;
        items: MarkerItem[];
        onCreate: (picked: MarkerItem[]) => Promise<void>;
        onClose: () => void;
    } = $props();
    const t = $derived(i18n);

    // 初值语义：扫描结果一次性传入，默认全选后由用户勾选
    // svelte-ignore state_referenced_locally
    let picked = $state<Set<string>>(new Set(items.map(i => i.blockID)));
    let busy = $state(false);
    let errorMsg = $state("");

    function toggle(id: string) {
        const next = new Set(picked);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        picked = next;
    }

    async function confirm() {
        const list = items.filter(i => picked.has(i.blockID));
        if (list.length === 0 || busy) {
            return;
        }
        busy = true;
        errorMsg = "";
        try {
            await onCreate(list);
            onClose();
        } catch (e) {
            errorMsg = e instanceof Error ? e.message : String(e);
        } finally {
            busy = false;
        }
    }

    const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");
    const allPicked = $derived(items.length > 0 && items.every(i => picked.has(i.blockID)));

    function toggleAll() {
        if (allPicked) {
            picked = new Set();
        } else {
            picked = new Set(items.map(i => i.blockID));
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (busy) return;
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            if (picked.size > 0) {
                e.preventDefault();
                void confirm();
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="lv-marker b3-typography">
    <div class="lv-marker-header">
        <div class="lv-marker-hint">{t.markerHint.replace("${n}", String(items.length))}</div>
        {#if items.length > 0}
            <button type="button" class="b3-button b3-button--small lv-btn-ghost" onclick={toggleAll}>
                {allPicked ? (t.unselectAll ?? "取消全选") : (t.selectAll ?? "全选")}
            </button>
        {/if}
    </div>
    {#if errorMsg}<div class="lv-marker-error" role="alert">{errorMsg}</div>{/if}
    {#if items.length === 0}
        <div class="lv-marker-empty lv-card2" role="status">
            <div class="lv-marker-empty-icon" aria-hidden="true">✦</div>
            <div>{t.markerEmpty ?? "当前文档没有找到可制卡的标记内容"}</div>
            <div class="ft__smaller ft__on-surface">{t.markerEmptyHint ?? "请先添加 :: 问答或？整块标记，再重新扫描。"}</div>
            <button class="b3-button b3-button--outline" onclick={onClose}>{t.markerCancel}</button>
        </div>
    {:else}
    <div class="lv-marker-list">
        {#each items as it (it.blockID)}
            <label class="lv-marker-item" class:lv-marker-item--checked={picked.has(it.blockID)}>
                <input type="checkbox" class="lv-check" checked={picked.has(it.blockID)} onchange={() => toggle(it.blockID)} />
                <span class="b3-chip b3-chip--secondary lv-marker-kind">{it.kind === "qa" ? t.markerKindQa : t.markerKindWhole}</span>
                <span class="lv-marker-text" title={it.kind === "qa" ? `${it.front} :: ${it.back}` : it.front}>
                    {it.kind === "qa" ? `${it.front} → ${it.back}` : it.front}
                </span>
            </label>
        {/each}
    </div>
    {/if}
    <div class="fn__flex lv-marker-actions">
        <span class="fn__flex-1"></span>
        <button class="b3-button b3-button--cancel" onclick={onClose}>{t.markerCancel}</button>
        <button class="b3-button lv-btn-primary" disabled={picked.size === 0 || busy} aria-busy={busy} onclick={confirm}>
            {busy ? (t.markerSaving ?? "正在制卡…") : t.markerConfirm.replace("${n}", String(picked.size))} <LvKbd k={isMac ? "⌘ ↵" : "Ctrl ↵"} />
        </button>
    </div>
</div>

<style>
    .lv-marker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-marker-hint {
        font-size: var(--lv-type-control-size);
        color: var(--lv-color-text-muted);
        margin: 0;
    }
    .lv-marker-error {
        margin-bottom: var(--lv-sp-2);
        color: var(--lv-color-danger);
        font-size: var(--lv-type-control-size);
    }
    .lv-marker-list {
        max-height: 46vh;
        overflow: auto;
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        padding: var(--lv-sp-2);
    }
    .lv-marker-item {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        border-radius: var(--lv-r-s);
        border-bottom: 1px dashed var(--lv-border);
        cursor: pointer;
        transition: background var(--lv-dur-1) var(--lv-ease);
    }
    .lv-marker-item:hover {
        background: var(--lv-surface-hover);
    }
    .lv-marker-item--checked {
        background: color-mix(in srgb, var(--lv-primary-soft) 40%, var(--lv-color-surface));
    }
    .lv-marker-item:last-child { border-bottom: none; }
    .lv-marker-kind { flex-shrink: 0; }
    .lv-marker-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--lv-type-body-size);
    }
    .lv-marker-actions { margin-top: var(--lv-sp-3); gap: var(--lv-sp-2); }
    .lv-marker-empty {
        display: flex; flex-direction: column; align-items: center; gap: var(--lv-sp-2);
        padding: var(--lv-sp-5); text-align: center; color: var(--lv-color-text-muted);
    }
    .lv-marker-empty-icon {
        width: 44px; height: 44px; border-radius: var(--lv-r-circle); display: flex; align-items: center;
        justify-content: center; background: var(--lv-primary-soft); color: var(--lv-color-brand); font-size: 18px;
    }
</style>
