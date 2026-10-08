<script lang="ts">
    /** 标记符制卡预览（M2·FR4）：勾选扫描结果 → 确认制卡（:: 问答新建块，？整块直加） */
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
</script>

<div class="lv-marker b3-typography">
    <div class="lv-marker-hint">{t.markerHint.replace("${n}", String(items.length))}</div>
    {#if errorMsg}<div class="lv-marker-error" role="alert">{errorMsg}</div>{/if}
    <div class="lv-marker-list">
        {#each items as it (it.blockID)}
            <label class="lv-marker-item">
                <input type="checkbox" checked={picked.has(it.blockID)} onchange={() => toggle(it.blockID)} />
                <span class="b3-chip b3-chip--secondary lv-marker-kind">{it.kind === "qa" ? t.markerKindQa : t.markerKindWhole}</span>
                <span class="lv-marker-text" title={it.kind === "qa" ? `${it.front} :: ${it.back}` : it.front}>
                    {it.kind === "qa" ? `${it.front} → ${it.back}` : it.front}
                </span>
            </label>
        {/each}
    </div>
    <div class="fn__flex lv-marker-actions">
        <span class="fn__flex-1"></span>
        <button class="b3-button b3-button--cancel" onclick={onClose}>{t.markerCancel}</button>
        <button class="b3-button b3-button--text" disabled={picked.size === 0 || busy} onclick={confirm}>
            {t.markerConfirm.replace("${n}", String(picked.size))}
        </button>
    </div>
</div>

<style>
    .lv-marker-hint {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-marker-error {
        margin-bottom: var(--lv-sp-2);
        color: var(--b3-theme-error);
        font-size: 12px;
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
        padding: var(--lv-sp-2);
        border-bottom: 1px dashed var(--lv-border);
        cursor: pointer;
    }
    .lv-marker-item:last-child { border-bottom: none; }
    .lv-marker-kind { flex-shrink: 0; }
    .lv-marker-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
    }
    .lv-marker-actions { margin-top: var(--lv-sp-3); gap: var(--lv-sp-2); }
</style>
