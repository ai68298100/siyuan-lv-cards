<script lang="ts">
    // 测试宿主：LvDrawer 携带 children snippet 的完整形态
    import LvDrawer from "../../src/ui/kit/LvDrawer.svelte";
    let { open = true, title = "抽屉" }: { open?: boolean; title?: string } = $props();
</script>

<LvDrawer {open} {title}>
    {#snippet children()}
        <div data-testid="drawer-children">抽屉内容</div>
    {/snippet}
</LvDrawer>
