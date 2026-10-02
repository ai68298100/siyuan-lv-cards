<script lang="ts">
    // 测试宿主：以 .svelte 文件内 {#snippet} 定义子内容——绕开 createRawSnippet 的模块解析错位
    import LvChip from "../../src/ui/kit/LvChip.svelte";
    let { tone = "default", label = "考前" }: { tone?: string; label?: string } = $props();
</script>

<LvChip {tone}>{label}</LvChip>
