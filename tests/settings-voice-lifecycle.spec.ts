import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/svelte";
import { defaultSettings } from "../src/core/settings";
import Settings from "../src/ui/settings.svelte";

vi.mock("siyuan", () => ({ showMessage: vi.fn() }));

function translated(path: string): any {
    const fn = () => path;
    return new Proxy(fn, {
        get(_target, property) {
            if (property === "replace") return (search: string, replacement: string) => path.replace(search, replacement);
            if (property === "toString" || property === "valueOf" || property === Symbol.toPrimitive) return () => path;
            if (property === "then") return undefined;
            return translated(`${path}.${String(property)}`);
        },
        apply: () => path,
    });
}

describe("settings speech voice lifecycle", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("subscribes to voice changes without replacing the global handler and removes its listener on unmount", async () => {
        const addEventListener = vi.fn();
        const removeEventListener = vi.fn();
        const originalHandler = vi.fn();
        let availableVoices = [{ name: "Initial voice" }];
        const synthesis = {
            addEventListener,
            removeEventListener,
            getVoices: vi.fn(() => availableVoices),
            onvoiceschanged: originalHandler,
        };
        Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
        Object.defineProperty(window, "siyuan", { configurable: true, value: { languages: { cancel: "Cancel", confirm: "Confirm" } } });

        const ctx = {
            i18n: translated("t"),
            settings: defaultSettings(),
            save: vi.fn(),
            close: vi.fn(),
            exportRevlog: vi.fn(),
            clearRevlog: vi.fn(),
            redetectV2: vi.fn(async () => ""),
            getV2Status: vi.fn(() => ""),
            getSuspendedCount: vi.fn(() => 0),
            restoreAllSuspended: vi.fn(),
            testAnkiClient: vi.fn(async () => ""),
            storageStats: vi.fn(() => []),
            exportSettings: vi.fn(),
            getNotebooks: vi.fn(async () => []),
            exportRevlogCsv: vi.fn(),
            importRevlogCsv: vi.fn(async () => ({ added: 0, skipped: 0 })),
            importRevlogMerge: vi.fn(async () => ({ added: 0, skipped: 0, forks: 0 })),
        };

        const view = render(Settings, { ctx });
        await waitFor(() => expect(addEventListener).toHaveBeenCalledWith("voiceschanged", expect.any(Function)));
        const listener = addEventListener.mock.calls[0][1];
        expect(synthesis.onvoiceschanged).toBe(originalHandler);
        expect(synthesis.getVoices).toHaveBeenCalledOnce();
        availableVoices = [{ name: "Updated voice" }];
        listener();
        await waitFor(() => expect(view.getByRole("option", { name: "Updated voice" })).toBeTruthy());

        view.unmount();

        expect(removeEventListener).toHaveBeenCalledWith("voiceschanged", listener);
    });

    it("renders appearance live preview card reflecting font scale and rating style", () => {
        const customSettings = {
            ...defaultSettings(),
            cardFontScale: 1.15,
            ratingStyle: "four" as const,
        };
        const ctx = {
            i18n: translated("t"),
            settings: customSettings,
            save: vi.fn(),
            close: vi.fn(),
            exportRevlog: vi.fn(),
            clearRevlog: vi.fn(),
            redetectV2: vi.fn(async () => ""),
            getV2Status: vi.fn(() => ""),
            getSuspendedCount: vi.fn(() => 0),
            restoreAllSuspended: vi.fn(),
            testAnkiClient: vi.fn(async () => ""),
            storageStats: vi.fn(() => []),
            exportSettings: vi.fn(),
            getNotebooks: vi.fn(async () => []),
            exportRevlogCsv: vi.fn(),
            importRevlogCsv: vi.fn(async () => ({ added: 0, skipped: 0 })),
            importRevlogMerge: vi.fn(async () => ({ added: 0, skipped: 0, forks: 0 })),
        };
        const view = render(Settings, { ctx });
        const previewCard = view.container.querySelector(".lv-settings-preview-rating");
        expect(previewCard).toBeTruthy();
        expect(view.container.querySelector(".lv-card2[style*='font-size: 1.15em']")).toBeTruthy();
        view.unmount();
    });
});
