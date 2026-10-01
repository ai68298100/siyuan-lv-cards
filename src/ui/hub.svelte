<script lang="ts">
    import LvTabs from "./kit/LvTabs.svelte";
    import Dashboard from "./dashboard.svelte";
    import Manager from "./manager.svelte";
    import ExamPage from "./exam-page.svelte";
    import type { DashboardCtx } from "./dashboard.svelte";
    import type { ManagerCtx } from "./manager.svelte";
    import type { ExamPlan, ExamPlansData, ExamScopeKind } from "@/core/exam";

    let { i18n, dashboardBase, managerCtx, exam, initialTab = "overview" }: {
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
        } | null;
        initialTab?: string;
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
</script>

<div class="lv-hub">
    <div class="lv-hub-bar">
        <LvTabs {tabs} active={active} onchange={(id) => (active = id)} />
    </div>
    <div class="lv-hub-body">
        {#if active === "overview"}
            <Dashboard ctx={dctx} />
        {:else if active === "manage"}
            <Manager ctx={managerCtx} />
        {:else if exam}
            <ExamPage
                i18n={i18n}
                plans={plans}
                onSavePlan={(p) => (plans = exam!.onSavePlan(p))}
                onDeletePlan={(id) => (plans = exam!.onDeletePlan(id))}
                onReviewScope={exam.onReviewScope}
                onReport={exam.onReport}
            />
        {/if}
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
