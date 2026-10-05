<script lang="ts">
    /**
     * T10 修卡演练（docs/13 §12，starline help 面）：独立样例上的五步修卡练习。
     * 纪律：固定公开样例、零网络（"固定 AI 改法"不发请求）、零数据写入、
     * 演练进度与旁路练习表现不迁入真实学习、不产生正式评分。
     */
    import { fade } from "svelte/transition";
    import LvSteps from "./kit/LvSteps.svelte";

    let { i18n, onClose }: { i18n: any; onClose: () => void } = $props();
    const t = $derived(i18n);

    const STEPS = 5;
    let step = $state(1); // 1..5
    let draft = $state(t.drillBrokenQ);
    let revealed = $state(false);

    const stepLabels = $derived([
        t.drillStep1,
        t.drillStep2,
        t.drillStep3,
        t.drillStep4,
        t.drillStep5,
    ]);
</script>

<div class="lv-aiwiz b3-typography">
    <div class="lv-ob-head">
        <LvSteps steps={stepLabels} current={step - 1} />
        <div class="fn__flex-1"></div>
        <span class="lv-tag lv-tag--brand">{t.drillBadge}</span>
        <button class="b3-button b3-button--small" onclick={onClose}>✕</button>
    </div>

    {#key step}
        <div transition:fade={{ duration: 160 }}>
            {#if step === 1}
                <!-- 看材料与必要条件 -->
                <div class="lv-card2" style="margin-bottom: var(--lv-sp-2)">
                    <div class="lv-eyebrow">{t.drillMaterialLabel}</div>
                    <p style="line-height: 1.95; margin: 10px 0">{t.drillMaterial}</p>
                    <div class="ft__smaller ft__on-surface">{t.drillMaterialNote}</div>
                </div>
                <div class="lv-notice lv-notice--warn">{t.drillIntro}</div>
            {:else if step === 2}
                <!-- 找出题面的问题 -->
                <div class="lv-card2" style="margin-bottom: var(--lv-sp-2)">
                    <div class="lv-eyebrow">{t.drillCardLabel}</div>
                    <div style="font-weight: 650; margin: 10px 0; line-height: 1.65">{t.drillBrokenQ}</div>
                </div>
                <div class="lv-notice lv-notice--warn">{t.drillIssue}</div>
            {:else if step === 3}
                <!-- 修改并看实际卡面 -->
                <label class="ft__smaller" style="display: block; margin-bottom: 6px">{t.drillEditLabel}</label>
                <textarea class="b3-text-field fn__block" rows="2" bind:value={draft}></textarea>
                <div class="lv-card2" style="margin-top: 10px; padding: 18px 20px">
                    <div class="lv-eyebrow">{t.aiWizard.previewQLabel}</div>
                    <div style="font-weight: 650; margin: 8px 0; line-height: 1.65">{draft || "—"}</div>
                </div>
                <div class="lv-notice">{t.drillEditNote}</div>
            {:else if step === 4}
                <!-- 对照固定改法（不发请求） -->
                <div class="lv-card2" style="margin-bottom: var(--lv-sp-2)">
                    <div class="lv-eyebrow">{t.drillEditLabel}</div>
                    <div style="margin: 8px 0; line-height: 1.65">{draft || "—"}</div>
                </div>
                <div class="lv-card2" style="margin-bottom: var(--lv-sp-2)">
                    <div class="lv-eyebrow">{t.drillFixedLabel}</div>
                    <div style="margin: 8px 0; line-height: 1.65">{t.drillFixed}</div>
                </div>
                <div class="lv-notice">{t.drillCompareNote}</div>
            {:else}
                <!-- 旁路试练：自评对照，不迁入真实证据 -->
                <div class="lv-card2" style="margin-bottom: var(--lv-sp-2)">
                    <div class="lv-eyebrow">{t.drillPractice}</div>
                    <div style="font-weight: 650; margin: 10px 0; line-height: 1.65">{draft || "—"}</div>
                    {#if revealed}
                        <div style="border-top: 1px solid var(--lv-border); padding-top: 12px; margin-top: 12px; line-height: 1.65">{t.drillAnswer}</div>
                    {:else}
                        <button class="b3-button" style="margin-top: 8px" onclick={() => (revealed = true)}>{t.drillReveal}</button>
                    {/if}
                </div>
                <div class="lv-notice">{t.drillPracticeNote}</div>
            {/if}
        </div>
    {/key}

    <div class="fn__flex" style="justify-content: space-between; gap: var(--lv-sp-2); margin-top: var(--lv-sp-3)">
        <button class="b3-button b3-button--outline" disabled={step <= 1} onclick={() => (step = Math.max(1, step - 1))}>← {t.drillPrev}</button>
        <span class="ft__smaller ft__on-surface">{step} / {STEPS}</span>
        {#if step < STEPS}
            <button class="b3-button lv-btn-primary" onclick={() => (step = Math.min(STEPS, step + 1))}>{t.drillNext} →</button>
        {:else}
            <button class="b3-button lv-btn-primary" onclick={onClose}>{t.drillExit}</button>
        {/if}
    </div>
    <div class="ft__smaller ft__on-surface" style="margin-top: var(--lv-sp-3); text-align: center">{t.drillFoot}</div>
</div>
