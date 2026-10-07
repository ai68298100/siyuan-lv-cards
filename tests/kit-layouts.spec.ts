import { describe, expect, it, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import LvPage from "../src/ui/kit/LvPage.svelte";
import LvDrawer from "../src/ui/kit/LvDrawer.svelte";
import LvSectionHost from "./helpers/LvSectionHost.svelte";
import LvPageHost from "./helpers/LvPageHost.svelte";
import LvDrawerHost from "./helpers/LvDrawerHost.svelte";

// Kit 组件 smoke 测试（组件测试基建第五批，v0.90.0 + 第五批补充，v0.103.0）：
// 布局壳组件的头部契约 + snippet 传子组件（经测试宿主 tests/helpers/*Host.svelte）

describe("LvSection（经测试宿主：children+actions snippet）", () => {
    it("渲染 title/sub/children/actions 四要素", () => {
        const { container } = render(LvSectionHost, { title: "保持曲线", sub: "实测" });
        expect(container.textContent).toContain("保持曲线");
        expect(container.textContent).toContain("· 实测");
        expect(container.textContent).toContain("子内容");
        expect(container.querySelector("[data-testid=section-action]")?.textContent).toContain("导出");
    });
});

describe("LvPage", () => {
    it("渲染 title 与 subtitle；dot 提供时渲染状态点", () => {
        const { container } = render(LvPage, { title: "闪卡中心", subtitle: "自 2026-10-01", dot: true });
        expect(container.textContent).toContain("闪卡中心");
        expect(container.querySelector(".lv-dot")).toBeTruthy();
    });

    it("title 缺省时不渲染页头", () => {
        const { container } = render(LvPage, {});
        expect(container.querySelector(".lv-pagehead")).toBeNull();
    });
});

describe("LvDrawer", () => {
    it("open=true 渲染遮罩与 title", () => {
        const { container } = render(LvDrawer, { open: true, title: "卡片详情", onclose: () => {} });
        expect(container.textContent).toContain("卡片详情");
    });

    it("open=false 不渲染遮罩", () => {
        const { container } = render(LvDrawer, { open: false, title: "x", onclose: () => {} });
        expect(container.querySelector(".lv-drawer-mask, [class*=mask]")).toBeNull();
    });

    // Esc→onclose 经 svelte:window 监听，happy-dom 下 window 级事件模拟不可靠——归 docs/34 V 项真机验收
});

describe("LvPage（经测试宿主：children snippet）", () => {
    it("渲染 title/subtitle/dot 与 children 内容", () => {
        const { container } = render(LvPageHost, { title: "闪卡中心", subtitle: "自 2026-10-01", dot: true });
        expect(container.textContent).toContain("闪卡中心");
        expect(container.textContent).toContain("自 2026-10-01");
        expect(container.querySelector(".lv-dot")).toBeTruthy();
        expect(container.querySelector("[data-testid=page-children]")?.textContent).toContain("页内容");
    });
});

describe("LvDrawer（经测试宿主：children snippet）", () => {
    it("open=true 渲染 title 与 children 内容", () => {
        const { container } = render(LvDrawerHost, { open: true, title: "卡片详情" });
        expect(container.textContent).toContain("卡片详情");
        expect(container.querySelector("[data-testid=drawer-children]")?.textContent).toContain("抽屉内容");
    });

    it("open=false 不渲染遮罩", () => {
        const { container } = render(LvDrawerHost, { open: false, title: "x" });
        expect(container.querySelector(".lv-drawer-mask, [class*=mask]")).toBeNull();
    });

    it("声明模态语义并把焦点限制在抽屉内", async () => {
        const outside = document.createElement("button");
        outside.textContent = "页面按钮";
        document.body.append(outside);
        outside.focus();

        const { container } = render(LvDrawerHost, { open: true, title: "卡片详情" });
        await Promise.resolve();

        const drawer = container.querySelector<HTMLElement>("[role=dialog]");
        expect(drawer?.getAttribute("aria-modal")).toBe("true");
        expect(drawer?.getAttribute("aria-labelledby")).toBe("lv-drawer-title");
        expect(drawer?.getAttribute("tabindex")).toBe("-1");
        expect(document.activeElement).toBe(container.querySelector("button[aria-label=close]"));

        await fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab" });
        expect(document.activeElement).toBe(container.querySelector("[data-testid=drawer-content-action]"));
        await fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(container.querySelector("button[aria-label=close]"));

        await fireEvent.click(container.querySelector("button[aria-label=close]") as HTMLElement);
        // Svelte outro 会保留 DOM 直到 fade 完成；等待实际卸载，避免并行测试下固定 sleep 抖动。
        await waitFor(() => expect(container.querySelector("[role=dialog]")).toBeNull(), { timeout: 1000 });
        expect(document.activeElement).toBe(outside);
        outside.remove();
    });

    it("支持宿主传入关闭按钮标签", () => {
        const { container } = render(LvDrawer, { open: true, title: "详情", closeLabel: "关闭", onclose: () => {} });
        expect(container.querySelector("button[aria-label=关闭]")).toBeTruthy();
    });
});
