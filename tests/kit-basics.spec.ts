import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import LvProgress from "../src/ui/kit/LvProgress.svelte";
import LvKbd from "../src/ui/kit/LvKbd.svelte";
import LvEmpty from "../src/ui/kit/LvEmpty.svelte";
import LvError from "../src/ui/kit/LvError.svelte";

// Kit 组件 smoke 测试（组件测试基建第二批，v0.87.0）：container 作用域查询，不用 screen

describe("LvProgress", () => {
    it("宽度按 value 渲染", () => {
        const { container } = render(LvProgress, { value: 42 });
        const fill = container.querySelector(".lv-mini-fill") as HTMLElement;
        expect(fill.style.width).toBe("42%");
    });

    it("越界值钳制 0-100", () => {
        const over = render(LvProgress, { value: 150 });
        expect((over.container.querySelector(".lv-mini-fill") as HTMLElement).style.width).toBe("100%");
        const under = render(LvProgress, { value: -20 });
        expect((under.container.querySelector(".lv-mini-fill") as HTMLElement).style.width).toBe("0%");
    });
});

describe("LvKbd", () => {
    it("渲染键位名", () => {
        const { container } = render(LvKbd, { k: "Space" });
        const kbd = container.querySelector("kbd");
        expect(kbd?.textContent).toBe("Space");
    });
});

describe("LvEmpty", () => {
    it("渲染文案；无 actionLabel 时不渲染按钮", () => {
        const { container } = render(LvEmpty, { text: "还没有卡片" });
        expect(container.textContent).toContain("还没有卡片");
        expect(container.querySelector("button")).toBeNull();
    });

    it("有 actionLabel+onaction 时渲染按钮并触发", async () => {
        const onaction = vi.fn();
        const { container } = render(LvEmpty, { text: "空", actionLabel: "去创建", onaction });
        const btn = container.querySelector("button")!;
        expect(btn.textContent).toContain("去创建");
        await fireEvent.click(btn);
        expect(onaction).toHaveBeenCalledTimes(1);
    });
});

describe("LvError", () => {
    it("渲染错误信息（role=alert）；无 onretry 不渲染重试按钮", () => {
        const { container } = render(LvError, { message: "加载失败" });
        expect(container.querySelector("[role=alert]")).toBeTruthy();
        expect(container.textContent).toContain("加载失败");
        expect(container.querySelector("button")).toBeNull();
    });

    it("onretry 提供时渲染重试按钮并触发", async () => {
        const onretry = vi.fn();
        const { container } = render(LvError, { message: "x", onretry, retryLabel: "重试" });
        const btn = container.querySelector("button")!;
        expect(btn.textContent).toContain("重试");
        await fireEvent.click(btn);
        expect(onretry).toHaveBeenCalledTimes(1);
    });
});
