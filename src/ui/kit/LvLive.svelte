<script lang="ts">
    /** AS-4 读屏播报（Kit）：aria-live 区域，评分/跳过/加载/错误/保存等状态变化播报。
     *  tone=polite → role=status（排队播报）；tone=assertive → role=alert（立即打断）。
     *  视觉隐藏（读屏专用），宿主布局零影响。message 置空即静默。 */
    let { message = "", tone = "polite" }: {
        message?: string;
        tone?: "polite" | "assertive";
    } = $props();
</script>

<div class="lv-visually-hidden" aria-live={tone} role={tone === "assertive" ? "alert" : "status"}>{message}</div>

<style>
    /* 读屏专用可见性隐藏：不 display:none（读屏会忽略），保持可访问树 */
    .lv-visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
    }
</style>
