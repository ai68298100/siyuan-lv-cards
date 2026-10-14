import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import Review from "../src/ui/review.svelte";

const { getRiffDueCards, getRiffDecks, batchSetRiffCardsDueTime, reviewRiffCard, skipReviewRiffCard, getNotebooks, getBlockAttrs, getBlockDOM } = vi.hoisted(() => ({
    getRiffDueCards: vi.fn(),
    getRiffDecks: vi.fn(),
    batchSetRiffCardsDueTime: vi.fn(),
    reviewRiffCard: vi.fn(),
    skipReviewRiffCard: vi.fn(),
    getNotebooks: vi.fn(),
    getBlockAttrs: vi.fn(),
    getBlockDOM: vi.fn(),
}));

vi.mock("@/api/riff", () => ({ getRiffDueCards, getRiffDecks, batchSetRiffCardsDueTime, reviewRiffCard, skipReviewRiffCard }));
vi.mock("@/api/siyuan", () => ({ getNotebooks, getBlockAttrs, getBlockDOM }));
vi.mock("@/api/due-shared", () => ({ dueCache: { get: vi.fn() }, invalidateDueCache: vi.fn() }));
vi.mock("siyuan", () => ({ openTab: vi.fn(), showMessage: vi.fn() }));

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

const cardA = { deckID: "deck-a", cardID: "card-a", blockID: "block-a", lapses: 0, reps: 0, state: 2, lastReview: 0, nextDues: {} };
const cardB = { deckID: "deck-a", cardID: "card-b", blockID: "block-b", lapses: 0, reps: 0, state: 2, lastReview: 0, nextDues: {} };

function message(path: string): any {
    const fn = () => path;
    return new Proxy(fn, {
        get(_target, property) {
            if (property === "replace") return (search: string, replacement: string) => path.replace(search, replacement);
            if (property === "toString" || property === "valueOf" || property === Symbol.toPrimitive) return () => path;
            if (property === "then") return undefined;
            return message(`${path}.${String(property)}`);
        },
        apply: () => path,
    });
}

const settings = (choiceEnabled = false, ttsEnabled = false, sfxEnabled = false) => ({
    ratingStyle: "four" as const,
    timeoutMode: "off" as const,
    timeoutSeconds: 60,
    randomOrder: false,
    cardMaxWidth: 720,
    typingEnabled: false,
    typingStrict: false,
    choiceEnabled,
    mixedRotation: false,
    ttsEnabled,
    ttsRate: 1,
    ttsVoice: "",
    batchLimit: 0,
    dictationEnabled: false,
    requeueAgain: false,
    dailyReviewTarget: 0,
    cardFontScale: 1,
    ratingDensity: "cozy" as const,
    sfxEnabled,
    sfxStyle: "chime" as const,
    hideMetaUntilAnswer: false,
    reverseOrder: false,
    answerTimeCapSec: 60,
    dailyTipEnabled: false,
});

const ctx = (choiceEnabled = false, ttsEnabled = false, sfxEnabled = false) => ({
    i18n: message("t"),
    app: {},
    settings: () => settings(choiceEnabled, ttsEnabled, sfxEnabled),
    appendRevlog: vi.fn(),
    getRevlog: () => ({ version: 1, entries: [], days: {} }),
    isSuspendedToday: () => false,
    suspendToday: vi.fn(),
    openDashboard: vi.fn(),
    onScopePersist: vi.fn(),
    getSessionState: () => null,
    saveSessionState: vi.fn(),
    clearSessionState: vi.fn(),
    emitSessionFinished: vi.fn(),
    getContextBlocks: async () => [],
});

function mountReview(choiceEnabled = false, ttsEnabled = false, sfxEnabled = false) {
    Object.defineProperty(window, "siyuan", {
        configurable: true,
        value: { languages: { confirm: "Confirm", cancel: "Cancel" } },
    });
    return render(Review, { ctx: ctx(choiceEnabled, ttsEnabled, sfxEnabled) });
}

