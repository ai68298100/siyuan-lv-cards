import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import CardDetail from "../src/ui/card-detail.svelte";

const { getBlockDOM } = vi.hoisted(() => ({ getBlockDOM: vi.fn() }));
vi.mock("../src/api/siyuan", () => ({ getBlockDOM }));

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

const t = {
    dashboard: { loading: "Loading", refresh: "Retry" },
    detail: {
        facetContent: "Content", facetSource: "Source", facetHistory: "History", facetIssues: "Issues",
        diffLoadFail: "Could not load current content. Please retry.",
        version: "Version", versionHistory: "History", viaAI: "AI", viaEditor: "Editor",
        accepted: "Accepted", acceptUnavailable: "Accept unavailable", acceptVer: "Accept version",
        diffCompare: "Compare with current", diffUnavailable: "Current content is unavailable for comparison",
    },
    editor: {
        loadFail: "Could not load content", edit: "Edit", title: "Edit card", inputLabel: "Card markdown",
        diffLabel: "Changes", noChange: "No changes", saveFail: "Save failed", saving: "Saving…", save: "Save",
        cancel: "Cancel", hint: "Review changes before saving",
    },
    manager: { detailTitle: "Card details", close: "Close", openDoc: "Open source", detailBlockId: "Block ID" },
};

const props = (id: string, content: string) => ({
    block: { id, content } as any,
    t,
    onOpenDoc: vi.fn(),
    onClose: vi.fn(),
});

describe("card detail preview loading", () => {
    beforeEach(() => getBlockDOM.mockReset());
    afterEach(cleanup);

    it("clears the previous preview and ignores an older response after switching cards", async () => {
        const first = deferred<string>();
        const second = deferred<string>();
        getBlockDOM.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const view = render(CardDetail, props("card-a", "<p>Fallback A</p>"));
        await waitFor(() => expect(getBlockDOM).toHaveBeenCalledWith("card-a"));
        expect(screen.getByRole("status").textContent).toContain("Loading");

        await view.rerender(props("card-b", "<p>Fallback B</p>"));
        await waitFor(() => expect(getBlockDOM).toHaveBeenCalledWith("card-b"));
        expect(screen.getByRole("status").textContent).toContain("Loading");
        expect(screen.queryByText("Fallback A")).toBeNull();
        expect(screen.getByText("Fallback B")).toBeTruthy();

        second.resolve("<p>Preview B</p>");
        expect(await screen.findByText("Preview B")).toBeTruthy();
        first.resolve("<p>Stale preview A</p>");
        await Promise.resolve();
        expect(screen.queryByText("Stale preview A")).toBeNull();
        expect(screen.getByText("Preview B")).toBeTruthy();
    });

    it("shows a readable error fallback with a retry action", async () => {
        getBlockDOM.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("<p>Recovered content</p>");
        render(CardDetail, props("card-a", "<p>Fallback A</p>"));

        expect(await screen.findByRole("alert")).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toContain("Could not load current content");
        expect(screen.getByText("Fallback A")).toBeTruthy();
        await screen.getByRole("button", { name: "Retry" }).click();
        expect(await screen.findByText("Recovered content")).toBeTruthy();
        expect(getBlockDOM).toHaveBeenCalledTimes(2);
    });

    it("disables version comparison when no current-content loader is available", async () => {
        getBlockDOM.mockResolvedValue("<p>Preview</p>");
        render(CardDetail, {
            ...props("card-a", "Fallback A"),
            versions: [{ md: "Older content", at: 1, via: "editor" }],
        });
        await screen.findByText("Preview");
        await screen.getByRole("button", { name: "History ▾" }).click();
        const compare = await screen.findByRole("button", { name: "Compare with current" }) as HTMLButtonElement;
        expect(compare.disabled).toBe(true);
        expect(compare.title).toBe("Current content is unavailable for comparison");
    });

    it("notifies the host after a successful edit and preview refresh", async () => {
        getBlockDOM.mockResolvedValue("<p>Preview</p>");
        const load = vi.fn().mockResolvedValue("原卡面");
        const save = vi.fn().mockResolvedValue(true);
        const onSaved = vi.fn();
        render(CardDetail, {
            ...props("card-a", "Fallback A"),
            editorCtx: { load, save },
            onSaved,
        });

        await screen.findByText("Preview");
        await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        const input = await screen.findByRole("textbox", { name: "Card markdown" });
        await fireEvent.input(input, { target: { value: "更新后的卡面" } });
        await new Promise(resolve => setTimeout(resolve, 220));
        await fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => expect(save).toHaveBeenCalledWith("更新后的卡面"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith("card-a"));
        expect(load).toHaveBeenCalledTimes(1);
    });
});
