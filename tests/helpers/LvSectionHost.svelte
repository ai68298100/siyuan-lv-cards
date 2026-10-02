<script lang="ts">
    // 测试宿主：LvSection 携带 children + actions snippet 的完整形态
    import LvSection from "../../src/ui/kit/LvSection.svelte";
    let { title = "曲线", sub = "实测" }: { title?: string; sub?: string } = $props();
</script>

<LvSection {title} {sub}>
    {#snippet children()}
        <div data-testid="section-children">子内容</div>
    {/snippet}
    {#snippet actions()}
        <button data-testid="section-action">导出</button>
    {/snippet}
</LvSection>
