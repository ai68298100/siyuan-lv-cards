import { describe, expect, it } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import LvSection from "../src/ui/kit/LvSection.svelte";
import LvPage from "../src/ui/kit/LvPage.svelte";
import LvDrawer from "../src/ui/kit/LvDrawer.svelte";

// Kit 组件 smoke 测试（组件测试基建第五批，v0.90.0）：
// 布局壳组件的「纯 props 头部契约」——children/actions snippet 内容不在覆盖范围（基建限制见 kit-components.spec.ts 注）

describe("LvSection", () => {
    it("渲染 title；sub 提供时以 · 前缀附于其后", () => {
        const { container } = render(LvSection, { title: "保持曲线", sub: "实测" });
        expect(container.textContent).toContain("保持曲线");
        expect(container.textContent).toContain("· 实测");
    });

    it("title 缺省时不渲染区块头", () => {
        const { container } = render(LvSection, {});
        expect(container.querySelector(".lv-secthead")).toBeNull();
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
