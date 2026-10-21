<script lang="ts">
    // BI-1 学习目标页（Hub 懒加载 chunk）：只记录目标不强迫建卡。
    // 品质线对齐 inbox 页：LvPage 页头 + 行卡 + LvChip 状态 + LvEmpty + 破坏性确认。
    import { confirmDialog } from "@/libs/dialog";
    import LvPage from "./kit/LvPage.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvIcon from "./kit/LvIcon.svelte";
    import { GOAL_PRIORITIES, LEVELS, currentCriteria, daysUntilDeadline, isGoalActive, setCriteria, sortGoalsByPriority, suggestedMinutes, type GoalPriority, type LearningGoal, type LearningGoalsData, type LearnerLevel } from "@/core/learning-goal";
    import { SESSION_PURPOSES } from "@/core/session-purpose";
    import { narrateGoalProgress, stageLabelKey } from "@/core/goal-narrative";

    let {
        i18n,
        goals,
        embedded = false,
    }: {
        i18n: any;
        embedded?: boolean;
        goals: {
            get: () => LearningGoalsData;
            save: (goal: LearningGoal) => LearningGoalsData | Promise<LearningGoalsData>;
            remove: (id: string) => LearningGoalsData | Promise<LearningGoalsData>;
            /** BI-15：目标材料的内容状态计数（只读；缺省=不显示叙事行） */
            narrate?: (blockIDs: string[]) => Record<string, number> | null;
        };
    } = $props();

    const t = $derived(i18n.goals);

    // svelte-ignore state_referenced_locally -- 初值快照刻意的：目标变更经 get/save 回调整体替换 snapshot
    let snapshot = $state<LearningGoalsData>(goals.get());
    let editing = $state(false);
    let form = $state<LearningGoal>(blankGoal());
    let live = $state("");
    let saving = $state(false);
    let actionBusy = $state(false);
    let formError = $state("");
    let editBaseline = $state("");
    // BI-16：完成定义（表单草稿；保存时经 setCriteria 追加历史，旧定义保留）
    let criteriaDraft = $state("");

    function blankGoal(): LearningGoal {
        return { id: "", purpose: "review", deadline: null, materialBlockIDs: [], minutesPerDay: 0, level: "beginner", createdAt: 0, updatedAt: 0 };
    }

    // BI-11：优先级分层排序（主目标→维持→暂缓）；纯展示序，不改 due 不写内核
    const sorted = $derived(sortGoalsByPriority(snapshot.goals));

    function startAdd() {
        criteriaDraft = "";
        form = blankGoal();
        form.minutesPerDay = suggestedMinutes(form.purpose, form.level);
        editBaseline = JSON.stringify({ ...form, criteria: criteriaDraft });
        formError = "";
        editing = true;
    }

    function cancelEdit() {
        const current = JSON.stringify({ ...form, criteria: criteriaDraft });
        if (current !== editBaseline && !window.confirm(t.discardConfirm ?? "当前填写内容尚未保存，确定退出吗？")) return;
        editing = false;
        formError = "";
    }

    function onPurposeChange() {
        // 目的/水平变化时刷新建议分钟（可覆盖）
        form.minutesPerDay = suggestedMinutes(form.purpose, form.level);
    }

    async function save() {
        if (saving) return;
        const minutes = Number(form.minutesPerDay);
        if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
            formError = "每日可用时间需为 0 到 1440 之间的有效数字。";
            return;
        }
        if (form.deadline !== null && !/^\d{4}-\d{2}-\d{2}$/.test(form.deadline)) {
            formError = "截止日期格式无效，请重新选择日期。";
            return;
        }
        if (criteriaDraft.trim().length > 100) {
            formError = "完成定义最多 100 个字符。";
            return;
        }
        formError = "";
        saving = true;
        try {
            if (criteriaDraft.trim()) setCriteria(form, criteriaDraft);
            snapshot = await goals.save({ ...form, minutesPerDay: Math.floor(minutes), createdAt: form.createdAt || Date.now() });
            editing = false;
            announce(t.saved);
        } catch (e) {
            formError = e instanceof Error ? e.message : "保存目标失败，请重试。";
        } finally {
            saving = false;
        }
    }

    function remove(id: string) {
        if (actionBusy) return;
        confirmDialog({
            title: t.delete,
            content: `<div class="b3-typography">${t.deleteConfirm}</div>`,
            confirm: () => {
                actionBusy = true;
                formError = "";
                void (async () => {
                    try {
                        snapshot = await goals.remove(id);
                        announce(t.deleted);
                    } catch (e) {
                        formError = e instanceof Error ? e.message : "删除目标失败，请重试。";
                    } finally {
                        actionBusy = false;
                    }
                })();
            },
        });
    }

    function deadlineText(g: LearningGoal): string {
        const d = daysUntilDeadline(g, todayStr());
        if (d === null) { return t.noDeadline; }
        if (d === 0) { return t.deadlineToday; }
        if (d > 0) { return t.deadlineIn.replace("${n}", String(d)); }
        return t.overdue.replace("${n}", String(-d));
    }

    function todayStr(): string {
        const d = new Date();
        const m = `${d.getMonth() + 1}`.padStart(2, "0");
        const day = `${d.getDate()}`.padStart(2, "0");
        return `${d.getFullYear()}-${m}-${day}`;
    }

    function levelText(level: LearnerLevel): string {
        return (t.levels as Record<string, string>)[level] ?? level;
    }

    function announce(msg: string) {
        live = msg;
    }

    // BI-11：切换优先级（主目标→维持→暂缓循环）；排序只影响展示与建议入口
    function cyclePriority(g: LearningGoal) {
        if (actionBusy) return;
        const order = GOAL_PRIORITIES;
        const cur = order.indexOf(g.priority ?? "keep");
        const next = order[(cur + 1) % order.length];
        actionBusy = true;
        void (async () => {
            try {
                snapshot = await goals.save({ ...g, priority: next as GoalPriority, updatedAt: Date.now() });
                announce((t.priority as Record<string, string>)[next]);
            } catch (e) {
                formError = e instanceof Error ? e.message : "更新目标优先级失败，请重试。";
            } finally {
                actionBusy = false;
            }
        })();
    }

    function priorityText(g: LearningGoal): string {
        return (t.priority as Record<string, string>)[g.priority ?? "keep"] ?? "";
    }

    // BI-15：进度叙事（阶段计数非掌握百分比；无记录显示占位而非虚构 0%）
    function narrativeText(g: LearningGoal): string {
        const stats = goals.narrate?.(g.materialBlockIDs);
        const stages = narrateGoalProgress(stats ?? {});
        if (stages.length === 0) return t.narrativeNone;
        return stages.map(s => `${(t as any)[stageLabelKey(s.stage)] ?? s.stage} ${s.count}`).join(" · ");
    }

    const showNarrative = $derived(typeof goals.narrate === "function");

    // T06 步骤链（docs/13 §8）：了解 → 回忆 → 应用；状态如实——应用证据未追踪就标注未追踪
    function hasRecall(g: LearningGoal): boolean {
        const stats = goals.narrate?.(g.materialBlockIDs) ?? null;
        if (!stats) return false;
        return Object.values(stats).some((n) => (n ?? 0) > 0);
    }
    function goalGaps(g: LearningGoal): string[] {
        const out: string[] = [];
        if (g.materialBlockIDs.length === 0) out.push(t.gapMaterial);
        if (g.minutesPerDay === 0) out.push(t.gapBudget);
        return out;
    }
