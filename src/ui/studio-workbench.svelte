<script lang="ts">
    import { onDestroy } from "svelte";
    type StudioSource = { label: string; content: string; docId?: string; nbId?: string; inboxId?: string };
    type InboxRequest = { id: number; sources: StudioSource[]; onImportComplete: (ids: string[]) => void };
    type ViewMount = (component: any, target: HTMLElement, props: Record<string, any>) => { destroy(): void };
    type LoadedView = { Component: any; props: Record<string, any>; mount?: ViewMount };

    let {
        i18n,
        aiConfigured = false,
        loadWizard,
        loadQuickCard,
        openDrill,
        openOnboarding,
        inboxRequest,
        isActive = false,
        manualRequest = 0,
        aiRequest = 0,
        recoveryJobId = "",
    }: {
        i18n: any;
        aiConfigured?: boolean;
        loadWizard?: (sources?: StudioSource[], onImportComplete?: (ids: string[]) => void, recoveryJobId?: string) => Promise<LoadedView>;
        loadQuickCard?: () => Promise<LoadedView>;
        openDrill?: () => void;
        openOnboarding: () => void;
        inboxRequest?: InboxRequest | null;
        isActive?: boolean;
        manualRequest?: number;
        aiRequest?: number;
        recoveryJobId?: string;
    } = $props();

    // The hub keeps this component mounted when navigation changes, so an unfinished draft stays in memory.
    let mode = $state<"manual" | "ai">("manual");
    let QuickCard = $state<any>(null);
    let quickCardProps = $state<Record<string, any>>({});
    let quickCardMount = $state<ViewMount | null>(null);
    let quickCardHost = $state<HTMLElement | null>(null);
    let AIWizard = $state<any>(null);
    let aiWizardProps = $state<Record<string, any>>({});
    let aiWizardMount = $state<ViewMount | null>(null);
    let aiWizardHost = $state<HTMLElement | null>(null);
    let loading = $state(false);
    let error = $state("");
    let pendingRequest = $state<InboxRequest | null>(null);
    let pendingRecoveryJobId = $state("");
    let handledInboxRequest = 0;
    let wizardRun = $state(0);
    let handledManualRequest = 0;
    let handledAiRequest = 0;
    let initialLoadStarted = false;
    // The hub chunk and dialogs chunk have separate Svelte runtimes. Keep the
    // returned handles outside reactive state; only the host DOM node is reactive.
    let quickCardHandle: { destroy(): void } | null = null;
    let aiWizardHandle: { destroy(): void } | null = null;

    $effect(() => {
        const host = quickCardHost;
        const Component = QuickCard;
        const mount = quickCardMount;
        if (!host || !Component || !mount) return;
        quickCardHandle?.destroy();
        quickCardHandle = mount(Component, host, {
            ...quickCardProps,
            embedded: true,
            onClose: () => (mode = "manual"),
        });
        return () => {
            quickCardHandle?.destroy();
            quickCardHandle = null;
        };
    });

    $effect(() => {
        const host = aiWizardHost;
        const Component = AIWizard;
        const mount = aiWizardMount;
        if (!host || !Component || !mount) return;
        aiWizardHandle?.destroy();
        aiWizardHandle = mount(Component, host, {
            ...aiWizardProps,
            embedded: true,
            closeLabel: i18n.hubStudioReturnManual ?? "返回手工制卡",
            onClose: () => (mode = "manual"),
        });
        return () => {
            aiWizardHandle?.destroy();
            aiWizardHandle = null;
        };
    });

    onDestroy(() => {
        quickCardHandle?.destroy();
        aiWizardHandle?.destroy();
    });

    async function startManual() {
        error = "";
        mode = "manual";
        if (!QuickCard) {
            if (loading) return;
            if (!loadQuickCard) {
                error = i18n.hubStudioManualUnavailable ?? "手工制卡暂不可用，请重新打开插件后重试。";
                return;
            }
            loading = true;
            try {
                const view = await loadQuickCard();
                QuickCard = view.Component;
                quickCardProps = view.props;
                quickCardMount = view.mount ?? null;
            } catch (e: any) {
                error = e?.message ?? String(e);
            } finally {
                loading = false;
            }
        }
        if (QuickCard) mode = "manual";
    }

    async function startAI(sources?: StudioSource[], onImportComplete?: (ids: string[]) => void) {
        error = "";
        if (AIWizard && (!sources || sources.length === 0) && !onImportComplete) {
            mode = "ai";
            return;
        }
        mode = "ai";
        if (loading) return;
        if (!loadWizard) {
            error = i18n.hubStudioAIUnavailable ?? "AI 制卡暂不可用，可先使用手工制卡。";
            return;
        }
        loading = true;
        try {
            const view = await loadWizard(sources, onImportComplete);
            AIWizard = view.Component;
            aiWizardProps = view.props;
            aiWizardMount = view.mount ?? null;
            wizardRun++;
            mode = "ai";
        } catch (e: any) {
            error = e?.message ?? String(e);
        } finally {
            loading = false;
        }
    }

    async function startRecovery(jobId: string) {
        error = "";
        mode = "ai";
        if (!loadWizard) {
            error = i18n.hubStudioAIUnavailable ?? "AI 制卡暂不可用，可先使用手工制卡。";
            return;
        }
        if (loading) return;
        loading = true;
        try {
            const view = await loadWizard(undefined, undefined, jobId);
            AIWizard = view.Component;
            aiWizardProps = view.props;
            aiWizardMount = view.mount ?? null;
            wizardRun++;
            pendingRecoveryJobId = "";
            mode = "ai";
        } catch (e: any) {
            error = e?.message ?? String(e);
        } finally {
            loading = false;
        }
    }

    function requestRecovery(jobId: string) {
        if (AIWizard) {
            pendingRecoveryJobId = jobId;
            mode = "ai";
            return;
        }
        void startRecovery(jobId);
    }

    function applyPendingRequest() {
        const request = pendingRequest;
        if (!request) return;
        pendingRequest = null;
        void startAI(request.sources, request.onImportComplete);
    }

    $effect(() => {
        const request = pendingRequest;
        if (request && !AIWizard && !loading) {
            pendingRequest = null;
            void startAI(request.sources, request.onImportComplete);
        }
    });

    $effect(() => {
        if (isActive && !initialLoadStarted && manualRequest <= 0 && aiRequest <= 0 && !inboxRequest) {
            initialLoadStarted = true;
            void startManual();
        }
    });

    $effect(() => {
        const request = manualRequest;
        if (request > 0 && request !== handledManualRequest) {
            handledManualRequest = request;
            void startManual();
        }
    });

    $effect(() => {
        const request = aiRequest;
        if (request > 0 && request !== handledAiRequest) {
            handledAiRequest = request;
            if (recoveryJobId) requestRecovery(recoveryJobId);
            else void startAI();
        }
    });

    $effect(() => {
        const request = inboxRequest;
        if (!request || request.id === handledInboxRequest) return;
        handledInboxRequest = request.id;
        error = "";
        mode = "ai";
        if (AIWizard || loading) {
            pendingRequest = request;
        } else {
            void startAI(request.sources, request.onImportComplete);
        }
    });
