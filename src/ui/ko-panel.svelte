<script lang="ts">
    /** BK-1 知识对象面板（Kit 级，props 注入可测）：核心事实 + 实例清单（停用/移除/派生）+ 事实修订（改事实→受影响实例清单在上方可见→确认保存）。
     *  数据与持久化由宿主注入；派生为异步（宿主查 riff 卡 ID），deriving=true 期间禁用按钮。 */
    import { CARD_CATALOG } from "@/core/card-catalog";

    let { fact, instances, deriving = false, t, ontoggle, onremove, onderive, onrevise }: {
        fact: string;
        instances: { cardID: string; cardType: string; capability: string | null; disabled: boolean }[];
        deriving?: boolean;
        t: any;
        ontoggle: (cardID: string, disabled: boolean) => void | Promise<void>;
        onremove: (cardID: string) => void | Promise<void>;
        onderive: (cardType: string) => void | Promise<void>;
        /** BK-1 验收：核心事实修订（宿主落盘后刷新快照） */
        onrevise?: (newFact: string) => void;
    } = $props();

    let deriveType = $state("qa");
    let revising = $state(false);
    let reviseDraft = $state("");
    let deriveError = $state("");
    let actionError = $state("");
    let actionBusy = $state<string | null>(null);
    let retryAction = $state<(() => Promise<void>) | null>(null);

    function startRevise() {
        reviseDraft = fact;
        revising = true;
    }

    function saveRevise() {
        const next = reviseDraft.trim();
        if (next && next !== fact) {
            onrevise?.(next);
        }
        revising = false;
    }

    async function deriveSelected() {
        if (deriving) return;
        deriveError = "";
        try {
            await onderive(deriveType);
        } catch (error) {
            deriveError = error instanceof Error && error.message
                ? error.message
                : (t.review.ko.deriveFailed ?? "派生失败，请重试。卡片数据未更改。");
            // 失败时保留当前实例快照，按钮切回可重试态；宿主负责原子持久化。
        }
    }

    async function runAction(key: string, action: () => Promise<void>) {
        if (actionBusy) return;
        actionError = "";
        actionBusy = key;
        try {
            await action();
            retryAction = null;
        } catch (error) {
            actionError = error instanceof Error && error.message ? error.message : (t.review.ko.actionFailed ?? "保存失败，请重试。");
            retryAction = action;
        } finally {
            actionBusy = null;
        }
    }

    function toggleInstance(cardID: string, disabled: boolean) {
        void runAction(cardID, () => Promise.resolve(ontoggle(cardID, disabled)));
    }

    async function removeInstance(cardID: string) {
        if (actionBusy) return;
        const message = t.review.ko.removeInstanceConfirm ?? "确定移除此卡片实例？只会移除知识对象关联，不会删除卡片。";
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(message)) return;
        await runAction(cardID, () => Promise.resolve(onremove(cardID)));
    }

    $effect(() => {
        // 已有实例的卡型从派生下拉中排除（同一卡型同一对象至多一张实例）
        const used = new Set(instances.map(i => i.cardType));
        if (used.has(deriveType)) {
            const free = CARD_CATALOG.map(c => c.id).find(id => !used.has(id));
            if (free) deriveType = free;
        }
    });

    const typeName = (id: string) => {
        const cap = CARD_CATALOG.find(c => c.id === id);
        return t.ko?.[`type_${id.replace(/-/g, "_")}`] ?? cap?.nameKey ?? id;
    };
</script>

