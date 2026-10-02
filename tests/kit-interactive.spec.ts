import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import LvSegmented from "../src/ui/kit/LvSegmented.svelte";
import LvSwitch from "../src/ui/kit/LvSwitch.svelte";

// Kit 组件 smoke 测试（组件测试基建第三批，v0.88.0）：交互组件的选中/onchange 契约

describe("LvSegmented", () => {
    const options = [
        { value: "four", label: "四档" },
        { value: "three", label: "三档" },
    ];

    it("渲染全部选项；当前值 aria-checked", () => {
        const { container } = render(LvSegmented, { options, value: "three" });
        const radios = [...container.querySelectorAll("[role=radio]")];
        expect(radios).toHaveLength(2);
        expect(radios[0].getAttribute("aria-checked")).toBe("false");
        expect(radios[1].getAttribute("aria-checked")).toBe("true");
        expect(radios[1].textContent).toContain("三档");
    });

    it("点击不同项触发 onchange 并携带该值；点击当前项不触发", async () => {
        const onchange = vi.fn();
        const { container } = render(LvSegmented, { options, value: "four", onchange });
        const radios = [...container.querySelectorAll("button")];
        await fireEvent.click(radios[1]);
        expect(onchange).toHaveBeenCalledWith("three");
        expect(onchange).toHaveBeenCalledTimes(1); // 点击当前项（four）不触发
    });

    it("disabled 时按钮禁用", () => {
        const { container } = render(LvSegmented, { options, value: "four", disabled: true });
        for (const b of container.querySelectorAll("button")) {
            expect(b.disabled).toBe(true);
        }
    });
});

describe("LvSwitch", () => {
    it("渲染 checkbox 并反映 checked", () => {
        const { container } = render(LvSwitch, { checked: true });
        const input = container.querySelector("input")!;
        expect(input.checked).toBe(true);
        const r2 = render(LvSwitch, { checked: false });
        expect((r2.container.querySelector("input") as HTMLInputElement).checked).toBe(false);
    });

    it("change 触发 onchange 并携带新值", async () => {
        const onchange = vi.fn();
        const { container } = render(LvSwitch, { checked: false, onchange });
        const input = container.querySelector("input")!;
        input.checked = true;
        await fireEvent.change(input);
        expect(onchange).toHaveBeenCalledWith(true);
    });

    it("disabled 传递到 input", () => {
        const { container } = render(LvSwitch, { checked: false, disabled: true });
        expect((container.querySelector("input") as HTMLInputElement).disabled).toBe(true);
    });
});
