<script lang="ts">
    import { onMount } from "svelte";
    import { getRiffDecks, type RiffDeck } from "@/api/riff";
    import { getNotebooks, type Notebook } from "@/api/siyuan";
    import { friendlyError } from "@/api/errors";
    import {
        dailyTarget, daysLeft, dynamicPlanAdvice, examReportStats, isCramActive,
        type ExamPlan, type ExamPlansData, type ExamScopeKind, type DynamicPlanAdvice,
    } from "@/core/exam";
    import { validateExamPlanInput } from "@/core/exam-plan-validation";
    import type { RevlogData } from "@/core/revlog";
    import { trapFocus } from "@/libs/focus-trap";
    import LvChip from "./kit/LvChip.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvError from "./kit/LvError.svelte";
    import LvRow from "./kit/LvRow.svelte";

    let { i18n, plans, onSavePlan, onDeletePlan, onReviewScope, onReport, onWriteReport, onError, getRevlog, getDailyCap }: {
        i18n: any;
        plans: ExamPlansData;
        onSavePlan: (plan: ExamPlan) => Promise<ExamPlansData>;
        onDeletePlan: (id: string) => Promise<ExamPlansData>;
        /** 带范围/cram 打开复习 */
        onReviewScope: (scopeKind: ExamScopeKind, scopeId: string, cram: boolean, planId?: string) => void;
        /** 生成考后复盘报告（复制到剪贴板） */
        onReport: (plan: ExamPlan) => void;
        /** 写入复盘文档（AR-5：busy 防重复 + 失败 toast） */
        onWriteReport: (plan: ExamPlan) => Promise<void>;
        onError: (message: string) => void;
        /** 本地复习日志（AQ-8 动态建议用，只读） */
        getRevlog: () => RevlogData;
        /** 每日复习上限设置（不可行判定用） */
        getDailyCap: () => number;
    } = $props();
    const t = $derived(i18n);
    const isChinese = $derived(t.exam.needName === "请填写计划名称");

    let decks: RiffDeck[] = $state([]);
    let notebooks: Notebook[] = $state([]);
    let editing = $state<ExamPlan | null>(null);
    let editorEl = $state<HTMLDivElement | null>(null);
    let savingPlan = $state(false);
    let actionBusy = $state(false);
    let actionError = $state("");
    let retryAction = $state<(() => Promise<ExamPlansData>) | null>(null);
    /** AR-8：范围下拉数据源加载失败可重试（两路全败才算失败；单路失败降级为可用子集） */
    let loadError = $state(false);
    let loadBusy = $state(false);
    let loadSeq = 0;

    function closeEditor() {
        if (!savingPlan) editing = null;
    }

    $effect(() => {
        if (!editing || !editorEl) return;
        const trap = trapFocus(editorEl, { onEscape: closeEditor });
        return () => trap.release();
    });

    async function load() {
        if (loadBusy) return;
        const seq = ++loadSeq;
        loadBusy = true;
        loadError = false;
        // 两路并行，且只接受最后一轮结果，避免重试时迟到响应覆盖当前范围。
        try {
            const [deckResult, notebookResult] = await Promise.allSettled([
                Promise.resolve().then(getRiffDecks),
                Promise.resolve().then(getNotebooks),
            ]);
            if (seq !== loadSeq) return;
            let ok = 0;
            if (deckResult.status === "fulfilled") {
                decks = deckResult.value;
                ok++;
            }
            if (notebookResult.status === "fulfilled") {
                notebooks = notebookResult.value;
                ok++;
            }
            loadError = ok === 0;
        } finally {
            if (seq === loadSeq) loadBusy = false;
        }
    }

    onMount(() => {
        void load();
    });

    /** AR-5：复盘文档写入闭环——busy 防重复、失败 toast 原因 */
    let reportBusyId = $state("");
    async function writeDoc(plan: ExamPlan) {
        if (reportBusyId) {
            return;
        }
        reportBusyId = plan.id;
        try {
            await onWriteReport(plan);
        } catch (e: any) {
            onError(friendlyError(e, i18n));
        } finally {
            reportBusyId = "";
        }
    }

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

    /** 时程进度（诚实口径）：createdAt → 考试日的已流逝天数占比；缺 createdAt 或已过期返回 null 不画条 */
    function paceFor(plan: ExamPlan): number | null {
        if (!plan.createdAt || !plan.examDate) {
            return null;
        }
        const start = plan.createdAt;
        const end = new Date(`${plan.examDate}T23:59:59`).getTime();
        if (!Number.isFinite(end) || end <= start) {
            return null;
        }
        const pct = Math.round(((Date.now() - start) / (end - start)) * 100);
        return Math.min(100, Math.max(0, pct));
    }

    /** AQ-8 动态建议：deck 范围容量取实时规模；all 用手填总量；notebook 归属需查内核，回退简单日均 */
    function adviceFor(plan: ExamPlan): { advice: DynamicPlanAdvice; capacity: number | undefined } | null {
        if (!plan.enabled || plan.archived) {
            return null;
        }
        const revlog = getRevlog();
        const observed = examReportStats(plan, revlog.entries).reviews;
        if (plan.scopeKind === "deck") {
            const capacity = decks.find(d => d.id === plan.scopeId)?.size;
            return { advice: dynamicPlanAdvice(plan, { capacity, observed, dailyCap: getDailyCap() }), capacity };
        }
        if (plan.scopeKind === "all") {
            return { advice: dynamicPlanAdvice(plan, { capacity: plan.totalCards, observed, dailyCap: getDailyCap() }), capacity: plan.totalCards };
        }
        return null; // notebook：范围归属需内核查询，保持简单日均展示
    }

    let formError = $state("");
    let fieldErrors = $state<Record<string, string>>({});
    let saveFailed = $state(false);

    function validatePlan(plan: ExamPlan): { name: string; examDate: string; totalCards?: number; cramDays: number } | null {
        const result = validateExamPlanInput(plan, {
            needName: t.exam.needName,
            needDate: t.exam.needDate,
            longName: isChinese ? "计划名称不能超过 120 个字符" : "Plan names must be 120 characters or fewer",
            invalidDate: isChinese ? "请输入有效的考试日期" : "Enter a valid exam date",
            invalidTotalCards: isChinese ? "总卡量须为 1 到 1,000,000 之间的整数，或留空" : "Total cards must be a whole number from 1 to 1,000,000, or blank",
            invalidCramDays: isChinese ? "考前天数须为 0 到 365 之间的整数" : "Cram days must be a whole number from 0 to 365",
        });
        fieldErrors = result.errors;
        const firstError = Object.keys(result.errors)[0];
        if (firstError) {
            formError = result.errors[firstError];
            document.querySelector<HTMLInputElement>(`[data-exam-field="${firstError}"]`)?.focus();
            return null;
        }
        formError = "";
        return result.value;
    }

    async function save() {
        if (!editing) {
            return;
        }
        if (savingPlan) return;
        const valid = validatePlan(editing);
        if (!valid) return;
        savingPlan = true;
        saveFailed = false;
        try {
            await onSavePlan({ ...editing, ...valid });
            editing = null;
            fieldErrors = {};
        } catch (error) {
            saveFailed = true;
            const reason = friendlyError(error, i18n);
            formError = isChinese ? `保存考试计划失败：${reason}。请重试。` : `Could not save the exam plan: ${reason}. Please retry.`;
        } finally {
            savingPlan = false;
        }
    }

    async function runPlanAction(action: () => Promise<ExamPlansData>) {
        if (actionBusy) return;
        actionBusy = true;
        actionError = "";
        try {
            await action();
            retryAction = null;
        } catch (error) {
            retryAction = action;
            const reason = friendlyError(error, i18n);
            actionError = isChinese ? `保存考试计划失败：${reason}。可重试。` : `Could not save the exam plan: ${reason}. Retry is available.`;
        } finally {
            actionBusy = false;
        }
    }

    function retryPlanAction() {
        if (retryAction) void runPlanAction(retryAction);
    }

    function deletePlan(plan: ExamPlan) {
        const title = plan.name || t.exam.untitled;
        const consequence = isChinese ? "删除后无法恢复。" : "This cannot be undone.";
        if (!window.confirm(`${t.exam.delete} “${title}”？${consequence}`)) return;
        void runPlanAction(() => onDeletePlan(plan.id));
    }
