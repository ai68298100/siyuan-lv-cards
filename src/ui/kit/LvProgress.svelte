<script lang="ts">
    let { value, ariaLabel = "" }: {
        /** 0-100 */
        value: number;
        /** AS-10：读屏标签 */
        ariaLabel?: string;
    } = $props();
</script>

<div
    class="lv-mini-track"
    role="progressbar"
    aria-valuenow={Math.min(100, Math.max(0, value))}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label={ariaLabel || undefined}
>
    <div class="lv-mini-fill" style={`width:${Math.min(100, Math.max(0, value))}%`}></div>
</div>
