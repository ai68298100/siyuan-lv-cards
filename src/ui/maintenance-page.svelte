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
            scan: () => Promise<{ blockID: string; md: string; state?: string; rootID?: string }[]>;
            suspendToday: (blockIDs: string[]) => void;
            unsuspendToday: (blockIDs: string[]) => void;
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

    function excerpt(md: string): string {
        const text = (md ?? "").replace(/==([^=]*)==/g, "$1").replace(/\s+/g, " ").trim();
        return text.length > 60 ? `${text.slice(0, 60)}…` : text;
    }

    async function runScan() {
        scanning = true;
        errorMsg = "";
        try {
            const cards = await maintenance.scan();
            groups = groupDebts(detectDebts(cards));
            excerpts = new Map(cards.map(c => [c.blockID, excerpt(c.md)]));
            suspended = new Set(cards.filter(c => maintenance.isSuspendedToday(c.blockID)).map(c => c.blockID));
            live = t.scanned;
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            scanning = false;
        }
    }

    function suspendOne(id: string) {
        maintenance.suspendToday([id]);
        const next = new Set(suspended);
        next.add(id);
        suspended = next;
        live = t.suspendedToday;
    }

    function suspendGroup(kind: DebtKind) {
        const ids = groups[kind].map(d => d.blockID);
        if (ids.length === 0) return;
        maintenance.suspendToday(ids);
        const next = new Set(suspended);
        for (const id of ids) next.add(id);
        suspended = next;
        live = t.suspendedGroup.replace("${n}", String(ids.length));
    }
    function resumeOne(id: string) {
        maintenance.unsuspendToday([id]);
        const next = new Set(suspended);
        next.delete(id);
        suspended = next;
        live = t.resumedToday;
    }

    function resumeGroup(kind: DebtKind) {
        const ids = groups[kind].map(d => d.blockID).filter(id => suspended.has(id));
        if (ids.length === 0) return;
        maintenance.unsuspendToday(ids);
        const next = new Set(suspended);
        for (const id of ids) next.delete(id);
        suspended = next;
        live = t.resumedGroup.replace("${n}", String(ids.length));
    }

    function total(): number {
        return DEBT_KINDS.reduce((sum, k) => sum + groups[k].length, 0);
    }

    onMount(() => { void runScan(); });
</script>

<LvPage eyebrow="WORKSPACE / RECOVER" title={t.title} subtitle={t.queueCount.replace("${n}", String(total()))}>
    {#snippet actions()}
        <button class="b3-button b3-button--small b3-button--outline" disabled={scanning} onclick={runScan}>{scanning ? t.scanning : t.scan}</button>
    {/snippet}

    <div class="lv-maint-note ft__smaller ft__on-surface">{t.impactNote}</div>

    {#if scanning}
        <div class="lv-maint-list">
            {#each [0, 1, 2] as i (i)}
                <LvSkeleton height={48} />
            {/each}
        </div>
    {:else if errorMsg}
        <LvError message={errorMsg} onretry={runScan} retryLabel={i18n.dashboard.refresh} />
    {:else if total() === 0}
        <LvEmpty text={t.none} />
    {:else}
        {#each DEBT_KINDS as kind (kind)}
            {#if groups[kind].length > 0}
                <div class="lv-maint-group">
                    <div class="lv-maint-group-head">
                        <LvChip tone={kind === "needsReview" ? "warn" : "error"}>{(t.kinds as Record<string, string>)[kind]} {groups[kind].length}</LvChip>
                        <div class="fn__flex-1"></div>
                        {#if groups[kind].length > 0 && groups[kind].every(d => suspended.has(d.blockID))}
                            <button class="b3-button b3-button--small" onclick={() => resumeGroup(kind)}>{t.resumeGroup}</button>
                        {:else}
                            <button class="b3-button b3-button--small" onclick={() => suspendGroup(kind)}>{t.suspendGroup}</button>
                        {/if}
                    </div>
                    {#each groups[kind] as d (d.blockID + d.kind)}
                        <div class="lv-card2 lv-maint-row">
                            <div class="lv-maint-main">
                                <div class="lv-maint-excerpt">{excerpts.get(d.blockID) || d.blockID}</div>
                                {#if d.detail}<div class="ft__smaller ft__on-surface">{d.detail}</div>{/if}
                            </div>
                            {#if suspended.has(d.blockID)}
                                <button class="b3-button b3-button--small" onclick={() => resumeOne(d.blockID)}>{t.resumeTodayBtn}</button>
                                <LvChip>{t.suspendedToday}</LvChip>
                            {:else}
                                <button class="b3-button b3-button--small" onclick={() => suspendOne(d.blockID)}>{t.suspendTodayBtn}</button>
                            {/if}
                            <button class="b3-button b3-button--small" onclick={() => maintenance.openSource(d.blockID)}>{t.open}</button>
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
    .lv-maint-excerpt { font-size: 13px; overflow-wrap: anywhere; }
    .lv-visually-hidden {
        position: absolute;
        width: 1px; height: 1px; margin: -1px; padding: 0;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }
</style>
