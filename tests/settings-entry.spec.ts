import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings, type LvCardsSettings } from "../src/core/settings";

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

type SettingsDialogArgs = {
    component: unknown;
    props: {
        initialSection?: "imports";
        ctx: {
            settings: LvCardsSettings;
            save: (settings: LvCardsSettings) => Promise<void>;
            close: () => void;
        };
    };
};

const SettingsPanel = () => undefined;
const dialogElement = document.createElement("div");
const close = vi.fn();

/** Exercise the actual plugin entry and injected save callback, without mounting host UI. */
function createHost() {
    const plugin = new LvCardsPlugin() as any;
    plugin.i18n = { settingsTitle: "Settings", settingsSaved: "Saved" };
    plugin.settings = defaultSettings();
    plugin.saveSettingsNow = vi.fn(async () => undefined);
    plugin.setupBadgeTimer = vi.fn();
    return {
        plugin,
        open: (onSaved?: () => void, initialSection?: "imports") =>
            (LvCardsPlugin.prototype as any).openSettingsDialog.call(plugin, onSaved, initialSection) as Promise<void>,
    };
}

function lastDialog(): SettingsDialogArgs {
    return svelteDialog.mock.calls.at(-1)![0];
}

beforeEach(() => {
    vi.clearAllMocks();
    loadChunk.mockResolvedValue({ components: { SettingsPanel }, mountDialogComponent: vi.fn() });
    svelteDialog.mockReturnValue({ close, dialog: { element: dialogElement } });
    dialogElement.className = "";
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("settings dialog task entry", () => {
    it("passes the imports task through the real lazy component entry", async () => {
        const host = createHost();
        await host.open(undefined, "imports");

        expect(svelteDialog).toHaveBeenCalledOnce();
        expect(lastDialog().component).toBe(SettingsPanel);
        expect(lastDialog().props.initialSection).toBe("imports");
        expect(lastDialog().props.ctx.settings).toBe(host.plugin.settings);
        expect(dialogElement.classList.contains("lv-dialog--settings")).toBe(true);
        lastDialog().props.ctx.close();
        expect(close).toHaveBeenCalledOnce();
    });

    it("keeps the ordinary entry unscoped and invokes its onSaved callback after persistence", async () => {
        const host = createHost();
        const onSaved = vi.fn();
        await host.open(onSaved);
        const args = lastDialog();
        expect(args.props.initialSection).toBeUndefined();
        const next = { ...host.plugin.settings, dailyNewTarget: 17 };

        await args.props.ctx.save(next);

        expect(host.plugin.settings).toBe(next);
        expect(host.plugin.saveSettingsNow).toHaveBeenCalledOnce();
        expect(onSaved).toHaveBeenCalledOnce();
        expect(host.plugin.saveSettingsNow.mock.invocationCallOrder[0]).toBeLessThan(onSaved.mock.invocationCallOrder[0]);
        expect(showMessage).toHaveBeenCalledWith("Saved", 2000, "info");
    });

    it("rolls back failed saves and preserves the task for retry without notifying onSaved", async () => {
        const host = createHost();
        const onSaved = vi.fn();
        const previous = host.plugin.settings;
        const next = { ...previous, dailyNewTarget: 22 };
        const failure = new Error("storage unavailable");
        host.plugin.saveSettingsNow.mockRejectedValueOnce(failure);
        await host.open(onSaved, "imports");

        await expect(lastDialog().props.ctx.save(next)).rejects.toBe(failure);

        expect(host.plugin.settings).toBe(previous);
        expect(host.plugin.setupBadgeTimer).toHaveBeenCalledOnce();
        expect(lastDialog().props.initialSection).toBe("imports");
        expect(onSaved).not.toHaveBeenCalled();
        expect(showMessage).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();

        await lastDialog().props.ctx.save(next);
        expect(host.plugin.settings).toBe(next);
        expect(onSaved).toHaveBeenCalledOnce();
    });
});
