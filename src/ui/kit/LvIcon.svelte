<script lang="ts">
    export type LvIconName =
        | "home" | "cards" | "plus" | "learn" | "settings" | "inbox" | "search" | "question" | "bell"
        | "book" | "target" | "lightbulb" | "calendar" | "graduation" | "flag" | "zap" | "eye" | "edit" | "refresh"
        | "moon" | "ban" | "timer" | "image" | "code" | "message" | "warning" | "dice" | "flame" | "star";

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
        book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5v16M8 7h8M8 11h8",
        target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2",
        lightbulb: "M9 18h6M10 22h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3z",
        calendar: "M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2M8 2v4M16 2v4M3 10h18",
        graduation: "m2 9 10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6",
        flag: "M5 21V4m0 0c4-3 7 3 14 0v10c-7 3-10-3-14 0",
        zap: "M13 2 4 14h7l-1 8 9-12h-7z",
        eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
        edit: "M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4",
        refresh: "M20 11a8 8 0 0 0-14.9-3M5 4v4h4M4 13a8 8 0 0 0 14.9 3M19 20v-4h-4",
        moon: "M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5z",
        ban: "M4.9 4.9l14.2 14.2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
        timer: "M9 2h6M12 6v6l4 2M19.1 7.1l1.4-1.4M4.9 7.1 3.5 5.7M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
        image: "M4 5h16v14H4zM7 15l3-3 2 2 2-2 3 3M8 9h.01",
        code: "m8 9-4 3 4 3M16 9l4 3-4 3M14 6l-4 12",
        message: "M4 5h16v11H8l-4 4zM8 9h8M8 12h5",
        warning: "M12 3 2.5 20h19zM12 9v5M12 17h.01",
        dice: "M4 4h16v16H4zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01",
        flame: "M12 22c4 0 7-2.8 7-7 0-3-1.8-5.4-4.8-7.8.2 2-1 3.3-2.2 4.1.1-3.8-1.8-6-4.5-8.3.2 4-3.5 6-3.5 10 0 5.1 3.3 9 8 9z",
        star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z",
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
