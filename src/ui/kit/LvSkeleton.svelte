<script lang="ts">
    /** 骨架屏（Kit，342）：row（行）/block（块）两种形态，替代手写 .lv-skeleton 堆叠 */
    let { shape = "row", count = 4, height = 44, gap = 8 }: {
        shape?: "row" | "block";
        count?: number;
        /** px */
        height?: number;
        gap?: number;
    } = $props();
</script>

<div class="lv-skel" style={`display:flex;flex-direction:column;gap:${gap}px`}>
    {#each Array(count) as _, i (i)}
        <div
            class="lv-skeleton"
            style={`height:${height}px;${shape === "block" ? "border-radius: var(--lv-r-m);" : ""}`}
        ></div>
    {/each}
</div>
