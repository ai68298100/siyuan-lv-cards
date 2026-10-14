<script lang="ts">
    // BI-25 维护债务队列（Hub 懒加载子页）：重复/泄漏/过长/待审核四类只读诊断。
    // 「暂缓今日」=今日不学（可逆，次日恢复，不改变 due 语义）；「打开来源」回原文档。
    import { onMount } from "svelte";
    import LvPage from "./kit/LvPage.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvSkeleton from "./kit/LvSkeleton.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvError from "./kit/LvError.svelte";
    import { groupDebts, detectDebts, DEBT_KINDS, type DebtItem, type DebtKind } from "@/core/maintenance-queue";

    let {
        i18n,
        maintenance,
    }: {
        i18n: any;
        maintenance: {
            scan: () => Promise<{ items: { blockID: string; md: string; state?: string; rootID?: string }[]; error?: string }>;
            suspendToday: (blockIDs: string[]) => Promise<void>;
            unsuspendToday: (blockIDs: string[]) => Promise<void>;
            isSuspendedToday: (blockID: string) => boolean;
            openSource: (blockID: string) => Promise<void>;
        };
    } = $props();

    const t = $derived(i18n.maintenance);

    let scanning = $state(true);
    let errorMsg = $state("");
    let groups = $state<Record<DebtKind, DebtItem[]>>(groupDebts([]));
    let excerpts = $state<Map<string, string>>(new Map());
    let suspended = $state<Set<string>>(new Set());
    let live = $state("");
    type SuspendAction = { type: "suspend" | "resume"; ids: string[]; message: string; group?: DebtKind };
    let pendingAction = $state<SuspendAction | null>(null);
    let failedAction = $state<SuspendAction | null>(null);
    let actionError = $state("");
    let sourcePendingId = $state("");
    let sourceError = $state("");
    let sourceErrorId = $state("");

    function excerpt(md: string): string {
        const text = (md ?? "").replace(/==([^=]*)==/g, "$1").replace(/\s+/g, " ").trim();
        return text.length > 60 ? `${text.slice(0, 60)}…` : text;
    }

    async function runScan() {
        scanning = true;
        errorMsg = "";
        try {
            const result = await maintenance.scan();
            const cards = result.items;
            groups = groupDebts(detectDebts(cards));
            excerpts = new Map(cards.map(c => [c.blockID, excerpt(c.md)]));
            suspended = new Set(cards.filter(c => maintenance.isSuspendedToday(c.blockID)).map(c => c.blockID));
            errorMsg = result.error ? i18n.scanPartial.replace("${error}", result.error) : "";
            live = t.scanned;
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            scanning = false;
        }
    }

    async function runSuspendAction(action: SuspendAction) {
        if (pendingAction) return;
        pendingAction = action;
        actionError = "";
        try {
            if (action.type === "suspend") await maintenance.suspendToday(action.ids);
            else await maintenance.unsuspendToday(action.ids);
            const next = new Set(suspended);
            for (const id of action.ids) {
                if (action.type === "suspend") next.add(id);
                else next.delete(id);
            }
            suspended = next;
            live = action.message;
            failedAction = null;
        } catch (e) {
            failedAction = action;
            const detail = e instanceof Error ? e.message : String(e);
            actionError = t.actionFailed.replace("${error}", detail);
        } finally {
            pendingAction = null;
        }
    }

    function retryAction() {
        if (failedAction) void runSuspendAction(failedAction);
    }

    function suspendOne(id: string) {
        void runSuspendAction({ type: "suspend", ids: [id], message: t.suspendedToday });
    }

    function suspendGroup(kind: DebtKind) {
        const ids = groups[kind].map(d => d.blockID);
        if (ids.length === 0) return;
        void runSuspendAction({ type: "suspend", ids, group: kind, message: t.suspendedGroup.replace("${n}", String(ids.length)) });
    }

    function resumeOne(id: string) {
        void runSuspendAction({ type: "resume", ids: [id], message: t.resumedToday });
    }

    function resumeGroup(kind: DebtKind) {
        const ids = groups[kind].map(d => d.blockID).filter(id => suspended.has(id));
        if (ids.length === 0) return;
        void runSuspendAction({ type: "resume", ids, group: kind, message: t.resumedGroup.replace("${n}", String(ids.length)) });
    }

    function actionIsPending(type: SuspendAction["type"], id: string): boolean {
        return pendingAction?.type === type && pendingAction.ids.includes(id);
    }

    function groupIsPending(type: SuspendAction["type"], kind: DebtKind): boolean {
        return pendingAction?.type === type && pendingAction.group === kind;
    }

    async function openSource(blockID: string) {
        if (sourcePendingId) return;
        sourcePendingId = blockID;
        sourceError = "";
        sourceErrorId = "";
        try {
            await maintenance.openSource(blockID);
        } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            sourceError = t.openFailed.replace("${error}", detail);
            sourceErrorId = blockID;
        } finally {
            sourcePendingId = "";
        }
    }

    function total(): number {
        return DEBT_KINDS.reduce((sum, k) => sum + groups[k].length, 0);
    }

    onMount(() => { void runScan(); });
