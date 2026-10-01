<script lang="ts">
    import { onMount } from "svelte";
    import { getRiffDecks, type RiffDeck } from "@/api/riff";
    import { getNotebooks, type Notebook } from "@/api/siyuan";
    import {
        dailyTarget, daysLeft, isCramActive,
        type ExamPlan, type ExamPlansData, type ExamScopeKind,
    } from "@/core/exam";
    import LvChip from "./kit/LvChip.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvRow from "./kit/LvRow.svelte";

    let { i18n, plans, onSavePlan, onDeletePlan, onReviewScope, onReport }: {
        i18n: any;
        plans: ExamPlansData;
        onSavePlan: (plan: ExamPlan) => void;
        onDeletePlan: (id: string) => void;
        /** 带范围/cram 打开复习 */
        onReviewScope: (scopeKind: ExamScopeKind, scopeId: string, cram: boolean) => void;
        /** 生成考后复盘报告（复制到剪贴板） */
        onReport: (plan: ExamPlan) => void;
    } = $props();
    const t = $derived(i18n);

    let decks: RiffDeck[] = $state([]);
    let notebooks: Notebook[] = $state([]);
    let editing = $state<ExamPlan | null>(null);

    onMount(async () => {
        try {
            decks = await getRiffDecks();
        } catch { /* 旁路 */ }
        try {
            notebooks = await getNotebooks();
        } catch { /* 旁路 */ }
    });

    function newPlan(): ExamPlan {
        return {
            id: `plan-${Date.now().toString(36)}`,
            name: "",
            examDate: "",
            scopeKind: "all",
            scopeId: "",
            scopeName: t.exam.scopeAll,
            cramDays: 7,
            enabled: true,
            createdAt: Date.now(),
        };
    }

    function scopeName(plan: ExamPlan): string {
        if (plan.scopeKind === "deck") {
            return decks.find(d => d.id === plan.scopeId)?.name ?? plan.scopeName;
        }
        if (plan.scopeKind === "notebook") {
            return notebooks.find(n => n.id === plan.scopeId)?.name ?? plan.scopeName;
        }
        return t.exam.scopeAll;
    }

    function targetFor(plan: ExamPlan): number | null {
        const size = plan.scopeKind === "deck" ? decks.find(d => d.id === plan.scopeId)?.size : undefined;
        return dailyTarget(plan, size);
    }

    function save() {
        if (!editing) {
            return;
        }
        if (!editing.name.trim() || !editing.examDate) {
            editing = { ...editing, name: editing.name.trim() };
            return;
        }
        onSavePlan({ ...editing, name: editing.name.trim() });
        editing = null;
    }
</script>