<div class="lv-ko">
    <div class="lv-ko-title">{t.review.ko.title}</div>
    {#if revising}
        <!-- BK-1 验收：修订模式下实例清单仍可见——受影响实例一目了然 -->
        <div class="lv-ko-revise">
            <textarea
                class="b3-text-field fn__block"
                rows="3"
                bind:value={reviseDraft}
                aria-label={t.review.ko.reviseLabel}
            ></textarea>
            <div class="fn__flex" style="gap: var(--lv-sp-2); margin-top: var(--lv-sp-2)">
                <button class="b3-button b3-button--text lv-btn-primary" onclick={saveRevise}>{t.review.ko.saveRevise}</button>
                <button class="b3-button b3-button--text" onclick={() => (revising = false)}>{t.review.ko.cancelRevise}</button>
            </div>
        </div>
    {:else}
        <div class="lv-ko-fact">
            {fact}
            {#if onrevise}
                <button class="b3-button b3-button--small lv-ko-revise-btn" onclick={startRevise}>{t.review.ko.revise}</button>
            {/if}
        </div>
    {/if}

    <div class="lv-ko-sub">{t.review.ko.instancesTitle}</div>
    {#if instances.length === 0}
        <div class="lv-ko-empty">{t.review.ko.emptyInstances}</div>
    {:else}
        {#each instances as inst (inst.cardID)}
            <div class="lv-ko-row" class:lv-ko-row-disabled={inst.disabled}>
                <input
                    type="checkbox"
                    class="b3-switch"
                    checked={!inst.disabled}
                    title={t.review.ko.toggleTitle}
                    aria-label={`${t.review.ko.toggleTitle}: ${inst.cardID}`}
                    disabled={actionBusy !== null}
                    onchange={() => void toggleInstance(inst.cardID, !inst.disabled)}
                />
                <span class="lv-ko-type b3-chip">{typeName(inst.cardType)}</span>
                {#if inst.capability}<span class="ft__smaller ft__on-surface">{inst.capability}</span>{/if}
                <span class="fn__flex-1 lv-ko-id ft__smaller ft__on-surface">{inst.cardID}</span>
                <button
                    class="b3-button b3-button--small"
                    title={t.review.ko.remove}
                    aria-label={t.review.ko.remove}
                    disabled={actionBusy !== null}
                    aria-busy={actionBusy === inst.cardID}
                    onclick={() => void removeInstance(inst.cardID)}
                >{actionBusy === inst.cardID ? "…" : "✕"}</button>
            </div>
        {/each}
    {/if}

    {#if deriveError}<div class="lv-ko-derive-error" role="alert">{deriveError}</div>{/if}
    {#if actionError}
        <div class="lv-ko-derive-error" role="alert">{actionError}
            {#if retryAction}<button class="b3-button b3-button--text" disabled={actionBusy !== null} onclick={() => retryAction && void runAction(actionBusy ?? "retry", retryAction)}>{t.review.ko.retryAction ?? "重试"}</button>{/if}
        </div>
    {/if}
    <div class="lv-ko-derive">
        <select class="b3-select" aria-label={t.review.ko.deriveLabel} bind:value={deriveType}>
            {#each CARD_CATALOG.filter(c => !instances.some(i => i.cardType === c.id)) as c (c.id)}
                <option value={c.id}>{typeName(c.id)}</option>
            {/each}
        </select>
        <button class="b3-button b3-button--text" disabled={deriving} aria-busy={deriving} onclick={deriveSelected}>
            {deriving ? t.review.ko.deriving : deriveError ? (t.review.ko.retryDerive ?? "重试派生") : t.review.ko.derive}
        </button>
    </div>
</div>

<style>
    .lv-ko { font-size: var(--lv-type-body-size); }
    .lv-ko-title { font-weight: var(--lv-fw-medium); margin-bottom: var(--lv-sp-2); }
    .lv-ko-fact {
        padding: var(--lv-sp-2);
        border-left: 3px solid var(--lv-color-brand);
        background: var(--lv-color-surface);
        border-radius: var(--b3-border-radius);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-ko-sub { color: var(--lv-color-text-muted); margin-bottom: var(--lv-sp-1); }
    .lv-ko-empty { color: var(--lv-color-text-muted); opacity: .7; padding: var(--lv-sp-1) 0; }
    .lv-ko-row {
        display: flex; align-items: center; gap: var(--lv-sp-2);
        padding: var(--lv-sp-1) 0;
        border-bottom: 1px dashed var(--b3-border-color);
    }
    .lv-ko-row-disabled { opacity: .5; }
    .lv-ko-id { font-family: var(--b3-font-family-code, monospace); font-size: 12px; word-break: break-all; }
    .lv-ko-derive { display: flex; gap: var(--lv-sp-2); margin-top: var(--lv-sp-2); align-items: center; }
    .lv-ko-derive-error { margin-top: var(--lv-sp-2); color: var(--lv-color-danger); font-size: var(--lv-type-control-size); overflow-wrap: anywhere; }
    .lv-ko-revise-btn { margin-left: auto; opacity: .8; }
    .lv-ko-revise textarea { resize: vertical; }
</style>
