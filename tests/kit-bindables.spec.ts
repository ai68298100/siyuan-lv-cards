import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import LvSlider from "../src/ui/kit/LvSlider.svelte";
import LvInput from "../src/ui/kit/LvInput.svelte";
import LvSelect from "../src/ui/kit/LvSelect.svelte";

// Kit 组件 smoke 测试（组件测试基建第六批，v0.98.0）：可绑定包装组件的输入契约（最后一批可测）

describe("LvSlider", () => {
    it("input 区间与初值反映 props；oninput 触发 onchange 携带数值", async () => {
        const onchange = vi.fn();
        const { container } = render(LvSlider, { value: 30, min: 5, max: 100, step: 5, suffix: "s", onchange });
        const input = container.querySelector("input")!;
        expect(input.type).toBe("range");
        expect(input.min).toBe("5");
        expect(input.max).toBe("100");
        expect(input.step).toBe("5");
        expect(container.textContent).toContain("30s");
        input.value = "60";
        await fireEvent.input(input);
        expect(onchange).toHaveBeenCalledWith(60);
    });
});

describe("LvInput", () => {
    it("type/placeholder/disabled 透传；oninput 携带字符串", async () => {
        const oninput = vi.fn();
        const { container } = render(LvInput, { value: "", placeholder: "填写", type: "password", disabled: true, oninput });
        const input = container.querySelector("input")!;
        expect(input.type).toBe("password");
        expect(input.placeholder).toBe("填写");
        expect(input.disabled).toBe(true);
        input.value = "abc";
        await fireEvent.input(input);
        expect(oninput).toHaveBeenCalledWith("abc");
    });
});

describe("LvSelect", () => {
    const options = [
        { value: "siyuan", label: "思源内置" },
        { value: "custom", label: "自定义" },
    ];

    it("渲染 options 且初值选中", () => {
        const { container } = render(LvSelect, { value: "custom", options });
        const select = container.querySelector("select")!;
        expect(select.options).toHaveLength(2);
        expect(select.value).toBe("custom");
    });

    it("change 触发 onchange 携带新值", async () => {
        const onchange = vi.fn();
        const { container } = render(LvSelect, { value: "siyuan", options, onchange });
        const select = container.querySelector("select")!;
        select.value = "custom";
        await fireEvent.change(select);
        expect(onchange).toHaveBeenCalledWith("custom");
    });

    it("disabled 透传", () => {
        const { container } = render(LvSelect, { value: "a", options, disabled: true });
        expect((container.querySelector("select") as HTMLSelectElement).disabled).toBe(true);
    });
});
