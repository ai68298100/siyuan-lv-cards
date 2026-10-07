<script lang="ts">
    // 测试宿主：LvDrawer 携带 children snippet 的完整形态
    import LvDrawer from "../../src/ui/kit/LvDrawer.svelte";
    let { open = true, title = "抽屉" }: { open?: boolean; title?: string } = $props();
    // 只同步首次传入值，避免 onclose 后被仍为 true 的宿主 prop 重新打开。
    let drawerOpen = $state<boolean | undefined>(undefined);
    $effect(() => {
        drawerOpen ??= open;
    });
</script>

<LvDrawer open={drawerOpen ?? open} {title} onclose={() => (drawerOpen = false)}>
    {#snippet children()}
        <div data-testid="drawer-children">抽屉内容</div>
        <button data-testid="drawer-content-action">内容操作</button>
    {/snippet}
</LvDrawer>
