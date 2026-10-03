<script lang="ts">
    /** BK-1 知识对象面板（Kit 级，props 注入可测）：核心事实 + 实例清单（停用/移除/派生）。
     *  数据与持久化由宿主注入；派生为异步（宿主查 riff 卡 ID），deriving=true 期间禁用按钮。 */
    import { CARD_CATALOG } from "@/core/card-catalog";

    let { fact, instances, deriving = false, t, ontoggle, onremove, onderive }: {
        fact: string;
        instances: { cardID: string; cardType: string; capability: string | null; disabled: boolean }[];
        deriving?: boolean;
        t: any;
        ontoggle: (cardID: string, disabled: boolean) => void;
        onremove: (cardID: string) => void;
        onderive: (cardType: string) => void;
    } = $props();

    let deriveType = $state("qa");

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
    <div class="lv-ko-title">{t.ko.title}</div>
    <div class="lv-ko-fact">{fact}</div>

    <div class="lv-ko-sub">{t.ko.instancesTitle}</div>
    {#if instances.length === 0}
        <div class="lv-ko-empty">{t.ko.emptyInstances}</div>
    {:else}
        {#each instances as inst (inst.cardID)}
            <div class="lv-ko-row" class:lv-ko-row-disabled={inst.disabled}>
                <input
                    type="checkbox"
                    class="b3-switch"
                    checked={!inst.disabled}
                    title={t.ko.toggleTitle}
                    aria-label={`${t.ko.toggleTitle}: ${inst.cardID}`}
                    onchange={() => ontoggle(inst.cardID, !inst.disabled)}
                />
                <span class="lv-ko-type b3-chip">{typeName(inst.cardType)}</span>
                {#if inst.capability}<span class="ft__smaller ft__on-surface">{inst.capability}</span>{/if}
                <span class="fn__flex-1 lv-ko-id ft__smaller ft__on-surface">{inst.cardID}</span>
                <button
                    class="b3-button b3-button--small"
                    title={t.ko.remove}
                    aria-label={t.ko.remove}
                    onclick={() => onremove(inst.cardID)}
                >✕</button>
            </div>
        {/each}
    {/if}

    <div class="lv-ko-derive">
        <select class="b3-select" aria-label={t.ko.deriveLabel} bind:value={deriveType}>
            {#each CARD_CATALOG.filter(c => !instances.some(i => i.cardType === c.id)) as c (c.id)}
                <option value={c.id}>{typeName(c.id)}</option>
            {/each}
        </select>
        <button class="b3-button b3-button--text" disabled={deriving} onclick={() => onderive(deriveType)}>
            {deriving ? t.ko.deriving : t.ko.derive}
        </button>
    </div>
</div>

<style>
    .lv-ko { font-size: 13px; }
    .lv-ko-title { font-weight: 500; margin-bottom: var(--lv-sp-2); }
    .lv-ko-fact {
        padding: var(--lv-sp-2);
        border-left: 3px solid var(--b3-theme-primary);
        background: var(--b3-theme-surface);
        border-radius: var(--b3-border-radius);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-ko-sub { color: var(--b3-theme-on-surface); margin-bottom: var(--lv-sp-1); }
    .lv-ko-empty { color: var(--b3-theme-on-surface); opacity: .7; padding: var(--lv-sp-1) 0; }
    .lv-ko-row {
        display: flex; align-items: center; gap: var(--lv-sp-2);
        padding: var(--lv-sp-1) 0;
        border-bottom: 1px dashed var(--b3-border-color);
    }
    .lv-ko-row-disabled { opacity: .5; }
    .lv-ko-id { font-family: var(--b3-font-family-code, monospace); font-size: 12px; word-break: break-all; }
    .lv-ko-derive { display: flex; gap: var(--lv-sp-2); margin-top: var(--lv-sp-2); align-items: center; }
</style>
