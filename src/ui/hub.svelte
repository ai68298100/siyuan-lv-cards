<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { fade } from "svelte/transition";
    import LvTabs from "./kit/LvTabs.svelte";
    import LvIcon, { type LvIconName } from "./kit/LvIcon.svelte";
    import Dashboard from "./dashboard.svelte";
    import Manager from "./manager.svelte";
    import StudioWorkbench from "./studio-workbench.svelte";
    import RecoveryPage from "./recovery-page.svelte";
    import type { DashboardCtx } from "./dashboard.svelte";
    import type { ManagerCtx } from "./manager.svelte";
    import type { ExamPlan, ExamPlansData, ExamScopeKind } from "@/core/exam";
    import type { InboxData, InboxStatus } from "@/core/inbox";
    import type { LearningGoal, LearningGoalsData } from "@/core/learning-goal";
    import { getMotionDuration } from "./kit/motion";

    type RecoverySnapshot = {
        aiJobs: {
            id: string; status: string; pending: number; failed: number; created: number; source: string;
            canReview: boolean; needsWriteCheck: boolean; deckID: string;
        }[];
        inboxCount: number;
        suspendedCount: number;
        session: { date: string; reviewed: number; skipped: number } | null;
    };

    let {
        i18n, dashboardBase, managerCtx, exam, inbox, goals, maintenance, recovery, uiMode = "advanced", initialTab = "overview", initialBlockID = "", onTabChange,
        openWizard, openDrill, openQuickCard, loadWizardView, loadQuickCardView, openSettings, openPalette, getSettingsHealth,
    }: {
        i18n: any;
        /** 总览页上下文（不含 openManager，由 Hub 内部切换页签实现） */
        dashboardBase: Omit<DashboardCtx, "openManager">;
        managerCtx: ManagerCtx;
        /** T02 工作台入口页：向导与修卡演练（可选——旧宿主不传则页签隐藏） */
        openWizard?: () => void;
        openDrill?: () => void;
        /** 手工制卡入口：R54 制卡工作台的快速入口，仍复用现有 quick-card 业务。 */
        openQuickCard?: () => void;
        /** Hub 内嵌 AI 向导和手工制卡组件的懒加载构造器。 */
        loadWizardView?: (
            sources?: { label: string; content: string; docId?: string; nbId?: string; inboxId?: string }[],
            onImportComplete?: (ids: string[]) => void,
            recoveryJobId?: string,
        ) => Promise<{ Component: any; props: Record<string, any> }>;
        loadQuickCardView?: () => Promise<{ Component: any; props: Record<string, any> }>;
        /** 设置保持独立 dialogs chunk；主导航只负责提供稳定入口。 */
        openSettings?: (onSaved?: () => void) => void;
        /** 顶栏搜索/命令面板入口；保持命令面板在 dialogs chunk 懒加载。 */
        openPalette?: () => void;
        /** 只提供非敏感的配置状态，不向 UI 暴露密钥或端点。 */
        getSettingsHealth?: () => { aiConfigured: boolean };
        /** 考试子页数据通道；null = 模块关闭 */
        exam: {
            plans: ExamPlansData;
            getPlans: () => ExamPlansData;
            subscribe: (cb: () => void) => () => void;
            onSavePlan: (plan: ExamPlan) => Promise<ExamPlansData>;
            onDeletePlan: (id: string) => Promise<ExamPlansData>;
            onReviewScope: (scopeKind: ExamScopeKind, scopeId: string, cram: boolean) => void;
            onReport: (plan: ExamPlan) => void;
            onWriteReport: (plan: ExamPlan) => void;
            onError: (message: string) => void;
            /** AQ-8 动态建议只读输入 */
            getRevlog: () => import("@/core/revlog").RevlogData;
            getDailyCap: () => number;
        } | null;
        /** BI-4 材料筛选收件箱通道；null = 模块关闭 */
        inbox: {
            get: () => InboxData;
            subscribe: (cb: () => void) => () => void;
            setStatus: (blockIDs: string[], status: InboxStatus) => InboxData;
            undoSelection: (blockIDs: string[]) => InboxData;
            remove: (blockIDs: string[]) => InboxData;
            add: (blockIDs: string[]) => number;
            loadSourcesForCards: (blockIDs: string[]) => Promise<{ label: string; content: string; docId?: string; inboxId: string }[]>;
            completeCards: (blockIDs: string[]) => void;
            openSource: (blockID: string) => Promise<void>;
            titles: (ids: string[]) => Promise<Map<string, string>>;
        } | null;
        /** BI-1 学习目标通道（只记录目标不强迫建卡） */
        goals: {
            get: () => LearningGoalsData;
            save: (goal: LearningGoal) => LearningGoalsData | Promise<LearningGoalsData>;
            remove: (id: string) => LearningGoalsData | Promise<LearningGoalsData>;
        };
        /** BI-25 维护债务通道（只读扫描 + 今日暂缓可逆 + 回来源） */
        maintenance: {
            scan: () => Promise<{ items: { blockID: string; md: string; state?: string; rootID?: string; occlusion?: boolean; exists?: boolean; mediaRefs?: string[]; mediaBroken?: string[]; mediaUnknown?: string[]; sourceHealthIssues?: { kind: string; detail: string }[] }[]; sourceHealthHistory?: import("@/core/source-health-store").SourceHealthHistoryItem[]; error?: string }>;
            previewRepair: (proposals: { blockID: string; afterMarkdown: string; expectedMarkdown?: string; reason?: string }[]) => Promise<{
                previewID: string;
                ok: boolean;
                errors: string[];
                diffs: { blockID: string; action: string; beforeMarkdown?: string; afterMarkdown?: string; errors?: string[] }[];
                summary: { update: number; unchanged: number; rejected: number };
            }>;
            applyRepair: (previewID: string) => Promise<{ blockIDs: string[] }>;
            getLastRepairRecord?: () => {
                previewID: string;
                appliedAt: number;
                summary: { update: number; unchanged: number; rejected: number };
                diffs: { blockID: string; action: string; beforeMarkdown?: string; afterMarkdown?: string; errors?: string[] }[];
            } | null;
            rollbackLastRepair?: () => Promise<{ blockIDs: string[]; previewID: string }>;
            acknowledgeSourceHealth?: (blockID: string) => Promise<void>;
            suspendToday: (blockIDs: string[]) => void;
            unsuspendToday: (blockIDs: string[]) => void;
            isSuspendedToday: (blockID: string) => boolean;
            openSource: (blockID: string) => Promise<void>;
            openCard: (blockID: string) => void;
        };
        recovery: { load: () => Promise<RecoverySnapshot> };
        /** BI-14：界面模式（simple=隐藏考试/维护高级入口；纯显示控制） */
        uiMode?: "simple" | "advanced";
        initialTab?: string;
        initialBlockID?: string;
        onTabChange?: (id: string) => void;
    } = $props();

    // R54 主导航只保留五个稳定入口；旧 route id 继续作为内部页面 id，
    // 这样命令面板、回源点和旧版本保存的 lastHubTab 都不需要迁移。
    // svelte-ignore state_referenced_locally -- i18n and module switches are fixed for the Hub mount.
    let dueCount = $state<number | null>(null);
    const primaryTabs = $derived(([
        {
            id: "today",
            label: i18n.hubPrimaryToday ?? "今日",
            icon: "home",
            badge: dueCount === null ? "—" : dueCount,
            badgeLabel: dueCount === null
                ? (i18n.hubDueUnknown ?? "待复习数量未知")
                : (i18n.hubDueCount ?? "待复习 ${count} 张").replace("${count}", String(dueCount)),
        },
        { id: "library", label: i18n.hubPrimaryLibrary ?? "卡库", icon: "cards" },
        { id: "studio", label: i18n.hubPrimaryStudio ?? "制卡", icon: "plus" },
        { id: "learning", label: i18n.hubPrimaryLearning ?? "学习", icon: "learn" },
        { id: "settings", label: i18n.hubPrimarySettings ?? "设置", icon: "settings" },
    ] satisfies { id: string; label: string; icon: LvIconName; badge?: string | number; badgeLabel?: string }[]));
    // 外部入口仍使用这些旧 id。它们是上下文页面，不再全部挤在一级导航。
    // svelte-ignore state_referenced_locally -- legacy routes are fixed for the Hub mount.
    const legacyTabs = [
        { id: "overview", label: i18n.hubTabOverview },
        { id: "manage", label: i18n.hubTabManage },
        ...(openWizard || openQuickCard ? [{ id: "authoring", label: i18n.hubTabAuthoring }] : []),
        { id: "goals", label: i18n.hubTabGoals },
        ...(inbox ? [{ id: "inbox", label: i18n.hubTabInbox }] : []),
        ...(exam && uiMode !== "simple" ? [{ id: "exam", label: i18n.hubTabExam }] : []),
        ...(uiMode !== "simple" ? [{ id: "maintenance", label: i18n.hubTabMaintenance }] : []),
        { id: "recovery", label: i18n.hubTabRecovery ?? "待处理与恢复" },
    ];
    // 简洁模式隐藏高级导航，但今日建议与恢复中心仍可直达维护闭环。
    const knownIds = new Set(["today", "library", "studio", "learning", "settings", "maintenance", ...legacyTabs.map(t => t.id)]);
    function initialRoute(id: string): string {
        if (id === "settings") return "settings";
        // 旧入口「goals」仍保留兼容，但落到完整学习页的目标与计划分面。
        if (id === "goals") return "learning";
        if (knownIds.has(id) && (id === "overview" || id === "manage" || id === "authoring" || id === "goals" || id === "inbox" || id === "exam" || id === "maintenance" || id === "recovery")) return id;
        if (id === "library") return "manage";
        if (id === "studio") return "authoring";
        if (id === "learning") return "learning";
        return "overview";
    }
    // svelte-ignore state_referenced_locally
    let active = $state(initialRoute(initialTab));
    // 旧的 goals 深链默认打开「目标与计划」；点击新的学习入口则回到回顾分面。
    // svelte-ignore state_referenced_locally -- deep-link value is copied once for this Hub mount.
    let learningTabRequest = $state(initialTab === "goals" ? "plans" : "recap");
    let learningViewKey = $state(0);
    // svelte-ignore state_referenced_locally -- the initial focus is copied once; later requests arrive through the switch event.
    let managerInitialBlockID = $state(initialBlockID);

    function primaryFor(route: string): string {
        if (route === "manage") return "library";
        if (route === "authoring") return "studio";
        if (route === "learning" || route === "goals" || route === "exam" || route === "maintenance" || route === "inbox" || route === "recovery") return "learning";
        return route === "settings" ? "settings" : "today";
    }

    function isLearningRoute(): boolean {
        return primaryFor(active) === "learning";
    }

    // svelte-ignore state_referenced_locally
    let plans = $state(exam?.plans ?? { version: 1 as const, plans: [] });
    let unsubscribeExamPlans: (() => void) | null = null;
    // svelte-ignore state_referenced_locally -- host health callback is stable for this Hub mount.
    let settingsHealth = $state(getSettingsHealth?.() ?? { aiConfigured: false });
    // svelte-ignore state_referenced_locally -- inbox source is fixed for this Hub lifetime.
    let inboxOpenCount = $state(inbox?.get().items.filter(item => item.status !== "dismissed").length ?? 0);
    let unsubscribeInbox: (() => void) | null = null;
    let studioInboxSeq = 0;
    let studioInboxRequest = $state<{
        id: number;
        sources: { label: string; content: string; docId?: string; inboxId: string }[];
        onImportComplete: (ids: string[]) => void;
    } | null>(null);
    let studioManualSeq = $state(0);
    let studioAISeq = $state(0);
    let managerDeckScope = $state<{ id: string; name: string } | null>(null);
    // 维护页打开卡片时建立一次性返回点；保存成功后由管理器回到维护页，
    // 维护页重新挂载并自动执行扫描。
    let managerReturnToMaintenance = $state("");

    function openFullSettings() {
        openSettings?.(() => {
            settingsHealth = getSettingsHealth?.() ?? settingsHealth;
        });
    }

    // svelte-ignore state_referenced_locally
    function openStudioManual() {
        studioManualSeq++;
        switchTab("authoring");
    }

    let studioAIRecoveryJobId = $state("");
    function openStudioAI(recoveryJobId?: string) {
        studioAIRecoveryJobId = recoveryJobId ?? "";
        studioAISeq++;
        switchTab("authoring");
    }

    function openRecoveryDeck(deckID: string) {
        managerDeckScope = { id: deckID, name: i18n.recoveryCenter?.aiDeckLabel ?? "AI 作业目标卡组" };
        switchTab("manage", true);
    }

    function openManagerDeck(deckID: string, deckName: string) {
        managerDeckScope = { id: deckID, name: deckName };
        switchTab("manage", true);
    }

    // svelte-ignore state_referenced_locally -- host callbacks and context are fixed for this Hub mount.
    const dctx: DashboardCtx = {
        ...dashboardBase,
        onDueCount: (count) => (dueCount = count),
        openManager: () => switchTab("manage"),
        openManagerDeck,
        openQuickCard: loadQuickCardView ? openStudioManual : undefined,
        openAIWizard: openStudioAI,
        openHubTab: (id) => switchTab(id),
    };

    // 考试子页懒加载（体积预算 670）：首次切到考试页才拉取 chunk
    let ExamComp = $state<any>(null);
    let examError = $state("");
    async function ensureExam() {
        if (ExamComp || !exam) { return; }
        examError = "";
        try {
            ExamComp = (await import("./exam-page.svelte")).default;
        } catch (e: any) {
            examError = e?.message ?? String(e);
        }
    }
    $effect(() => {
        if (active === "exam") { ensureExam(); }
    });
    // 初值语义：首帧按入口参数直达考试页；此后由 switchTab 驱动
    // svelte-ignore state_referenced_locally
    if (active === "exam") { ensureExam(); }

    // BI-4 收件箱子页懒加载（同考试页模式：首次切到才拉 chunk）
    let InboxComp = $state<any>(null);
    let inboxError = $state("");
    async function ensureInbox() {
        if (InboxComp || !inbox) { return; }
        inboxError = "";
        try {
            InboxComp = (await import("./inbox-page.svelte")).default;
        } catch (e: any) {
            inboxError = e?.message ?? String(e);
        }
    }
    $effect(() => {
        if (active === "inbox") { ensureInbox(); }
    });
    // svelte-ignore state_referenced_locally
    if (active === "inbox") { ensureInbox(); }

    // R54 学习页懒加载：回顾 / 目标与计划 / 学习日历共用一个稳定入口。
    let LearningComp = $state<any>(null);
    let learningError = $state("");
    async function ensureLearning() {
        if (LearningComp) return;
        learningError = "";
        try {
            LearningComp = (await import("./learning-page.svelte")).default;
        } catch (e: any) {
            learningError = e?.message ?? String(e);
        }
    }
    $effect(() => {
        if (active === "learning") void ensureLearning();
    });
    // svelte-ignore state_referenced_locally
    if (active === "learning") void ensureLearning();

    // BI-25 维护子页懒加载（同考试页模式：首次切到才拉 chunk）
    let MaintComp = $state<any>(null);
    let maintError = $state("");
    async function ensureMaint() {
        if (MaintComp) { return; }
        maintError = "";
        try {
            MaintComp = (await import("./maintenance-page.svelte")).default;
        } catch (e: any) {
            maintError = e?.message ?? String(e);
        }
    }
    $effect(() => {
        if (active === "maintenance") { ensureMaint(); }
    });
    // svelte-ignore state_referenced_locally
    if (active === "maintenance") { ensureMaint(); }

    let RecoveryComp = $state<any>(RecoveryPage);

    function switchTab(id: string, preserveDeckScope = false) {
        if (id === "goals") {
            learningTabRequest = "plans";
            learningViewKey += 1;
        } else if (id === "learning") {
            learningTabRequest = "recap";
            learningViewKey += 1;
        }
        const route = id === "today" ? "overview" : id === "library" ? "manage" : id === "studio" ? "authoring" : id === "goals" ? "learning" : id;
        if (!knownIds.has(route) && route !== "settings") return;
        // 离开管理器即放弃未完成的维护页返回点，避免随后从普通卡库编辑时误跳回维护页。
        if (route !== "manage") managerReturnToMaintenance = "";
        if (route !== "manage" || !preserveDeckScope) managerDeckScope = null;
        active = route;
        // settings 是 Hub 内部的稳定入口，旧宿主没有对应的 lastHubTab route，
        // 仍允许保存它以便返回时保留现场；外部旧入口照旧写入原 id。
        onTabChange?.(route);
        void tick().then(() => document.getElementById(active === "authoring" ? "lv-hub-studio-panel" : "lv-hub-panel")?.focus());
    }

    async function handleManagerCardSaved(blockID: string) {
        if (!managerReturnToMaintenance || managerReturnToMaintenance !== blockID) return;
        managerReturnToMaintenance = "";
        managerInitialBlockID = "";
        switchTab("maintenance");
    }

    function openMaintenanceCard(blockID: string) {
        managerReturnToMaintenance = blockID;
        managerInitialBlockID = blockID;
        switchTab("manage");
    }

    async function prepareInboxCards(blockIDs: string[]) {
        if (!inbox || blockIDs.length === 0) return;
        const sources = await inbox.loadSourcesForCards(blockIDs);
        if (sources.length === 0) throw new Error(i18n.inboxEmptySource ?? "所选材料没有可用内容");
        studioInboxRequest = {
            id: ++studioInboxSeq,
            sources,
            onImportComplete: (ids: string[]) => inbox?.completeCards(ids),
        };
        switchTab("authoring");
    }

    // T13/openTabOf 去重（docs/40）：外部（顶栏/命令面板）复用既有中心页签时，
    // 经根元素派发 lv-switch-tab 事件切换子页——避免每次入口都新开一个中心
    let hubRoot = $state<HTMLElement | null>(null);
    let onSwitchTab: ((e: Event) => void) | null = null;
    onMount(() => {
        onSwitchTab = (e: Event) => {
            const detail = (e as CustomEvent<string | { tab?: string; focusBlockID?: string }>).detail;
            const id = typeof detail === "string" ? detail : detail?.tab;
            if (typeof id === "string" && knownIds.has(id)) {
                if (typeof detail !== "string" && detail.focusBlockID) managerInitialBlockID = detail.focusBlockID;
                switchTab(id);
            }
        };
        hubRoot?.addEventListener("lv-switch-tab", onSwitchTab);
        if (inbox) {
            unsubscribeInbox = inbox.subscribe(() => {
                inboxOpenCount = inbox?.get().items.filter(item => item.status !== "dismissed").length ?? 0;
            });
        }
        if (exam) {
            plans = exam.getPlans();
            unsubscribeExamPlans = exam.subscribe(() => {
                plans = exam?.getPlans() ?? plans;
            });
        }
    });
    onDestroy(() => {
        hubRoot?.removeEventListener("lv-switch-tab", onSwitchTab ?? (() => {}));
        unsubscribeInbox?.();
        unsubscribeExamPlans?.();
    });

    const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");
