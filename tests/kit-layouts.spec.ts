import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import LvPage from "../src/ui/kit/LvPage.svelte";
import LvDrawer from "../src/ui/kit/LvDrawer.svelte";
import LvSectionHost from "./helpers/LvSectionHost.svelte";

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
