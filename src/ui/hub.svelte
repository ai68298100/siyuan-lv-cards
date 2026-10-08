<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import LvTabs from "./kit/LvTabs.svelte";
    import Dashboard from "./dashboard.svelte";
    import Manager from "./manager.svelte";
    import type { DashboardCtx } from "./dashboard.svelte";
    import type { ManagerCtx } from "./manager.svelte";
    import type { ExamPlan, ExamPlansData, ExamScopeKind } from "@/core/exam";
    import type { InboxData, InboxStatus } from "@/core/inbox";
    import type { LearningGoal, LearningGoalsData } from "@/core/learning-goal";

    let {
        i18n, dashboardBase, managerCtx, exam, inbox, goals, maintenance, uiMode = "advanced", initialTab = "overview", onTabChange,
        openWizard, openDrill,
    }: {
        i18n: any;
        /** 总览页上下文（不含 openManager，由 Hub 内部切换页签实现） */
        dashboardBase: Omit<DashboardCtx, "openManager">;
        managerCtx: ManagerCtx;
        /** T02 工作台入口页：向导与修卡演练（可选——旧宿主不传则页签隐藏） */
        openWizard?: () => void;
        openDrill?: () => void;
        /** 考试子页数据通道；null = 模块关闭 */
        exam: {
            plans: ExamPlansData;
            onSavePlan: (plan: ExamPlan) => ExamPlansData;
            onDeletePlan: (id: string) => ExamPlansData;
            onReviewScope: (scopeKind: ExamScopeKind, scopeId: string, cram: boolean) => void;
            onReport: (plan: ExamPlan) => void;
            onWriteReport: (plan: ExamPlan) => void;
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
            makeCards: (blockIDs: string[]) => Promise<void>;
            openSource: (blockID: string) => Promise<void>;
            titles: (ids: string[]) => Promise<Map<string, string>>;
        } | null;
        /** BI-1 学习目标通道（只记录目标不强迫建卡） */
        goals: {
            get: () => LearningGoalsData;
            save: (goal: LearningGoal) => LearningGoalsData;
            remove: (id: string) => LearningGoalsData;
        };
        /** BI-25 维护债务通道（只读扫描 + 今日暂缓可逆 + 回来源） */
        maintenance: {
            scan: () => Promise<{ blockID: string; md: string; state?: string; rootID?: string }[]>;
            suspendToday: (blockIDs: string[]) => void;
            unsuspendToday: (blockIDs: string[]) => void;
            isSuspendedToday: (blockID: string) => boolean;
            openSource: (blockID: string) => Promise<void>;
        };
        /** BI-14：界面模式（simple=隐藏考试/维护高级入口；纯显示控制） */
        uiMode?: "simple" | "advanced";
        initialTab?: string;
        onTabChange?: (id: string) => void;
    } = $props();

    // 初值语义：i18n/exam/inbox 由挂载时的插件设置决定，hub 生命周期内不变
    // svelte-ignore state_referenced_locally
    const tabs = [
        { id: "overview", label: i18n.hubTabOverview },
        { id: "manage", label: i18n.hubTabManage },
        ...(openWizard ? [{ id: "authoring", label: i18n.hubTabAuthoring }] : []),
        { id: "goals", label: i18n.hubTabGoals },
        ...(inbox ? [{ id: "inbox", label: i18n.hubTabInbox }] : []),
        ...(exam && uiMode !== "simple" ? [{ id: "exam", label: i18n.hubTabExam }] : []),
        ...(uiMode !== "simple" ? [{ id: "maintenance", label: i18n.hubTabMaintenance }] : []),
    ];
    // svelte-ignore state_referenced_locally
    let active = $state(
        initialTab === "manage" || initialTab === "goals" || (initialTab === "maintenance" && uiMode !== "simple") || (initialTab === "exam" && exam && uiMode !== "simple") || (initialTab === "inbox" && inbox) ? initialTab : "overview"
    );

    // svelte-ignore state_referenced_locally
    let plans = $state(exam?.plans ?? { version: 1 as const, plans: [] });

    // svelte-ignore state_referenced_locally
    const dctx: DashboardCtx = { ...dashboardBase, openManager: () => (active = "manage") };

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

    // BI-1 目标页懒加载（同考试页模式：首次切到才拉 chunk）
    let GoalsComp = $state<any>(null);
    let goalsError = $state("");
    async function ensureGoals() {
        if (GoalsComp) { return; }
        goalsError = "";
        try {
            GoalsComp = (await import("./goals-page.svelte")).default;
        } catch (e: any) {
            goalsError = e?.message ?? String(e);
        }
    }
    $effect(() => {
        if (active === "goals") { ensureGoals(); }
    });
    // svelte-ignore state_referenced_locally
    if (active === "goals") { ensureGoals(); }

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

    function switchTab(id: string) {
        active = id;
        onTabChange?.(id);
    }

    // T13/openTabOf 去重（docs/40）：外部（顶栏/命令面板）复用既有中心页签时，
    // 经根元素派发 lv-switch-tab 事件切换子页——避免每次入口都新开一个中心
    let hubRoot = $state<HTMLElement | null>(null);
    let onSwitchTab: ((e: Event) => void) | null = null;
    onMount(() => {
        onSwitchTab = (e: Event) => {
            const id = (e as CustomEvent<string>).detail;
            if (typeof id === "string" && tabs.some(t => t.id === id)) switchTab(id);
        };
        hubRoot?.addEventListener("lv-switch-tab", onSwitchTab);
    });
    onDestroy(() => {
        hubRoot?.removeEventListener("lv-switch-tab", onSwitchTab ?? (() => {}));
    });
