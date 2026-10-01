<script lang="ts">
    import type { Snippet } from "svelte";

    let { tone = "default", children }: {
        tone?: "default" | "primary" | "warn" | "error";
        children?: Snippet;
    } = $props();
</script>

<span class={`lv-chip2 lv-chip2--${tone}`}>{@render children?.()}</span>
