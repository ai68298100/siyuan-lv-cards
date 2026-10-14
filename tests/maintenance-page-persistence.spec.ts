import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import i18n from "../public/i18n/zh-CN.json";
import MaintenancePage from "../src/ui/maintenance-page.svelte";

const cards = [
    { blockID: "card-a", md: "待检查的卡片 A", state: "needsRevision" },
    { blockID: "card-b", md: "待检查的卡片 B", state: "needsRevision" },
];

function renderPage(overrides: Record<string, unknown> = {}) {
    return render(MaintenancePage, {
        i18n,
        maintenance: {
            scan: vi.fn(async () => ({ items: cards })),
            suspendToday: vi.fn(async () => undefined),
            unsuspendToday: vi.fn(async () => undefined),
            isSuspendedToday: () => false,
            openSource: vi.fn(async () => undefined),
            ...overrides,
        },
    });
}

describe("maintenance pause persistence feedback", () => {
    afterEach(cleanup);

    it("shows the partial scan reason while retaining scanned results and a scan retry", async () => {
        const scan = vi.fn(async () => ({ items: cards, error: "权限不足" }));
        renderPage({ scan });

        expect((await screen.findByRole("alert")).textContent).toContain("权限不足");
        expect(screen.getByText("待检查的卡片 A")).toBeTruthy();
        expect(screen.getByText("待检查的卡片 B")).toBeTruthy();
        await fireEvent.click(screen.getByRole("button", { name: i18n.dashboard.refresh }));
        await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    });

    it("shows a retry when opening a source document fails", async () => {
        const openSource = vi.fn()
            .mockRejectedValueOnce(new Error("文档已移除"))
            .mockResolvedValueOnce(undefined);
        renderPage({ openSource });

        const openButtons = await screen.findAllByRole("button", { name: "打开来源" });
        await fireEvent.click(openButtons[0]);
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("打开来源失败");
        expect(alert.textContent).toContain("文档已移除");
        await fireEvent.click(screen.getByRole("button", { name: "重试" }));
        await waitFor(() => expect(openSource).toHaveBeenCalledTimes(2));
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("keeps the prior state after a failed pause and retries the same card", async () => {
        let finishRetry!: () => void;
        const retryWrite = new Promise<void>(resolve => { finishRetry = resolve; });
        const suspendToday = vi.fn().mockRejectedValueOnce(new Error("磁盘不可用")).mockReturnValueOnce(retryWrite);
        renderPage({ suspendToday });

        await fireEvent.click((await screen.findAllByRole("button", { name: "暂缓今日" }))[0]);
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("今日状态未改变");
        expect(alert.textContent).toContain("磁盘不可用");
        expect(screen.getAllByRole("button", { name: "暂缓今日" })).toHaveLength(2);
        expect(screen.queryByText("已暂缓")).toBeNull();
        expect(suspendToday).toHaveBeenCalledWith(["card-a"]);

        await fireEvent.click(screen.getByRole("button", { name: "重试" }));
        const savingButtons = await screen.findAllByRole("button", { name: "保存中…" });
        expect(savingButtons).toHaveLength(1);
        expect((savingButtons[0] as HTMLButtonElement).disabled).toBe(true);
        expect(suspendToday).toHaveBeenCalledTimes(2);
        finishRetry();
        await waitFor(() => expect(screen.getByRole("button", { name: "恢复" })).toBeTruthy());
        expect(suspendToday).toHaveBeenCalledTimes(2);
        expect(screen.getAllByText("已暂缓").length).toBeGreaterThan(0);
    });

    it("does not mark a group as paused while its write is pending or failed", async () => {
        const suspendToday = vi.fn().mockRejectedValueOnce(new Error("写入失败"));
        renderPage({ suspendToday });

        await fireEvent.click(await screen.findByRole("button", { name: "本组暂缓" }));
        expect((await screen.findByRole("alert")).textContent).toContain("写入失败");
        expect(screen.getAllByRole("button", { name: "暂缓今日" })).toHaveLength(2);
        expect(screen.getByRole("button", { name: "本组暂缓" })).toBeTruthy();
        expect(screen.queryByText("已暂缓")).toBeNull();
        expect(suspendToday).toHaveBeenCalledWith(["card-a", "card-b"]);
    });

    it("keeps a paused group visible when resume fails, then removes its markers on retry success", async () => {
        const unsuspendToday = vi.fn().mockRejectedValueOnce(new Error("写入失败")).mockResolvedValueOnce(undefined);
        renderPage({ unsuspendToday, isSuspendedToday: () => true });

        await fireEvent.click(await screen.findByRole("button", { name: "本组恢复" }));
        expect((await screen.findByRole("alert")).textContent).toContain("写入失败");
        expect(screen.getAllByRole("button", { name: "恢复" })).toHaveLength(2);
        expect(screen.getAllByText("已暂缓")).toHaveLength(2);

        await fireEvent.click(screen.getByRole("button", { name: "重试" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "本组暂缓" })).toBeTruthy());
        expect(screen.queryByText("已暂缓")).toBeNull();
        expect(unsuspendToday).toHaveBeenCalledTimes(2);
        expect(unsuspendToday).toHaveBeenLastCalledWith(["card-a", "card-b"]);
    });
});
