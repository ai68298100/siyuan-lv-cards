<script lang="ts">
    import { onMount } from "svelte";
    import { getNotebooks, type Notebook } from "@/api/siyuan";
    import LvSection from "./kit/LvSection.svelte";
    import LvRow from "./kit/LvRow.svelte";
    import LvKbd from "./kit/LvKbd.svelte";

    let { i18n, applyPersona, createSampleCards, openReview, onClose }: {
        i18n: any;
        applyPersona: (id: "exam" | "notes" | "language") => void;
        createSampleCards: (notebookId: string) => Promise<void>;
        openReview: () => void;
        onClose: () => void;
    } = $props();
    const t = $derived(i18n);

    let step = $state(1);
    let persona = $state<"exam" | "notes" | "language">("exam");
    let notebooks: Notebook[] = $state([]);
    let nbId = $state("");
    let busy = $state(false);
    let errorMsg = $state("");

    const personaKeys = [
        { id: "exam", nameKey: "personaExam" },
        { id: "notes", nameKey: "personaNotes" },
        { id: "language", nameKey: "personaLanguage" },
    ] as const;

    onMount(async () => {
        try {
            notebooks = await getNotebooks();
            if (notebooks.length > 0) {
                nbId = notebooks[0].id;
            }
        } catch {
            // 允许稍后在步骤 2 重试
        }
    });

    function pickPersona(id: "exam" | "notes" | "language") {
        persona = id;
        applyPersona(id);
        step = 2;
    }

    async function createSamples() {
        if (busy || !nbId) {
            errorMsg = notebooks.length === 0 ? t.onboardingNoNotebook : "";
            return;
        }
        busy = true;
        errorMsg = "";
        try {
            await createSampleCards(nbId);
            step = 3;
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            busy = false;
        }
    }

    function finish() {
        openReview();
        onClose();
    }
</script>

<div class="lv-onboarding b3-typography">
    <div class="lv-ob-head">
        <span class="lv-ob-step">{t.onboardingStep} {step} / 3</span>
        <div class="fn__flex-1"></div>
        <button class="b3-button b3-button--small" onclick={onClose}>{t.onboardingSkip}</button>
    </div>

    {#if step === 1}
        <!-- R53 UX：标题不与对话框头重复——用步骤问题句驱动选择 -->
        <LvSection title={t.onboardingPersonaQ} sub={t.onboardingPersonaHint}>
            <div class="fn__flex fn__flex-wrap lv-ob-cards">
                {#each personaKeys as p (p.id)}
                    <button class="lv-persona" class:lv-persona-active={persona === p.id} onclick={() => pickPersona(p.id)}>
                        <div class="lv-persona-name">{t[p.nameKey]}</div>
                        <div class="ft__smaller ft__on-surface">{t[p.nameKey + "_desc"]}</div>
                    </button>
                {/each}
            </div>
        </LvSection>
    {:else if step === 2}
        <LvSection title={t.onboardingSampleTitle} sub={t.onboardingSampleHint}>
            <LvRow label={t.onboardingNotebook}>
                {#snippet children()}
                    <select class="b3-select fn__size-200" bind:value={nbId}>
                        {#each notebooks as n (n.id)}
                            <option value={n.id}>{n.name}</option>
                        {/each}
                    </select>
                {/snippet}
            </LvRow>
            {#if errorMsg}
                <div class="ft__smaller" style="color: var(--b3-theme-error)">{errorMsg}</div>
            {/if}
            <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-2)">
                <button class="b3-button b3-button--outline" onclick={() => (step = 1)}>{t.onboardingBack}</button>
                <button class="b3-button b3-button--text lv-btn-primary" disabled={busy || !nbId} onclick={createSamples}>
                    {busy ? "…" : t.onboardingCreate}
                </button>
            </div>
        </LvSection>
    {:else}
        <LvSection title={t.onboardingDoneTitle}>
            <div class="ft__on-surface">{t.onboardingDoneDesc}</div>
            <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-3)">
                <button class="b3-button b3-button--text lv-btn-primary" onclick={finish}>
                    {t.onboardingFinish} <LvKbd k="→" />
                </button>
            </div>
        </LvSection>
    {/if}
</div>

<style>
    .lv-onboarding {
        padding: var(--lv-sp-4);
        max-width: 640px;
        margin: 0 auto;
        height: 100%;
        overflow: auto;
        box-sizing: border-box;
    }
    .lv-ob-head {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-ob-step {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        font-variant-numeric: tabular-nums;
    }
    .lv-ob-cards {
        gap: var(--lv-sp-2);
    }
    .lv-persona {
        flex: 1 1 140px;
        padding: var(--lv-sp-3);
        cursor: pointer;
        border: 1px solid var(--lv-border);
        background: var(--b3-theme-background);
        text-align: left;
        border-radius: var(--lv-r-m);
        transition: border-color var(--lv-dur-2) var(--lv-ease), transform var(--lv-dur-2) var(--lv-ease),
            box-shadow var(--lv-dur-2) var(--lv-ease);
    }
    .lv-persona:hover {
        transform: translateY(-2px);
        box-shadow: var(--lv-shadow-2);
        border-color: var(--lv-border-strong);
    }
    .lv-persona-active {
        border-color: var(--lv-primary-border);
        background: var(--lv-primary-softer);
        box-shadow: var(--lv-focus-ring);
    }
    .lv-persona-name {
        font-weight: 600;
        margin-bottom: 2px;
    }
</style>
