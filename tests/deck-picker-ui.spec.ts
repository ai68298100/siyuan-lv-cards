import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/svelte";
import DeckPicker from "../src/ui/deck-picker.svelte";

const { getRiffDecks, createRiffDeck } = vi.hoisted(() => ({
    getRiffDecks: vi.fn(),
    createRiffDeck: vi.fn(),
}));

vi.mock("../src/api/riff", () => ({ getRiffDecks, createRiffDeck }));

describe("deck picker interaction states", () => {
    beforeEach(() => {
        getRiffDecks.mockReset();
        getRiffDecks.mockResolvedValue([]);
        createRiffDeck.mockReset();
        Object.defineProperty(window, "siyuan", {
            configurable: true,
            value: { languages: { cancel: "Cancel" } },
        });
    });

    afterEach(cleanup);

    const props = (overrides: Record<string, unknown> = {}) => ({
        firstDeckNamePlaceholder: "Name the first deck",
        newNamePlaceholder: "New deck name",
        emptyDeckText: "No decks yet. Enter a name to create one.",
        retryLabel: "Retry",
        confirmLabel: "OK",
        loadingLabel: "Loading decks…",
        busyLabel: "Adding…",
        onBeforeConfirm: vi.fn(async () => undefined),
        onConfirm: vi.fn(async () => undefined),
        onClose: vi.fn(),
        ...overrides,
    });

    it("disables confirm without a selection or a new deck name", async () => {
        getRiffDecks.mockResolvedValue([]);
        render(DeckPicker, props());

        const confirm = await screen.findByRole("button", { name: "OK ↵" }) as HTMLButtonElement;
        expect(screen.getByText("No decks yet. Enter a name to create one.")).toBeTruthy();
        expect(confirm.disabled).toBe(true);
    });

    it("creates the first deck after a name is provided", async () => {
        getRiffDecks.mockResolvedValue([]);
        createRiffDeck.mockResolvedValue({ id: "new-id", name: "New deck", size: 0 });
        const p = props();
        render(DeckPicker, p);

        const input = await screen.findByPlaceholderText("Name the first deck");
        await fireEvent.input(input, { target: { value: "New deck" } });
        const confirm = screen.getByRole("button", { name: "OK ↵" }) as HTMLButtonElement;
        expect(confirm.disabled).toBe(false);
        await fireEvent.click(confirm);

        await waitFor(() => expect(p.onConfirm).toHaveBeenCalledWith("new-id", "New deck"));
        expect(createRiffDeck).toHaveBeenCalledWith("New deck");
        expect(p.onClose).toHaveBeenCalledOnce();
    });

    it("retries a failed load and keeps a typed deck name", async () => {
        getRiffDecks.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
        render(DeckPicker, props());

        await screen.findByText("offline");
        const input = screen.getByPlaceholderText("Name the first deck") as HTMLInputElement;
        await fireEvent.input(input, { target: { value: "Draft deck" } });
        await fireEvent.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(getRiffDecks).toHaveBeenCalledTimes(2));
        expect(input.value).toBe("Draft deck");
    });

    it("keeps the picker open when duplicate confirmation is declined", async () => {
        const p = props({
            onBeforeConfirm: vi.fn(async () => false),
        });
        render(DeckPicker, p);

        const input = await screen.findByPlaceholderText("Name the first deck");
        await fireEvent.input(input, { target: { value: "Draft deck" } });
        await fireEvent.click(screen.getByRole("button", { name: "OK ↵" }));
        await waitFor(() => expect(p.onBeforeConfirm).toHaveBeenCalledOnce());
        expect(createRiffDeck).not.toHaveBeenCalled();
        expect(p.onConfirm).not.toHaveBeenCalled();
        expect(p.onClose).not.toHaveBeenCalled();
    });

    it("reuses a newly created deck when adding cards fails and the user retries", async () => {
        getRiffDecks.mockResolvedValue([]);
        createRiffDeck.mockResolvedValue({ id: "new-id", name: "New deck", size: 0 });
        const onConfirm = vi.fn().mockRejectedValueOnce(new Error("add failed")).mockResolvedValueOnce(undefined);
        const p = props({ onConfirm });
        render(DeckPicker, p);
        await fireEvent.input(await screen.findByPlaceholderText("Name the first deck"), { target: { value: "New deck" } });

        await fireEvent.click(screen.getByRole("button", { name: "OK ↵" }));
        expect(await screen.findByText("add failed")).toBeTruthy();
        await fireEvent.click(screen.getByRole("button", { name: "OK ↵" }));

        await waitFor(() => expect(p.onClose).toHaveBeenCalledOnce());
        expect(createRiffDeck).toHaveBeenCalledOnce();
        expect(onConfirm).toHaveBeenNthCalledWith(2, "new-id", "New deck");
    });

    it("confirms deck creation when Enter key is pressed in the name field, and cancels on Escape", async () => {
        getRiffDecks.mockResolvedValue([]);
        createRiffDeck.mockResolvedValue({ id: "fast-deck-id", name: "Fast deck", size: 0 });
        const p = props();
        render(DeckPicker, p);

        const input = await screen.findByPlaceholderText("Name the first deck");
        await fireEvent.input(input, { target: { value: "Fast deck" } });

        // 按 Enter 键确认建组
        await fireEvent.keyDown(input, { key: "Enter" });
        await waitFor(() => expect(p.onConfirm).toHaveBeenCalledWith("fast-deck-id", "Fast deck"));
        expect(p.onClose).toHaveBeenCalledOnce();

        // 重新渲染测试 Escape 退出
        const p2 = props();
        render(DeckPicker, p2);
        await fireEvent.keyDown(window, { key: "Escape" });
        expect(p2.onClose).toHaveBeenCalledOnce();
    });
});
