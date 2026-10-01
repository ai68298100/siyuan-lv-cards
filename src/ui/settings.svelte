<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { MODULE_DEFS } from "@/core/modules";
    import { PERSONA_PRESETS, type PersonaPreset } from "@/core/personas";
    import { confirmDialog } from "@/libs/dialog";
    import type { LvCardsSettings } from "@/core/settings";
    import LvSection from "./kit/LvSection.svelte";
    import LvRow from "./kit/LvRow.svelte";
    import LvChip from "./kit/LvChip.svelte";

    export interface SettingsCtx {
        i18n: any;
        settings: LvCardsSettings;
        save: (s: LvCardsSettings) => void;
        close: () => void;
        exportRevlog: () => void;
        clearRevlog: () => void;
        redetectV2: () => Promise<string>;
        getV2Status: () => string;
        getSuspendedCount: () => number;
        restoreAllSuspended: () => void;
        testAnkiClient: () => Promise<string>;
        storageStats: () => { file: string; size: string; lastWrite: number }[];
        exportSettings: () => void;
        exportRevlogCsv: () => void;
        importRevlogCsv: (fileText: string) => Promise<{ added: number; skipped: number }>;
        importRevlogMerge: (fileText: string) => Promise<{ added: number; skipped: number }>;
    }

    let { ctx }: { ctx: SettingsCtx } = $props();
    const t = $derived(ctx.i18n);

    let draft: LvCardsSettings = $state(JSON.parse(JSON.stringify(ctx.settings)));
    let v2Label = $state(ctx.getV2Status());
    let voices = $state<{ name: string }[]>([]);

    onMount(() => {
        try {
            if ("speechSynthesis" in window) {
                const load = () => (voices = speechSynthesis.getVoices().map(v => ({ name: v.name })));
                load();
                speechSynthesis.onvoiceschanged = load;
            }
        } catch { /* 旁路 */ }
    });
    let ankiLabel = $state("");

    function toggleModule(id: string, ev: Event) {
        draft.modules[id] = (ev.target as HTMLInputElement).checked;
        draft.persona = "custom";
    }

    function applyPersona(preset: PersonaPreset) {
        confirmDialog({
            title: t.personaApplyTitle,
            content: `<div class="b3-typography">${t.modules[preset.nameKey]}：${t[preset.descKey]}<br><small>${t.personaApplyHint}</small></div>`,
            confirm: () => {
                draft.persona = preset.id;
                draft.modules = { ...draft.modules, ...preset.modules };
                Object.assign(draft, preset.params);
            },
        });
    }

    async function redetectV2() {
        v2Label = await ctx.redetectV2();
        showMessage(t.settings.redetectOk, 1500, "info");
    }

    function importCsv(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showMessage(t.settings.importTooLarge, 3000, "error");
            input.value = "";
            return;
        }
        file.text().then(async (text) => {
            try {
                const r = await ctx.importRevlogCsv(text);
                showMessage(t.settings.importResult.replace("${a}", String(r.added)).replace("${s}", String(r.skipped)), 3000, "info");
            } catch (e: any) {
                showMessage(e?.message || t.settings.importInvalid, 3000, "error");
            }
            input.value = "";
        });
    }

    function importMerge(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showMessage(t.settings.importTooLarge, 3000, "error");
            input.value = "";
            return;
        }
        file.text().then(async (text) => {
            try {
                const r = await ctx.importRevlogMerge(text);
                showMessage(t.settings.importResult.replace("${a}", String(r.added)).replace("${s}", String(r.skipped)), 3000, "info");
            } catch (e: any) {
                showMessage(e?.message || t.settings.importInvalid, 3000, "error");
            }
            input.value = "";
        });
    }

    async function testAnki() {
        ankiLabel = await ctx.testAnkiClient();
    }

    function requestClose() {
        if (JSON.stringify(draft) === JSON.stringify(ctx.settings)) {
            ctx.close();
            return;
        }
        confirmDialog({
            title: t.settings.unsavedTitle,
            content: `<div class="b3-typography">${t.settings.unsavedDesc}</div>`,
            confirm: () => ctx.close(),
        });
    }

    function save() {
        draft.dailyNewTarget = Math.max(0, Number(draft.dailyNewTarget) || 0);
        draft.dailyReviewTarget = Math.max(0, Number(draft.dailyReviewTarget) || 0);
        draft.timeoutSeconds = Math.min(3600, Math.max(5, Number(draft.timeoutSeconds) || 60));
        draft.leechThreshold = Math.max(1, Number(draft.leechThreshold) || 8);
        ctx.save(draft);
        ctx.close();
    }
