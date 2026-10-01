<script lang="ts">
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
    }

    let { ctx }: { ctx: SettingsCtx } = $props();
    const t = $derived(ctx.i18n);

    let draft: LvCardsSettings = $state(JSON.parse(JSON.stringify(ctx.settings)));
    let v2Label = $state(ctx.getV2Status());

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
        <LvRow label={t.settings.leechThreshold}>
            <input class="b3-text-field fn__size-60" type="number" min="1" bind:value={draft.leechThreshold} />
        </LvRow>
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
                <button class="b3-button b3-button--outline" onclick={ctx.exportRevlog}>{t.settings.exportRevlog}</button>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.clearRevlog}>
            {#snippet children()}
                <button
                    class="b3-button b3-button--outline"
                    onclick={() => confirmDialog({
                        title: t.settings.clearRevlog,
                        content: `<div class="b3-typography">${t.settings.clearRevlogConfirm}</div>`,
                        confirm: () => ctx.clearRevlog(),
                    })}
                >{t.settings.clearRevlog}</button>
            {/snippet}
        </LvRow>
    </LvSection>

    <div class="b3-dialog__action">
        <button class="b3-button b3-button--cancel" onclick={ctx.close}>{window.siyuan.languages.cancel}</button>
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
