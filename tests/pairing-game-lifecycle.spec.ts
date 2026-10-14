import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import PairingGame from "../src/ui/pairing-game.svelte";

const { dueGet, getBlockDOM } = vi.hoisted(() => ({ dueGet: vi.fn(), getBlockDOM: vi.fn() }));

vi.mock("../src/api/due-shared", () => ({ dueCache: { get: dueGet } }));
vi.mock("../src/api/siyuan", () => ({ getBlockDOM }));

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

const cards = Array.from({ length: 4 }, (_, i) => ({ cardID: `card-${i}`, blockID: `block-${i}` }));
const i18n = { dashboard: { loading: "Loading", refresh: "Retry" }, pairing: {
    title: "Pairing", desc: "Match ${n}", start: "Start", notEnough: "Not enough pairs",
    loadFailed: "Could not load pairs", pairs: "Pairs", mistakes: "Mistakes", exit: "Exit",
    doneTitle: "Complete", doneTime: "Time ${s}s", again: "Again",
} };

function mountGame() {
    Object.defineProperty(window, "siyuan", { configurable: true, value: { languages: { cancel: "Cancel" } } });
    return render(PairingGame, { i18n, onExit: vi.fn() });
}

describe("pairing game async lifecycle", () => {
    beforeEach(() => {
        dueGet.mockReset();
        getBlockDOM.mockReset();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("does not fetch faces when the due request resolves after unmount", async () => {
        const due = deferred<{ cards: typeof cards }>();
        dueGet.mockReturnValueOnce(due.promise);
        mountGame();
        await waitFor(() => expect(dueGet).toHaveBeenCalledOnce());
        cleanup();

        due.resolve({ cards });
        await Promise.resolve();
        await Promise.resolve();

        expect(getBlockDOM).not.toHaveBeenCalled();
    });

    it("does not start the timer when a face request resolves after unmount", async () => {
        const face = deferred<string>();
        dueGet.mockResolvedValueOnce({ cards });
        getBlockDOM.mockReturnValueOnce(face.promise);
        mountGame();
        await waitFor(() => expect(getBlockDOM).toHaveBeenCalledOnce());
        const interval = vi.spyOn(globalThis, "setInterval");
        cleanup();

        face.resolve("<p>Question <mark>answer</mark></p>");
        await Promise.resolve();
        await Promise.resolve();

        expect(interval).not.toHaveBeenCalled();
        expect(getBlockDOM).toHaveBeenCalledOnce();
    });

    it("clears the running game timer when unmounted", async () => {
        dueGet.mockResolvedValueOnce({ cards });
        getBlockDOM.mockResolvedValue("<p>Question <mark>answer</mark> details</p>");
        const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
        const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
        const view = mountGame();

        await screen.findByText("Pairs: 0 / 4");
        const timer = setIntervalSpy.mock.results.find(result => result.type === "return")?.value;
        expect(timer).toBeDefined();
        view.unmount();

        expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
    });

    it("invalidates an older load when a newer retry starts", async () => {
        const first = deferred<{ cards: typeof cards }>();
        dueGet.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ cards });
        getBlockDOM.mockResolvedValue("<p>Question <mark>answer</mark> details</p>");
        mountGame();
        await waitFor(() => expect(dueGet).toHaveBeenCalledOnce());

        first.reject(new Error("offline"));
        await screen.findByText("offline");
        await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        await screen.findByText("Pairs: 0 / 4");
        expect(getBlockDOM).toHaveBeenCalledTimes(4);
    });
});
