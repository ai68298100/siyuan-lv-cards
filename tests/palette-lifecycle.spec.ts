import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaletteCommand } from "../src/core/palette";

const { loadChunk, svelteDialog, setDialogMounter, showMessage, invalidateChunk } = vi.hoisted(() => ({
    loadChunk: vi.fn(),
    svelteDialog: vi.fn(),
    setDialogMounter: vi.fn(),
    showMessage: vi.fn(),
    invalidateChunk: vi.fn(),
}));

vi.mock("../src/libs/chunk-loader", () => ({ loadChunk, invalidateChunk }));
vi.mock("../src/libs/dialog", async importOriginal => ({
    ...await importOriginal<typeof import("../src/libs/dialog")>(),
    svelteDialog,
    setDialogMounter,
}));
vi.mock("siyuan", async importOriginal => ({
    ...await importOriginal<typeof import("siyuan")>(),
    showMessage,
}));

import LvCardsPlugin from "../src/index";
import { createPaletteView } from "../src/ui/palette-view";

type View = ReturnType<typeof createPaletteView>;
type DialogArgs = View & { callback?: () => void };
type DialogRecord = {
    args: DialogArgs;
    props: View["props"];
    element: HTMLDivElement;
    input: HTMLInputElement;
    close: ReturnType<typeof vi.fn>;
};

