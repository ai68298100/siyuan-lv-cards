<script lang="ts">
    // BI-1 学习目标页（Hub 懒加载 chunk）：只记录目标不强迫建卡。
    // 品质线对齐 inbox 页：LvPage 页头 + 行卡 + LvChip 状态 + LvEmpty + 破坏性确认。
    import { confirmDialog } from "@/libs/dialog";
    import LvPage from "./kit/LvPage.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import { GOAL_PRIORITIES, LEVELS, currentCriteria, daysUntilDeadline, isGoalActive, setCriteria, sortGoalsByPriority, suggestedMinutes, type GoalPriority, type LearningGoal, type LearningGoalsData, type LearnerLevel } from "@/core/learning-goal";
    import { SESSION_PURPOSES } from "@/core/session-purpose";
    import { narrateGoalProgress, stageLabelKey } from "@/core/goal-narrative";

    let {
        i18n,
        goals,
    }: {
        i18n: any;
        goals: {
            get: () => LearningGoalsData;
            save: (goal: LearningGoal) => LearningGoalsData;
            remove: (id: string) => LearningGoalsData;
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
        editing = true;
    }

    function onPurposeChange() {
        // 目的/水平变化时刷新建议分钟（可覆盖）
        form.minutesPerDay = suggestedMinutes(form.purpose, form.level);
    }

    function save() {
        if (criteriaDraft.trim()) setCriteria(form, criteriaDraft);
        snapshot = goals.save({ ...form, createdAt: form.createdAt || Date.now() });
        editing = false;
        announce(t.saved);
    }

    function remove(id: string) {
        confirmDialog({
            title: t.delete,
            content: `<div class="b3-typography">${t.deleteConfirm}</div>`,
            confirm: () => {
                snapshot = goals.remove(id);
                announce(t.deleted);
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
        const order = GOAL_PRIORITIES;
        const cur = order.indexOf(g.priority ?? "keep");
        const next = order[(cur + 1) % order.length];
        snapshot = goals.save({ ...g, priority: next as GoalPriority, updatedAt: Date.now() });
        announce((t.priority as Record<string, string>)[next]);
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

<LvPage title={t.title} subtitle={`${sorted.length}`}>
    {#snippet actions()}
        {#if !editing}
            <button class="b3-button b3-button--small" onclick={startAdd}>{t.add}</button>
        {/if}
    {/snippet}

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
                <input class="b3-text-field" type="number" min="5" step="5" bind:value={form.minutesPerDay} />
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
            <div class="lv-form-hint">💡 {t.suggested.replace("${n}", String(suggestedMinutes(form.purpose, form.level)))}</div>
            <div class="lv-form-actions">
                <button class="b3-button b3-button--text" onclick={save}>{t.save}</button>
                <button class="b3-button" onclick={() => (editing = false)}>{t.cancel}</button>
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
                                🧭 {narrativeText(g)}
                            </div>
                        {/if}
                        {#if currentCriteria(g)}
                            <!-- BI-16：现行完成定义（修改即追加历史，旧定义保留） -->
                            <div class="lv-goal-meta ft__smaller ft__on-surface" style="opacity:.8">
                                🎯 {currentCriteria(g)}
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
                            <div class="lv-notice lv-notice--warn" style="margin-top: 8px">{t.gapPrefix}{goalGaps(g).join("；")}</div>
                        {/if}
                    </div>
                    <button class="b3-button b3-button--small" title={t.priorityTitle} onclick={() => cyclePriority(g)}>{priorityText(g)}</button>
                    <button class="b3-button b3-button--small" title={t.delete} onclick={() => remove(g.id)}>🗑</button>
                </div>
            {/each}
            <div class="lv-goal-add">
                <button class="b3-button b3-button--outline" onclick={startAdd}>{t.add}</button>
            </div>
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
        font-size: 13px;
    }
    .lv-field > span {
        flex: none;
        width: 72px;
        color: var(--b3-theme-on-surface);
    }
    .lv-field > select,
    .lv-field > input {
        flex: 1;
    }
    .lv-form-hint {
        color: var(--b3-theme-on-surface);
        font-size: 12px;
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
            flex-direction: column;
            gap: 4px;
            margin-top: var(--lv-sp-2);
        }
        .lv-step {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: var(--b3-theme-on-surface);
        }
        .lv-step-num {
            flex: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--lv-border-strong);
            font-size: 10px;
        }
        .lv-step-done { color: var(--b3-theme-primary); }
        .lv-step-num.lv-step-done {
            background: var(--lv-primary-soft);
            border-color: transparent;
            color: var(--b3-theme-primary);
        }
    }
    .lv-goal-row {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-3);
    }
    .lv-goal-main {
        flex: 1;
        min-width: 0;
    }
    .lv-goal-title {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        font-size: 13px;
        font-weight: 600;
    }
    .lv-goal-meta {
        margin-top: 2px;
    }
    .lv-goal-add {
        display: flex;
        justify-content: center;
        padding: var(--lv-sp-2);
    }
    .lv-visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
    }
</style>
