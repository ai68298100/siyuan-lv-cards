<script lang="ts">
    // BI-1 学习目标页（Hub 懒加载 chunk）：只记录目标不强迫建卡。
    // 品质线对齐 inbox 页：LvPage 页头 + 行卡 + LvChip 状态 + LvEmpty + 破坏性确认。
    import { confirmDialog } from "@/libs/dialog";
    import LvPage from "./kit/LvPage.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import { LEVELS, daysUntilDeadline, isGoalActive, suggestedMinutes, type LearningGoal, type LearningGoalsData, type LearnerLevel } from "@/core/learning-goal";
    import { SESSION_PURPOSES } from "@/core/session-purpose";

    let {
        i18n,
        goals,
    }: {
        i18n: any;
        goals: {
            get: () => LearningGoalsData;
            save: (goal: LearningGoal) => LearningGoalsData;
            remove: (id: string) => LearningGoalsData;
        };
    } = $props();

    const t = $derived(i18n.goals);

    let snapshot = $state<LearningGoalsData>(goals.get());
    let editing = $state(false);
    let form = $state<LearningGoal>(blankGoal());
    let live = $state("");

    function blankGoal(): LearningGoal {
        return { id: "", purpose: "review", deadline: null, materialBlockIDs: [], minutesPerDay: 0, level: "beginner", createdAt: 0, updatedAt: 0 };
    }

    const sorted = $derived([...snapshot.goals].sort((a, b) => a.createdAt - b.createdAt));

    function startAdd() {
        form = blankGoal();
        form.minutesPerDay = suggestedMinutes(form.purpose, form.level);
        editing = true;
    }

    function onPurposeChange() {
        // 目的/水平变化时刷新建议分钟（可覆盖）
        form.minutesPerDay = suggestedMinutes(form.purpose, form.level);
    }

    function save() {
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
                    </div>
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
