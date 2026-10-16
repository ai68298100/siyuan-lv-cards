import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import AIWizard from "../src/ui/ai-wizard.svelte";
import i18n from "../public/i18n/en.json";

vi.mock("svelte/transition", () => ({ fade: () => ({ duration: 0, css: () => "" }) }));
const { getRiffDecks, createRiffDeck } = vi.hoisted(() => ({ getRiffDecks: vi.fn(), createRiffDeck: vi.fn() }));
vi.mock("@/api/riff", () => ({ getRiffDecks, createRiffDeck }));
vi.mock("@/api/ai", () => ({ classifyAiFailure: () => ({ cls: "network" }), isAICanceled: () => false }));
vi.mock("siyuan", () => ({ showMessage: vi.fn() }));

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => { resolve = res; });
    return { promise, resolve };
};
const gen = { mode: "custom" as const, modelId: "test", templateHash: "template" };
const cards = [{ q: "First question", a: "Alpha" }, { q: "Second question", a: "Beta" }];
async function generateCards(generate: ReturnType<typeof vi.fn>, extra: Record<string, unknown> = {}) {
    const view = render(AIWizard, { i18n, generate, onCreate: vi.fn(), onClose: vi.fn(), initialSource: "Lecture notes", ...extra });
    await fireEvent.click(await screen.findByRole("button", { name: "Generate →" }));
    await fireEvent.click(screen.getByRole("checkbox", { name: i18n.aiWizard.preflightConsent }));
    await fireEvent.click(screen.getByRole("button", { name: i18n.aiWizard.preflightConfirm }));
    await screen.findByDisplayValue("First question");
    return view;
}