describe("review async action guards", () => {
    beforeEach(() => {
        getRiffDueCards.mockReset().mockResolvedValue({ cards: [cardA, cardB], unreviewedCount: 2 });
        getRiffDecks.mockReset().mockResolvedValue([]);
        batchSetRiffCardsDueTime.mockReset().mockResolvedValue(undefined);
        reviewRiffCard.mockReset().mockResolvedValue(undefined);
        skipReviewRiffCard.mockReset().mockResolvedValue(undefined);
        getNotebooks.mockReset().mockResolvedValue([]);
        getBlockAttrs.mockReset().mockResolvedValue({});
        getBlockDOM.mockReset().mockImplementation(async (id: string) => `<p>${id} body</p>`);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("discards a choice-generation response after the current card changes", async () => {
        const staleAnswer = deferred<string>();
        getBlockDOM.mockImplementation((id: string) => {
            if (id === "block-a" && getBlockDOM.mock.calls.filter(([calledID]) => calledID === "block-a").length === 2) {
                return staleAnswer.promise;
            }
            return Promise.resolve(`<p>${id} body</p>`);
        });
        mountReview(true);
        await screen.findByText("block-a body");
        await waitFor(() => expect(getBlockDOM).toHaveBeenCalledTimes(2));
        await fireEvent.click(screen.getByRole("button", { name: "t.review.skip" }));
        await screen.findByText("block-b body");

        staleAnswer.resolve("<p>stale answer from A</p>");
        await Promise.resolve();
        await Promise.resolve();

        expect(screen.getByText("block-b body")).toBeTruthy();
        expect(screen.queryByText(/stale answer from A/)).toBeNull();
        expect(screen.queryByRole("button", { name: /A\. stale answer from A/ })).toBeNull();
    });

    it("locks rescheduling while the first request is pending", async () => {
        const pending = deferred<void>();
        batchSetRiffCardsDueTime.mockReturnValueOnce(pending.promise);
        mountReview();
        await screen.findByText("block-a body");
        await fireEvent.keyDown(window, { key: "f" });
        const confirm = await screen.findByRole("button", { name: "Confirm" });

        await fireEvent.click(confirm);
        await waitFor(() => expect(batchSetRiffCardsDueTime).toHaveBeenCalledTimes(1));
        expect(confirm.hasAttribute("disabled")).toBe(true);
        await fireEvent.click(confirm);
        expect(batchSetRiffCardsDueTime).toHaveBeenCalledTimes(1);

        pending.resolve(undefined);
        await screen.findByText("block-b body");
    });

    it("reuses the exact due timestamp when retrying a failed reschedule", async () => {
        const fixedNow = new Date("2026-10-12T01:02:03.000Z").getTime();
        vi.spyOn(Date, "now").mockReturnValue(fixedNow);
        batchSetRiffCardsDueTime.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
        mountReview();
        await screen.findByText("block-a body");
        await fireEvent.keyDown(window, { key: "f" });
        const confirm = await screen.findByRole("button", { name: "Confirm" });

        await fireEvent.click(confirm);
        await waitFor(() => expect(batchSetRiffCardsDueTime).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getAllByText("offline").length).toBeGreaterThan(0));
        const retryButton = screen.getByRole("button", { name: "Confirm" });
        await fireEvent.click(retryButton);
        await waitFor(() => expect(batchSetRiffCardsDueTime).toHaveBeenCalledTimes(2));

        expect(batchSetRiffCardsDueTime.mock.calls[1][0]).toEqual(batchSetRiffCardsDueTime.mock.calls[0][0]);
        await screen.findByText("block-b body");
    });

    it("cancels active speech and closes its audio context when the review is destroyed", async () => {
        const cancel = vi.fn();
        const speak = vi.fn();
        Object.defineProperty(window, "speechSynthesis", {
            configurable: true,
            value: { cancel, speak, getVoices: () => [] },
        });
        class MockUtterance {
            lang = "";
            rate = 1;
            voice: unknown;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;
            constructor(readonly text: string) {}
        }
        vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
        const oscillator = {
            connect: vi.fn(), type: "", frequency: { setValueAtTime: vi.fn() },
            start: vi.fn(), stop: vi.fn(),
        };
        const gain = { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } };
        const close = vi.fn().mockResolvedValue(undefined);
        class MockAudioContext {
            currentTime = 0;
            destination = {};
            createOscillator = () => oscillator;
            createGain = () => gain;
            close = close;
        }
        vi.stubGlobal("AudioContext", MockAudioContext);

        const view = mountReview(false, true, true);
        await screen.findByText("block-a body");
        await fireEvent.click(screen.getByRole("button", { name: "t.review.showAnswer" }));
        await fireEvent.click(screen.getByRole("button", { name: "t.review.speak" }));
        expect(speak).toHaveBeenCalledOnce();
        await fireEvent.click(view.container.querySelector(".lv-btn-rate")!);
        await waitFor(() => expect(reviewRiffCard).toHaveBeenCalledOnce());

        view.unmount();

        expect(cancel).toHaveBeenCalled();
        expect(close).toHaveBeenCalledOnce();
    });
});
