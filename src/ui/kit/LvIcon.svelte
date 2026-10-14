<script lang="ts">
    export type LvIconName = "home" | "cards" | "plus" | "learn" | "settings" | "inbox" | "search" | "question" | "bell";

    let { name, size = 18 }: { name: LvIconName; size?: number } = $props();

    const paths: Record<LvIconName, string> = {
        home: "M3 10l9-7 9 7M5 9v11h5v-6h4v6h5V9",
        cards: "M6 5h12v15H6zM3 2h12M9 9h6M9 13h4",
        plus: "M12 4v16M4 12h16",
        learn: "M3 18h18M5 14v-3M10 14V7M15 14V4M20 14v-5",
        settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
        inbox: "M4 4h16l2 12v4H2v-4zM3 15h5l2 3h4l2-3h5",
        search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6",
        question: "M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
        bell: "M5 16V9a7 7 0 0 1 14 0v7l2 3H3zM10 22h4",
    };
</script>

<svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
>
    <path d={paths[name]} />
</svg>

<style>
    svg { display: block; flex: none; }
</style>
