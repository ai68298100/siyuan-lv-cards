import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/svelte";
import LvStat from "../src/ui/kit/LvStat.svelte";

describe("stat animation lifecycle", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("cancels old number animation when refresh switches to an unknown count", async () => {
        const frames = new Map<number, FrameRequestCallback>();
        let sequence = 0;
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            frames.set(++sequence, callback);
            return sequence;
        });
        vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
        const view = render(LvStat, { label: "到期", value: 100, animate: true });
        expect(frames.size).toBe(1);
        await view.rerender({ value: "—" });
        expect(frames.size).toBe(0);
        expect(view.container.querySelector(".lv-hero-num")?.textContent).toBe("—");
        await view.rerender({ value: 20 });
        expect(frames.size).toBe(1);
        view.unmount();
        expect(frames.size).toBe(0);
    });

    it("renders denominator and streak badge when provided", () => {
        const view = render(LvStat, {
            label: "连续天数",
            value: 7,
            denom: "30",
            badge: "🔥",
            tone: "warn",
        });

        expect(view.container.querySelector(".lv-stat-denom")?.textContent).toBe("/ 30");
        const badgeEl = view.container.querySelector(".lv-stat-badge");
        expect(badgeEl?.textContent).toBe("🔥");
        expect(badgeEl?.getAttribute("aria-label")).toBe("🔥");
        view.unmount();
    });
});
