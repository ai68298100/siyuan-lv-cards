import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import LvTabs from "../src/ui/kit/LvTabs.svelte";
import LvRow from "../src/ui/kit/LvRow.svelte";

// Kit 组件 smoke 测试（组件测试基建第四批，v0.89.0）：LvTabs 选中/切换契约；LvRow 渲染契约

describe("LvTabs", () => {
    const tabs = [
        { id: "overview", label: "总览" },
        { id: "manage", label: "管理" },
        { id: "exam", label: "考试" },
    ];

    it("渲染全部页签；active 页签 aria-selected", () => {
        const { container } = render(LvTabs, { tabs, active: "manage", onchange: () => {} });
        const els = [...container.querySelectorAll("[role=tab]")];
        expect(els).toHaveLength(3);
        expect(els.map(e => e.textContent)).toEqual(["总览", "管理", "考试"]);
        expect(els[0].getAttribute("aria-selected")).toBe("false");
        expect(els[1].getAttribute("aria-selected")).toBe("true");
        expect(els[1].classList.contains("lv-tab-active")).toBe(true);
    });

    it("点击页签触发 onchange 携带该 id", async () => {
        const onchange = vi.fn();
        const { container } = render(LvTabs, { tabs, active: "overview", onchange });
        const els = [...container.querySelectorAll("[role=tab]")];
        await fireEvent.click(els[2]);
        expect(onchange).toHaveBeenCalledWith("exam");
        expect(onchange).toHaveBeenCalledTimes(1);
    });

    it("点击当前 active 页签仍触发（hub 以重挂载自愈，契约允许）", async () => {
        const onchange = vi.fn();
        const { container } = render(LvTabs, { tabs, active: "overview", onchange });
        await fireEvent.click(container.querySelectorAll("[role=tab]")[0]);
        expect(onchange).toHaveBeenCalledWith("overview");
    });

    it("AS-9：页签有唯一 id（lv-tab-{id}）与 roving tabindex", () => {
        const { container } = render(LvTabs, { tabs, active: "manage", onchange });
        const els = [...container.querySelectorAll("[role=tab]")];
        expect(els.map(e => e.id)).toEqual(["lv-tab-overview", "lv-tab-manage", "lv-tab-exam"]);
        expect(els.map(e => e.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    });

    it("AS-9：宿主提供单一活动面板时，所有页签关联同一现存面板", () => {
        const { container } = render(LvTabs, { tabs, active: "manage", onchange: () => {}, panelId: "hub-panel" });
        const list = container.querySelector("[role=tablist]")!;
        expect(list.getAttribute("aria-orientation")).toBe("horizontal");
        expect([...container.querySelectorAll("[role=tab]")].map((e) => e.getAttribute("aria-controls"))).toEqual([
            "hub-panel", "hub-panel", "hub-panel",
        ]);
    });

    it("AS-9：ArrowRight 移动并激活下一页签，Home/End 跳转首尾", async () => {
        const onchange = vi.fn();
        const { container } = render(LvTabs, { tabs, active: "manage", onchange });
        const list = container.querySelector("[role=tablist]")!;
        // 注意：组件从 props 读 active（测试中不变），每次按键均从 manage 起算
        await fireEvent.keyDown(list, { key: "ArrowRight" });
        expect(onchange).toHaveBeenLastCalledWith("exam");
        await fireEvent.keyDown(list, { key: "Home" });
        expect(onchange).toHaveBeenLastCalledWith("overview");
        await fireEvent.keyDown(list, { key: "End" });
        expect(onchange).toHaveBeenLastCalledWith("exam");
        await fireEvent.keyDown(list, { key: "ArrowLeft" });
        expect(onchange).toHaveBeenLastCalledWith("overview");
    });

    it("AS-9：非导航键不触发切换", async () => {
        const onchange = vi.fn();
        const { container } = render(LvTabs, { tabs, active: "overview", onchange });
        await fireEvent.keyDown(container.querySelector("[role=tablist]")!, { key: "a" });
        expect(onchange).not.toHaveBeenCalled();
    });
});

describe("LvRow", () => {
    it("渲染 label；hint 缺省不渲染", () => {
        const { container } = render(LvRow, { label: "随机顺序" });
        expect(container.textContent).toContain("随机顺序");
        expect(container.textContent).not.toContain("ft__smaller");
        expect(container.querySelectorAll(".ft__smaller")).toHaveLength(0);
    });

    it("hint 提供时渲染在 label 下方", () => {
        const { container } = render(LvRow, { label: "标签", hint: "提示语" });
        expect(container.textContent).toContain("提示语");
        expect(container.querySelectorAll(".ft__smaller")).toHaveLength(1);
    });
});