</script>

<LvPage eyebrow="WORKSPACE / RECOVER" title={t.title} subtitle={t.queueCount.replace("${n}", String(total()))}>
    {#snippet actions()}
        <button class="b3-button b3-button--small b3-button--outline" disabled={scanning || !!pendingAction} onclick={runScan}>{scanning ? t.scanning : t.scan}</button>
    {/snippet}

    <div class="lv-maint-note ft__smaller ft__on-surface">{t.impactNote}</div>

    {#if scanning}
        <div class="lv-maint-list">
            {#each [0, 1, 2] as i (i)}
                <LvSkeleton height={48} />
            {/each}
        </div>
    {:else}
        {#if actionError}<LvError message={actionError} onretry={failedAction && !pendingAction ? retryAction : undefined} retryLabel={t.retry} />{/if}
        {#if errorMsg}<LvError message={errorMsg} onretry={runScan} retryLabel={i18n.dashboard.refresh} />{/if}
        {#if sourceError}<LvError message={sourceError} onretry={sourceErrorId && !sourcePendingId ? () => openSource(sourceErrorId) : undefined} retryLabel={t.retry} />{/if}
        {#if total() === 0 && !errorMsg}<LvEmpty text={t.none} />{/if}
        {#each DEBT_KINDS as kind (kind)}
            {#if groups[kind].length > 0}
                <div class="lv-maint-group">
                    <div class="lv-maint-group-head">
                        <LvChip tone={kind === "needsReview" ? "warn" : "error"}>{(t.kinds as Record<string, string>)[kind]} {groups[kind].length}</LvChip>
                        <div class="fn__flex-1"></div>
                        {#if groups[kind].length > 0 && groups[kind].every(d => suspended.has(d.blockID))}
                            <button class="b3-button b3-button--small" disabled={!!pendingAction} aria-busy={groupIsPending("resume", kind)} onclick={() => resumeGroup(kind)}>{groupIsPending("resume", kind) ? t.saving : t.resumeGroup}</button>
                        {:else}
                            <button class="b3-button b3-button--small" disabled={!!pendingAction} aria-busy={groupIsPending("suspend", kind)} onclick={() => suspendGroup(kind)}>{groupIsPending("suspend", kind) ? t.saving : t.suspendGroup}</button>
                        {/if}
                    </div>
                    {#each groups[kind] as d (d.blockID + d.kind)}
                        <div class="lv-card2 lv-maint-row">
                            <div class="lv-maint-main">
                                <div class="lv-maint-excerpt">{excerpts.get(d.blockID) || d.blockID}</div>
                                {#if d.detail}<div class="ft__smaller ft__on-surface">{d.detail}</div>{/if}
                            </div>
                            {#if suspended.has(d.blockID)}
                                <button class="b3-button b3-button--small" disabled={!!pendingAction} aria-busy={actionIsPending("resume", d.blockID)} onclick={() => resumeOne(d.blockID)}>{actionIsPending("resume", d.blockID) ? t.saving : t.resumeTodayBtn}</button>
                                <LvChip>{t.suspendedToday}</LvChip>
                            {:else}
                                <button class="b3-button b3-button--small" disabled={!!pendingAction} aria-busy={actionIsPending("suspend", d.blockID)} onclick={() => suspendOne(d.blockID)}>{actionIsPending("suspend", d.blockID) ? t.saving : t.suspendTodayBtn}</button>
                            {/if}
                            <button class="b3-button b3-button--small" disabled={!!sourcePendingId} aria-busy={sourcePendingId === d.blockID} onclick={() => openSource(d.blockID)}>{sourcePendingId === d.blockID ? t.opening : t.open}</button>
                        </div>
                    {/each}
                </div>
            {/if}
        {/each}
    {/if}
</LvPage>

<!-- AS-4 读屏播报 -->
<div class="lv-visually-hidden" aria-live="polite">{live}</div>

<style>
    .lv-maint-note { margin-bottom: var(--lv-sp-3); }
    .lv-maint-list { display: flex; flex-direction: column; gap: var(--lv-sp-2); }
    .lv-maint-group { margin-bottom: var(--lv-sp-4); }
    .lv-maint-group-head {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-2);
    }
    .lv-maint-row {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-2);
    }
    .lv-maint-main { flex: 1; min-width: 0; }
    .lv-maint-excerpt { font-size: var(--lv-type-body-size); overflow-wrap: anywhere; }
    .lv-visually-hidden {
        position: absolute;
        width: 1px; height: 1px; margin: calc(var(--lv-space-hairline) * -1); padding: 0;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }
</style>
