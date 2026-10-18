import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import LearningPage from "../src/ui/learning-page.svelte";
import i18n from "../public/i18n/zh-CN.json";
import { emptyRevlog } from "../src/core/revlog";

const riff = vi.hoisted(() => ({ getRiffCards: vi.fn() }));
vi.mock("../src/api/riff", () => ({ getRiffCards: riff.getRiffCards }));

describe("learning page R54 facets", () => {
    beforeEach(() => riff.getRiffCards.mockReset().mockResolvedValue({ blocks: [], pageCount: 1 }));
    afterEach(cleanup);

    function renderPage() {
        const revlog = emptyRevlog();
        revlog.days["2026-10-01"] = { new: 1, review: 2, forget: 0 };
        return render(LearningPage, {
            i18n,
            goals: {
                get: () => ({ version: 1, goals: [] }),
                save: vi.fn(),
                remove: vi.fn(),
            },
            getRevlog: () => revlog,
            getDailyTargets: () => ({ new: 5, review: 10 }),
        });
    }

    it("exposes recap, plans, and calendar tabs", async () => {
        const { container } = renderPage();
        const tabs = screen.getAllByRole("tab");
        expect(tabs.map(t => t.textContent?.trim())).toEqual(["学习回顾", "目标与计划", "学习日历"]);
        expect(container.textContent).toContain(i18n.learningPage.formalReviews);

        await fireEvent.click(tabs[1]);
        expect(await screen.findByText(i18n.goals.none)).toBeTruthy();

        await fireEvent.click(tabs[2]);
        await waitFor(() => expect(container.querySelector(".lv-cal-grid")).toBeTruthy());
        expect(container.querySelectorAll("button.lv-cal-day").length).toBeGreaterThan(0);
    });

    it("reports facet changes through the optional route callback", async () => {
        const onTabChange = vi.fn();
        render(LearningPage, { i18n, goals: { get: () => ({ version: 1, goals: [] }), save: vi.fn(), remove: vi.fn() }, getRevlog: emptyRevlog, onTabChange });
        await fireEvent.click(screen.getAllByRole("tab")[2]);
        expect(onTabChange).toHaveBeenCalledWith("calendar");
    });

    it("keeps formal review counts separate from new cards and filters review history", () => {
        const revlog = emptyRevlog();
        const now = Date.now();
        revlog.entries = [
            { ts: now, cardID: "reviewed", deckID: "d", blockID: "b1", rating: 3, source: "plugin" },
            { ts: now - 86400000, cardID: "skipped", deckID: "d", blockID: "b2", rating: 0, source: "plugin" },
        ];
        revlog.days[localDateForTest(now)] = { new: 0, review: 1, forget: 0 };
        const { container } = render(LearningPage, { i18n, goals: { get: () => ({ version: 1, goals: [] }), save: vi.fn(), remove: vi.fn() }, getRevlog: () => revlog });
        expect(container.textContent).toContain("1");
        expect(container.textContent).toContain("最近正式评分记录");
        expect(container.textContent).not.toContain("跳过");
    });

    it("filters the calendar day details by the selected local date", async () => {
        const now = Date.now();
        const revlog = emptyRevlog();
        revlog.entries = [
            { ts: now, cardID: "today", deckID: "d", blockID: "b1", rating: 3, source: "plugin" },
            { ts: now - 86400000, cardID: "yesterday", deckID: "d", blockID: "b2", rating: 2, source: "plugin" },
        ];
        const view = render(LearningPage, { i18n, initialTab: "calendar", goals: { get: () => ({ version: 1, goals: [] }), save: vi.fn(), remove: vi.fn() }, getRevlog: () => revlog });
        const todayButton = await screen.findByRole("button", { name: new RegExp(`^${localDateForTest(now)}`) });
        await fireEvent.click(todayButton);
        const day = view.container.querySelector(".lv-learning-day");
        expect(day?.textContent).toContain(i18n.learningPage.good);
        expect(day?.textContent).not.toContain(i18n.learningPage.hard);
    });

    it("labels a selected day's count as formal reviews rather than a seven-day total", async () => {
        const today = localDateForTest(Date.now());
        const revlog = emptyRevlog();
        revlog.days[today] = { new: 0, review: 3, forget: 0 };
        const { container } = render(LearningPage, {
            i18n, initialTab: "calendar",
            goals: { get: () => ({ version: 1, goals: [] }), save: vi.fn(), remove: vi.fn() },
            getRevlog: () => revlog,
        });
        await waitFor(() => expect(container.querySelector(".lv-cal .tiny")?.textContent).toContain(`${i18n.learningPage.formalReviews} 3`));
        expect(screen.getByRole("button", { name: new RegExp(`^${today} · ${i18n.learningPage.formalReviews} 3`) })).toBeTruthy();
        expect(container.querySelector(".lv-cal .tiny")?.textContent).not.toContain(i18n.learningPage.reviewCount);
    });

    it("marks forecasts partial when the host reports more than the page limit", async () => {
        riff.getRiffCards.mockImplementation(async () => ({ blocks: [], pageCount: 25 }));
        const { container } = renderPage();
        await fireEvent.click(screen.getAllByRole("tab")[2]);
        await waitFor(() => expect(riff.getRiffCards).toHaveBeenCalledTimes(20));
        expect(container.textContent).toContain(i18n.learningPage.partialPages.replace("${n}", "20").replace("${max}", "20"));
        expect(container.textContent).toContain(i18n.learningPage.calendarSub);
    });

    it("shows a localized error and keeps date details unknown when forecast loading fails", async () => {
        riff.getRiffCards.mockRejectedValueOnce(new Error("host offline"));
        const { container } = renderPage();
        await fireEvent.click(screen.getAllByRole("tab")[2]);
        await waitFor(() => expect(container.querySelector('[role="alert"]')).toBeTruthy());
        expect(container.textContent).toContain("host offline");
        expect(container.textContent).toContain(i18n.learningPage.forecastUnknown);
        expect(container.textContent).toContain(i18n.learningPage.retry);
    });

    it("unsubscribes store events and stops pagination after unmount", async () => {
        let resolve!: (value: { blocks: object[]; pageCount: number }) => void;
        let reviewed!: () => void;
        let storesChanged!: () => void;
        const unsubscribeReviewed = vi.fn();
        const unsubscribeStores = vi.fn();
        const getRevlog = vi.fn(emptyRevlog);
        riff.getRiffCards.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
        const view = render(LearningPage, {
            i18n, initialTab: "calendar",
            goals: { get: () => ({ version: 1, goals: [] }), save: vi.fn(), remove: vi.fn() },
            getRevlog,
            onReviewed: (cb) => { reviewed = cb; return unsubscribeReviewed; },
            onStoresChanged: (cb) => { storesChanged = cb; return unsubscribeStores; },
        });
        await waitFor(() => expect(riff.getRiffCards).toHaveBeenCalledTimes(1));
        view.unmount();
        expect(unsubscribeReviewed).toHaveBeenCalledOnce();
        expect(unsubscribeStores).toHaveBeenCalledOnce();
        const readsBeforeEvents = getRevlog.mock.calls.length;
        reviewed();
        storesChanged();
        resolve({ blocks: Array.from({ length: 100 }, () => ({})), pageCount: 2 });
        await new Promise(r => setTimeout(r, 0));
        expect(getRevlog).toHaveBeenCalledTimes(readsBeforeEvents);
        expect(riff.getRiffCards).toHaveBeenCalledTimes(1);
    });

    it.each(["onReviewed", "onStoresChanged"] as const)("queues a fresh calendar load when %s arrives mid-request", async (eventName) => {
        let resolve!: (value: { blocks: never[]; pageCount: number }) => void;
        const onReviewed = vi.fn((cb: () => void) => { (onReviewed as any).callback = cb; return () => undefined; });
        riff.getRiffCards
            .mockImplementationOnce(() => new Promise(r => { resolve = r; }))
            .mockResolvedValueOnce({ blocks: [], pageCount: 1 });
        render(LearningPage, { i18n, goals: { get: () => ({ version: 1, goals: [] }), save: vi.fn(), remove: vi.fn() }, getRevlog: emptyRevlog, [eventName]: onReviewed });
        await fireEvent.click(screen.getAllByRole("tab")[2]);
        (onReviewed as any).callback();
        resolve({ blocks: [], pageCount: 1 });
        await waitFor(() => expect(riff.getRiffCards).toHaveBeenCalledTimes(2));
    });

    it.each(["onReviewed", "onStoresChanged"] as const)("invalidates a cached forecast on %s from another facet and reloads only on return", async (eventName) => {
        let reviewed!: () => void;
        const today = localDateForTest(Date.now());
        riff.getRiffCards
            .mockResolvedValueOnce({ blocks: [{ riffCard: { due: `${today}T12:00:00`, state: 2 } }], pageCount: 1 })
            .mockResolvedValueOnce({ blocks: [], pageCount: 1 });
        const { container } = render(LearningPage, {
            i18n, initialTab: "calendar",
            goals: { get: () => ({ version: 1, goals: [] }), save: vi.fn(), remove: vi.fn() },
            getRevlog: emptyRevlog,
            [eventName]: (cb: () => void) => { reviewed = cb; },
        });
        const caption = () => container.querySelector(".lv-cal .tiny")?.textContent;
        await waitFor(() => expect(caption()).toContain(`${i18n.learningPage.forecastDue} 1`));
        await fireEvent.click(screen.getAllByRole("tab")[0]);
        reviewed();
        await Promise.resolve();
        expect(riff.getRiffCards).toHaveBeenCalledTimes(1);
        await fireEvent.click(screen.getAllByRole("tab")[2]);
        await waitFor(() => expect(caption()).toContain(`${i18n.learningPage.forecastDue} 0`));
        expect(riff.getRiffCards).toHaveBeenCalledTimes(2);
    });

    it.each(["onReviewed", "onStoresChanged"] as const)("discards an in-flight forecast invalidated by %s while hidden without leaving loading stuck", async (eventName) => {
        let reviewed!: () => void;
        let resolve!: (value: { blocks: { riffCard: { due: string; state: number } }[]; pageCount: number }) => void;
        const today = localDateForTest(Date.now());
        riff.getRiffCards
            .mockImplementationOnce(() => new Promise(r => { resolve = r; }))
            .mockResolvedValueOnce({ blocks: [], pageCount: 1 });
        const { container } = render(LearningPage, {
            i18n, initialTab: "calendar",
            goals: { get: () => ({ version: 1, goals: [] }), save: vi.fn(), remove: vi.fn() },
            getRevlog: emptyRevlog,
            [eventName]: (cb: () => void) => { reviewed = cb; },
        });
        await waitFor(() => expect(riff.getRiffCards).toHaveBeenCalledTimes(1));
        await fireEvent.click(screen.getAllByRole("tab")[0]);
        reviewed();
        resolve({ blocks: [{ riffCard: { due: `${today}T12:00:00`, state: 2 } }], pageCount: 1 });
        // Let the stale request settle before re-entering the calendar.
        await new Promise(r => setTimeout(r, 0));
        expect(riff.getRiffCards).toHaveBeenCalledTimes(1);
        await fireEvent.click(screen.getAllByRole("tab")[2]);
        await waitFor(() => expect(container.querySelector(".lv-cal .tiny")?.textContent).toContain(`${i18n.learningPage.forecastDue} 0`));
        expect(riff.getRiffCards).toHaveBeenCalledTimes(2);
        expect(container.textContent).not.toContain(i18n.learningPage.calendarLoading);
    });

    it("replaces the displayed review log when another frontend synchronizes stores", async () => {
        let storesChanged!: () => void;
        let revlog = emptyRevlog();
        const { container } = render(LearningPage, {
            i18n, goals: { get: () => ({ version: 1, goals: [] }), save: vi.fn(), remove: vi.fn() },
            getRevlog: () => revlog,
            onStoresChanged: (cb) => { storesChanged = cb; },
        });
        expect(container.textContent).toContain(i18n.learningPage.recentEmpty);
        const replacement = emptyRevlog();
        replacement.entries = [{ ts: Date.now(), cardID: "synced", deckID: "d", blockID: "source", rating: 3, source: "plugin" }];
        revlog = replacement;
        storesChanged();
        await waitFor(() => expect(container.querySelector(".lv-learning-records")?.textContent).toContain(i18n.learningPage.good));
        expect(container.textContent).not.toContain(i18n.learningPage.recentEmpty);
        expect(riff.getRiffCards).not.toHaveBeenCalled();
    });
});

function localDateForTest(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

