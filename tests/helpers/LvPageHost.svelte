<script lang="ts">
    // 测试宿主：LvPage 携带 children snippet 的完整形态
    import LvPage from "../../src/ui/kit/LvPage.svelte";
    let { title = "闪卡中心", subtitle = "自 2026-10-01", dot = false } = $props();
</script>

<LvPage {title} {subtitle} {dot}>
    {#snippet children()}
        <div data-testid="page-children">页内容</div>
    {/snippet}
</LvPage>
