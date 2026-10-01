<script lang="ts">
    import LvTabs from "./kit/LvTabs.svelte";
    import Dashboard from "./dashboard.svelte";
    import Manager from "./manager.svelte";
    import type { DashboardCtx } from "./dashboard.svelte";
    import type { ManagerCtx } from "./manager.svelte";
    import type { ExamPlan, ExamPlansData, ExamScopeKind } from "@/core/exam";

    let { i18n, dashboardBase, managerCtx, exam, initialTab = "overview", onTabChange }: {
        i18n: any;
        /** 总览页上下文（不含 openManager，由 Hub 内部切换页签实现） */
        dashboardBase: Omit<DashboardCtx, "openManager">;
        managerCtx: ManagerCtx;
        /** 考试子页数据通道；null = 模块关闭 */
        exam: {
            plans: ExamPlansData;
            onSavePlan: (plan: ExamPlan) => ExamPlansData;
            onDeletePlan: (id: string) => ExamPlansData;
            onReviewScope: (scopeKind: ExamScopeKind, scopeId: string, cram: boolean) => void;
            onReport: (plan: ExamPlan) => void;
            onWriteReport: (plan: ExamPlan) => void;
        } | null;
        initialTab?: string;
        onTabChange?: (id: string) => void;
    } = $props();

    const tabs = [
        { id: "overview", label: i18n.hubTabOverview },
        { id: "manage", label: i18n.hubTabManage },
        ...(exam ? [{ id: "exam", label: i18n.hubTabExam }] : []),
    ];
    let active = $state(
        initialTab === "manage" || (initialTab === "exam" && exam) ? initialTab : "overview"
    );

    let plans = $state(exam?.plans ?? { version: 1 as const, plans: [] });

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
    if (active === "exam") { ensureExam(); }

    function switchTab(id: string) {
        active = id;
        onTabChange?.(id);
    }
</script>

<div class="lv-hub">
    <div class="lv-hub-bar">
        <LvTabs {tabs} active={active} onchange={switchTab} />
    </div>
    <div class="lv-hub-body">
        <!-- 错误边界（450）：{#key} 使边界随页签重建，单子页崩溃不拖垮中心，切换自愈 -->
        {#key active}
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
                    <Dashboard ctx={dctx} />
                {:else if active === "manage"}
                    <Manager ctx={managerCtx} />
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
                        />
                    {:else if examError}
                        <div style="padding: var(--lv-sp-5); color: var(--b3-theme-error); font-size: 13px">{examError}</div>
                    {:else}
                        <div style="padding: var(--lv-sp-5); color: var(--b3-theme-on-surface); font-size: 13px">{i18n.dashboard.loading}</div>
                    {/if}
                {/if}
            </svelte:boundary>
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
