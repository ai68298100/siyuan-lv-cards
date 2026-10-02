import { describe, expect, it } from "vitest";
import { render } from "@testing-library/svelte";
import LvHeatmap from "../src/ui/kit/LvHeatmap.svelte";
import LvSkeleton from "../src/ui/kit/LvSkeleton.svelte";

// Kit 组件 smoke 测试（组件测试基建收官，v0.105.0）：LvHeatmap/LvSkeleton——19 组件全覆盖

describe("LvHeatmap", () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
        date: `2026-10-0${i + 1}`,
        stat: { new: i, review: i * 3, forget: 0 },
    }));

    it("渲染与天数等量的热力格", () => {
        const { container } = render(LvHeatmap, { days });
        expect(container.querySelectorAll(".lv-cell")).toHaveLength(7);
    });

    it("末格标记今日（lv-cell-today）", () => {
        const { container } = render(LvHeatmap, { days });
        const cells = [...container.querySelectorAll(".lv-cell")];
        expect(cells[cells.length - 1].classList.contains("lv-cell-today")).toBe(true);
        expect(cells[0].classList.contains("lv-cell-today")).toBe(false);
    });

    it("title 含日期与复习次数", () => {
        const { container } = render(LvHeatmap, { days });
        const cell = container.querySelector(".lv-cell") as HTMLElement;
        expect(cell.title).toContain("2026");
    });

    it("空 days 不崩溃", () => {
        const { container } = render(LvHeatmap, { days: [] });
        expect(container.querySelectorAll(".lv-cell")).toHaveLength(0);
    });
});

describe("LvSkeleton", () => {
    it("渲染 count 个骨架行", () => {
        const { container } = render(LvSkeleton, { shape: "row", count: 3, height: 40, gap: 8 });
        expect(container.querySelectorAll(".lv-skeleton")).toHaveLength(3);
    });

    it("block 形态加圆角样式", () => {
        const { container } = render(LvSkeleton, { shape: "block", count: 1 });
        const el = container.querySelector(".lv-skeleton") as HTMLElement;
        expect(el.style.borderRadius).toContain("var(--lv-r-m)");
    });

    it("count=0 不渲染骨架", () => {
        const { container } = render(LvSkeleton, { shape: "row", count: 0 });
        expect(container.querySelectorAll(".lv-skeleton")).toHaveLength(0);
    });
});
