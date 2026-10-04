<script lang="ts">
    import { onMount } from "svelte";
    import { getBlockDOM } from "@/api/siyuan";
    import type { SearchBlock } from "@/api/riff";
    import LvDrawer from "./kit/LvDrawer.svelte";
    import RelationsPanel from "./relations-panel.svelte";
    import KoPanel from "./ko-panel.svelte";
    import LifecyclePanel from "./lifecycle-panel.svelte";
    import CardEditor from "./card-editor.svelte";
    import type { LcSnapshot } from "./lifecycle-panel.svelte";
    import type { ContentState } from "@/core/content-lifecycle";
    import type { NextAction } from "@/core/next-action";

    let { block, t, onOpenDoc, onClose, relationsCtx, koCtx, lcCtx, editorCtx }: {
        block: SearchBlock;
        t: any;
        onOpenDoc: () => void;
        onClose: () => void;
        /** BI-5/6/7：内容状态面板数据与操作（宿主注入；缺省=不显示内容状态区） */
        lcCtx?: {
            snapshot: LcSnapshot | null;
            onopen: () => void;
            ontransition: (to: ContentState, reason: string) => boolean;
            onaction: (action: NextAction) => void;
        };
        /** BK-2：关系面板数据与持久化回调（宿主注入；缺省=不显示关系区） */
        relationsCtx?: {
            relations: { relation: { from: string; to: string; type: string; createdAt: number }; direction: "outgoing" | "incoming" }[];
            onadd: (from: string, to: string, type: string) => void;
            onremove: (from: string, to: string, type: string) => void;
        };
        /** BK-1：知识对象面板数据与操作回调（宿主注入；缺省=不显示知识对象区） */
        koCtx?: {
            snapshot: { registered: boolean; fact: string; instances: { cardID: string; cardType: string; capability: string | null; disabled: boolean }[] };
            deriving: boolean;
            onregister: () => void;
            ontoggle: (cardID: string, disabled: boolean) => void;
            onremove: (cardID: string) => void;
            onderive: (cardType: string) => void;
        };
        /** BX-2 W2：卡片内容编辑（宿主注入；缺省=不显示编辑入口） */
        editorCtx?: {
            load: () => Promise<string | null>;
            save: (md: string) => Promise<boolean>;
        };
    } = $props();

    let html = $state("");
    let loadSeq = 0;
    // BX-2 W2：编辑态（原文加载成功才进入；保存成功回读预览）
    let editing = $state(false);
    let editorMd = $state("");
    let editorLoadFail = $state(false);

    onMount(async () => {
        const seq = ++loadSeq;
        try {
            // AQ-20：统一内核响应校验，失败回退块文本预览
            const dom = await getBlockDOM(block.id);
            if (seq === loadSeq) {
                html = dom;
            }
        } catch {
            if (seq === loadSeq) {
                html = "";
            }
        }
    });

    async function startEdit() {
        if (!editorCtx) return;
        const md = await editorCtx.load();
        if (md === null) {
            editorLoadFail = true;
            return;
        }
        editorLoadFail = false;
        editorMd = md;
        editing = true;
    }

    async function saveEdit(md: string): Promise<boolean> {
        if (!editorCtx) return false;
        const ok = await editorCtx.save(md);
        if (ok) {
            editing = false;
            // 写回成功后刷新预览（失败保留旧卡面）
            try {
                html = await getBlockDOM(block.id);
            } catch { /* 预览刷新失败不阻塞 */ }
        }
        return ok;
    }
</script>

<LvDrawer open title={t.manager.detailTitle} width="min(560px, 92vw)" onclose={onClose}>
    {#snippet actions()}
        {#if editorCtx && !editing}
            <button class="b3-button b3-button--small" onclick={startEdit}>{t.editor.edit}</button>
        {/if}
        <button class="b3-button b3-button--small" onclick={onOpenDoc}>{t.manager.openDoc}</button>
    {/snippet}
    <div class="lv-detail-preview">{@html html || (block.content ?? "")}</div>
    <div class="lv-detail-meta ft__smaller ft__on-surface">
        <div>{t.manager.detailBlockId}: {block.id}</div>
        {#if block.hPath}<div>{block.hPath}</div>{/if}
    </div>
    {#if editing}
        <CardEditor t={t} original={editorMd} onsave={saveEdit} oncancel={() => (editing = false)} />
    {:else if editorLoadFail}
        <div class="ft__smaller ft__on-surface">{t.editor.loadFail}</div>
    {/if}
    {#if lcCtx}
        <LifecyclePanel
            t={t}
            snapshot={lcCtx.snapshot}
            onopen={lcCtx.onopen}
            ontransition={lcCtx.ontransition}
            onaction={lcCtx.onaction}
        />
    {/if}
    {#if koCtx}
        {#if koCtx.snapshot.registered}
            <KoPanel
                fact={koCtx.snapshot.fact}
                instances={koCtx.snapshot.instances}
                deriving={koCtx.deriving}
                t={t}
                ontoggle={koCtx.ontoggle}
                onremove={koCtx.onremove}
                onderive={koCtx.onderive}
            />
        {:else}
            <button class="b3-button b3-button--text" onclick={koCtx.onregister}>
                {t.ko.register}
            </button>
        {/if}
    {/if}
    {#if relationsCtx}
        <RelationsPanel
            entityId={block.id}
            relations={relationsCtx.relations}
            t={t}
            onadd={relationsCtx.onadd}
            onremove={relationsCtx.onremove}
        />
    {/if}
</LvDrawer>

<style>
    .lv-detail-preview { margin-bottom: var(--lv-sp-4); }
    .lv-detail-meta div { padding: 2px 0; }
</style>
