import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import ChallengeMode from "../src/ui/challenge-mode.svelte";

const { dueGet, getBlockDOM } = vi.hoisted(() => ({
    dueGet: vi.fn(),
    getBlockDOM: vi.fn(),
}));

vi.mock("../src/api/due-shared", () => ({ dueCache: { get: dueGet } }));
vi.mock("../src/api/siyuan", () => ({ getBlockDOM }));

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
};

describe("challenge loading lifecycle", () => {
    beforeEach(() => {
        dueGet.mockReset();
        getBlockDOM.mockReset();
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { cancel: "Cancel" } },
        });
    });

    afterEach(cleanup);

    const renderChallenge = () => render(ChallengeMode, {
        i18n: { challenge: {
            title: "Challenge", desc: "For ${n} minutes", start: "Start", loading: "Loading",
            empty: "No cards", loadError: "Load failed", readFailed: "Read failed",
            readPartial: "Skipped ${n}", retry: "Retry", stop: "Stop", unknown: "Unknown",
            known: "Known", doneTitle: "Done", skipped: "skipped", closeBtn: "Close",
        } },
        onExit: vi.fn(),
    });

    it("does not request cards again after closing during the due query", async () => {
        const due = deferred<{ cards: { blockID: string }[] }>();
        dueGet.mockReturnValueOnce(due.promise);
        renderChallenge();

        await fireEvent.click(screen.getByRole("button", { name: "Start" }));
        await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        cleanup();
        due.resolve({ cards: [{ blockID: "a" }] });
        await Promise.resolve();
        await Promise.resolve();

        expect(getBlockDOM).not.toHaveBeenCalled();
    });

    it("does not load more faces or start a timer after closing during face loading", async () => {
        const firstFace = deferred<string>();
        dueGet.mockResolvedValueOnce({ cards: [{ blockID: "a" }, { blockID: "b" }] });
        getBlockDOM.mockReturnValueOnce(firstFace.promise);
        renderChallenge();

        await fireEvent.click(screen.getByRole("button", { name: "Start" }));
        await waitFor(() => expect(getBlockDOM).toHaveBeenCalledOnce());
        const interval = vi.spyOn(globalThis, "setInterval");
        await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        cleanup();
        firstFace.resolve("<p>Question</p>");
        await Promise.resolve();
        await Promise.resolve();

        expect(getBlockDOM).toHaveBeenCalledOnce();
        expect(interval).not.toHaveBeenCalled();
        interval.mockRestore();
    });
});
