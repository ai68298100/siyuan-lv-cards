// AT-17：复习面板 chunk 入口（review + kit 引用链，独立 IIFE）
import { mount, unmount } from "svelte";
import Review from "@/ui/review.svelte";

type Props = Record<string, unknown>;

// 按键合并注册（v0.185.1 修复，同 hub.ts：整表覆盖使 __lvChunks.review 恒缺）
const w = window as unknown as { __lvChunks?: Record<string, unknown> };
(w.__lvChunks ??= {}).review = {
    mount(target: HTMLElement, props: Props) {
        const app = mount(Review, { target, props });
        return { destroy: () => { void unmount(app); } };
    },
};
