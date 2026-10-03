<script lang="ts">
    /** BK-2 关系面板（Kit 级，props 注入可测）：查看/新建/删除某实体的语义关联。
     *  数据与持久化全部由宿主注入（onadd/onremove 回调），本组件零 siyuan 依赖。 */
    import LvError from "./kit/LvError.svelte";

    let { entityId, relations, t, onadd, onremove }: {
        /** 当前实体 id（块 ID） */
        entityId: string;
        /** 该实体的全部关系（宿主预过滤，双向） */
        relations: { relation: { from: string; to: string; type: string; createdAt: number }; direction: "outgoing" | "incoming" }[];
        t: any;
        onadd: (from: string, to: string, type: string) => void;
        onremove: (from: string, to: string, type: string) => void;
    } = $props();

    let newTarget = $state("");
    let newType = $state("sibling");
    let formError = $state("");

    const TYPE_KEYS: Record<string, string> = {
        sibling: "relSibling",
        prerequisite: "relPrerequisite",
        example: "relExample",
        counterexample: "relCounterexample",
        source: "relSource",
        application: "relApplication",
        alternative: "relAlternative",
    };
    const typeName = (type: string) => (t.relations?.[TYPE_KEYS[type]] ?? type);

    function submit() {
        const target = newTarget.trim();
        formError = "";
        if (!target) {
            formError = t.relations.errTargetRequired;
            return;
        }
        if (target === entityId) {
            formError = t.relations.errSelfRelation;
            return;
        }
        onadd(entityId, target, newType);
        newTarget = "";
    }
</script>

<div class="lv-relations">
    <div class="lv-relations-title">{t.relations.title}</div>

    {#if relations.length === 0}
        <div class="lv-relations-empty">{t.relations.empty}</div>
    {:else}
        {#each relations as { relation, direction } (relation.from + relation.to + relation.type)}
            <div class="lv-relations-row">
                <span class="lv-relations-type b3-chip">{typeName(relation.type)}</span>
                <span class="lv-relations-dir ft__smaller ft__on-surface">
                    {direction === "outgoing" ? "→" : "←"}
                </span>
                <span class="fn__flex-1 lv-relations-target">
                    {direction === "outgoing" ? relation.to : relation.from}
                </span>
                <button
                    class="b3-button b3-button--small"
                    title={t.relations.remove}
                    aria-label={t.relations.remove}
                    onclick={() => onremove(relation.from, relation.to, relation.type)}
                >✕</button>
            </div>
        {/each}
    {/if}

    <div class="lv-relations-add">
        {#if formError}<LvError message={formError} />{/if}
        <div class="fn__flex" style="gap: var(--lv-sp-2)">
            <input
                class="b3-text-field fn__flex-1"
                placeholder={t.relations.targetPlaceholder}
                aria-label={t.relations.targetPlaceholder}
                bind:value={newTarget}
                onkeydown={(e) => { if (e.key === "Enter") { submit(); } }}
            />
            <select
                class="b3-select"
                aria-label={t.relations.typeLabel}
                value={newType}
                onchange={(e) => (newType = (e.target as HTMLSelectElement).value)}
            >
                {#each Object.keys(TYPE_KEYS) as type}
                    <option value={type}>{typeName(type)}</option>
                {/each}
            </select>
            <button class="b3-button b3-button--text" onclick={submit}>{t.relations.add}</button>
        </div>
    </div>
</div>

<style>
    .lv-relations { font-size: 13px; }
    .lv-relations-title { font-weight: 500; margin-bottom: var(--lv-sp-2); }
    .lv-relations-empty { color: var(--b3-theme-on-surface); opacity: .7; padding: var(--lv-sp-2) 0; }
    .lv-relations-row {
        display: flex; align-items: center; gap: var(--lv-sp-2);
        padding: var(--lv-sp-1) 0;
        border-bottom: 1px dashed var(--b3-border-color);
    }
    .lv-relations-target { font-family: var(--b3-font-family-code, monospace); font-size: 12px; word-break: break-all; }
    .lv-relations-add { margin-top: var(--lv-sp-2); }
</style>
