import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import Hub from "../src/ui/hub.svelte";
import i18n from "../public/i18n/zh-CN.json";
import { emptyRevlog } from "../src/core/revlog";

const mocks = vi.hoisted(() => ({ getRiffCards: vi.fn(), getRiffCardsByBlockIDs: vi.fn(), getBlockDOM: vi.fn() }));
vi.mock("../src/api/riff", () => ({
    getRiffCards: mocks.getRiffCards, getRiffCardsByBlockIDs: mocks.getRiffCardsByBlockIDs,
    getRiffDecks: vi.fn(), getRiffDueCards: vi.fn(), removeRiffCards: vi.fn(), resetRiffCards: vi.fn(),
}));
vi.mock("../src/api/siyuan", () => ({ getBlockDOM: mocks.getBlockDOM }));
vi.mock("../src/api/due-shared", () => ({ dueCache: { get: vi.fn() }, invalidateDueCache: vi.fn() }));
vi.mock("../src/api/flashcardV2", () => ({ getFlashcardStatistics: vi.fn(), summarizeStatistics: vi.fn() }));
vi.mock("../src/libs/dialog", () => ({ confirmDialog: vi.fn() }));

function context() {
    const scan = vi.fn(async () => ({ items: [{ blockID: "card-a", md: "==只有答案==" }] }));
    const saveBlockContent = vi.fn(async () => true);
    const props = {
        i18n,
        initialTab: "maintenance",
        dashboardBase: {
            i18n, app: {}, getRevlog: emptyRevlog, getV2Status: () => null,
            getDailyTargets: () => ({ new: 0, review: 0 }), openReview: vi.fn(), openOnboarding: vi.fn(),
            getAIBatches: () => [], getLeechCards: () => [], rewriteWithAI: vi.fn(),
            writeReportDoc: vi.fn(), getExamCountdown: () => null, getXpEnabled: () => false, getHeatmapWeeks: () => 4,
        },
        managerCtx: {
            i18n, app: {}, savedFilters: () => [], saveFilter: vi.fn(), deleteFilter: vi.fn(),
            getLeechCards: () => [], isNewBlock: () => false, getLapsesMap: () => ({}), getDueBlockIDs: async () => [],
            blockContent: async (id: string) => `原文 ${id}`, saveBlockContent,
        },
        exam: null, inbox: null,
        goals: { get: () => ({ version: 1, goals: [] }), save: vi.fn(), remove: vi.fn() },
        maintenance: {
            scan, previewRepair: vi.fn(), applyRepair: vi.fn(), suspendToday: vi.fn(), unsuspendToday: vi.fn(),
            isSuspendedToday: () => false, openSource: vi.fn(), openCard: vi.fn(),
        },
        recovery: { load: vi.fn(async () => ({ aiJobs: [], inboxCount: 0, suspendedCount: 1, session: null })) },
    };
    return { props: props as any, scan, saveBlockContent };
}

describe("hub navigation boundaries", () => {
    beforeEach(() => {
        mocks.getRiffCards.mockReset().mockResolvedValue({ blocks: [{ id: "card-b", content: "另一张卡面 B" }], total: 1, pageCount: 1 });
        mocks.getRiffCardsByBlockIDs.mockReset().mockResolvedValue({ blocks: [{ id: "card-a", content: "需要修复的卡面 A" }] });
        mocks.getBlockDOM.mockReset().mockResolvedValue("");
    });
    afterEach(cleanup);

    it("opens maintenance from the recovery center in simple mode", async () => {
        const host = context();
        render(Hub, { ...host.props, initialTab: "recovery", uiMode: "simple" });
        await fireEvent.click(await screen.findByRole("button", { name: i18n.recoveryCenter.openMaintenance }));
        await waitFor(() => expect(host.scan).toHaveBeenCalledOnce(), { timeout: 3000 });
        expect(await screen.findByRole("button", { name: i18n.maintenance.editCard })).toBeTruthy();
    });

    it("returns to maintenance only after saving the card opened from that page", async () => {
        const host = context();
        render(Hub, host.props);
        await fireEvent.click(await screen.findByRole("button", { name: i18n.maintenance.editCard }));
        await screen.findByRole("dialog");
        await fireEvent.click(screen.getByRole("button", { name: i18n.manager.close, exact: true }));
        await fireEvent.click(await screen.findByRole("button", { name: /另一张卡面 B/ }));
        await fireEvent.click(screen.getByRole("button", { name: i18n.editor.edit, exact: true }));
        const editor = await screen.findByRole("textbox", { name: i18n.editor.inputLabel });
        await fireEvent.input(editor, { target: { value: "另一张新题面 ==答案==" } });
        await new Promise(resolve => setTimeout(resolve, 220));
        await fireEvent.click(screen.getByRole("button", { name: i18n.editor.save, exact: true }));
        await waitFor(() => expect(host.saveBlockContent).toHaveBeenCalledWith("card-b", "另一张新题面 ==答案=="));
        await waitFor(() => expect(screen.queryByRole("textbox", { name: i18n.editor.inputLabel })).toBeNull());
        expect(host.scan).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("dialog")).toBeTruthy();
    });

    it("maps the learning entry to the R54 recap/plans/calendar facets", async () => {
        const host = context();
        render(Hub, { ...host.props, initialTab: "learning" });
        expect(await screen.findByRole("tab", { name: "学习回顾" }, { timeout: 12000 })).toBeTruthy();
        expect(await screen.findByRole("tab", { name: "目标与计划" }, { timeout: 12000 })).toBeTruthy();
        expect(await screen.findByRole("tab", { name: "学习日历" }, { timeout: 12000 })).toBeTruthy();
    }, 15000);

    it("clears a target deck when the library navigation is selected again", async () => {
        const host = context();
        host.props.recovery.load = async () => ({
            aiJobs: [{ id: "job", status: "importing", pending: 1, failed: 0, created: 0, source: "来源", canReview: false, needsWriteCheck: true, deckID: "deck-x" }],
            inboxCount: 0, suspendedCount: 0, session: null,
        });
        render(Hub, { ...host.props, initialTab: "recovery" });
        await fireEvent.click(await screen.findByRole("button", { name: `${i18n.recoveryCenter.openTargetDeck}：来源` }));
        await waitFor(() => expect(mocks.getRiffCards).toHaveBeenCalledWith("deck-x", 1, 20));
        await fireEvent.click(screen.getAllByRole("button", { name: i18n.hubPrimaryLibrary, exact: true })[0]);
        await waitFor(() => expect(mocks.getRiffCards).toHaveBeenCalledWith("", 1, 20));
    });
});
