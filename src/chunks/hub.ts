// AT-17：Hub chunk 入口（hub + 总览/管理/收件箱/目标/考试 页签 + kit 全链，独立 IIFE）
// 挂载与组件共用本 chunk 内的 svelte 实例（无双份内部状态）；siyuan 走 window.__lvSiyuan
import { mount, unmount } from "svelte";
import Hub from "@/ui/hub.svelte";

type Props = Record<string, unknown>;

(window as unknown as { __lvChunks: Record<string, unknown> }).__lvChunks = {
    mount(target: HTMLElement, props: Props) {
        const app = mount(Hub, { target, props });
        return { destroy: () => { void unmount(app); } };
    },
};
