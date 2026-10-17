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
        onadd: (from: string, to: string, type: string) => void | Promise<void>;
        onremove: (from: string, to: string, type: string) => void | Promise<void>;
    } = $props();

    let newTarget = $state("");
    let newType = $state("sibling");
    let formError = $state("");
    let actionError = $state("");
    let busy = $state(false);
    let retryAction = $state<(() => Promise<void>) | null>(null);

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

    const TYPE_TONES: Record<string, "brand" | "warn" | "danger" | "good" | "neutral"> = {
        prerequisite: "warn",
        counterexample: "danger",
        example: "good",
        application: "good",
        sibling: "brand",
        source: "neutral",
        alternative: "brand",
    };
    const typeTone = (type: string) => (TYPE_TONES[type] ?? "neutral");

    async function runAction(action: () => Promise<void>) {
        if (busy) return;
        actionError = "";
        busy = true;
        try {
            await action();
            retryAction = null;
        } catch (error) {
            actionError = error instanceof Error && error.message ? error.message : (t.relations.saveFailed ?? "保存关系失败，请重试。");
            retryAction = action;
        } finally {
            busy = false;
        }
    }

    function submit() {
        if (busy) return;
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
        const type = newType;
        void runAction(async () => {
            await onadd(entityId, target, type);
            newTarget = "";
        });
    }

    function remove(relation: { from: string; to: string; type: string }) {
        if (busy) return;
        const message = t.relations.removeConfirm ?? "确定删除这条关系？此操作不可撤销。";
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(message)) return;
        void runAction(() => Promise.resolve(onremove(relation.from, relation.to, relation.type)));
    }
</script>

<div class="lv-relations">
    <div class="lv-relations-title">{t.relations.title}</div>

    {#if relations.length === 0}
        <div class="lv-relations-empty">{t.relations.empty}</div>
    {:else}
        {#each relations as { relation, direction } (relation.from + relation.to + relation.type)}
            <div class="lv-relations-row">
                <span class={`lv-relations-type b3-chip lv-rel-tag lv-rel-tag--${typeTone(relation.type)}`}>
                    {typeName(relation.type)}
                </span>
                <span class="lv-relations-dir ft__smaller ft__on-surface" class:lv-dir-out={direction === "outgoing"} class:lv-dir-in={direction === "incoming"}>
                    {direction === "outgoing" ? "→" : "←"}
                </span>
                <span class="fn__flex-1 lv-relations-target">
                    {direction === "outgoing" ? relation.to : relation.from}
                </span>
                <button
                    class="b3-button b3-button--small lv-btn-ghost lv-relations-del"
                    title={t.relations.remove}
                    aria-label={t.relations.remove}
                    disabled={busy}
                    aria-busy={busy}
                    onclick={() => remove(relation)}
                >{busy ? "…" : "✕"}</button>
            </div>
        {/each}
    {/if}

    <div class="lv-relations-add">
        {#if formError}<LvError message={formError} />{/if}
        {#if actionError}
            <div role="alert"><LvError message={actionError} />
                {#if retryAction}<button class="b3-button b3-button--text" disabled={busy} onclick={() => retryAction && void runAction(retryAction)}>{t.relations.retry ?? "重试"}</button>{/if}
            </div>
        {/if}
        <div class="fn__flex" style="gap: var(--lv-sp-2)">
            <input
                class="b3-text-field fn__flex-1"
                placeholder={t.relations.targetPlaceholder}
                aria-label={t.relations.targetPlaceholder}
                bind:value={newTarget}
                disabled={busy}
                onkeydown={(e) => { if (e.key === "Enter") { submit(); } }}
            />
            <select
                class="b3-select"
                aria-label={t.relations.typeLabel}
                value={newType}
                disabled={busy}
                onchange={(e) => (newType = (e.target as HTMLSelectElement).value)}
            >
                {#each Object.keys(TYPE_KEYS) as type}
                    <option value={type}>{typeName(type)}</option>
                {/each}
            </select>
            <button class="b3-button lv-btn-primary" disabled={busy} aria-busy={busy} onclick={submit}>{busy ? (t.relations.saving ?? "保存中…") : t.relations.add}</button>
        </div>
    </div>
</div>

<style>
    .lv-relations { font-size: var(--lv-type-body-size); }
    .lv-relations-title { font-weight: var(--lv-fw-heading); margin-bottom: var(--lv-sp-2); font-size: var(--lv-type-label-size); }
    .lv-relations-empty { color: var(--lv-color-text-muted); opacity: .7; padding: var(--lv-sp-2) 0; }
    .lv-relations-row {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        padding: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 3);
        margin-bottom: var(--lv-sp-1);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
        transition: transform var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);

        &:hover {
            transform: translateY(-1px);
            border-color: var(--lv-border-strong);
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
        }
    }
    .lv-rel-tag {
        font-weight: var(--lv-fw-semibold);
        font-size: var(--lv-type-caption-size);
        border-radius: var(--lv-r-tag);
        padding: var(--lv-space-hairline) calc(var(--lv-space-unit) * 3);
    }
    .lv-rel-tag--brand { background: var(--lv-primary-soft); color: var(--lv-color-brand); }
    .lv-rel-tag--warn { background: var(--lv-warn-soft); color: var(--lv-color-warning); }
    .lv-rel-tag--good { background: var(--lv-good-soft); color: var(--lv-color-success); }
    .lv-rel-tag--danger { background: var(--lv-danger-soft); color: var(--lv-color-danger); }
    .lv-rel-tag--neutral { background: color-mix(in srgb, var(--lv-color-text) 8%, transparent); color: var(--lv-color-text-muted); }

    .lv-relations-dir {
        font-weight: var(--lv-fw-bold);
        font-size: 13px;
        &.lv-dir-out { color: var(--lv-color-brand); }
        &.lv-dir-in { color: var(--lv-color-warning); }
    }
    .lv-relations-target {
        font-family: var(--b3-font-family-code, monospace);
        font-size: var(--lv-type-control-size);
        word-break: break-all;
        color: var(--lv-color-text);
    }
    .lv-relations-del {
        padding: 0 calc(var(--lv-space-unit) * 2);
        opacity: 0.7;
        &:hover { opacity: 1; }
    }
    .lv-relations-add { margin-top: var(--lv-sp-3); }
</style>