</script>

<div class="lv-hub" bind:this={hubRoot}>
    <!-- R54 工作台外壳：桌面左侧稳定主入口；旧模块作为学习页中的上下文工具。 -->
    <div class="lv-r54-shell">
        <aside class="lv-r54-sidebar" aria-label={i18n.hubPrimaryLabel ?? "主要导航"}>
            <div class="lv-r54-brand">
                <svg class="lv-r54-brand-mark" viewBox="0 0 32 36" fill="none" aria-hidden="true" focusable="false">
                    <rect x="8" y="3" width="21" height="28" rx="6" fill="currentColor" opacity=".2" transform="rotate(8 8 3)" />
                    <rect x="2" y="7" width="21" height="28" rx="6" fill="currentColor" />
                    <path d="M8 15h9M8 21h6" stroke="var(--lv-color-surface)" stroke-width="2" stroke-linecap="round" />
                </svg>
                <span>小驴闪卡</span>
            </div>
            <button class="b3-button lv-btn-primary lv-r54-new-card" disabled={!loadQuickCardView} aria-describedby={!loadQuickCardView ? "lv-r54-new-card-hint" : undefined} onclick={openStudioManual}>
                <LvIcon name="plus" size={18} />{i18n.hubStudioManualAction ?? "新建闪卡"}
            </button>
            <LvTabs tabs={primaryTabs} active={primaryFor(active)} onchange={switchTab} panelId={active === "authoring" ? "lv-hub-studio-panel" : "lv-hub-panel"} orientation="vertical" />
            {#if inbox}
                <button class:lv-r54-sidebar-link-active={active === "inbox"} class="lv-r54-sidebar-link" aria-current={active === "inbox" ? "page" : undefined} onclick={() => switchTab("inbox")}>
                    <span class="lv-r54-sidebar-icon"><LvIcon name="inbox" size={18} /></span>{i18n.hubTabInbox}
                    {#if inboxOpenCount > 0}<span class="lv-r54-nav-count">{inboxOpenCount}</span>{/if}
                </button>
            {/if}
            <div class="lv-r54-sidebar-divider"></div>
            <button class="lv-r54-sidebar-link" onclick={() => dashboardBase.openOnboarding()}>
                <span class="lv-r54-sidebar-icon"><LvIcon name="question" size={18} /></span>{i18n.hubStudioOnboarding ?? "上手与示例"}
            </button>
            <div class="lv-r54-sidebar-note">
                <strong>{i18n.hubLocalFirstNote ?? "一天一点，让理解留得更久。"}</strong>
            </div>
            <p class="lv-r54-sidebar-version">{i18n.hubVersionNote ?? "内测版 · 本地优先"}</p>
            {#if !loadQuickCardView}<span id="lv-r54-new-card-hint" class="lv-sr-only">{i18n.hubManualUnavailable ?? "当前宿主未提供手工制卡入口"}</span>{/if}
        </aside>
        <section class="lv-r54-content">
            <header class="lv-r54-topbar">
                <div class="lv-r54-workspace-context">
                    <span>{i18n.hubWorkspaceLabel ?? "我的学习空间"}</span>
                    <span class="lv-r54-beta-badge">{i18n.hubBetaStatus ?? "内测版"}</span>
                </div>
                <div class="lv-r54-topbar-actions">
                    <button class="lv-r54-search" disabled={!openPalette} aria-describedby={!openPalette ? "lv-r54-search-hint" : undefined} onclick={() => openPalette?.()} aria-label={i18n.cmdPalette ?? "命令面板"}>
                        <LvIcon name="search" size={17} />
                        <span class="lv-r54-search-text">{i18n.palettePlaceholder ?? "搜索动作、页面…"}</span>
                        <kbd>{isMac ? "⌘ K" : "Ctrl K"}</kbd>
                    </button>
                    <span class="lv-r54-local-status"><i aria-hidden="true"></i>{i18n.hubLocalStatus ?? "本地优先"}</span>
                    {#if inbox}
                        <button
                            class:lv-r54-inbox-action-active={active === "inbox"}
                            class="lv-r54-inbox-action"
                            aria-current={active === "inbox" ? "page" : undefined}
                            aria-label={inboxOpenCount > 0
                                ? `${i18n.hubInboxOpen ?? "打开收件箱"}，${(i18n.hubInboxCount ?? "${count} 项待处理").replace("${count}", String(inboxOpenCount))}`
                                : (i18n.hubInboxOpen ?? "打开收件箱")}
                            title={i18n.hubInboxOpen ?? "打开收件箱"}
                            onclick={() => switchTab("inbox")}
                        >
                            <LvIcon name="inbox" size={18} />
                            {#if inboxOpenCount > 0}<span class="lv-r54-action-count" aria-hidden="true">{inboxOpenCount}</span>{/if}
                        </button>
                    {/if}
                </div>
            </header>
            {#if !openPalette}<span id="lv-r54-search-hint" class="lv-sr-only">{i18n.hubSearchUnavailable ?? "当前宿主未提供命令面板"}</span>{/if}
            <div class="lv-hub-bar">
                {#if isLearningRoute()}
                    <nav class="lv-hub-subnav" aria-label={i18n.hubSecondaryLabel ?? "学习工具"}>
                        <button class:lv-hub-subnav-active={active === "learning"} class="lv-hub-subnav-btn" aria-current={active === "learning" ? "page" : undefined} onclick={() => switchTab("learning")}>{i18n.hubPrimaryLearning ?? "学习"}</button>
                        {#if inbox}
                            <button class:lv-hub-subnav-active={active === "inbox"} class="lv-hub-subnav-btn" aria-current={active === "inbox" ? "page" : undefined} onclick={() => switchTab("inbox")}>{i18n.hubTabInbox}</button>
                        {/if}
                        {#if exam && uiMode !== "simple"}
                            <button class:lv-hub-subnav-active={active === "exam"} class="lv-hub-subnav-btn" aria-current={active === "exam" ? "page" : undefined} onclick={() => switchTab("exam")}>{i18n.hubTabExam}</button>
                        {/if}
                        {#if uiMode !== "simple"}
                            <button class:lv-hub-subnav-active={active === "maintenance"} class="lv-hub-subnav-btn" aria-current={active === "maintenance" ? "page" : undefined} onclick={() => switchTab("maintenance")}>{i18n.hubTabMaintenance}</button>
                        {/if}
                        <button class:lv-hub-subnav-active={active === "recovery"} class="lv-hub-subnav-btn" aria-current={active === "recovery" ? "page" : undefined} onclick={() => switchTab("recovery")}>{i18n.hubTabRecovery ?? "待处理与恢复"}</button>
                    </nav>
                {:else}
                    <div class="lv-r54-context-label">{primaryFor(active) === "today" ? (i18n.hubPrimaryToday ?? "今日") : primaryFor(active) === "library" ? (i18n.hubPrimaryLibrary ?? "卡库") : primaryFor(active) === "studio" ? (i18n.hubPrimaryStudio ?? "制卡") : (i18n.hubPrimarySettings ?? "设置")}</div>
                {/if}
            </div>
            <div class="lv-hub-body">
        <!-- 错误边界（450）：{#key} 使边界随页签重建，单子页崩溃不拖垮中心，切换自愈 -->
        {#key active}
            {#if active !== "authoring"}
            <!-- 页签切换：140ms 单次淡入（R53 动效纪律：只动 opacity，无错峰） -->
            <div
                id="lv-hub-panel"
                class="lv-hub-panel"
                role="tabpanel"
                aria-labelledby={`lv-tab-${primaryFor(active)}`}
                tabindex="0"
                in:fade={{ duration: getMotionDuration("standard") }}
            >
            <svelte:boundary onerror={(e) => console.warn("[lv-cards] tab error", e)}>
                {#snippet failed(error: unknown, reset)}
                    <div style="padding: var(--lv-sp-5)">
                        <div class="lv-card2">
                            <div style="color: var(--lv-color-danger); font-size: 13px; margin-bottom: calc(var(--lv-space-unit) * 4)">{i18n.hubTabError}{error instanceof Error && error.message ? `: ${error.message}` : ""}</div>
                            <button class="b3-button b3-button--outline" onclick={reset}>{i18n.dashboard.refresh}</button>
                        </div>
                    </div>
                {/snippet}
                {#if active === "overview"}
                    <!-- T08：注入页签切换（待处理分区直达收件箱） -->
                    <Dashboard ctx={{ ...dctx, openHubTab: (id: string) => switchTab(id) }} />
                {:else if active === "manage"}
                    {#key managerDeckScope?.id ?? ""}
                    <Manager ctx={{ ...managerCtx, initialBlockID: managerInitialBlockID, onInitialBlockConsumed: () => (managerInitialBlockID = ""), onCardContentSaved: handleManagerCardSaved, deckScope: managerDeckScope, clearDeckScope: () => (managerDeckScope = null) }} />
                    {/key}
                {:else if active === "settings"}
                    <div class="lv-r54-settings">
                        <div class="lv-pagehead">
                            <div class="lv-pagehead-main">
                                <div class="lv-eyebrow">{i18n.hubSettingsEyebrow ?? "偏好与健康"}</div>
                                <div class="lv-pagehead-title">{i18n.hubPrimarySettings ?? "设置"}</div>
                                <p class="lv-pagehead-sub">{i18n.hubSettingsSubtitle ?? "先看影响，再进入完整配置。"}</p>
                            </div>
                        </div>
                        <div class="lv-r54-health-grid">
                            <section class="lv-card2"><span class="lv-r54-health-dot lv-r54-health-dot-good"></span><strong>{i18n.hubSettingsLocalTitle ?? "本地闪卡"}</strong><span class="lv-r54-health-state">{i18n.hubSettingsLocalStatus ?? "本地可用"}</span><p>{i18n.hubSettingsLocalDesc ?? "卡片、来源和复习记录继续保存在当前插件数据中。"}</p></section>
                            <section class="lv-card2"><span class:lv-r54-health-dot-good={settingsHealth.aiConfigured} class:lv-r54-health-dot-warn={!settingsHealth.aiConfigured} class="lv-r54-health-dot"></span><strong>{i18n.hubSettingsAITitle ?? "AI 辅助"}</strong><span class="lv-r54-health-state">{settingsHealth.aiConfigured ? (i18n.hubSettingsAIConfigured ?? "已配置") : (i18n.hubSettingsAINotConfigured ?? "尚未配置")}</span><p>{i18n.hubSettingsAIDesc ?? "模型、端点、预算和外发确认在完整设置中管理。"}</p></section>
                            <section class="lv-card2"><span class="lv-r54-health-dot lv-r54-health-dot-neutral"></span><strong>{i18n.hubSettingsDataTitle ?? "数据与备份"}</strong><span class="lv-r54-health-state">{i18n.hubSettingsDataStatus ?? "可在完整设置中管理"}</span><p>{i18n.hubSettingsDataDesc ?? "导入、导出、恢复和诊断按任务展开。"}</p></section>
                        </div>
                        <section class="lv-card2 lv-r54-settings-action">
                            <div><h3>{i18n.hubSettingsOpenTitle ?? "需要修改配置？"}</h3><p>{i18n.hubSettingsOpenDesc ?? "打开完整设置，保存后会回到当前工作台。"}</p></div>
                            <button class="b3-button lv-btn-primary" disabled={!openSettings} onclick={openFullSettings}>{i18n.hubSettingsOpen ?? "打开完整设置"}</button>
                        </section>
                    </div>
                {:else if active === "learning"}
                    {#if LearningComp}
                        {#key learningViewKey}
                            <LearningComp
                                {i18n}
                                {goals}
                                getRevlog={dashboardBase.getRevlog}
                                getDailyTargets={dashboardBase.getDailyTargets}
                                onReviewed={dashboardBase.onReviewed}
                                onStoresChanged={dashboardBase.onStoresChanged}
                                onGoToday={() => switchTab("today")}
                                onOpenExam={exam ? () => switchTab("exam") : undefined}
                                onOpenBlock={(blockID: string) => { managerInitialBlockID = blockID; switchTab("manage"); }}
                                onTabChange={(tab: string) => onTabChange?.(tab === "plans" ? "goals" : "learning")}
                                initialTab={learningTabRequest}
                            />
                        {/key}
                    {:else if learningError}
                        <div style="padding: var(--lv-sp-5); color: var(--lv-color-danger); font-size: var(--lv-type-body-size)">
                            <div style="margin-bottom: calc(var(--lv-space-unit) * 4)">{learningError}</div>
                            <button class="b3-button b3-button--outline" onclick={ensureLearning}>{i18n.dashboard.refresh}</button>
                        </div>
                    {:else}
                        <div role="status" aria-busy="true" style="padding: var(--lv-sp-5); color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size)">{i18n.dashboard.loading}</div>
                    {/if}
                {:else if active === "maintenance"}
                    {#if MaintComp}
                        <MaintComp i18n={i18n} maintenance={{ ...maintenance, openCard: openMaintenanceCard }} />
                    {:else if maintError}
                        <div style="padding: var(--lv-sp-5); color: var(--lv-color-danger); font-size: var(--lv-type-body-size)">
                            <div style="margin-bottom: calc(var(--lv-space-unit) * 4)">{maintError}</div>
                            <button class="b3-button b3-button--outline" onclick={ensureMaint}>{i18n.dashboard.refresh}</button>
                        </div>
                    {:else}
                        <div role="status" aria-busy="true" style="padding: var(--lv-sp-5); color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size)">{i18n.dashboard.loading}</div>
                    {/if}
                {:else if active === "inbox" && inbox}
                    {#if InboxComp}
                        <InboxComp i18n={i18n} inbox={{ ...inbox, makeCards: prepareInboxCards }} />
                    {:else if inboxError}
                        <div style="padding: var(--lv-sp-5); color: var(--lv-color-danger); font-size: var(--lv-type-body-size)">
                            <div style="margin-bottom: calc(var(--lv-space-unit) * 4)">{inboxError}</div>
                            <button class="b3-button b3-button--outline" onclick={ensureInbox}>{i18n.dashboard.refresh}</button>
                        </div>
                    {:else}
                        <div role="status" aria-busy="true" style="padding: var(--lv-sp-5); color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size)">{i18n.dashboard.loading}</div>
                    {/if}
                {:else if exam}
                    {#if ExamComp}
                        <ExamComp
                            i18n={i18n}
                            plans={plans}
                            onSavePlan={async (p: ExamPlan) => (plans = await exam!.onSavePlan(p))}
                            onDeletePlan={async (id: string) => (plans = await exam!.onDeletePlan(id))}
                            onReviewScope={exam.onReviewScope}
                            onReport={exam.onReport}
                            onWriteReport={exam.onWriteReport}
                            onError={exam.onError}
                            getRevlog={exam.getRevlog}
                            getDailyCap={exam.getDailyCap}
                        />
                    {:else if examError}
                        <div style="padding: var(--lv-sp-5); color: var(--lv-color-danger); font-size: var(--lv-type-body-size)">
                            <div style="margin-bottom: calc(var(--lv-space-unit) * 4)">{examError}</div>
                            <button class="b3-button b3-button--outline" onclick={ensureExam}>{i18n.dashboard.refresh}</button>
                        </div>
                    {:else}
                        <div role="status" aria-busy="true" style="padding: var(--lv-sp-5); color: var(--lv-color-text-muted); font-size: var(--lv-type-body-size)">{i18n.dashboard.loading}</div>
                    {/if}
                {:else if active === "recovery"}
                    <RecoveryComp
                        i18n={i18n}
                        load={recovery.load}
                        openAI={openStudioAI}
                        openDeck={openRecoveryDeck}
                        openInbox={() => switchTab("inbox")}
                        openMaintenance={() => switchTab("maintenance")}
                        openReview={dashboardBase.openReview}
                        openOnboarding={dashboardBase.openOnboarding}
                    />
                {/if}
            </svelte:boundary>
            </div>
            {/if}
        {/key}
        <div
            id="lv-hub-studio-panel"
            class="lv-hub-panel lv-hub-studio-panel"
            hidden={active !== "authoring"}
            role="tabpanel"
            aria-labelledby="lv-tab-studio"
            tabindex="0"
        >
            <svelte:boundary onerror={(e) => console.warn("[lv-cards] studio error", e)}>
                {#snippet failed(error: unknown, reset)}
                    <div style="padding: var(--lv-sp-5)">
                        <div class="lv-card2">
                            <div style="color: var(--lv-color-danger); font-size: 13px; margin-bottom: calc(var(--lv-space-unit) * 4)">{i18n.hubTabError}{error instanceof Error && error.message ? `: ${error.message}` : ""}</div>
                            <button class="b3-button b3-button--outline" onclick={reset}>{i18n.dashboard.refresh}</button>
                        </div>
                    </div>
                {/snippet}
                <StudioWorkbench
                    {i18n}
                    isActive={active === "authoring"}
                    aiConfigured={settingsHealth.aiConfigured}
                    loadWizard={loadWizardView}
                    loadQuickCard={loadQuickCardView}
                    {openDrill}
                    openOnboarding={dashboardBase.openOnboarding}
                    inboxRequest={studioInboxRequest}
                    manualRequest={studioManualSeq}
                    aiRequest={studioAISeq}
                    recoveryJobId={studioAIRecoveryJobId}
                />
            </svelte:boundary>
        </div>
            </div>
        </section>
    </div>
    <nav class="lv-hub-mobile-nav" aria-label={i18n.hubPrimaryLabel ?? "主要导航"}>
        {#each primaryTabs as tab (tab.id)}
            <button class:lv-hub-mobile-active={primaryFor(active) === tab.id} class="lv-hub-mobile-btn" aria-current={primaryFor(active) === tab.id ? "page" : undefined} aria-label={tab.badgeLabel ? `${tab.label}，${tab.badgeLabel}` : undefined} onclick={() => switchTab(tab.id)}>
                <span class="lv-hub-mobile-icon">
                    <LvIcon name={tab.icon} size={19} />
                    {#if tab.badge !== undefined}<span class="lv-hub-mobile-count" aria-hidden="true">{tab.badge}</span>{/if}
                </span>
                <span class="lv-hub-mobile-label">{tab.label}</span>
            </button>
        {/each}
    </nav>
</div>

<style>
    .lv-hub {
        height: 100%;
        display: flex;
        flex-direction: column;
        container: lv-hub / inline-size;
    }

    .lv-r54-shell {
        display: grid;
        grid-template-columns: 184px minmax(0, 1fr);
        flex: 1;
        min-height: 0;
        background: var(--lv-color-canvas);
    }

    .lv-r54-sidebar {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: calc(var(--lv-space-unit) * 11 + var(--lv-space-hairline));
        padding: calc(var(--lv-space-unit) * 13) calc(var(--lv-space-unit) * 7) calc(var(--lv-space-unit) * 9);
        border-right: 1px solid var(--lv-border);
        background: color-mix(in srgb, var(--lv-color-canvas) 72%, var(--lv-color-surface));
    }

    .lv-r54-brand {
        display: flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 4 + var(--lv-space-hairline));
        min-height: 36px;
        padding: 0 calc(var(--lv-space-unit) * 4);
        color: var(--lv-color-text);
        font-size: var(--lv-type-label-size);
        font-weight: var(--lv-fw-bold);
    }

    .lv-r54-brand-mark {
        display: block;
        width: 28px;
        height: 32px;
        flex: none;
        color: var(--lv-color-brand);
    }

    .lv-r54-new-card {
        width: 100%;
        min-height: 42px;
        justify-content: flex-start;
        gap: calc(var(--lv-space-unit) * 3 + var(--lv-space-hairline));
        padding: 0 calc(var(--lv-space-unit) * 7);
    }

    :global(.lv-r54-sidebar .lv-tabs) {
        display: flex;
        flex-direction: column;
        gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline));
        margin: 0;
        border-bottom: 0;
    }

    :global(.lv-r54-sidebar .lv-tab) {
        display: flex;
        min-height: 46px;
        align-items: center;
        padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 6);
        border-radius: var(--lv-r-m);
        color: var(--lv-color-text-muted);
        text-align: left;
    }

    :global(.lv-r54-sidebar .lv-tab:hover),
    :global(.lv-r54-sidebar .lv-tab.lv-tab-active) {
        background: var(--lv-primary-soft);
        color: var(--lv-color-brand);
    }

    :global(.lv-r54-sidebar .lv-tab.lv-tab-active) { font-weight: var(--lv-fw-heading); }
    :global(.lv-r54-sidebar .lv-tab) { gap: calc(var(--lv-space-unit) * 5); }
    :global(.lv-r54-sidebar .lv-tab svg) { color: currentColor; }
    :global(.lv-r54-sidebar .lv-tab.lv-tab-active::after) { display: none; }
    .lv-r54-sidebar-divider { height: 1px; margin: auto 8px 0; background: var(--lv-border); }

    .lv-r54-sidebar-link {
        display: flex;
        min-height: 40px;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 4 + var(--lv-space-hairline));
        padding: calc(var(--lv-space-unit) * 3) calc(var(--lv-space-unit) * 6);
        border: 0;
        border-radius: var(--lv-r-m);
        background: transparent;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        cursor: pointer;
        text-align: left;
    }

    .lv-r54-sidebar-link:hover,
    .lv-r54-sidebar-link-active { background: var(--lv-primary-softer); color: var(--lv-color-brand); }
    .lv-r54-sidebar-icon { display: grid; width: 20px; height: 20px; flex: none; place-items: center; }
    .lv-r54-sidebar-link .lv-r54-nav-count { display: inline-flex; width: auto; height: auto; min-width: 20px; justify-content: center; margin-left: auto; padding: var(--lv-space-hairline) calc(var(--lv-space-unit) * 3); border: 0; border-radius: var(--lv-r-control); background: var(--lv-primary-soft); color: var(--lv-color-brand); font-size: 10px; font-variant-numeric: tabular-nums; }
    .lv-r54-sidebar-note {
        margin: 0 calc(var(--lv-space-unit) * 2);
        padding: calc(var(--lv-space-unit) * 5) calc(var(--lv-space-unit) * 6);
        border-radius: var(--lv-r-m);
        background: var(--lv-warn-soft);
        color: var(--lv-color-text);
        font-size: var(--lv-type-meta-size);
        line-height: 1.5;
        border: 1px solid color-mix(in srgb, var(--lv-color-warning) 24%, transparent);
        box-shadow: var(--lv-shadow-card), inset 0 1px 0 color-mix(in srgb, white 40%, transparent);
        strong { font-weight: var(--lv-fw-emphasis); display: block; }
    }
    .lv-r54-sidebar-version { margin: 0 calc(var(--lv-space-unit) * 4); color: var(--lv-color-text-muted); font-size: var(--lv-type-caption-size); line-height: 1.4; }
    .lv-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: calc(var(--lv-space-hairline) * -1); overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .lv-r54-content { display: flex; min-width: 0; min-height: 0; flex-direction: column; }
    .lv-r54-topbar {
        display: flex;
        min-height: 64px;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-4);
        padding: 0 calc(var(--lv-space-unit) * 15);
        border-bottom: 1px solid var(--lv-border);
        background: color-mix(in srgb, var(--lv-color-surface) 92%, transparent);
        backdrop-filter: blur(12px) saturate(1.15);
        -webkit-backdrop-filter: blur(12px) saturate(1.15);
        box-shadow: 0 1px 3px color-mix(in srgb, black 3%, transparent);
        position: sticky;
        top: 0;
        z-index: 10;
    }

    @container lv-hub (max-width: 1040px) {
        .lv-r54-shell { grid-template-columns: 156px minmax(0, 1fr); }
        .lv-r54-topbar { padding-right: calc(var(--lv-space-unit) * 12); padding-left: 24px; }
        :global(.lv-r54-sidebar .lv-tab) { padding-right: calc(var(--lv-space-unit) * 5); padding-left: 10px; }
    }
    .lv-r54-workspace-context { display: flex; min-width: 0; align-items: center; gap: 9px; color: var(--lv-color-text-muted); font-size: 12px; }
    .lv-r54-workspace-context > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lv-r54-beta-badge { flex: none; border-radius: 7px; padding: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 3 + var(--lv-space-hairline)); background: var(--lv-primary-soft); color: var(--lv-color-brand); font-size: 10px; }
    .lv-r54-topbar-actions { display: flex; min-width: 0; align-items: center; gap: var(--lv-sp-2); }
    .lv-r54-search {
        display: flex;
        width: min(300px, 100%);
        min-height: 36px;
        align-items: center;
        justify-content: flex-start;
        gap: calc(var(--lv-space-unit) * 4);
        padding: calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 5);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-canvas);
        box-shadow: inset 0 1px 2px color-mix(in srgb, black 3%, transparent);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        font-weight: var(--lv-fw-normal);
        text-align: left;
        transition: border-color var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease);
    }
    .lv-r54-search:not(:disabled):hover { border-color: var(--lv-border-strong); background: var(--lv-color-surface); }
    .lv-r54-search:disabled { cursor: not-allowed; opacity: .62; }
    .lv-r54-search kbd {
        margin-left: auto;
        padding: 2px 6px;
        border-radius: 6px;
        background: var(--lv-color-surface);
        border: 1px solid var(--lv-border);
        font-size: 10px;
        font-family: inherit;
        box-shadow: 0 1px 2px color-mix(in srgb, black 4%, transparent);
    }
    .lv-r54-local-status { display: inline-flex; align-items: center; gap: calc(var(--lv-space-unit) * 3); color: var(--lv-color-text-muted); font-size: var(--lv-type-meta-size); white-space: nowrap; }
    .lv-r54-local-status i { width: 7px; height: 7px; border-radius: var(--lv-r-circle); background: var(--lv-color-success); }
    .lv-r54-inbox-action { position: relative; display: grid; width: 44px; height: 44px; flex: none; place-items: center; padding: 0; border: 1px solid transparent; border-radius: var(--lv-r-m); background: transparent; color: var(--lv-color-text-muted); cursor: pointer; }
    .lv-r54-inbox-action:hover,
    .lv-r54-inbox-action-active { border-color: var(--lv-border); background: var(--lv-primary-softer); color: var(--lv-color-brand); }
    .lv-r54-inbox-action:focus-visible { outline: 2px solid var(--lv-color-brand); outline-offset: 2px; }
    .lv-r54-action-count { position: absolute; top: 1px; right: 1px; display: grid; min-width: 17px; height: 17px; place-items: center; padding: 0 4px; border: 2px solid var(--lv-color-surface); border-radius: 999px; background: var(--lv-color-brand); color: var(--lv-color-on-brand); font-size: var(--lv-type-micro-size); font-variant-numeric: tabular-nums; line-height: var(--lv-lh-tight); }
    .lv-r54-context-label { min-height: 30px; color: var(--lv-color-text-muted); font-size: var(--lv-type-control-size); }
    .lv-hub-bar {
        padding: var(--lv-sp-3) var(--lv-sp-5) 0;
        flex: none;
    }

    .lv-hub-body {
        flex: 1;
        min-height: 0;
    }

    .lv-hub-studio-panel {
        box-sizing: border-box;
        height: 100%;
        min-height: 0;
        overflow: auto;
    }

    .lv-hub-mobile-nav { display: none; }

    /* R54 shell additions: keep the existing LvPage/Manager scroll contract and
       only style the new navigation/workbench surfaces here. */
    .lv-hub-subnav {
        display: flex;
        align-items: center;
        gap: calc(var(--lv-space-unit) * 3);
        margin: calc(var(--lv-sp-2) * -1) 0 var(--lv-sp-3);
        padding: 0 calc(var(--lv-space-unit) * 1);
        overflow-x: auto;
        scrollbar-width: none;
    }

    .lv-hub-subnav::-webkit-scrollbar { display: none; }

    .lv-hub-subnav-btn {
        min-height: 30px;
        padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 6);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-pill);
        background: transparent;
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-control-size);
        white-space: nowrap;
        cursor: pointer;
        transition: background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease), border-color var(--lv-dur-1) var(--lv-ease);
    }

    .lv-hub-subnav-btn:hover,
    .lv-hub-subnav-btn.lv-hub-subnav-active {
        color: var(--lv-color-brand);
        background: var(--lv-primary-soft);
        border-color: transparent;
    }

    .lv-r54-settings {
        max-width: 1040px;
        margin: 0 auto;
        padding: var(--lv-sp-5);
    }

    .lv-r54-health-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--lv-sp-4);
    }

    .lv-r54-settings-action h3 {
        margin: calc(var(--lv-space-unit) * 3 + var(--lv-space-hairline)) 0 calc(var(--lv-space-unit) * 4);
        font-size: var(--lv-type-title-lg-size);
    }

    .lv-r54-settings-action p,
    .lv-r54-health-grid p {
        margin: 0 0 calc(var(--lv-space-unit) * 9);
        color: var(--lv-color-text-muted);
        font-size: var(--lv-type-body-size);
        line-height: var(--lv-lh-relaxed);
    }

    .lv-r54-settings-action {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lv-sp-4);
        margin-top: var(--lv-sp-4);
        padding: calc(var(--lv-space-unit) * 9) calc(var(--lv-space-unit) * 11);
    }

    .lv-r54-health-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .lv-r54-health-grid .lv-card2 { padding: calc(var(--lv-space-unit) * 9 + var(--lv-space-hairline)) calc(var(--lv-space-unit) * 10); }
    .lv-r54-health-grid strong { display: block; margin-top: 10px; font-size: var(--lv-type-body-sm-size); }
    .lv-r54-health-state { display: block; margin-top: 4px; color: var(--lv-color-text-muted); font-size: 11px; }
    .lv-r54-health-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
    .lv-r54-health-dot-good { background: var(--lv-color-success); }
    .lv-r54-health-dot-warn { background: var(--lv-color-warning); }
    .lv-r54-health-dot-neutral { background: var(--lv-color-brand); }

    @container lv-hub (max-width: 780px) {
        .lv-r54-shell { grid-template-columns: 1fr; }
        .lv-r54-sidebar { display: none; }
        .lv-r54-topbar { min-height: 57px; padding: 0 19px; }
        .lv-r54-local-status { display: none; }
        .lv-r54-workspace-context { max-width: 190px; flex: 0 1 auto; }
        .lv-r54-topbar-actions { flex: none; }
        .lv-r54-search { width: clamp(112px, calc(100cqi - 252px), 180px); flex: 0 1 auto; }
        .lv-r54-settings { padding: var(--lv-sp-4); }
        .lv-r54-health-grid { grid-template-columns: 1fr; }
        .lv-r54-settings-action { align-items: flex-start; flex-direction: column; }
    }

    @container lv-hub (max-width: 780px) {
        .lv-hub-bar { padding-bottom: var(--lv-sp-2); }
        .lv-hub-mobile-nav {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: calc(var(--lv-space-unit) * 1);
            flex: none;
            padding: calc(var(--lv-space-unit) * 3) var(--lv-sp-3) max(calc(var(--lv-space-unit) * 3), env(safe-area-inset-bottom));
            border-top: 1px solid var(--lv-border);
            background: color-mix(in srgb, var(--lv-color-surface) 92%, transparent);
            backdrop-filter: blur(14px) saturate(1.15);
            -webkit-backdrop-filter: blur(14px) saturate(1.15);
            box-shadow: 0 -1px 3px color-mix(in srgb, black 3%, transparent);
        }
        .lv-hub-mobile-btn {
            display: flex;
            min-height: 48px;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: calc(var(--lv-space-unit) * 1);
            border: 0;
            border-radius: var(--lv-r-m);
            background: transparent;
            color: var(--lv-color-text-muted);
            font-size: var(--lv-type-meta-size);
            cursor: pointer;
            transition: transform var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease);
        }
        .lv-hub-mobile-btn:active {
            transform: scale(0.96);
        }
        .lv-hub-mobile-btn:hover,
        .lv-hub-mobile-btn.lv-hub-mobile-active {
            color: var(--lv-color-brand);
            background: var(--lv-primary-soft);
            font-weight: var(--lv-fw-heading);
        }
        .lv-hub-mobile-icon { position: relative; display: grid; width: 24px; height: 24px; place-items: center; }
        .lv-hub-mobile-count { position: absolute; top: -4px; right: -13px; display: grid; min-width: 16px; height: 16px; place-items: center; padding: 0 3px; border: 1px solid var(--lv-color-surface); border-radius: 999px; background: var(--lv-color-brand); color: var(--lv-color-on-brand); font-size: var(--lv-type-micro-size); font-variant-numeric: tabular-nums; line-height: var(--lv-lh-tight); }
        .lv-hub-mobile-label { line-height: var(--lv-lh-icon); }
    }

    @container lv-hub (max-width: 740px) {
        .lv-hub-bar { padding-left: var(--lv-sp-4); padding-right: var(--lv-sp-4); }
    }
    @container lv-hub (max-width: 420px) {
        .lv-hub-bar { padding-left: var(--lv-sp-3); padding-right: var(--lv-sp-3); }
        .lv-r54-topbar { gap: var(--lv-sp-2); padding-right: var(--lv-sp-3); padding-left: var(--lv-sp-3); }
        .lv-r54-workspace-context { max-width: 104px; gap: 5px; }
        .lv-r54-workspace-context > span:first-child { font-size: var(--lv-type-meta-size); }
        .lv-r54-beta-badge { padding: calc(var(--lv-space-unit) * 1) calc(var(--lv-space-unit) * 2 + var(--lv-space-hairline)); font-size: 9px; }
        .lv-r54-topbar-actions { gap: calc(var(--lv-space-unit) * 1 + var(--lv-space-hairline)); }
        .lv-r54-search { width: 42px; height: 40px; flex: 0 0 42px; justify-content: center; padding: calc(var(--lv-space-unit) * 4); }
        .lv-r54-search-text, .lv-r54-search kbd { display: none; }
    }
</style>