</script>

<div class="lv-r54-workbench lv-studio">
    <div class="lv-studio-heading">
        <div class="lv-eyebrow">{i18n.hubStudioEyebrow ?? "制卡工作台"}</div>
        <h2>{mode === "manual" ? (i18n.hubStudioManualTitle ?? "先写一张清楚的卡") : (i18n.aiWizardTitle ?? "AI 制卡")}</h2>
        <p>
            {mode === "manual"
                ? (i18n.hubStudioManualDesc ?? "先写一个清楚的问题，再补上可以核对的答案。")
                : aiConfigured
                    ? (i18n.hubStudioAIConfiguredHint ?? "生成前仍可检查材料、来源和外发范围。")
                    : (i18n.hubStudioAIHint ?? "AI 尚未配置也可先手工制卡；生成前会提示配置条件。")}
        </p>
    </div>
    <div class="lv-studio-toolbar">
        <div class="lv-studio-modes" role="group" aria-label={i18n.hubStudioModeLabel ?? "制卡方式"}>
            <button class="b3-button" class:lv-studio-mode-active={mode === "manual"} aria-pressed={mode === "manual"} disabled={loading} onclick={startManual}>
                {i18n.hubStudioManualKicker ?? "手工制卡"}
            </button>
            <button class="b3-button" class:lv-studio-mode-active={mode === "ai"} aria-pressed={mode === "ai"} disabled={loading} onclick={() => startAI()}>
                {i18n.hubStudioAICicker ?? "AI 辅助"}
            </button>
        </div>
        <div class="lv-studio-tools">
            {#if openDrill}<button class="b3-button b3-button--text" onclick={() => openDrill?.()}>{i18n.authoringDrillOpen ?? "修卡演练"}</button>{/if}
            <button class="b3-button b3-button--text lv-studio-onboarding" onclick={openOnboarding}>{i18n.hubStudioOnboarding ?? "上手与示例"}</button>
        </div>
    </div>

    {#if error}<div class="lv-studio-error" role="alert">{i18n.hubStudioLoadError ?? "工作台打开失败"}：{error}</div>{/if}

    {#if pendingRecoveryJobId}
        <div class="lv-studio-replace" role="status">
            <div class="lv-studio-replace-copy">
                <strong>{i18n.hubStudioRecoveryReplaceTitle ?? "恢复审核会替换当前 AI 草稿"}</strong>
                <p>{i18n.hubStudioRecoveryReplaceBody ?? "当前草稿仍保留在此工作台。确认后才载入已保存的候选卡。"}</p>
            </div>
            <button class="b3-button lv-btn-primary" disabled={loading} onclick={() => startRecovery(pendingRecoveryJobId)}>{i18n.hubStudioRecoveryReplaceAction ?? "载入候选审核"}</button>
            <button class="b3-button b3-button--text" disabled={loading} onclick={() => (pendingRecoveryJobId = "")}>{i18n.hubStudioKeepDraft ?? "保留当前草稿"}</button>
        </div>
    {/if}

    {#if mode === "manual" && loading && !QuickCard}
        <div class="lv-studio-loading" role="status" aria-busy="true">{i18n.hubStudioLoading ?? "正在打开手工制卡…"}</div>
    {/if}

    {#if mode === "ai" && loading && !AIWizard}
        <div class="lv-studio-loading" role="status" aria-busy="true">{i18n.hubStudioLoading ?? "正在打开…"}</div>
    {/if}

    {#if QuickCard}
        <section hidden={mode !== "manual"} class="lv-studio-tool">
            {#if quickCardMount}
                <div bind:this={quickCardHost}></div>
            {:else}
                <QuickCard {...quickCardProps} embedded={true} onClose={() => (mode = "manual")} />
            {/if}
        </section>
    {/if}

    {#if AIWizard}
        <section hidden={mode !== "ai"} class="lv-studio-tool">
            <div class="lv-studio-tool-head">
                <div><div class="lv-eyebrow">{i18n.hubStudioAICicker ?? "AI 辅助"}</div><h2>{i18n.aiWizardTitle}</h2></div>
                <button class="b3-button b3-button--text" onclick={() => (mode = "manual")}>{i18n.hubStudioReturnManual ?? "返回手工制卡"}</button>
            </div>
            {#if pendingRequest}
                <div class="lv-studio-replace" role="status">
                    <div class="lv-studio-replace-copy">
                        <strong>{i18n.hubStudioReplaceTitle ?? "收件箱材料已就绪"}</strong>
                        <p>{i18n.hubStudioReplaceBody?.replace("${n}", String(pendingRequest.sources.length)) ?? `将载入 ${pendingRequest.sources.length} 条来源，并替换当前 AI 草稿。`}</p>
                    </div>
                    <button class="b3-button lv-btn-primary" disabled={loading} onclick={applyPendingRequest}>{i18n.hubStudioReplaceAction ?? "替换并载入"}</button>
                    <button class="b3-button b3-button--text" onclick={() => (pendingRequest = null)}>{i18n.hubStudioKeepDraft ?? "保留当前草稿"}</button>
                </div>
            {/if}
            {#key wizardRun}
                {#if aiWizardMount}
                    <div bind:this={aiWizardHost}></div>
                {:else}
                    <AIWizard
                        {...aiWizardProps}
                        embedded={true}
                        closeLabel={i18n.hubStudioReturnManual ?? "返回手工制卡"}
                        onClose={() => (mode = "manual")}
                    />
                {/if}
            {/key}
        </section>
    {/if}
</div>

<style>
    .lv-studio { max-width: 1120px; margin: 0 auto; padding: var(--lv-sp-5); container: lv-studio / inline-size; }
    .lv-studio-tool[hidden] { display: none !important; }
    .lv-studio-tool { min-width: 0; }
    .lv-studio-heading { margin: 0 0 var(--lv-sp-4); }
    .lv-studio-heading h2 { margin: calc(var(--lv-space-unit) * 2) 0 calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)); font-size: 21px; line-height: var(--lv-lh-reading-tight); }
    .lv-studio-heading p { margin: 0; color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size); line-height: 1.65; }
    .lv-studio-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: var(--lv-sp-3); }
    .lv-studio-modes {
        display: inline-flex;
        gap: 4px;
        padding: calc(var(--lv-space-unit) * 2);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-canvas);
        border: 1px solid var(--lv-border);
        box-shadow: inset 0 1px 2px color-mix(in srgb, black 3%, transparent);
    }
    .lv-studio-modes .b3-button {
        min-height: 38px;
        padding: 0 var(--lv-sp-4);
        border: 1px solid transparent;
        border-radius: var(--lv-r-control);
        background: transparent;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-body-size);
        font-weight: var(--lv-fw-medium);
        transition: color var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease), box-shadow var(--lv-dur-1) var(--lv-ease);
    }
    .lv-studio-modes .lv-studio-mode-active {
        border-color: var(--lv-border);
        background: var(--lv-color-surface);
        color: var(--lv-color-brand);
        font-weight: var(--lv-fw-semibold);
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
    }
    .lv-studio-tools { display: flex; align-items: center; gap: calc(var(--lv-space-unit) * 2); }
    .lv-studio-onboarding { min-height: 44px; }
    .lv-studio-replace {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        margin: 0 0 calc(var(--lv-space-unit) * 7);
        padding: 12px 14px;
        border: 1px solid color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
        border-radius: var(--lv-r-m);
        background: color-mix(in srgb, var(--lv-color-warning) 8%, var(--lv-color-surface));
        box-shadow: var(--lv-shadow-card);
    }
    .lv-studio-replace-copy { flex: 1 1 220px; min-width: 0; }
    .lv-studio-replace p { margin: calc(var(--lv-space-unit) * 2) 0 0; color: var(--lv-color-text-muted); font-size: var(--lv-type-control-size); line-height: 1.5; }
    .lv-studio-error { margin: calc(var(--lv-space-unit) * 6) 0; padding: 10px 12px; border-left: 3px solid var(--lv-color-danger); background: var(--lv-color-surface); color: var(--lv-color-danger); overflow-wrap: anywhere; }
    .lv-studio-loading { padding: calc(var(--lv-space-unit) * 9) 0; color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size); }
    @container lv-studio (max-width: 680px) {
        .lv-studio-toolbar { align-items: flex-start; flex-wrap: wrap; }
        .lv-studio-tools { margin-left: auto; }
        .lv-studio-replace { align-items: stretch; }
        .lv-studio-replace button { flex: 1 1 140px; }
    }
</style>
