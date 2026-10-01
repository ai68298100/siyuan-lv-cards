<script lang="ts">
    import LvTabs from "./kit/LvTabs.svelte";
    import Dashboard from "./dashboard.svelte";
    import Manager from "./manager.svelte";
    import type { DashboardCtx } from "./dashboard.svelte";
    import type { ManagerCtx } from "./manager.svelte";

    let { i18n, dashboardBase, managerCtx, initialTab = "overview" }: {
        i18n: any;
        /** 总览页上下文（不含 openManager，由 Hub 内部切换页签实现） */
        dashboardBase: Omit<DashboardCtx, "openManager">;
        managerCtx: ManagerCtx;
        initialTab?: string;
    } = $props();

    const tabs = [
        { id: "overview", label: i18n.hubTabOverview },
        { id: "manage", label: i18n.hubTabManage },
    ];
    let active = $state(initialTab === "manage" ? "manage" : "overview");

    const dctx: DashboardCtx = { ...dashboardBase, openManager: () => (active = "manage") };
</script>

<div class="lv-hub">
    <div class="lv-hub-bar">
        <LvTabs {tabs} active={active} onchange={(id) => (active = id)} />
    </div>
    <div class="lv-hub-body">
        {#if active === "overview"}
            <Dashboard ctx={dctx} />
        {:else}
            <Manager ctx={managerCtx} />
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