</script>

<LvPage eyebrow={embedded ? "" : "GOAL / PLAN"} title={embedded ? "" : t.title} subtitle={embedded ? "" : t.subtitle}>
    {#snippet actions()}
        {#if !embedded && !editing}
            <!-- 主动作：每屏唯一 primary（底部重复入口已收敛） -->
            <button class="b3-button b3-button--small lv-btn-primary" onclick={startAdd}>{t.add}</button>
        {/if}
    {/snippet}

    {#if formError && !editing}<div class="lv-form-error" role="alert">{formError}</div>{/if}

    {#if editing}
        <div class="lv-card2 lv-form">
            <label class="lv-field">
                <span>{t.purpose}</span>
                <select class="b3-select" bind:value={form.purpose} onchange={onPurposeChange}>
                    {#each SESSION_PURPOSES as p (p)}
                        <option value={p}>{i18n.purpose[p].name}</option>
                    {/each}
                </select>
            </label>
            <label class="lv-field">
                <span>{t.deadline}</span>
                <input class="b3-text-field" type="date" bind:value={form.deadline} />
            </label>
            <label class="lv-field">
                <span>{t.minutes}</span>
                <input class="b3-text-field" type="number" min="0" step="5" bind:value={form.minutesPerDay} />
            </label>
            <label class="lv-field">
                <span>{t.criteriaLabel}</span>
                <input class="b3-text-field" type="text" maxlength="100" bind:value={criteriaDraft}
                    placeholder={t.criteriaPlaceholder} />
            </label>
            <label class="lv-field">
                <span>{t.level}</span>
                <select class="b3-select" bind:value={form.level} onchange={onPurposeChange}>
                    {#each LEVELS as l (l)}
                        <option value={l}>{levelText(l)}</option>
                    {/each}
                </select>
            </label>
            <div class="lv-form-hint"><LvIcon name="lightbulb" size={15} /> {t.suggested.replace("${n}", String(suggestedMinutes(form.purpose, form.level)))}</div>
            <div class="lv-form-actions">
                {#if formError}<div class="lv-form-error" role="alert">{formError}</div>{/if}
                <button class="b3-button lv-btn-primary b3-button--small" disabled={saving || actionBusy} onclick={() => void save()}>{saving ? "保存中…" : t.save}</button>
                <button class="b3-button b3-button--small" disabled={saving || actionBusy} onclick={cancelEdit}>{t.cancel}</button>
            </div>
        </div>
    {:else if sorted.length === 0}
        <LvEmpty text={t.none} actionLabel={t.add} onaction={startAdd} />
    {:else}
        <div class="lv-list">
            {#each sorted as g (g.id)}
                <div class="lv-card2 lv-goal-row">
                    <div class="lv-goal-main">
                        <div class="lv-goal-title">
                            {i18n.purpose[g.purpose].name}
                            {#if isGoalActive(g, todayStr())}
                                <LvChip tone="primary">{t.chipActive}</LvChip>
                            {:else}
                                <LvChip tone="error">{t.chipExpired}</LvChip>
                            {/if}
                        </div>
                        <div class="lv-goal-meta ft__smaller ft__on-surface">
                            {deadlineText(g)} · {g.minutesPerDay > 0 ? t.minutesPerDay.replace("${n}", String(g.minutesPerDay)) : t.minutesUnset} · {levelText(g.level)}
                        </div>
                        {#if showNarrative}
                            <!-- BI-15：阶段计数叙事（描述进展，非掌握百分比） -->
                            <div class="lv-goal-meta ft__smaller ft__on-surface" style="opacity:.8">
                                <LvIcon name="learn" size={14} /> {narrativeText(g)}
                            </div>
                        {/if}
                        {#if currentCriteria(g)}
                            <!-- BI-16：现行完成定义（修改即追加历史，旧定义保留） -->
                            <div class="lv-goal-meta ft__smaller ft__on-surface" style="opacity:.8">
                                <LvIcon name="target" size={14} /> {currentCriteria(g)}
                            </div>
                        {/if}
                        <!-- T06 步骤链（docs/13 §8）：了解 → 回忆 → 应用；应用证据未追踪，如实标注 -->
                        <div class="lv-goal-steps">
                            <div class="lv-step">
                                <span class="lv-step-num" class:lv-step-done={g.materialBlockIDs.length > 0}>1</span>
                                <span>{t.stepConcept}{g.materialBlockIDs.length > 0 ? ` · ${t.stepScope.replace("${n}", String(g.materialBlockIDs.length))}` : ` · ${t.stepGapMaterial}`}</span>
                            </div>
                            <div class="lv-step">
                                <span class="lv-step-num" class:lv-step-done={hasRecall(g)}>2</span>
                                <span>{t.stepRecall}{hasRecall(g) ? ` · ${narrativeText(g)}` : ` · ${t.stepNotStarted}`}</span>
                            </div>
                            <div class="lv-step">
                                <span class="lv-step-num">3</span>
                                <span>{t.stepApply} · {t.stepUntracked}</span>
                            </div>
                        </div>
                        {#if goalGaps(g).length > 0}
                            <div class="lv-notice lv-notice--warn" style="margin-top: calc(var(--lv-space-unit) * 4)">{t.gapPrefix}{goalGaps(g).join("；")}</div>
                        {/if}
                    </div>
                    <div class="lv-goal-side">
                        <button class="lv-chipbtn" disabled={actionBusy} title={t.priorityTitle} onclick={() => cyclePriority(g)}>{priorityText(g)}</button>
                        <button class="b3-button b3-button--small lv-btn-danger" disabled={actionBusy} title={t.delete} onclick={() => remove(g.id)}>{t.delete}</button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</LvPage>

<!-- AS-4 读屏播报 -->
<div class="lv-visually-hidden" aria-live="polite">{live}</div>

<style>
    .lv-form {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-3);
        max-width: 480px;
    }
    .lv-field {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
        font-size: var(--lv-type-body-size);
    }
    .lv-field > span {
        flex: none;
        width: 72px;
        color: var(--lv-color-text-muted);
    }
    .lv-field > select,
    .lv-field > input {
        flex: 1;
    }
    .lv-form-hint {
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
    }
    .lv-form-actions {
        display: flex;
        gap: var(--lv-sp-2);
    }
    .lv-list {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);

        /* T06 步骤链（docs/13 §8） */
        .lv-goal-steps {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: var(--lv-sp-2);
            margin-top: calc(var(--lv-space-unit) * 3);
        }
        .lv-step {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: var(--lv-type-caption-size);
            color: var(--lv-color-text-muted);
            padding: 3px 10px;
            border-radius: var(--lv-r-pill);
            background: color-mix(in srgb, var(--lv-color-text) 5%, transparent);
            border: 1px solid var(--lv-border);
        }
        .lv-step-num {
            flex: none;
            width: 19px;
            height: 19px;
            border-radius: var(--lv-r-circle);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--lv-border);
            background: color-mix(in srgb, var(--lv-color-text) 8%, transparent);
            color: var(--lv-color-text-muted);
            font-size: 10px;
            font-weight: var(--lv-fw-bold);
        }
        .lv-step-done { color: var(--lv-color-brand); font-weight: 500; }
        .lv-step-num.lv-step-done {
            background: var(--lv-color-brand);
            border-color: var(--lv-color-brand);
            color: #FFFFFF;
            box-shadow: 0 1px 3px color-mix(in srgb, var(--lv-color-brand) 30%, transparent);
        }
    }
    .lv-goal-row {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
        padding: var(--lv-sp-4);
        border-radius: var(--lv-r-l);
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
        transition: transform var(--lv-dur-2) var(--lv-ease),
            border-color var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);

        &:hover {
            transform: translateY(-2px);
            border-color: var(--lv-primary-border);
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
        }
    }
    /* 窄屏：侧栏动作（优先级/删除）落到卡底横排，不再挤压主内容 */
    @media (max-width: 740px) {
        .lv-goal-row { flex-direction: column; align-items: stretch; }
        .lv-goal-side {
            flex-direction: row;
            align-items: center;
            justify-content: flex-end;
            width: 100%;
        }
    }
    .lv-goal-side {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: var(--lv-sp-2);
        flex: none;
    }
    .lv-goal-main {
        flex: 1;
        min-width: 0;
    }
    .lv-goal-title {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        font-size: var(--lv-type-body-size);
        font-weight: var(--lv-fw-semibold);
    }
    .lv-goal-meta {
        margin-top: calc(var(--lv-space-unit) * 1);
    }
    .lv-visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: calc(var(--lv-space-hairline) * -1);
        padding: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
    }
</style>