describe("AI wizard release audit regressions", () => {
    beforeEach(() => {
        getRiffDecks.mockReset().mockResolvedValue([{ id: "deck-a", name: "Default" }]);
        createRiffDeck.mockReset().mockResolvedValue({ id: "deck-new", name: "New deck" });
        Object.defineProperty(window, "siyuan", { configurable: true, value: { languages: { cancel: "Cancel" } } });
    });
    afterEach(cleanup);

    it("keeps the material editor available from the empty state and after clearing", async () => {
        render(AIWizard, { i18n, generate: vi.fn(), onCreate: vi.fn(), onClose: vi.fn() });
        const editor = screen.getByPlaceholderText(i18n.aiWizard.sourceEditHint);
        await fireEvent.input(editor, { target: { value: "New material" } });
        expect(screen.getByPlaceholderText(i18n.aiWizard.sourceEditHint)).toBe(editor);
        await fireEvent.click(screen.getByRole("button", { name: i18n.aiWizard.sourceClear }));
        expect((screen.getByPlaceholderText(i18n.aiWizard.sourceEditHint) as HTMLTextAreaElement).value).toBe("");
    });

    it("sends prefilled material exactly once", async () => {
        const generate = vi.fn().mockResolvedValue({ cards, jobId: "job", gen });
        await generateCards(generate);
        expect(generate.mock.calls[0][0]).toBe("Lecture notes");
    });

    it("requires renewed consent when material changes inside preflight", async () => {
        render(AIWizard, { i18n, generate: vi.fn(), onCreate: vi.fn(), onClose: vi.fn(), initialSource: "Lecture notes" });
        await fireEvent.click(await screen.findByRole("button", { name: "Generate →" }));
        await fireEvent.click(screen.getByRole("checkbox", { name: i18n.aiWizard.preflightConsent }));
        expect((screen.getByRole("button", { name: i18n.aiWizard.preflightConfirm }) as HTMLButtonElement).disabled).toBe(false);
        await fireEvent.input(screen.getByPlaceholderText(i18n.aiWizard.sourceEditHint), { target: { value: "Changed notes" } });
        expect((screen.getByRole("button", { name: i18n.aiWizard.preflightConfirm }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("restores a version on the correct card and preserves its history after removing an earlier card", async () => {
        await generateCards(vi.fn().mockResolvedValue({ cards, jobId: "job", gen }));
        await fireEvent.input(screen.getByDisplayValue("Second question"), { target: { value: "Second edited question" } });
        const secondCard = screen.getByDisplayValue("Second edited question").closest(".lv-aiwiz-card") as HTMLElement;
        await fireEvent.click(within(secondCard).getAllByRole("button", { name: i18n.aiWizard.cardPreview })[0]);
        await fireEvent.click(within(secondCard).getByRole("button", { name: i18n.aiScore.restore }));
        expect(screen.getByDisplayValue("First question")).toBeTruthy();
        expect(screen.getByDisplayValue("Second question")).toBeTruthy();

        await fireEvent.click(screen.getAllByRole("button", { name: i18n.aiWizard.removeCandidate })[0]);
        const remainingCard = screen.getByDisplayValue("Second question").closest(".lv-aiwiz-card") as HTMLElement;
        await fireEvent.click(within(remainingCard).getByRole("button", { name: i18n.aiScore.restore }));
        expect(screen.getByDisplayValue("Second edited question")).toBeTruthy();
    });

    it("renders repeated source assertions without duplicate keys", async () => {
        render(AIWizard, {
            i18n, generate: vi.fn(), onCreate: vi.fn(), onClose: vi.fn(), initialSource: "A repeated assertion.",
            recoveryJob: { id: "saved", sourceLabel: "Notes", candidates: [{ q: "What was said?", a: "A repeated assertion。A repeated assertion。", origIndex: 0 }] },
        });
        await fireEvent.click((await screen.findAllByRole("button", { name: i18n.aiWizard.cardPreview }))[0]);
        expect(screen.getByText(i18n.aiWizard.assertionTitle)).toBeTruthy();
        expect(screen.getAllByText("A repeated assertion")).toHaveLength(2);
    });

    it("locks candidate edits during import and reuses the new deck after a failed card write", async () => {
        const write = deferred<void>();
        const onCreate = vi.fn().mockRejectedValueOnce(new Error("Write failed")).mockImplementationOnce(() => write.promise);
        await generateCards(vi.fn().mockResolvedValue({ cards, jobId: "job", gen }), { onCreate });
        await fireEvent.click(screen.getByRole("button", { name: i18n.aiWizard.acceptAll }));
        await fireEvent.input(screen.getByPlaceholderText(i18n.deckNewName), { target: { value: "New deck" } });
        await fireEvent.click(screen.getByRole("button", { name: "Create 2 Accepted Cards" }));
        await screen.findByRole("alert");
        await fireEvent.click(screen.getByRole("button", { name: "Create 2 Accepted Cards" }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
        expect(createRiffDeck).toHaveBeenCalledOnce();
        expect((screen.getByDisplayValue("First question") as HTMLTextAreaElement).disabled).toBe(true);
        expect((screen.getAllByRole("button", { name: i18n.aiWizard.removeCandidate })[0] as HTMLButtonElement).disabled).toBe(true);
        expect(onCreate.mock.calls[1][1]).toBe("deck-new");
        write.resolve();
    });

    it("cancels a regeneration on Back and keeps a late response out of the current draft", async () => {
        const late = deferred<{ cards: typeof cards; jobId: string; gen: typeof gen }>();
        const generate = vi.fn().mockResolvedValueOnce({ cards, jobId: "job", gen }).mockImplementationOnce(() => late.promise);
        await generateCards(generate);
        await fireEvent.click(screen.getAllByRole("button", { name: i18n.aiWizard.regenerate })[0]);
        expect((screen.getByDisplayValue("First question") as HTMLTextAreaElement).disabled).toBe(true);
        await fireEvent.click(screen.getByRole("button", { name: "← Back" }));
        expect(generate.mock.calls[1][2].signal.aborted).toBe(true);
        late.resolve({ cards: [{ q: "Late overwrite", a: "Late answer" }], jobId: "late", gen });
        await waitFor(() => expect(screen.queryByDisplayValue("Late overwrite")).toBeNull());
        expect(screen.getByPlaceholderText(i18n.aiWizard.sourceEditHint)).toBeTruthy();
    });

    it("clears successfully imported candidates before the embedded wizard is reopened", async () => {
        const onClose = vi.fn();
        const onCreate = vi.fn().mockResolvedValue(undefined);
        await generateCards(vi.fn().mockResolvedValue({ cards, jobId: "job", gen }), { onCreate, onClose, embedded: true });
        await fireEvent.click(screen.getByRole("button", { name: i18n.aiWizard.acceptAll }));
        await fireEvent.click(screen.getByRole("button", { name: "Create 2 Accepted Cards" }));
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(screen.queryByDisplayValue("First question")).toBeNull();
        expect(screen.getByRole("button", { name: "Generate →" })).toBeTruthy();
    });
});