<div class="lv-exam">
    <div class="fn__flex" style="justify-content: flex-end; margin-bottom: var(--lv-sp-3)">
        <button class="b3-button b3-button--text lv-btn-primary" onclick={() => (editing = newPlan())}>
            + {t.exam.newPlan}
        </button>
    </div>

    {#if plans.plans.length === 0}
        <LvEmpty text={t.exam.emptyHint} />
    {:else}
        {@const sorted = [...plans.plans].sort((a, b) => {
            const ar = a.enabled && !a.archived ? 0 : 1;
            const br = b.enabled && !b.archived ? 0 : 1;
            if (ar !== br) return ar - br;
            return (daysLeft(a.examDate) ?? 9999) - (daysLeft(b.examDate) ?? 9999);
        })}
        {#each sorted as plan (plan.id)}
            {@const left = daysLeft(plan.examDate)}
            {@const cram = plan.enabled && isCramActive(plan)}
            {@const target = plan.enabled ? targetFor(plan) : null}
            <div class="lv-card2 lv-plan" class:lv-plan-cram={cram}>
                <div class="fn__flex lv-plan-head">
                    <span class="lv-plan-name">🎓 {plan.name || t.exam.untitled}</span>
                    {#if cram}
                        <LvChip tone="error">{t.exam.cramOn}</LvChip>
                    {:else if left !== null && left <= 30}
                        <LvChip tone="warn">{t.exam.daysLeft.replace("${n}", String(left))}</LvChip>
                    {/if}
                    <div class="fn__flex-1"></div>
                    {#if plan.enabled}
                        <button class="b3-button b3-button--text" onclick={() => onReviewScope(plan.scopeKind, plan.scopeId, cram)}>
                            {t.exam.startToday}
                        </button>
                    {:else}
                        <button class="b3-button b3-button--text" onclick={() => onSavePlan({ ...plan, enabled: true })}>
                            {t.exam.resume}
                        </button>
                    {/if}
                </div>
                <div class="lv-plan-meta ft__smaller ft__on-surface">
                    {plan.examDate}
                    {#if left !== null}
                        · {left >= 0 ? t.exam.daysLeft.replace("${n}", String(left)) : t.exam.passed}
                    {/if}
                    · {scopeName(plan)}
                </div>
                {#if target !== null}
                    <div class="lv-plan-pacing">
                        <span>{t.exam.dailyTarget}: <b>{target}</b> {t.exam.cardsUnit}</span>
                        <div class="lv-mini-track" style="flex:1">
                            <div class="lv-mini-fill" style={`width:${Math.min(100, Math.round((left ?? 0) / Math.max(1, (left ?? 0) + 30) * 100))}%`}></div>
                        </div>
                    </div>
                {/if}
                <div class="fn__flex lv-plan-actions">
                    <button class="b3-button b3-button--small" onclick={() => (editing = { ...plan })}>{t.exam.edit}</button>
                    <button class="b3-button b3-button--small" onclick={() => onReport(plan)}>{t.exam.report}</button>
                    <button class="b3-button b3-button--small" onclick={() => onSavePlan({ ...plan, archived: true, enabled: false })}>{t.exam.archive}</button>
                    <button class="b3-button b3-button--small" onclick={() => onSavePlan({ ...plan, enabled: !plan.enabled, archived: false })}>
                        {plan.enabled ? t.exam.pause : t.exam.enable}
                    </button>
                    <button class="b3-button b3-button--small" onclick={() => onDeletePlan(plan.id)}>{t.exam.delete}</button>
                </div>
            </div>
        {/each}
    {/if}
</div>

<!-- 编辑器：轻量内联表单（单计划），走 LvSection -->
{#if editing}
    <div class="lv-editmask" role="presentation">
        <div class="lv-card2 lv-editcard">
            <div class="lv-secthead">{editing.id && plans.plans.some(p => p.id === editing.id) ? t.exam.editPlan : t.exam.newPlan}</div>
            <LvRow label={t.exam.planName}>
                <input class="b3-text-field fn__size-200" bind:value={editing.name} placeholder={t.exam.untitled} />
            </LvRow>
            <LvRow label={t.exam.examDateLabel}>
                <input class="b3-text-field fn__size-200" type="date" bind:value={editing.examDate} />
            </LvRow>
            <LvRow label={t.exam.scopeLabel}>
                {#snippet children()}
                    <select
                        class="b3-select fn__size-200"
                        bind:value={editing.scopeId}
                        onchange={(e) => {
                            const v = (e.target as HTMLSelectElement).value;
                            if (v === "all") { editing!.scopeKind = "all"; editing!.scopeId = ""; editing!.scopeName = t.exam.scopeAll; }
                            else if (v.startsWith("deck:")) { editing!.scopeKind = "deck"; editing!.scopeId = v.slice(5); editing!.scopeName = decks.find(d => d.id === editing!.scopeId)?.name ?? ""; }
                            else if (v.startsWith("notebook:")) { editing!.scopeKind = "notebook"; editing!.scopeId = v.slice(9); editing!.scopeName = notebooks.find(n => n.id === editing!.scopeId)?.name ?? ""; }
                        }}
                    >
                        <option value="all" selected={editing.scopeKind === "all"}>{t.exam.scopeAll}</option>
                        <optgroup label={t.dashboard.decks}>
                            {#each decks as d (d.id)}
                                <option value={`deck:${d.id}`} selected={editing.scopeKind === "deck" && editing.scopeId === d.id}>{d.name}</option>
                            {/each}
                        </optgroup>
                        <optgroup label={t.review.scopeNotebooks}>
                            {#each notebooks as n (n.id)}
                                <option value={`notebook:${n.id}`} selected={editing.scopeKind === "notebook" && editing.scopeId === n.id}>{n.name}</option>
                            {/each}
                        </optgroup>
                    </select>
                {/snippet}
            </LvRow>
            <LvRow label={t.exam.totalCardsLabel} hint={t.exam.totalCardsHint}>
                <input class="b3-text-field fn__size-60" type="number" min="0" bind:value={editing.totalCards} />
            </LvRow>
            <LvRow label={t.exam.cramDaysLabel}>
                <input class="b3-text-field fn__size-60" type="number" min="0" bind:value={editing.cramDays} />
            </LvRow>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel" onclick={() => (editing = null)}>{window.siyuan.languages.cancel}</button>
                <div class="fn__space"></div>
                <button class="b3-button b3-button--text lv-btn-primary" onclick={save}>{window.siyuan.languages.confirm}</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .lv-exam { display: flex; flex-direction: column; gap: var(--lv-sp-3); }
    .lv-plan-cram { border-color: var(--lv-danger-border); }
    .lv-plan-head { align-items: center; gap: var(--lv-sp-2); }
    .lv-plan-name { font-weight: 700; }
    .lv-plan-meta { margin: var(--lv-sp-1) 0; }
    .lv-plan-pacing {
        display: flex; align-items: center; gap: var(--lv-sp-3);
        font-size: 12px; color: var(--b3-theme-on-surface);
        margin: var(--lv-sp-2) 0;
    }
    .lv-plan-actions { gap: var(--lv-sp-2); }
    .lv-editmask {
        position: fixed; inset: 0; z-index: 40;
        background: color-mix(in srgb, black 32%, transparent);
        display: flex; align-items: flex-start; justify-content: center;
        padding: var(--lv-sp-5);
    }
    .lv-editcard { width: 520px; max-width: 94vw; margin-top: 6vh; }
</style>
