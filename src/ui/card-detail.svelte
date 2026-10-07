<script lang="ts">
    import { onMount } from "svelte";
    import { getBlockDOM } from "@/api/siyuan";
    import { diffLines, type DiffRow } from "@/core/line-diff";
    import type { SearchBlock } from "@/api/riff";
    import LvDrawer from "./kit/LvDrawer.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import RelationsPanel from "./relations-panel.svelte";
    import KoPanel from "./ko-panel.svelte";
    import LifecyclePanel from "./lifecycle-panel.svelte";
    import CardEditor from "./card-editor.svelte";
    import type { LcSnapshot } from "./lifecycle-panel.svelte";
    import type { ContentState } from "@/core/content-lifecycle";
    import type { NextAction } from "@/core/next-action";

    let { block, t, onOpenDoc, onClose, relationsCtx, koCtx, lcCtx, editorCtx, historyEntries = [], issues = [], versions = [], acceptVersion }: {
        block: SearchBlock;
        t: any;
        onOpenDoc: () => void;
        onClose: () => void;
        /** T05 分面（docs/40）：块学习记录与关联疑问（可选——旧宿主不传则分面显示空态） */
        historyEntries?: { rating: number; ts: number; dur: number | null }[];
        issues?: { addedAt: number; status: string }[];
        /** T05 内容版本快照（最新在前；可选——旧宿主不传则不显示版本） */
        versions?: { md: string; at: number; via: "editor" | "ai"; accepted?: boolean }[];
        /** T05：用户核对确认某版本（可选） */
        acceptVersion?: (at: number) => void;
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
    // T05 内容版本（docs/40）：历史列表折叠 + 单版本展开 + 对比当前（逐行 diff）
    let versionsOpen = $state(false);
    let verOpenAt = $state<number | null>(null);
    let diffAt = $state<number | null>(null);
    let diffRows = $state<DiffRow[]>([]);
    let diffBusy = $state(false);
    async function compareWithCurrent(at: number, versionMd: string) {
        if (diffBusy) return;
        if (diffAt === at) { diffAt = null; return; }
        if (!editorCtx) return;
        diffBusy = true;
        try {
            const cur = await editorCtx.load();
            diffRows = diffLines(versionMd, cur ?? "");
            diffAt = at;
        } finally {
            diffBusy = false;
        }
    }
    // 切换块时重置折叠/对比状态
    $effect(() => {
        void block.id;
        versionsOpen = false;
        verOpenAt = null;
        diffAt = null;
    });
    // T05 分面（docs/40）：内容/来源/学习记录/问题
    type Facet = "content" | "source" | "history" | "issues";
    let facet = $state<Facet>("content");
    const facetTabs = $derived([
        { id: "content" as Facet, label: t.detail.facetContent },
        { id: "source" as Facet, label: t.detail.facetSource },
        { id: "history" as Facet, label: t.detail.facetHistory },
        { id: "issues" as Facet, label: t.detail.facetIssues },
    ]);
    function onFacetKeydown(e: KeyboardEvent) {
        const focused = (e.target as HTMLElement | null)?.closest<HTMLElement>("[role=tab]");
        const focusedId = focused?.id.startsWith("lv-facet-tab-") ? focused.id.slice("lv-facet-tab-".length) : "";
        const idx = facetTabs.findIndex((f) => f.id === (focusedId || facet));
        if (idx < 0) return;
        let next: number | null = null;
        if (e.key === "ArrowRight") next = (idx + 1) % facetTabs.length;
        else if (e.key === "ArrowLeft") next = (idx - 1 + facetTabs.length) % facetTabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = facetTabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        facet = facetTabs[next].id;
        document.getElementById(`lv-facet-tab-${facetTabs[next].id}`)?.focus();
    }
    const ratingLabel = (r: number) => (r === 1 ? t.review.unknown : r === 2 ? t.review.vague : r === 3 ? t.review.know : r === 4 ? t.review.easy : "—");
    const histSummary = $derived.by(() => {
        const reviews = historyEntries.filter((e) => e.rating > 0);
        const forgets = historyEntries.filter((e) => e.rating === 1).length;
        const last = reviews.reduce((m, e) => Math.max(m, e.ts), 0);
        return { reviews: reviews.length, forgets, last };
    });
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

<LvDrawer open title={t.manager.detailTitle} closeLabel={t.manager.close} width="min(560px, 92vw)" onclose={onClose}>
    {#snippet actions()}
        {#if editorCtx && !editing}
            <button class="b3-button b3-button--small" onclick={startEdit}>{t.editor.edit}</button>
        {/if}
        <button class="b3-button b3-button--small" onclick={onOpenDoc}>{t.manager.openDoc}</button>
    {/snippet}
    <!-- T05 分面导航（docs/40）：内容 / 来源 / 学习记录 / 问题 -->
    <div class="lv-facets" role="tablist" aria-orientation="horizontal" tabindex="-1" onkeydown={onFacetKeydown}>
        {#each facetTabs as f, i (f.id)}
            <button
                type="button"
                class="lv-facet"
                role="tab"
                id={`lv-facet-tab-${f.id}`}
                aria-selected={facet === f.id}
                aria-controls="lv-facet-panel"
                tabindex={facet === f.id || (i === 0 && !facetTabs.some((tab) => tab.id === facet)) ? 0 : -1}
                class:lv-facet-active={facet === f.id}
                onclick={() => (facet = f.id)}
            >{f.label}</button>
        {/each}
    </div>
    <div
        id="lv-facet-panel"
        class="lv-facet-panel"
        role="tabpanel"
        aria-labelledby={`lv-facet-tab-${facet}`}
        tabindex="0"
    >
    {#if facet === "content"}
        <!-- T05 内容版本（docs/40）：保存即留快照；可展开回看历史内容 -->
        {#if versions.length > 0}
            <div style="margin-bottom: var(--lv-sp-2); display: flex; align-items: center; gap: 6px">
                <LvChip tone="primary">{t.detail.version} {versions.length}</LvChip>
                <button class="b3-button b3-button--small" onclick={() => (versionsOpen = !versionsOpen)}>
                    {t.detail.versionHistory} {versionsOpen ? "▴" : "▾"}
                </button>
            </div>
            {#if versionsOpen}
                <div class="lv-ver-list">
                    {#each versions as v (v.at)}
                        <div class="lv-ver-row">
                            <div class="fn__flex" style="gap: 4px; align-items: center">
                                <button class="b3-button b3-button--small" onclick={() => (verOpenAt = verOpenAt === v.at ? null : v.at)}>
                                    {new Date(v.at).toLocaleString()} · {v.via === "ai" ? t.detail.viaAI : t.detail.viaEditor}
                                </button>
                                {#if v.accepted}<LvChip tone="primary">{t.detail.accepted}</LvChip>{/if}
                                <button class="b3-button b3-button--small" disabled={v.accepted} title={t.detail.acceptVer} onclick={() => acceptVersion?.(v.at)}>✓</button>
                                <button class="b3-button b3-button--small" disabled={diffBusy} onclick={() => compareWithCurrent(v.at, v.md)}>{t.detail.diffCompare}</button>
                            </div>
                            {#if verOpenAt === v.at}
                                <div class="ft__smaller" style="white-space: pre-wrap; max-height: 160px; overflow: auto; margin-top: 4px; padding: 8px; border: 1px solid var(--lv-border); border-radius: 6px">{v.md}</div>
                            {/if}
                            {#if diffAt === v.at}
                                <div class="lv-diff">
                                    {#each diffRows as r, ri (ri)}
                                        <div class="lv-diff-row lv-diff-{r.kind}">{r.kind === "add" ? "+ " : r.kind === "del" ? "− " : "  "}{r.text}</div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        {/if}
        <div class="lv-detail-preview">{@html html || (block.content ?? "")}</div>
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
    {:else if facet === "source"}
        <div class="lv-detail-meta ft__smaller ft__on-surface">
            <div>{t.manager.detailBlockId}: {block.id}</div>
            {#if block.hPath}<div>{block.hPath}</div>{/if}
        </div>
        <button class="b3-button b3-button--outline" style="margin-top: var(--lv-sp-2)" onclick={onOpenDoc}>{t.manager.openDoc}</button>
    {:else if facet === "history"}
        {#if historyEntries.length === 0}
            <div class="lv-hint">{t.detail.histEmpty}</div>
        {:else}
            <div class="ft__smaller ft__on-surface" style="margin-bottom: var(--lv-sp-2)">
                {t.detail.histSummary.replace("${r}", String(histSummary.reviews)).replace("${f}", String(histSummary.forgets))}
            </div>
            <div class="lv-hist-list">
                {#each [...historyEntries].reverse() as e (e.ts)}
                    <div class="lv-todo-row">
                        <span>{new Date(e.ts).toLocaleString()}</span>
                        <span class="ft__smaller ft__on-surface">{ratingLabel(e.rating)}{e.dur ? ` · ${Math.round(e.dur / 1000)}s` : ""}</span>
                    </div>
                {/each}
            </div>
        {/if}
    {:else}
        {#if issues.length === 0}
            <div class="lv-hint">{t.detail.issuesEmpty}</div>
        {:else}
            {#each issues as it (it.addedAt)}
                <div class="lv-todo-row">
                    <span>{new Date(it.addedAt).toLocaleDateString()}</span>
                    <span class="ft__smaller ft__on-surface">{t.detail.issueStatus}: {it.status}</span>
                </div>
            {/each}
            <div class="ft__smaller ft__on-surface" style="margin-top: var(--lv-sp-2)">{t.detail.issuesHint}</div>
        {/if}
    {/if}
    </div>
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
            <!-- ko 文案在 i18n 的 review.ko 组（与 ko-panel 同源）；t.ko 顶层不存在（v0.124 起的潜伏笔误） -->
            <button class="b3-button b3-button--text" onclick={koCtx.onregister}>
                {t.review?.ko?.register ?? t.ko?.register ?? ""}
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

    /* T05 分面导航（R52 segmented 同构） */
    .lv-facets {
        display: flex;
        gap: 2px;
        padding: 3px;
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-s);
        background: color-mix(in srgb, var(--b3-theme-on-background) 5%, transparent);
        margin-bottom: var(--lv-sp-4);
    }
    .lv-facet {
        flex: 1;
        border: none;
        background: transparent;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 6px;
        cursor: pointer;
        transition: background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease);
    }
    .lv-facet-active {
        background: var(--b3-theme-surface);
        color: var(--b3-theme-primary);
        font-weight: 600;
        box-shadow: var(--lv-shadow-1);
    }
    .lv-hist-list { max-height: 320px; overflow: auto; }

    /* T05 版本对比（docs/40）：逐行差异 */
    .lv-diff {
        margin-top: 4px;
        padding: 6px 8px;
        border: 1px solid var(--lv-border);
        border-radius: 6px;
        max-height: 220px;
        overflow: auto;
        font-size: 12px;
        line-height: 1.6;
    }
    .lv-diff-row { white-space: pre-wrap; word-break: break-word; padding: 0 4px; }
    .lv-diff-del { background: var(--lv-danger-soft); color: var(--b3-theme-error); }
    .lv-diff-add { background: var(--lv-good-soft); color: var(--b3-theme-success, var(--b3-theme-primary)); }
    .lv-diff-same { opacity: 0.65; }
</style>