</script>

<div class="lv-settings b3-typography">
    <LvSection title={t.settings.personaSection}>
        <div class="fn__flex fn__flex-wrap lv-personas">
            {#each PERSONA_PRESETS as p (p.id)}
                <button
                    class="lv-persona"
                    class:lv-persona-active={draft.persona === p.id}
                    onclick={() => applyPersona(p)}
                >
                    <div class="lv-persona-name">{t[p.nameKey]}</div>
                    <div class="ft__smaller ft__on-surface">{t[p.descKey]}</div>
                </button>
            {/each}
            <div class="lv-persona" class:lv-persona-active={draft.persona === "custom"}>
                <div class="lv-persona-name">{t.personaCustom}</div>
                <div class="ft__smaller ft__on-surface">{t.personaCustom_desc}</div>
            </div>
        </div>
    </LvSection>

    <LvSection title={t.settings.modules}>
        {#each MODULE_DEFS as m (m.id)}
            <LvRow label={t.modules[m.nameKey]} hint={m.locked ? t.settings.lockedModule : t.modules[m.descKey]}>
                {#snippet children()}
                    <LvChip tone={m.phase === "v0.1" ? "primary" : m.phase === "v0.9" ? "warn" : "default"}>{m.phase}</LvChip>
                    {#if m.locked}
                        <input class="b3-switch" type="checkbox" checked disabled />
                    {:else}
                        <input class="b3-switch" type="checkbox" checked={draft.modules[m.id]} onchange={(e) => toggleModule(m.id, e)} />
                    {/if}
                {/snippet}
            </LvRow>
        {/each}
    </LvSection>

    <LvSection title={t.settings.study}>
        <LvRow label={t.settings.dailyNewTarget}>
            <input class="b3-text-field fn__size-60" type="number" min="0" bind:value={draft.dailyNewTarget} />
        </LvRow>
        <LvRow label={t.settings.dailyReviewTarget}>
            <input class="b3-text-field fn__size-60" type="number" min="0" bind:value={draft.dailyReviewTarget} />
        </LvRow>
        <LvRow label={t.settings.ratingStyle}>
            <select class="b3-select fn__size-200" bind:value={draft.ratingStyle}>
                <option value="four">{t.settings.ratingFour}</option>
                <option value="three">{t.settings.ratingThree}</option>
            </select>
        </LvRow>
        <LvRow label={t.settings.timeoutMode}>
            <select class="b3-select fn__size-200" bind:value={draft.timeoutMode}>
                <option value="off">{t.settings.timeoutOff}</option>
                <option value="reveal">{t.settings.timeoutReveal}</option>
                <option value="forget">{t.settings.timeoutForget}</option>
            </select>
        </LvRow>
        {#if draft.timeoutMode !== "off"}
            <LvRow label={t.settings.timeoutSeconds}>
                <input class="b3-text-field fn__size-60" type="number" min="5" max="3600" bind:value={draft.timeoutSeconds} />
            </LvRow>
        {/if}
        <LvRow label={t.settings.randomOrder}>
            <input class="b3-switch" type="checkbox" bind:checked={draft.randomOrder} />
        </LvRow>
        <LvRow label={t.settings.batchLimit} hint={t.settings.batchLimitHint}>
            <input class="b3-text-field fn__size-60" type="number" min="0" bind:value={draft.batchLimit} />
        </LvRow>
        <LvRow label={t.settings.requeueAgain} hint={t.settings.requeueAgainHint}>
            <input class="b3-switch" type="checkbox" bind:checked={draft.requeueAgain} />
        </LvRow>
        <LvRow label={t.settings.typingEnabled}>
            <input class="b3-switch" type="checkbox" bind:checked={draft.typingEnabled} />
        </LvRow>
        {#if draft.typingEnabled}
            <LvRow label={t.settings.typingStrict}>
                <input class="b3-switch" type="checkbox" bind:checked={draft.typingStrict} />
            </LvRow>
            <LvRow label={t.settings.dictationEnabled}>
                <input class="b3-switch" type="checkbox" bind:checked={draft.dictationEnabled} />
            </LvRow>
        {/if}
        <LvRow label={t.settings.ttsEnabled}>
            <input class="b3-switch" type="checkbox" bind:checked={draft.ttsEnabled} />
        </LvRow>
        {#if draft.ttsEnabled}
            <LvRow label={t.settings.ttsRate}>
                <input class="b3-text-field fn__size-60" type="number" min="0.5" max="2" step="0.1" bind:value={draft.ttsRate} />
            </LvRow>
            <LvRow label={t.settings.ttsVoice} hint={t.settings.ttsVoiceHint}>
                {#snippet children()}
                    <select class="b3-select fn__size-200" bind:value={draft.ttsVoice}>
                        <option value="">{t.settings.ttsVoiceDefault}</option>
                        {#each voices as v (v.name)}<option value={v.name}>{v.name}</option>{/each}
                    </select>
                {/snippet}
            </LvRow>
        {/if}
        <LvRow label={t.settings.choiceEnabled}>
            <input class="b3-switch" type="checkbox" bind:checked={draft.choiceEnabled} />
        </LvRow>
        <LvRow label={t.settings.quietSection} hint={t.settings.quietHint}> </LvRow>
        <LvRow label={t.settings.quietStart}>
            <input class="b3-text-field fn__size-60" type="time" bind:value={draft.quietStart} />
        </LvRow>
        <LvRow label={t.settings.quietEnd}>
            <input class="b3-text-field fn__size-60" type="time" bind:value={draft.quietEnd} />
        </LvRow>
        <LvRow label={t.settings.leechThreshold}>
            <input class="b3-text-field fn__size-60" type="number" min="1" bind:value={draft.leechThreshold} />
        </LvRow>
        <LvRow label={t.settings.ttsEnabled}>
            <input class="b3-switch" type="checkbox" bind:checked={draft.ttsEnabled} />
        </LvRow>
        <LvRow label={t.settings.reminderEnabled}>
            <input class="b3-switch" type="checkbox" bind:checked={draft.reminderEnabled} />
        </LvRow>
        {#if draft.reminderEnabled}
            <LvRow label={t.settings.reminderTime}>
                <input class="b3-text-field fn__size-60" type="time" bind:value={draft.reminderTime} />
            </LvRow>
            <LvRow label={t.settings.backlogDays}>
                <input class="b3-text-field fn__size-60" type="number" min="1" bind:value={draft.backlogDays} />
            </LvRow>
        {/if}
    </LvSection>

    <LvSection title={t.settings.aiSection} sub={t.settings.aiSectionHint}>
        <LvRow label={t.settings.aiMode}>
            {#snippet children()}
                <select class="b3-select fn__size-200" bind:value={draft.aiMode}>
                    <option value="siyuan">{t.settings.aiModeSiyuan}</option>
                    <option value="custom">{t.settings.aiModeCustom}</option>
                </select>
            {/snippet}
        </LvRow>
        {#if draft.aiMode === "custom"}
            <LvRow label={t.settings.aiEndpoint}>
                <input class="b3-text-field fn__size-200" placeholder="https://api.example.com/v1" bind:value={draft.aiEndpoint} />
            </LvRow>
            <LvRow label={t.settings.aiModel}>
                <input class="b3-text-field fn__size-200" placeholder="gpt-4o-mini" bind:value={draft.aiModel} />
            </LvRow>
            <LvRow label={t.settings.aiKey} hint={t.settings.aiKeyHint}>
                <input class="b3-text-field fn__size-200" type="password" bind:value={draft.aiKey} />
            </LvRow>
        {/if}
    </LvSection>

    <LvSection title={t.settings.exam}>
        <LvRow label={t.settings.examEnabled}>
            <input class="b3-switch" type="checkbox" bind:checked={draft.examEnabled} />
        </LvRow>
        <LvRow label={t.settings.examDate}>
            <input class="b3-text-field fn__size-200" type="date" bind:value={draft.examDate} disabled={!draft.examEnabled} />
        </LvRow>
        <div class="ft__smaller ft__on-surface">{t.settings.examHint}</div>
    </LvSection>

    <LvSection title={t.settings.ankiSection} sub={t.settings.ankiSectionHint}>
        <LvRow label={t.settings.ankiUrl}>
            <input class="b3-text-field fn__size-200" bind:value={draft.ankiClientUrl} />
        </LvRow>
        <LvRow label={t.settings.ankiKey}>
            <input class="b3-text-field fn__size-200" type="password" bind:value={draft.ankiClientKey} />
        </LvRow>
        <LvRow label={t.settings.ankiTest}>
            {#snippet children()}
                {#if ankiLabel}<span class="ft__smaller ft__on-surface">{ankiLabel}</span>{/if}
                <button class="b3-button b3-button--outline" onclick={testAnki}>{t.settings.ankiTest}</button>
            {/snippet}
        </LvRow>
    </LvSection>

    <LvSection title={t.settings.dataSection}>
        <LvRow label="Flashcard V2" hint={t.dashboard.v2Active}>
            {#snippet children()}
                <LvChip tone={v2Label.startsWith("Active") ? "primary" : v2Label === "N/A (<3.9.0)" ? "default" : "warn"}>{v2Label}</LvChip>
                <button class="b3-button b3-button--outline" onclick={redetectV2}>{t.settings.redetectV2}</button>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.suspendedManage} hint={t.settings.suspendedHint.replace("${n}", String(ctx.getSuspendedCount()))}>
            {#snippet children()}
                <button class="b3-button b3-button--outline" disabled={ctx.getSuspendedCount() === 0} onclick={ctx.restoreAllSuspended}>
                    {t.settings.suspendedRestore}
                </button>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.exportRevlog} hint={t.settings.storageNote}>
            {#snippet children()}
                <button class="b3-button b3-button--outline" onclick={ctx.exportRevlog}>JSON</button>
                <button class="b3-button b3-button--outline" onclick={ctx.exportRevlogCsv}>CSV</button>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.exportSettings}>
            {#snippet children()}
                <button class="b3-button b3-button--outline" onclick={ctx.exportSettings}>{t.settings.exportSettings}</button>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.importMerge} hint={t.settings.importMergeHint}>
            {#snippet children()}
                <input class="b3-button b3-button--outline" type="file" accept=".json,application/json" onchange={importMerge} />
                <input class="b3-button b3-button--outline" type="file" accept=".csv,text/csv" onchange={importCsv} />
            {/snippet}
        </LvRow>
        <div class="lv-storage">
            <div class="fn__flex lv-st-head ft__smaller ft__on-surface">
                <span>file</span><div class="fn__flex-1"></div><span>{t.settings.storageLastWrite}</span>
            </div>
            {#each ctx.storageStats() as row (row.file)}
                <div class="fn__flex lv-st-row">
                    <span>{row.file}</span>
                    <div class="fn__flex-1"></div>
                    <span class="ft__smaller ft__on-surface">{row.size}</span>
                    <span class="ft__smaller ft__on-surface lv-lw">{row.lastWrite ? new Date(row.lastWrite).toLocaleString() : "—"}</span>
                </div>
            {/each}
        </div>
        <LvRow label={t.settings.clearRevlog}>
            {#snippet children()}
                <button
                    class="b3-button b3-button--outline"
                    onclick={() => confirmDialog({
                        title: t.settings.clearRevlog,
                        content: `<div class="b3-typography">${t.settings.clearRevlogConfirm}</div>`,
                        confirm: () => {
                            ctx.exportRevlog(); // 清空前自动备份（AK）
                            ctx.clearRevlog();
                        },
                    })}
                >{t.settings.clearRevlog}</button>
            {/snippet}
        </LvRow>
    </LvSection>

    <div class="b3-dialog__action">
        <button class="b3-button b3-button--cancel" onclick={requestClose}>{window.siyuan.languages.cancel}</button>
        <div class="fn__space"></div>
        <button class="b3-button b3-button--text" onclick={save}>{window.siyuan.languages.confirm}</button>
    </div>
</div>

<style lang="scss">
    .lv-settings {
        padding: var(--lv-sp-4);
        height: 100%;
        overflow: auto;
        box-sizing: border-box;
        max-width: 720px;
        margin: 0 auto;

        .b3-dialog__action { justify-content: flex-end; }

        .lv-storage {
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-s);
            padding: var(--lv-sp-2) var(--lv-sp-3);
            .lv-st-head, .lv-st-row { gap: var(--lv-sp-3); align-items: center; padding: 2px 0; }
            .lv-st-head { border-bottom: 1px solid var(--lv-border); padding-bottom: var(--lv-sp-1); }
            .lv-lw { margin-left: var(--lv-sp-3); font-variant-numeric: tabular-nums; }
        }

        .lv-personas { gap: var(--lv-sp-2); }
        .lv-persona {
            flex: 1 1 130px;
            padding: var(--lv-sp-3);
            cursor: pointer;
            border: 1px solid var(--lv-border);
            background: var(--b3-theme-background);
            text-align: left;
            border-radius: var(--lv-r-m);
            transition: border-color var(--lv-dur-2) var(--lv-ease),
                transform var(--lv-dur-2) var(--lv-ease),
                box-shadow var(--lv-dur-2) var(--lv-ease);

            &:hover {
                transform: translateY(-2px);
                box-shadow: var(--lv-shadow-2);
                border-color: var(--lv-border-strong);
            }
        }
        .lv-persona-active {
            border-color: var(--lv-primary-border);
            background: var(--lv-primary-softer);
            box-shadow: var(--lv-focus-ring);
        }
        .lv-persona-name { font-weight: 600; margin-bottom: 2px; }
    }
</style>
