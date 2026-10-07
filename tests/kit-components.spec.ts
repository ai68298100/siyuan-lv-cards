import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import LvStat from "../src/ui/kit/LvStat.svelte";
import LvSteps from "../src/ui/kit/LvSteps.svelte";
import LvCalendar from "../src/ui/kit/LvCalendar.svelte";
import LvChipHost from "./helpers/LvChipHost.svelte";

// Kit 组件 smoke 测试（组件测试基建首批，v0.86.0）：渲染契约 + 关键交互/语义
// 注意：不用 screen 全局查询（未卸载的渲染会互相污染），一律以 container 作用域查询

describe("LvStat", () => {
    it("渲染 label 与 value；denom 缺省不显示分母", () => {
        const { container } = render(LvStat, { label: "今日到期", value: 7 });
        expect(container.textContent).toContain("今日到期");
        expect(container.textContent).toContain("7");
        expect(container.querySelector(".lv-stat-denom")).toBeNull();
    });

    it("progress >= 0 时渲染进度条，<0 不渲染", () => {
        const { container } = render(LvStat, { label: "今日已复习", value: 5, denom: "200", progress: 50 });
        expect(container.querySelector(".lv-stat-progress")).toBeTruthy();
        const r2 = render(LvStat, { label: "X", value: 1, progress: -1 });
        expect(r2.container.querySelector(".lv-stat-progress")).toBeNull();
    });
});

describe("LvSteps", () => {
    it("渲染全部步骤，当前步带 aria-current=step", () => {
        const { container } = render(LvSteps, { steps: ["配置", "预览"], current: 1 });
        const btns = [...container.querySelectorAll("button")];
        expect(btns).toHaveLength(2);
        expect(btns[0].getAttribute("aria-current")).toBeNull();
        expect(btns[1].getAttribute("aria-current")).toBe("step");
        expect(btns[0].textContent).toContain("配置");
    });

    it("onclick 缺省时按钮禁用；点击可用步骤触发回跳", async () => {
        let jumped = -1;
        const { container } = render(LvSteps, {
            steps: ["a", "b"],
            current: 1,
            onclick: (i: number) => { jumped = i; },
        });
        const btns = [...container.querySelectorAll("button")];
        await fireEvent.click(btns[0]);
        expect(jumped).toBe(0);
        const disabled = render(LvSteps, { steps: ["a", "b"], current: 0 });
        for (const b of disabled.container.querySelectorAll("button")) {
            expect(b.disabled).toBe(true);
        }
    });
});

describe("LvCalendar", () => {
    it("只读月历不伪装成可交互 grid", () => {
        const { container } = render(LvCalendar, {
            monthLabel: "2026 年 10 月",
            cells: [{ date: null, day: 0, tone: "empty" }],
            forecast: [],
        });
        const grid = container.querySelector(".lv-cal-grid");
        expect(grid?.getAttribute("aria-label")).toBe("2026 年 10 月");
        expect(grid?.getAttribute("role")).toBeNull();
    });
});

// snippet 传子的组件经测试宿主（tests/helpers/*Host.svelte，以 .svelte 内 {#snippet} 定义子内容）
// 挂载测试——绕开 createRawSnippet 的模块解析错位（v0.103 解决此前"暂不纳入"的限制）。
describe("LvChip（经测试宿主）", () => {
    it("渲染 children 与 tone 语义色", () => {
        const { container } = render(LvChipHost, { tone: "error", label: "考前" });
        expect(container.textContent).toContain("考前");
        expect(container.querySelector(".lv-chip2--error")).toBeTruthy();
    });
});

