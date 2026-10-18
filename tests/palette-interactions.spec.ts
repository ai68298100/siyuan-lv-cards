import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import LvPalette from "../src/ui/kit/LvPalette.svelte";
import type { PaletteCommand } from "../src/core/palette";

const commands: PaletteCommand[] = Array.from({ length: 18 }, (_, index) => ({
    id: `command-${index + 1}`,
    group: index < 6 ? "actions" : "navigation",
    label: `Command ${index + 1}`,
    hint: index === 0 ? "⌘1" : undefined,
}));

function mountPalette(items = commands) {
    const onrun = vi.fn();
    const onClose = vi.fn();
    const props = { commands: items, placeholder: "搜索动作", labels: { empty: "没有匹配的命令" }, onrun, onClose };
    const view = render(LvPalette, props);
    const input = view.container.querySelector<HTMLInputElement>("input")!;
    const options = () => [...view.container.querySelectorAll<HTMLButtonElement>("[role='option']")];
    const selected = () => view.container.querySelector<HTMLButtonElement>("[role='option'][aria-selected='true']");
    return { ...view, props, input, options, selected, onrun, onClose };
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("LvPalette 可访问键盘交互", () => {
    it("输入关联列表和活动选项，结果项不进入 Tab 顺序", async () => {
        const view = mountPalette();
        await tick();
        const list = view.getByRole("listbox");
        expect(view.input.getAttribute("role")).toBe("combobox");
        expect(view.input.getAttribute("aria-autocomplete")).toBe("list");
        expect(view.input.getAttribute("aria-expanded")).toBe("true");
        expect(list.id).not.toBe("");
        expect(view.input.getAttribute("aria-controls")).toBe(list.id);
        expect(view.selected()?.id).not.toBe("");
        expect(view.input.getAttribute("aria-activedescendant")).toBe(view.selected()?.id);
        expect(view.options().every(option => option.tabIndex === -1)).toBe(true);
    });

    it("同时挂载的面板使用独立的列表及活动选项 ID", async () => {
        const first = mountPalette();
        const second = mountPalette();
        await tick();
        const firstList = first.container.querySelector<HTMLElement>("[role='listbox']")!;
        const secondList = second.container.querySelector<HTMLElement>("[role='listbox']")!;
        expect(firstList.id).not.toBe("");
        expect(secondList.id).not.toBe(firstList.id);
        const ids = [...first.options(), ...second.options()].map(option => option.id);
        expect(ids.every(Boolean)).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
        expect(first.input.getAttribute("aria-controls")).toBe(firstList.id);
        expect(second.input.getAttribute("aria-controls")).toBe(secondList.id);
        expect(first.container.contains(document.getElementById(first.input.getAttribute("aria-activedescendant")!))).toBe(true);
        expect(second.container.contains(document.getElementById(second.input.getAttribute("aria-activedescendant")!))).toBe(true);
    });

    it("上下键跨首尾循环，焦点留在搜索输入中", async () => {
        const view = mountPalette();
        await tick();
        view.input.focus();
        await fireEvent.keyDown(view.input, { key: "ArrowUp" });
        expect(view.selected()).toBe(view.options().at(-1));
        expect(view.input.getAttribute("aria-activedescendant")).toBe(view.selected()?.id);
        await fireEvent.keyDown(view.input, { key: "ArrowDown" });
        expect(view.selected()).toBe(view.options()[0]);
        await fireEvent.keyDown(view.input, { key: "ArrowDown" });
        expect(view.selected()).toBe(view.options()[1]);
        expect(document.activeElement).toBe(view.input);
    });

    it("Home/End 跳到当前结果的首尾", async () => {
        const view = mountPalette();
        await fireEvent.keyDown(view.input, { key: "End" });
        expect(view.selected()).toBe(view.options().at(-1));
        await fireEvent.keyDown(view.input, { key: "Home" });
        expect(view.selected()).toBe(view.options()[0]);
        expect(view.onrun).not.toHaveBeenCalled();
    });

    it("长列表键盘选择将活动项即时滚入最近可视位置", async () => {
        const view = mountPalette();
        await tick();
        const firstScroll = vi.fn();
        const lastScroll = vi.fn();
        Object.defineProperty(view.options()[0], "scrollIntoView", { configurable: true, value: firstScroll });
        Object.defineProperty(view.options().at(-1)!, "scrollIntoView", { configurable: true, value: lastScroll });
        expect(view.options()).toHaveLength(commands.length);
        await fireEvent.keyDown(view.input, { key: "End" });
        await waitFor(() => expect(lastScroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" }));
        await fireEvent.keyDown(view.input, { key: "ArrowDown" });
        await waitFor(() => expect(firstScroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" }));
    });

    it("过滤后回到首项，Enter 执行当前项且只关闭一次", async () => {
        const view = mountPalette();
        await fireEvent.keyDown(view.input, { key: "ArrowUp" });
        await fireEvent.input(view.input, { target: { value: "Command 1" } });
        expect(view.selected()).toBe(view.options()[0]);
        expect(view.selected()?.textContent).toContain("Command 1");
        expect(view.input.getAttribute("aria-activedescendant")).toBe(view.selected()?.id);
        await fireEvent.keyDown(view.input, { key: "ArrowDown" });
        await fireEvent.keyDown(view.input, { key: "Enter" });
        expect(view.onrun).toHaveBeenCalledExactlyOnceWith(commands[9]);
        expect(view.onClose).toHaveBeenCalledTimes(1);
        expect(view.onrun.mock.invocationCallOrder[0]).toBeLessThan(view.onClose.mock.invocationCallOrder[0]);
    });

    it("空结果清除活动后代，Enter 不执行或关闭；清空过滤恢复首项", async () => {
        const view = mountPalette();
        await fireEvent.input(view.input, { target: { value: "no-match" } });
        expect(view.options()).toEqual([]);
        expect(view.input.hasAttribute("aria-activedescendant")).toBe(false);
        expect(view.container.textContent).toContain("没有匹配的命令");
        await fireEvent.keyDown(view.input, { key: "ArrowDown" });
        await fireEvent.keyDown(view.input, { key: "Enter" });
        expect(view.onrun).not.toHaveBeenCalled();
        expect(view.onClose).not.toHaveBeenCalled();
        await fireEvent.input(view.input, { target: { value: "" } });
        expect(view.selected()).toBe(view.options()[0]);
        expect(view.input.getAttribute("aria-activedescendant")).toBe(view.selected()?.id);
    });

    it("命令源替换为更短的新列表时，不遗留旧选择或执行旧命令", async () => {
        const view = mountPalette();
        await fireEvent.keyDown(view.input, { key: "ArrowUp" });
        const replacement = [
            { id: "new-a", label: "新动作 A", group: "actions" },
            { id: "new-b", label: "新动作 B", group: "actions" },
        ];
        await view.rerender({ ...view.props, commands: replacement });
        await tick();
        expect(view.selected()).toBe(view.options()[0]);
        expect(view.input.getAttribute("aria-activedescendant")).toBe(view.options()[0].id);
        await fireEvent.keyDown(view.input, { key: "Enter" });
        expect(view.onrun).toHaveBeenCalledExactlyOnceWith(replacement[0]);
    });

    it("命令源等长替换时也重置到新首项，不沿用旧列表的索引", async () => {
        const view = mountPalette();
        await fireEvent.keyDown(view.input, { key: "ArrowDown" });
        const replacement = commands.map((command, index) => ({
            ...command,
            id: `replacement-${index}`,
            label: `Replacement ${index}`,
        }));
        await view.rerender({ ...view.props, commands: replacement });
        await tick();
        expect(view.options()).toHaveLength(replacement.length);
        expect(view.selected()).toBe(view.options()[0]);
        await fireEvent.keyDown(view.input, { key: "Enter" });
        expect(view.onrun).toHaveBeenCalledExactlyOnceWith(replacement[0]);
    });

    it("鼠标悬停同步活动后代，点击可执行末项命令", async () => {
        const view = mountPalette();
        const last = view.options().at(-1)!;
        await fireEvent.mouseEnter(last);
        expect(view.selected()).toBe(last);
        expect(view.input.getAttribute("aria-activedescendant")).toBe(last.id);
        await fireEvent.click(last);
        expect(view.onrun).toHaveBeenCalledExactlyOnceWith(commands.at(-1));
        expect(view.onClose).toHaveBeenCalledTimes(1);
    });

    it("鼠标悬停只更新活动态，键盘导航才滚动新的活动项", async () => {
        const view = mountPalette();
        await tick();
        const first = view.options()[0];
        const last = view.options().at(-1)!;
        const firstScroll = vi.fn();
        const lastScroll = vi.fn();
        Object.defineProperty(first, "scrollIntoView", { configurable: true, value: firstScroll });
        Object.defineProperty(last, "scrollIntoView", { configurable: true, value: lastScroll });

        await fireEvent.mouseEnter(last);
        await tick();
        expect(view.selected()).toBe(last);
        expect(view.input.getAttribute("aria-activedescendant")).toBe(last.id);
        expect(lastScroll).not.toHaveBeenCalled();

        await fireEvent.keyDown(view.input, { key: "ArrowDown" });
        await waitFor(() => expect(firstScroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" }));
    });

    it.each(["Command 1", "   "])("查询有文本时保留 Home/End 编辑键，修饰快捷键也不改动列表选择：%j", async query => {
        const view = mountPalette();
        await fireEvent.input(view.input, { target: { value: query } });
        await fireEvent.keyDown(view.input, { key: "ArrowDown" });
        const selected = view.selected();
        for (const key of ["Home", "End"]) {
            const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
            await fireEvent(view.input, event);
            expect(event.defaultPrevented).toBe(false);
            expect(view.selected()).toBe(selected);
        }
        await fireEvent.input(view.input, { target: { value: "" } });
        await fireEvent.keyDown(view.input, { key: "ArrowDown" });
        const beforeShortcut = view.selected();
        for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
            for (const key of ["Home", "End", "ArrowUp", "ArrowDown", "Enter", "Escape"]) {
                const event = new KeyboardEvent("keydown", { key, ...modifier, bubbles: true, cancelable: true });
                await fireEvent(view.input, event);
                expect(event.defaultPrevented).toBe(false);
                expect(view.selected()).toBe(beforeShortcut);
            }
        }
        expect(view.onrun).not.toHaveBeenCalled();
        expect(view.onClose).not.toHaveBeenCalled();
    });

    it("Escape 只请求关闭一次，保持宿主负责销毁与焦点归还", async () => {
        const view = mountPalette();
        await fireEvent.keyDown(view.input, { key: "Escape" });
        expect(view.onClose).toHaveBeenCalledTimes(1);
        expect(view.onrun).not.toHaveBeenCalled();
    });

    it.each([
        { name: "compositionstart 生命周期", lifecycle: true, event: {} },
        { name: "isComposing 键盘事件", lifecycle: false, event: { isComposing: true } },
        { name: "兼容 keyCode 229", lifecycle: false, event: { keyCode: 229 } },
    ])("中文输入合成期间忽略导航、执行与关闭：$name", async ({ lifecycle, event }) => {
        const view = mountPalette();
        await tick();
        const original = view.selected();
        if (lifecycle) await fireEvent.compositionStart(view.input);
        for (const key of ["ArrowDown", "End", "Enter", "Escape"]) {
            await fireEvent.keyDown(view.input, { key, ...event });
        }
        expect(view.selected()).toBe(original);
        expect(view.onrun).not.toHaveBeenCalled();
        expect(view.onClose).not.toHaveBeenCalled();
        if (lifecycle) await fireEvent.compositionEnd(view.input);
        await fireEvent.keyDown(view.input, { key: "ArrowDown" });
        expect(view.selected()).toBe(view.options()[1]);
    });
});
