// AT-17：复习面板 chunk 入口（review + kit 引用链，独立 IIFE）
import { mount, unmount } from "svelte";
import Review from "@/ui/review.svelte";

type Props = Record<string, unknown>;

(window as unknown as { __lvChunks: Record<string, unknown> }).__lvChunks = {
    mount(target: HTMLElement, props: Props) {
        const app = mount(Review, { target, props });
        return { destroy: () => { void unmount(app); } };
    },
};
