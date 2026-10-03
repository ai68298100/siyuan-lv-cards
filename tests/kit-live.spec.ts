import { describe, expect, it } from "vitest";
import { render } from "@testing-library/svelte";
import LvLive from "../src/ui/kit/LvLive.svelte";

// AS-4 LvLive 读屏播报组件：aria-live 语义 + 视觉隐藏
describe("LvLive（AS-4 读屏播报）", () => {
    it("polite：role=status + aria-live=polite", () => {
        const { container } = render(LvLive, { message: "已提交评分", tone: "polite" });
        const el = container.querySelector("[aria-live]");
        expect(el?.getAttribute("aria-live")).toBe("polite");
        expect(el?.getAttribute("role")).toBe("status");
        expect(el?.textContent).toContain("已提交评分");
    });

    it("assertive：role=alert", () => {
        const { container } = render(LvLive, { message: "错误", tone: "assertive" });
        const el = container.querySelector("[aria-live]");
        expect(el?.getAttribute("role")).toBe("alert");
    });

    it("默认 tone=polite", () => {
        const { container } = render(LvLive, { message: "test" });
        expect(container.querySelector("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
    });

    it("视觉隐藏：clip-pattern（宽高 1px + overflow hidden）", () => {
        const { container } = render(LvLive, { message: "test" });
        const el = container.querySelector(".lv-visually-hidden");
        expect(el).toBeTruthy();
    });
});