</script>

<div class="lv-page lv-exam">
    {#if loadError}
        <!-- AR-8：数据源全败时错误+重试优先，不用空计划列表误导 -->
        <LvError message={t.exam.loadFailed} onretry={load} retryLabel={t.dashboard.refresh} />
    {/if}
    {#if actionError}
        <LvError message={actionError} onretry={retryPlanAction} retryLabel={t.dashboard.refresh} />
    {/if}
    <div class="lv-pagehead">
        <div class="lv-pagehead-main">
            <div class="lv-eyebrow">EXAM / CRAM</div>
            <div class="lv-pagehead-title">{t.exam.title}</div>
            <p class="lv-pagehead-sub">{t.exam.pageSub}</p>
        </div>
        <div class="lv-pagehead-actions">
            {#if loadBusy}<span class="ft__smaller ft__on-surface" role="status" aria-busy="true">{isChinese ? "加载中…" : "Loading…"}</span>{/if}
            <button class="b3-button b3-button--outline" disabled={actionBusy || savingPlan} onclick={() => { editing = newPlan(); formError = ""; fieldErrors = {}; }}>
                + {t.exam.newPlan}
            </button>
        </div>
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
                    <span class="lv-plan-name">{plan.name || t.exam.untitled}</span>
                    {#if cram}
                        <LvChip tone="error">{t.exam.cramOn}</LvChip>
                    {:else if left !== null && left <= 30}
                        <LvChip tone="warn">{t.exam.daysLeft.replace("${n}", String(left))}</LvChip>
                    {/if}
                    <div class="fn__flex-1"></div>
                    {#if plan.enabled}
                        <button class="b3-button lv-btn-primary" onclick={() => onReviewScope(plan.scopeKind, plan.scopeId, cram, plan.id)}>
                            {t.exam.startToday}
                        </button>
                    {:else}
                        <button class="b3-button b3-button--outline" disabled={actionBusy || savingPlan} onclick={() => void runPlanAction(() => onSavePlan({ ...plan, enabled: true }))}>
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
                        {#if paceFor(plan) !== null}
                            <!-- 时程进度（真实口径：建档→考试日的已流逝占比），替换无意义的假宽度条 -->
                            <span class="lv-plan-pace-label ft__smaller ft__on-surface">{t.exam.pace}</span>
                            <div class="lv-mini-track" style="flex:1">
                                <div class="lv-mini-fill" style={`width:${paceFor(plan)}%`}></div>
                            </div>
                            <span class="ft__smaller ft__on-surface" style="font-variant-numeric: tabular-nums">{paceFor(plan)}%</span>
                        {/if}
                    </div>
                {/if}
                {#if plan.enabled ? adviceFor(plan) : null}
                    {@const adv = adviceFor(plan)!}
                    <div class="lv-plan-advice ft__smaller ft__on-surface">
                        {#if adv.advice.infeasible === "expired"}
                            <span>{t.exam.adviceExpired}</span>
                        {:else if adv.advice.capacityUnknown}
                            <span>{t.exam.adviceCapacityUnknown.replace("${observed}", String(adv.advice.observed))}</span>
                        {:else if adv.advice.todayTarget !== null}
                            <span>{t.exam.adviceToday.replace("${n}", String(adv.advice.todayTarget))}</span>
                            {#if adv.advice.behind > 0}
                                <span> · {t.exam.adviceBehind.replace("${n}", String(adv.advice.behind))}</span>
                            {/if}
                            {#if adv.advice.infeasible === "over-capacity" && adv.advice.daysNeededAtCap !== null}
                                <span class="lv-plan-advice-warn"> · {t.exam.adviceOverCap.replace("${n}", String(adv.advice.daysNeededAtCap))}</span>
                            {/if}
                            <span style="opacity:.65">{t.exam.advicePreview}</span>
                        {/if}
                    </div>
                {/if}
                <div class="fn__flex lv-plan-actions">
                    <button class="b3-button b3-button--small lv-btn-ghost" disabled={actionBusy || savingPlan} onclick={() => { editing = { ...plan }; formError = ""; fieldErrors = {}; }}>{t.exam.edit}</button>
                    <button class="b3-button b3-button--small lv-btn-ghost" onclick={() => onReport(plan)}>{t.exam.report}</button>
                    <!-- AR-5：写入中禁点，失败 toast 给原因（文档写入失败可重试） -->
                    <button class="b3-button b3-button--small lv-btn-ghost" disabled={reportBusyId === plan.id} onclick={() => writeDoc(plan)}>
                        {reportBusyId === plan.id ? "…" : t.exam.writeDoc}
                    </button>
                    <button class="b3-button b3-button--small lv-btn-ghost" disabled={actionBusy || savingPlan} onclick={() => void runPlanAction(() => onSavePlan({ ...plan, archived: true, enabled: false }))}>{t.exam.archive}</button>
                    <button class="b3-button b3-button--small lv-btn-ghost" disabled={actionBusy || savingPlan} onclick={() => void runPlanAction(() => onSavePlan({ ...plan, enabled: !plan.enabled, archived: false }))}>
                        {plan.enabled ? t.exam.pause : t.exam.enable}
                    </button>
                    <button class="b3-button b3-button--small lv-btn-ghost" disabled={actionBusy || savingPlan} onclick={() => deletePlan(plan)}>{t.exam.delete}</button>
                </div>
            </div>
        {/each}
    {/if}
</div>

<!-- 编辑器：轻量内联表单（单计划），走 LvSection -->
{#if editing}
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
    class="lv-editmask"
    role="presentation"
    onclick={closeEditor}
>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
            class="lv-card2 lv-editcard"
            role="dialog"
            aria-modal="true"
            aria-label={editing.id && plans.plans.some(p => p.id === editing.id) ? t.exam.editPlan : t.exam.newPlan}
            tabindex="-1"
            bind:this={editorEl}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }}
        >
            <div class="lv-secthead">{editing.id && plans.plans.some(p => p.id === editing.id) ? t.exam.editPlan : t.exam.newPlan}</div>
            {#if formError}
                <div class="lv-form-error" role="alert">{formError}</div>
            {/if}
            <form onsubmit={(event) => { event.preventDefault(); void save(); }}>
            <LvRow label={t.exam.planName}>
                <input class="b3-text-field fn__size-200" aria-label={t.exam.planName} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "exam-name-error" : undefined} data-exam-field="name" bind:value={editing.name} placeholder={t.exam.untitled} />
            </LvRow>
            {#if fieldErrors.name}<div class="lv-field-error" id="exam-name-error">{fieldErrors.name}</div>{/if}
            <LvRow label={t.exam.examDateLabel}>
                <input class="b3-text-field fn__size-200" aria-label={t.exam.examDateLabel} aria-invalid={Boolean(fieldErrors.examDate)} aria-describedby={fieldErrors.examDate ? "exam-date-error" : undefined} data-exam-field="examDate" type="date" bind:value={editing.examDate} />
            </LvRow>
            {#if fieldErrors.examDate}<div class="lv-field-error" id="exam-date-error">{fieldErrors.examDate}</div>{/if}
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
                <input class="b3-text-field fn__size-60" aria-label={t.exam.totalCardsLabel} aria-invalid={Boolean(fieldErrors.totalCards)} aria-describedby={fieldErrors.totalCards ? "exam-total-error" : undefined} data-exam-field="totalCards" type="number" min="1" max="1000000" step="1" bind:value={editing.totalCards} />
            </LvRow>
            {#if fieldErrors.totalCards}<div class="lv-field-error" id="exam-total-error">{fieldErrors.totalCards}</div>{/if}
            <LvRow label={t.exam.cramDaysLabel}>
                <input class="b3-text-field fn__size-60" aria-label={t.exam.cramDaysLabel} aria-invalid={Boolean(fieldErrors.cramDays)} aria-describedby={fieldErrors.cramDays ? "exam-cram-error" : undefined} data-exam-field="cramDays" type="number" min="0" max="365" step="1" bind:value={editing.cramDays} />
            </LvRow>
            {#if fieldErrors.cramDays}<div class="lv-field-error" id="exam-cram-error">{fieldErrors.cramDays}</div>{/if}
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel" type="button" disabled={savingPlan} onclick={() => (editing = null)}>{window.siyuan.languages.cancel}</button>
                <div class="fn__space"></div>
                <button class="b3-button b3-button--text lv-btn-primary" type="submit" disabled={savingPlan}>{savingPlan ? (isChinese ? "保存中…" : "Saving…") : saveFailed ? (isChinese ? "重试保存" : "Retry save") : window.siyuan.languages.confirm}</button>
            </div>
            </form>
        </div>
    </div>
{/if}

<style>
    .lv-exam { display: flex; flex-direction: column; gap: var(--lv-sp-3); }
    .lv-plan {
        position: relative;
        padding: calc(var(--lv-space-unit) * 9) calc(var(--lv-space-unit) * 10);
        margin-bottom: var(--lv-sp-3);
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
        transition: transform var(--lv-dur-2) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);

        &:hover {
            transform: translateY(-2px);
            border-color: var(--lv-border-strong);
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
        }
    }
    .lv-plan-cram {
        border-color: color-mix(in srgb, var(--lv-color-danger) 45%, transparent);
        background: linear-gradient(135deg, color-mix(in srgb, var(--lv-color-danger) 7%, var(--lv-color-surface)), var(--lv-color-surface));
        box-shadow: 0 6px 20px -3px color-mix(in srgb, var(--lv-color-danger) 22%, transparent), var(--lv-inset-shine);
    }
    .lv-plan-head { align-items: center; gap: var(--lv-sp-2); margin-bottom: 6px; }
    .lv-plan-name { font-weight: var(--lv-fw-bold); font-size: var(--lv-type-label-size); letter-spacing: -0.01em; }
    .lv-plan-meta { margin: var(--lv-sp-1) 0; }
    .lv-plan-pacing {
        display: flex; align-items: center; gap: var(--lv-sp-3);
        font-size: var(--lv-type-control-size); color: var(--lv-color-text-muted);
        margin: var(--lv-sp-2) 0;
    }
    .lv-plan-advice {
        display: flex; flex-wrap: wrap; gap: calc(var(--lv-space-unit) * 2); align-items: baseline;
        margin: var(--lv-sp-1) 0 0;
    }
    .lv-plan-actions { gap: var(--lv-sp-1); flex-wrap: wrap; }
    .lv-plan-advice-warn { color: var(--lv-color-warning); }
    .lv-editmask {
        position: fixed; inset: 0; z-index: var(--lv-z-host-overlay);
        background: color-mix(in srgb, black 38%, transparent);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex; align-items: flex-start; justify-content: center;
        padding: var(--lv-sp-5);
    }
    .lv-editcard {
        width: 520px;
        max-width: 94vw;
        margin-top: 6vh;
        border-radius: var(--lv-r-dialog);
        box-shadow: var(--lv-shadow-float), var(--lv-inset-shine);
        animation: lv-modal-pop var(--lv-dur-2) var(--lv-ease);
    }
    .lv-form-error {
        color: var(--lv-color-danger);
        font-size: var(--lv-type-control-size);
        margin-bottom: var(--lv-sp-2);
    }
    .lv-field-error {
        color: var(--lv-color-danger);
        font-size: var(--lv-type-control-size);
        margin: 0 0 var(--lv-sp-1);
    }

    @media (max-width: 740px) {
        .lv-plan-head {
            align-items: flex-start;
            flex-wrap: wrap;
            .lv-plan-name { flex: 1 1 180px; min-width: 0; overflow-wrap: anywhere; }
            .fn__flex-1 { display: none; }
            > .b3-button { flex: 1 1 100%; }
        }
        .lv-plan-pacing { flex-wrap: wrap; }
        .lv-plan-actions { justify-content: flex-start; }
    }
</style>