</script>

<div class="lv-hub" bind:this={hubRoot}>
    <!-- R53 中心外壳：只保留页签栏（原型 .app-head 口径）；页头语义下放到各子页
         的 LvPage（eyebrow + 题 + 副题 + 动作），避免一屏两个 24px 题级 -->
    <div class="lv-hub-bar">
        <LvTabs {tabs} active={active} onchange={switchTab} panelId="lv-hub-panel" />
    </div>
    <div class="lv-hub-body">
        <!-- 错误边界（450）：{#key} 使边界随页签重建，单子页崩溃不拖垮中心，切换自愈 -->
        {#key active}
            <!-- 页签切换：140ms 单次淡入（R53 动效纪律：只动 opacity，无错峰） -->
            <div
                id="lv-hub-panel"
                class="lv-hub-panel"
                role="tabpanel"
                aria-labelledby={`lv-tab-${active}`}
                tabindex="0"
                in:fade={{ duration: 140 }}
            >
            <svelte:boundary onerror={(e) => console.warn("[lv-cards] tab error", e)}>
                {#snippet failed(error: unknown, reset)}
                    <div style="padding: var(--lv-sp-5)">
                        <div class="lv-card2">
                            <div style="color: var(--b3-theme-error); font-size: 13px; margin-bottom: 8px">{i18n.hubTabError}{error instanceof Error && error.message ? `: ${error.message}` : ""}</div>
                            <button class="b3-button b3-button--outline" onclick={reset}>{i18n.dashboard.refresh}</button>
                        </div>
                    </div>
                {/snippet}
                {#if active === "overview"}
                    <!-- T08：注入页签切换（待处理分区直达收件箱） -->
                    <Dashboard ctx={{ ...dctx, openHubTab: (id: string) => switchTab(id) }} />
                {:else if active === "authoring"}
                    <!-- T02 工作台入口页（docs/40）：向导/演练常驻入口；全屏内嵌工作面为后续批次 -->
                    <div style="padding: var(--lv-sp-5); max-width: 720px; margin: 0 auto">
                        <div class="lv-pagehead">
                            <div class="lv-pagehead-main">
                                <div class="lv-eyebrow">CREATE / CHECK</div>
                                <div class="lv-pagehead-title">{i18n.hubTabAuthoring}</div>
                                <p class="lv-pagehead-sub">{i18n.authoringPageSub}</p>
                            </div>
                        </div>
                        <div class="lv-card2" style="padding: 20px 22px">
                            <div style="font-weight: 650; font-size: 15px">{i18n.aiWizardTitle}</div>
                            <div class="ft__smaller ft__on-surface" style="margin: 6px 0 12px">{i18n.authoringWizardDesc}</div>
                            <button class="b3-button lv-btn-primary" onclick={() => openWizard?.()}>{i18n.authoringWizardOpen}</button>
                        </div>
                        {#if openDrill}
                            <div class="lv-card2" style="margin-top: var(--lv-sp-3); padding: 20px 22px">
                                <div style="font-weight: 650; font-size: 15px">{i18n.drillTitle}</div>
                                <div class="ft__smaller ft__on-surface" style="margin: 6px 0 12px">{i18n.authoringDrillDesc}</div>
                                <button class="b3-button b3-button--outline" onclick={() => openDrill?.()}>{i18n.authoringDrillOpen}</button>
                            </div>
                        {/if}
                    </div>
                {:else if active === "manage"}
                    <Manager ctx={managerCtx} />
                {:else if active === "goals"}
                    {#if GoalsComp}
                        <GoalsComp i18n={i18n} {goals} />
                    {:else if goalsError}
                        <div style="padding: var(--lv-sp-5); color: var(--b3-theme-error); font-size: 13px">{goalsError}</div>
                    {:else}
                        <div style="padding: var(--lv-sp-5); color: var(--b3-theme-on-surface); font-size: 13px">{i18n.dashboard.loading}</div>
                    {/if}
                {:else if active === "maintenance"}
                    {#if MaintComp}
                        <MaintComp i18n={i18n} maintenance={maintenance} />
                    {:else if maintError}
                        <div style="padding: var(--lv-sp-5); color: var(--b3-theme-error); font-size: 13px">{maintError}</div>
                    {:else}
                        <div style="padding: var(--lv-sp-5); color: var(--b3-theme-on-surface); font-size: 13px">{i18n.dashboard.loading}</div>
                    {/if}
                {:else if active === "inbox" && inbox}
                    {#if InboxComp}
                        <InboxComp i18n={i18n} inbox={inbox} />
                    {:else if inboxError}
                        <div style="padding: var(--lv-sp-5); color: var(--b3-theme-error); font-size: 13px">{inboxError}</div>
                    {:else}
                        <div style="padding: var(--lv-sp-5); color: var(--b3-theme-on-surface); font-size: 13px">{i18n.dashboard.loading}</div>
                    {/if}
                {:else if exam}
                    {#if ExamComp}
                        <ExamComp
                            i18n={i18n}
                            plans={plans}
                            onSavePlan={(p: ExamPlan) => (plans = exam!.onSavePlan(p))}
                            onDeletePlan={(id: string) => (plans = exam!.onDeletePlan(id))}
                            onReviewScope={exam.onReviewScope}
                            onReport={exam.onReport}
                            onWriteReport={exam.onWriteReport}
                            getRevlog={exam.getRevlog}
                            getDailyCap={exam.getDailyCap}
                        />
                    {:else if examError}
                        <div style="padding: var(--lv-sp-5); color: var(--b3-theme-error); font-size: 13px">{examError}</div>
                    {:else}
                        <div style="padding: var(--lv-sp-5); color: var(--b3-theme-on-surface); font-size: 13px">{i18n.dashboard.loading}</div>
                    {/if}
                {/if}
            </svelte:boundary>
            </div>
        {/key}
    </div>
</div>

<style>
    .lv-hub {
        height: 100%;
        display: flex;
        flex-direction: column;
    }
    .lv-hub-bar {
        padding: var(--lv-sp-3) var(--lv-sp-5) 0;
        flex: none;
    }

    .lv-hub-body {
        flex: 1;
        min-height: 0;
    }
</style>