const dialogs: DialogRecord[] = [];
const chunk = {
    createPaletteView,
    // Retained so the previous component-only loader can exercise the same fixture.
    components: { LvPalette: (() => undefined) },
    mountDialogComponent: vi.fn(),
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

/** Exercise the real plugin lifecycle; only host services and UI mounting are fakes. */
function createHost() {
    const plugin = new LvCardsPlugin() as any;
    plugin.i18n = {
        cmdPalette: "命令面板",
        palettePlaceholder: "搜索动作",
        paletteGroupActions: "动作",
        paletteGroupNav: "导航",
        paletteEmpty: "没有匹配命令",
        paletteFoot: "选择并执行",
        chunkLoadFailedDetail: "界面模块加载失败，请重试。",
    };
    plugin.settings = { modules: { inbox: true, exam: true }, uiMode: "advanced" };
    plugin.eventBus = { off: vi.fn() };
    plugin.unbindExamPlansSync = vi.fn();
    plugin.flushRevlogSave = vi.fn();
    plugin.persist = { waitAll: vi.fn(async () => true) };
    for (const method of ["openTabOf", "openAIWizard", "openQuickCard", "openPairing", "openRepairDrill", "openSettingsDialog"]) {
        plugin[method] = vi.fn();
    }
    return {
        plugin,
        open: () => (LvCardsPlugin.prototype as any).openPalette.call(plugin) as Promise<void>,
        unload: () => LvCardsPlugin.prototype.onunload.call(plugin),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    loadChunk.mockReset();
    loadChunk.mockResolvedValue(chunk);
    svelteDialog.mockReset();
    dialogs.length = 0;
    svelteDialog.mockImplementation((args: DialogArgs) => {
        const element = document.createElement("div");
        const input = document.createElement("input");
        input.setAttribute("role", "combobox");
        element.append(input);
        document.body.append(element);
        let closed = false;
        const close = vi.fn(() => {
            if (closed) return;
            closed = true;
            element.remove();
            args.callback?.();
        });
        const props = {
            ...args.props,
            onClose: () => {
                try { args.props.onClose(); } finally { close(); }
            },
        };
        dialogs.push({ args, props, element, input, close });
        return { dialog: { element }, element, close };
    });
});

afterEach(() => {
    for (const dialog of dialogs) dialog.element.remove();
    vi.restoreAllMocks();
});

describe("plugin command palette lifecycle", () => {
    it("routes imports to its task view after closing, while general settings keeps its default call", async () => {
        const { plugin, open } = createHost();
        await open();
        const active = dialogs[0];
        active.props.onrun(active.props.commands.find(command => command.id === "imports")!);
        expect(active.close).toHaveBeenCalledOnce();
        expect(plugin.openSettingsDialog).toHaveBeenCalledWith(undefined, "imports");
        expect(active.close.mock.invocationCallOrder[0]).toBeLessThan(plugin.openSettingsDialog.mock.invocationCallOrder[0]);
        await open();
        dialogs[1].props.onrun(dialogs[1].props.commands.find(command => command.id === "settings")!);
        expect(plugin.openSettingsDialog).toHaveBeenLastCalledWith();
    });
    it("coalesces repeated entrances while the dialogs chunk is still loading", async () => {
        const pending = deferred<typeof chunk>();
        loadChunk.mockReturnValue(pending.promise);
        const host = createHost();
        const first = host.open();
        const calls = loadChunk.mock.calls.length;
        const second = host.open();
        expect(loadChunk).toHaveBeenCalledTimes(calls);
        expect(svelteDialog).not.toHaveBeenCalled();

        pending.resolve(chunk);
        await Promise.all([first, second]);
        expect(svelteDialog).toHaveBeenCalledTimes(1);
        expect(dialogs[0].props.commands.some(command => command.id === "maintenance")).toBe(true);
    });

    it("reopening an active palette focuses its search without remounting or reloading", async () => {
        const host = createHost();
        await host.open();
        const outside = document.createElement("button");
        document.body.append(outside);
        outside.focus();
        const calls = loadChunk.mock.calls.length;
        try {
            await host.open();
            expect(svelteDialog).toHaveBeenCalledTimes(1);
            expect(loadChunk).toHaveBeenCalledTimes(calls);
            expect(document.activeElement).toBe(dialogs[0].input);
        } finally { outside.remove(); }
    });

    it("reports a loading failure once and permits retry on the next entrance", async () => {
        const host = createHost();
        loadChunk.mockRejectedValueOnce(new Error("chunk unavailable"));
        await host.open();
        expect(svelteDialog).not.toHaveBeenCalled();
        expect(showMessage).toHaveBeenCalledTimes(1);
        expect(showMessage.mock.calls[0][0]).toContain("chunk unavailable");

        await host.open();
        expect(svelteDialog).toHaveBeenCalledTimes(1);
        expect(showMessage).toHaveBeenCalledTimes(1);
    });

    it("clears a failed mount so the next entrance can retry", async () => {
        const host = createHost();
        svelteDialog.mockImplementationOnce(() => { throw new Error("host mount failed"); });
        await host.open();
        expect(showMessage).toHaveBeenCalledTimes(1);
        expect(showMessage.mock.calls[0][0]).toContain("host mount failed");

        await host.open();
        expect(svelteDialog).toHaveBeenCalledTimes(2);
        expect(dialogs).toHaveLength(1);
    });

    it.each([undefined, 42])("invalidates an incompatible production factory (%j) and recovers after repair", async createView => {
        const host = createHost();
        loadChunk.mockResolvedValue({ ...chunk, createPaletteView: createView });
        await host.open();
        expect(svelteDialog).not.toHaveBeenCalled();
        expect(showMessage).toHaveBeenCalledTimes(1);
        expect(showMessage.mock.calls[0][0]).toContain("missing palette view");
        expect(invalidateChunk).toHaveBeenCalledExactlyOnceWith("dialogs");

        loadChunk.mockResolvedValue(chunk);
        await host.open();
        expect(svelteDialog).toHaveBeenCalledTimes(1);
        expect(showMessage).toHaveBeenCalledTimes(1);
    });

    it.each(["resolve", "reject"] as const)("ignores a %s arriving after unload without mounting or showing an error", async outcome => {
        const pending = deferred<typeof chunk>();
        loadChunk.mockReturnValue(pending.promise);
        const host = createHost();
        const opening = host.open();
        host.unload();
        if (outcome === "resolve") pending.resolve(chunk);
        else pending.reject(new Error("late chunk failure"));
        await opening;

        expect(svelteDialog).not.toHaveBeenCalled();
        expect(showMessage).not.toHaveBeenCalled();
        const calls = loadChunk.mock.calls.length;
        await host.open();
        expect(loadChunk).toHaveBeenCalledTimes(calls);
        expect(svelteDialog).not.toHaveBeenCalled();
    });

    it("unload closes the active palette and prevents it from reopening", async () => {
        const host = createHost();
        await host.open();
        const active = dialogs[0];
        host.unload();
        expect(active.close).toHaveBeenCalledTimes(1);
        expect(document.contains(active.element)).toBe(false);
        await host.open();
        expect(svelteDialog).toHaveBeenCalledTimes(1);
    });

    it("closing through the component permits a fresh palette on the next entrance", async () => {
        const host = createHost();
        await host.open();
        dialogs[0].props.onClose();
        expect(dialogs[0].close).toHaveBeenCalledTimes(1);
        await host.open();
        expect(dialogs).toHaveLength(2);
        expect(dialogs[1].element).not.toBe(dialogs[0].element);
    });

    it("late callbacks from a closed palette cannot clear the newly active one", async () => {
        const host = createHost();
        await host.open();
        const old = dialogs[0];
        old.close();
        await host.open();
        const active = dialogs[1];

        old.args.callback?.();
        old.props.onClose();
        await host.open();
        expect(dialogs).toHaveLength(2);
        expect(document.activeElement).toBe(active.input);
        expect(active.close).not.toHaveBeenCalled();
    });

    it("releases the palette before dispatching a command that opens another view", async () => {
        const host = createHost();
        await host.open();
        const active = dialogs[0];
        const wizard = active.props.commands.find(command => command.id === "wizard") as PaletteCommand;
        active.props.onrun(wizard);

        expect(active.close).toHaveBeenCalledTimes(1);
        expect(host.plugin.openAIWizard).toHaveBeenCalledTimes(1);
        expect(active.close.mock.invocationCallOrder[0]).toBeLessThan(host.plugin.openAIWizard.mock.invocationCallOrder[0]);
        await host.open();
        expect(dialogs).toHaveLength(2);
    });

    it.each(["closed", "unloaded"] as const)("ignores commands from a palette that is already %s", async outcome => {
        const host = createHost();
        await host.open();
        const old = dialogs[0];
        const wizard = old.props.commands.find(command => command.id === "wizard") as PaletteCommand;
        if (outcome === "closed") {
            old.close();
            await host.open();
        } else {
            host.unload();
        }

        old.props.onrun(wizard);
        expect(host.plugin.openAIWizard).not.toHaveBeenCalled();
        expect(old.close).toHaveBeenCalledTimes(1);
        if (outcome === "closed") {
            expect(dialogs[1].close).not.toHaveBeenCalled();
            expect(document.contains(dialogs[1].element)).toBe(true);
        }
        expect(showMessage).not.toHaveBeenCalled();
    });

    it("tracks one palette per plugin instance rather than sharing the active dialog", async () => {
        const first = createHost();
        const second = createHost();
        await first.open();
        await second.open();
        await first.open();
        expect(dialogs).toHaveLength(2);
        expect(document.activeElement).toBe(dialogs[0].input);
        first.unload();
        expect(dialogs[0].close).toHaveBeenCalledTimes(1);
        expect(dialogs[1].close).not.toHaveBeenCalled();
        await second.open();
        expect(document.activeElement).toBe(dialogs[1].input);
    });
});
