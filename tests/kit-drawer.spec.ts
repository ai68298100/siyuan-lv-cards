import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import LvDrawer from "../src/ui/kit/LvDrawer.svelte";

describe("LvDrawer accessibility", () => {
    afterEach(() => cleanup());

    it("gives each open drawer a unique title id and matching dialog label", () => {
        const first = render(LvDrawer, { open: true, title: "卡片详情", onclose: vi.fn() });
        const second = render(LvDrawer, { open: true, title: "设置", onclose: vi.fn() });
        const dialogs = [...document.querySelectorAll<HTMLElement>("[role=dialog]")];

        expect(dialogs).toHaveLength(2);
        const labelledBy = dialogs.map(dialog => dialog.getAttribute("aria-labelledby"));
        expect(labelledBy[0]).toBeTruthy();
        expect(labelledBy[1]).toBeTruthy();
        expect(labelledBy[0]).not.toBe(labelledBy[1]);
        for (const id of labelledBy) {
            expect(document.getElementById(id!)?.classList.contains("lv-drawer-title")).toBe(true);
        }
        expect(first.container.textContent).toContain("卡片详情");
        expect(second.container.textContent).toContain("设置");
    });
});
