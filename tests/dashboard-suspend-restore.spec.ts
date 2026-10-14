import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import i18n from "../public/i18n/zh-CN.json";
import { emptyRevlog } from "../src/core/revlog";
import { localDate } from "../src/core/revlog";
import Dashboard from "../src/ui/dashboard.svelte";

const mocks = vi.hoisted(() => ({
    getRiffDecks: vi.fn(), getRiffCards: vi.fn(), getRiffDueCards: vi.fn(), dueGet: vi.fn(),
    getFlashcardStatistics: vi.fn(), summarizeStatistics: vi.fn(),
}));

vi.mock("../src/api/riff", () => ({
    getRiffDecks: mocks.getRiffDecks,
    getRiffCards: mocks.getRiffCards,
    getRiffDueCards: mocks.getRiffDueCards,
}));
vi.mock("../src/api/due-shared", () => ({ dueCache: { get: mocks.dueGet } }));
vi.mock("../src/api/flashcardV2", () => ({
    getFlashcardStatistics: mocks.getFlashcardStatistics,
    summarizeStatistics: mocks.summarizeStatistics,
}));

const ctx = (restoreSuspendedToday: () => Promise<number>, getRevlog = emptyRevlog) => ({
    i18n,
    app: {},
    getRevlog,
    getV2Status: () => null,
    getDailyTargets: () => ({ new: 0, review: 0 }),
    openReview: vi.fn(), openManager: vi.fn(), openOnboarding: vi.fn(), openQuickCard: vi.fn(),
    getAIBatches: () => [], getLeechCards: () => [], rewriteWithAI: vi.fn(),
    writeReportDoc: vi.fn(async () => undefined), getExamCountdown: () => null,
    getXpEnabled: () => false, getHeatmapWeeks: () => 4,
    getSuspendedCount: () => 2, restoreSuspendedToday,
});

describe("dashboard restore suspended action", () => {
    afterEach(cleanup);

    it("preserves the count on write failure and retries with a locked pending state", async () => {
        let finishRetry!: (count: number) => void;
        const retryWrite = new Promise<number>(resolve => { finishRetry = resolve; });
        const restoreSuspendedToday = vi.fn().mockRejectedValueOnce(new Error("磁盘不可用")).mockReturnValueOnce(retryWrite);
        mocks.getRiffDecks.mockResolvedValue([{ id: "deck-a", name: "卡组", size: 2 }]);
        mocks.dueGet.mockResolvedValue({ cards: [], unreviewedCount: 0, unreviewedNewCardCount: 0, unreviewedOldCardCount: 0 });

        render(Dashboard, { ctx: ctx(restoreSuspendedToday) });
        const restoreButton = await screen.findByRole("button", { name: "全部恢复" });
        await fireEvent.click(restoreButton);

        expect((await screen.findByRole("alert")).textContent).toContain("磁盘不可用");
        expect(screen.getByText("今日暂停 2 张，可恢复")).toBeTruthy();
        expect(screen.getByRole("button", { name: "全部恢复" })).toBeTruthy();

        await fireEvent.click(screen.getByRole("button", { name: "重试" }));
        const pendingButton = await screen.findByRole("button", { name: "恢复中…" }) as HTMLButtonElement;
        expect(pendingButton.disabled).toBe(true);
        await fireEvent.click(pendingButton);
        expect(restoreSuspendedToday).toHaveBeenCalledTimes(2);

        finishRetry(0);
        await waitFor(() => expect(screen.getByText("暂无待处理事项")).toBeTruthy());
        expect(restoreSuspendedToday).toHaveBeenCalledTimes(2);
    });

    it("renders a real seven-day week from local review records without treating future days as empty history", async () => {
        const revlog = emptyRevlog();
        revlog.days[localDate(Date.now() - 24 * 60 * 60 * 1000)] = { new: 0, review: 3, forget: 0 };
        mocks.getRiffDecks.mockResolvedValue([{ id: "deck-a", name: "卡组", size: 2 }]);
        mocks.dueGet.mockResolvedValue({ cards: [], unreviewedCount: 0, unreviewedNewCardCount: 0, unreviewedOldCardCount: 0 });

        render(Dashboard, { ctx: ctx(vi.fn(), () => revlog) });

        expect(await screen.findByRole("list", { name: "本周每日学习记录" })).toBeTruthy();
        expect(screen.getAllByRole("listitem")).toHaveLength(7);
        expect(screen.getByText("1 天有学习记录")).toBeTruthy();
        expect(screen.getByText("3", { selector: "strong" })).toBeTruthy();
        expect(screen.getAllByRole("listitem").some(day => day.getAttribute("aria-label")?.includes("尚未到来"))).toBe(true);
    });

    it("announces new-card-only activity in the weekly view", async () => {
        const revlog = emptyRevlog();
        revlog.days[localDate(Date.now() - 24 * 60 * 60 * 1000)] = { new: 2, review: 0, forget: 0 };
        mocks.getRiffDecks.mockResolvedValue([{ id: "deck-a", name: "卡组", size: 2 }]);
        mocks.dueGet.mockResolvedValue({ cards: [], unreviewedCount: 0, unreviewedNewCardCount: 0, unreviewedOldCardCount: 0 });

        render(Dashboard, { ctx: ctx(vi.fn(), () => revlog) });

        const previousDay = (await screen.findByRole("list", { name: "本周每日学习记录" })).querySelectorAll("[role=listitem]");
        expect(Array.from(previousDay).some(day => day.getAttribute("aria-label")?.includes("正式复习 0 次 · 新卡 2 张"))).toBe(true);
    });
});
