import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDialogMounter, svelteDialog } from "../src/libs/dialog";

const hostState = vi.hoisted(() => ({
    instances: [] as Array<{ element: HTMLElement; destroyCalls: number; destroy(): void }>,
    failNextConstruction: false,
}));

// The real host destroys dialogs after its exit animation. Keep that ordering
// so the old destroyCallback can run after another view has taken focus.
vi.mock("siyuan", () => ({
    Dialog: class {
        element: HTMLElement;
        destroyCalls = 0;
        private destroying = false;
        private callback?: () => void;

        constructor(options: { content: string; destroyCallback?: () => void }) {
            if (hostState.failNextConstruction) {
                hostState.failNextConstruction = false;
                throw new Error("host dialog unavailable");
            }
            this.element = document.createElement("div");
            this.element.innerHTML = options.content;
            document.body.appendChild(this.element);
            this.callback = options.destroyCallback;
            hostState.instances.push(this);
        }

        destroy() {
            this.destroyCalls += 1;
            if (this.destroying) return;
            this.destroying = true;
            setTimeout(() => {
                this.element.remove();
                this.callback?.();
            }, 160);
        }
    },
}));

describe("svelteDialog 延迟销毁与焦点归还", () => {
    let opener: HTMLButtonElement;
    let unmounts: number;

    beforeEach(() => {
        vi.useFakeTimers();
        hostState.instances = [];
        hostState.failNextConstruction = false;
        document.body.innerHTML = "";
        opener = document.createElement("button");
        opener.textContent = "打开面板";
        document.body.appendChild(opener);
        opener.focus();
        unmounts = 0;
        setDialogMounter((_component, target) => {
            const input = document.createElement("input");
            input.setAttribute("aria-label", "对话框输入");
            target.appendChild(input);
            return {
                destroy: () => {
                    unmounts += 1;
                    target.replaceChildren();
                },
            };
        });
    });

    afterEach(() => {
        vi.runAllTimers();
        vi.useRealTimers();
        vi.unstubAllEnvs();
        document.body.innerHTML = "";
    });

    const open = (extra: Record<string, unknown> = {}) => svelteDialog({
        title: "测试面板",
        component: {} as never,
        props: { onClose: () => undefined },
        ...extra,
    });

    it("主动关闭立即释放焦点陷阱并回焦，重复关闭只销毁和卸载一次", () => {
        const callback = vi.fn();
        const handle = open({ callback });
        const input = handle.dialog.element.querySelector<HTMLInputElement>("input")!;
        expect(document.activeElement).toBe(input);

        handle.close();
        handle.close();
        expect(document.activeElement).toBe(opener);
        expect(hostState.instances[0].destroyCalls).toBe(1);
        expect(unmounts).toBe(0);
        const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
        input.dispatchEvent(tab);
        expect(tab.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(opener);

        vi.advanceTimersByTime(160);
        expect(unmounts).toBe(1);
        expect(callback).toHaveBeenCalledTimes(1);
        handle.close();
        expect(unmounts).toBe(1);
        expect(hostState.instances[0].destroyCalls).toBe(1);
    });

    it("宿主关闭路径在延迟销毁后归还焦点和卸载组件", () => {
        const handle = open();
        const input = handle.dialog.element.querySelector<HTMLInputElement>("input")!;
        handle.dialog.destroy();
        expect(document.activeElement).toBe(input);
        vi.advanceTimersByTime(160);
        expect(document.activeElement).toBe(opener);
        expect(unmounts).toBe(1);
    });

    it("新对话框已接管焦点后，旧对话框的延迟回调不回抢", () => {
        const first = open();
        first.close();
        const second = open();
        const secondInput = second.dialog.element.querySelector<HTMLInputElement>("input")!;
        expect(document.activeElement).toBe(secondInput);

        vi.advanceTimersByTime(160);
        expect(document.activeElement).toBe(secondInput);
        expect(second.dialog.element.isConnected).toBe(true);
        expect(unmounts).toBe(1);
        second.close();
        vi.advanceTimersByTime(160);
        expect(document.activeElement).toBe(opener);
        expect(unmounts).toBe(2);
    });

    it("命令目标已聚焦其他工作面后，主动关闭及迟到回调均不覆盖目标焦点", () => {
        const handle = open();
        const destination = document.createElement("input");
        document.body.appendChild(destination);
        destination.focus();
        handle.close();
        expect(document.activeElement).toBe(destination);
        vi.advanceTimersByTime(160);
        expect(document.activeElement).toBe(destination);
        expect(unmounts).toBe(1);
    });

    it("宿主关闭等待期间打开新对话框，旧回调不覆盖新焦点", () => {
        const first = open();
        first.dialog.destroy();
        const second = open();
        const secondInput = second.dialog.element.querySelector<HTMLInputElement>("input")!;
        vi.advanceTimersByTime(160);
        expect(document.activeElement).toBe(secondInput);
        expect(unmounts).toBe(1);
        second.close();
        vi.advanceTimersByTime(160);
    });

    it("打开前的触发器已移除时，关闭保持安全且不聚焦失效节点", () => {
        const handle = open();
        opener.remove();
        expect(() => handle.close()).not.toThrow();
        vi.advanceTimersByTime(160);
        expect(document.activeElement).toBe(document.body);
        expect(unmounts).toBe(1);
    });

    it("宿主创建失败时释放已挂载的组件并保留错误供入口反馈", () => {
        hostState.failNextConstruction = true;
        expect(() => open()).toThrow("host dialog unavailable");
        expect(unmounts).toBe(1);
        expect(document.activeElement).toBe(opener);
        expect(hostState.instances).toHaveLength(0);
    });

    it("无注入挂载器的开发模式也卸载真正的 Svelte 组件，重复关闭保持一次性", async () => {
        vi.resetModules();
        vi.stubEnv("DEV_MODE", "true");
        const { svelteDialog: openDevDialog } = await import("../src/libs/dialog");
        const { default: Palette } = await import("../src/ui/kit/LvPalette.svelte");
        const { flushSync } = await import("svelte");
        const callback = vi.fn();
        const handle = openDevDialog({
            title: "开发模式面板",
            component: Palette,
            props: {
                commands: [{ id: "review", group: "actions", label: "开始复习" }],
                onrun: () => undefined,
                onClose: () => undefined,
            },
            callback,
        });
        flushSync();
        const content = handle.dialog.element.querySelector<HTMLElement>(".dialog-content")!;
        expect(content.querySelector("input")).not.toBeNull();

        handle.close();
        handle.close();
        vi.advanceTimersByTime(160);
        await Promise.resolve();
        flushSync();

        // Removing the host element alone leaves its descendants in memory.
        // A real Svelte unmount must remove the component from that detached host too.
        expect(content.querySelector("input")).toBeNull();
        expect(content.querySelector("[role='dialog']")).toBeNull();
        expect(hostState.instances[0].destroyCalls).toBe(1);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(opener);
    });
});
