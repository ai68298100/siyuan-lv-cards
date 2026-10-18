import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import zh from "../public/i18n/zh-CN.json";
import en from "../public/i18n/en.json";
import { defaultSettings } from "../src/core/settings";
import * as ankiPackage from "../src/core/anki-package";
import * as lvCardsPackage from "../src/core/lvcards-package";
import * as obsidianImport from "../src/core/obsidian-import";
import { showMessage } from "siyuan";
import Settings from "../src/ui/settings.svelte";

const mocks = vi.hoisted(() => ({
    detectSqlite: vi.fn(),
    confirm: vi.fn(),
    getNotebooks: vi.fn(),
    createDoc: vi.fn(),
    addCards: vi.fn(),
}));

vi.mock("siyuan", () => ({ showMessage: vi.fn() }));
vi.mock("../src/api/anki-host", () => ({ detectSqlite: mocks.detectSqlite, openSqliteFile: vi.fn() }));
vi.mock("../src/libs/dialog", () => ({ confirmDialog: vi.fn(), confirmDialogBool: mocks.confirm }));
vi.mock("../src/api/siyuan", () => ({
    getNotebooks: mocks.getNotebooks,
    createNotebook: vi.fn(),
    createDocWithMd: mocks.createDoc,
    sqlQuery: vi.fn(),
}));
vi.mock("../src/api/riff", () => ({ createRiffDeck: vi.fn(), getRiffDecks: vi.fn(), getRiffCards: vi.fn() }));
vi.mock("../src/api/due-shared", () => ({ addRiffCards: mocks.addCards, formatRiffCardEntryError: (_e: unknown, _t: unknown, message: string) => message }));

function makeCtx(i18n = zh) {
    return {
        i18n,
        settings: defaultSettings(),
        save: vi.fn(),
        close: vi.fn(),
        exportRevlog: vi.fn(),
        clearRevlog: vi.fn(),
        backup: { export: vi.fn(), restore: vi.fn(async () => {}) },
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
}

function sectionTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll(".lv-secthead > span:first-child"), el => el.firstChild?.textContent?.trim() ?? "");
}

function fileInput(container: HTMLElement, accept: string): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>(`input[type="file"][accept="${accept}"]`);
    expect(input).toBeTruthy();
    return input!;
}

describe("settings import workflow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.detectSqlite.mockReturnValue({ available: true });
        mocks.confirm.mockResolvedValue(false);
        Object.defineProperty(window, "siyuan", { configurable: true, value: { languages: { cancel: "Cancel", confirm: "Save" } } });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it.each([["zh-CN", zh], ["en", en]] as const)("opens the import task with only migration and data sections in %s", (_locale, i18n) => {
        const view = render(Settings, { ctx: makeCtx(i18n), initialSection: "imports" });

        expect(sectionTitles(view.container)).toEqual([i18n.settings.ankiSection, i18n.settings.dataSection]);
        expect(view.getByText(i18n.settings.importsTitle)).toBeTruthy();
        expect(view.getByText(i18n.settings.importsHint)).toBeTruthy();
        expect(view.getByRole("button", { name: i18n.settings.showAllSettings })).toBeTruthy();
        expect(view.queryByRole("button", { name: i18n.settings.personaImport })).toBeNull();
    });

    it.each([["zh-CN", zh], ["en", en]] as const)("finds card formats, review logs, backup, and personas by their visible labels in %s", async (_locale, i18n) => {
        const view = render(Settings, { ctx: makeCtx(i18n) });
        const search = view.getByRole("textbox", { name: i18n.settings.searchPlaceholder });
        const queries = [
            [i18n.settings.lvcardsImportLabel, i18n.settings.ankiSection],
            [i18n.settings.obImportLabel, i18n.settings.ankiSection],
            [i18n.settings.ankiImport, i18n.settings.ankiSection],
            [i18n.settings.importMerge, i18n.settings.dataSection],
            [i18n.settings.importCsv, i18n.settings.dataSection],
            [i18n.settings.backupExport, i18n.settings.dataSection],
            [i18n.settings.personaImport, i18n.settings.personaSection],
        ];
        for (const [query, title] of queries) {
            await fireEvent.input(search, { target: { value: query } });
            expect(sectionTitles(view.container)).toEqual([title]);
        }
    });

    it.each([["zh-CN", zh], ["en", en]] as const)("recovers from an unmatched task search without broadening the scope in %s", async (_locale, i18n) => {
        const view = render(Settings, { ctx: makeCtx(i18n), initialSection: "imports" });
        const search = view.getByRole("textbox", { name: i18n.settings.searchPlaceholder });
        // This term exists outside the migration task, so the empty state must
        // respect the task scope rather than revealing unrelated settings.
        await fireEvent.input(search, { target: { value: i18n.settings.personaImport } });

        expect(sectionTitles(view.container)).toEqual([]);
        expect(view.getByRole("status").textContent).toBe(i18n.settings.searchEmpty);
        expect(view.getByRole("button", { name: i18n.settings.showAllSettings })).toBeTruthy();

        await fireEvent.input(search, { target: { value: "" } });

        expect(view.queryByRole("status")).toBeNull();
        expect(sectionTitles(view.container)).toEqual([i18n.settings.ankiSection, i18n.settings.dataSection]);
    });

    it.each([["zh-CN", zh], ["en", en]] as const)("recovers the complete settings after clearing an unmatched search in %s", async (_locale, i18n) => {
        const view = render(Settings, { ctx: makeCtx(i18n) });
        const originalSections = sectionTitles(view.container);
        const search = view.getByRole("textbox", { name: i18n.settings.searchPlaceholder });
        await fireEvent.input(search, { target: { value: "no-setting-matches-865092" } });

        expect(sectionTitles(view.container)).toEqual([]);
        expect(view.getByRole("status").textContent).toBe(i18n.settings.searchEmpty);

        await fireEvent.input(search, { target: { value: "" } });

        expect(view.queryByText(i18n.settings.searchEmpty)).toBeNull();
        expect(sectionTitles(view.container)).toEqual(originalSections);
        expect(originalSections).toContain(i18n.settings.personaSection);
        expect(originalSections).toContain(i18n.settings.ankiSection);
    });

    it("shows all settings, clears the search, and returns focus without discarding draft edits", async () => {
        const ctx = makeCtx();
        const view = render(Settings, { ctx, initialSection: "imports" });
        const url = "http://127.0.0.1:9000";
        await fireEvent.input(view.getByDisplayValue(ctx.settings.ankiClientUrl), { target: { value: url } });
        const search = view.getByRole("textbox", { name: zh.settings.searchPlaceholder }) as HTMLInputElement;
        await fireEvent.input(search, { target: { value: zh.settings.backupExport } });
        expect(sectionTitles(view.container)).toEqual([zh.settings.dataSection]);

        await fireEvent.click(view.getByRole("button", { name: zh.settings.showAllSettings }));

        expect(search.value).toBe("");
        expect(document.activeElement).toBe(search);
        expect(sectionTitles(view.container)).toContain(zh.settings.personaSection);
        expect(view.getByDisplayValue(url)).toBeTruthy();
        expect(ctx.settings.ankiClientUrl).not.toBe(url);
        await fireEvent.click(view.getByRole("button", { name: "Save", exact: true }));
        await waitFor(() => expect(ctx.save).toHaveBeenCalledWith(expect.objectContaining({ ankiClientUrl: url })));
    });

    it("exposes all four file pickers through named native buttons", async () => {
        const view = render(Settings, { ctx: makeCtx() });
        const pickers = [
            [zh.settings.personaImport, "application/json,.json"],
            [zh.settings.ankiImportPick, ".apkg,.colpkg"],
            [zh.settings.lvcardsImportPick, ".lvcards,.json,application/json"],
            [zh.settings.obImportPick, ".md,.markdown,text/markdown"],
        ];
        for (const [name, accept] of pickers) {
            const input = fileInput(view.container, accept);
            const click = vi.spyOn(input, "click").mockImplementation(() => {});
            const button = view.getByRole("button", { name, exact: true }) as HTMLButtonElement;
            expect(button.tagName).toBe("BUTTON");
            expect(button.type).toBe("button");
            expect(button.disabled).toBe(false);
            expect(input.hidden || input.style.display === "none").toBe(true);
            button.focus();
            expect(document.activeElement).toBe(button);
            await fireEvent.click(button);
            expect(click).toHaveBeenCalledOnce();
        }
    });

    it("keeps other migration paths available when local Anki parsing is unsupported", () => {
        mocks.detectSqlite.mockReturnValue({ available: false, reason: "SQLite test boundary" });
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });

        expect(view.queryByRole("button", { name: zh.settings.ankiImportPick })).toBeNull();
        expect(view.getByRole("status").textContent).toContain("SQLite test boundary");
        expect(view.getByRole("button", { name: zh.settings.lvcardsImportPick })).toBeTruthy();
        expect(view.getByRole("button", { name: zh.settings.obImportPick })).toBeTruthy();
        expect(sectionTitles(view.container)).toContain(zh.settings.dataSection);
    });

    it("names the connection, data export, restore, and file import controls in the migration task", () => {
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });

        expect(view.getByRole("textbox", { name: zh.settings.ankiUrl })).toBeTruthy();
        // Password and file inputs have no implicit ARIA role; their explicit
        // labels must still identify the correct native control.
        expect((view.getByLabelText(zh.settings.ankiKey) as HTMLInputElement).type).toBe("password");
        const buttonNames = [
            zh.settings.ankiTest,
            zh.settings.redetectV2,
            zh.settings.suspendedRestore,
            zh.settings.exportSettings,
            zh.settings.clearRevlog,
            `${zh.settings.exportRevlog} · JSON`,
            `${zh.settings.exportRevlog} · CSV`,
            `${zh.settings.backupExport} · JSON`,
        ];
        for (const name of buttonNames) {
            expect(view.getByRole("button", { name, exact: true })).toBeTruthy();
        }
        for (const [name, accept] of [
            [zh.settings.importMerge, ".json,application/json"],
            [zh.settings.importCsv, ".csv,text/csv"],
            [zh.settings.backupRestore, ".json,application/json"],
        ]) {
            const input = view.getByLabelText(name, { exact: true }) as HTMLInputElement;
            expect(input.tagName).toBe("INPUT");
            expect(input.type).toBe("file");
            expect(input.accept).toBe(accept);
        }
    });

    it("treats empty file-change events as cancellations for every named import entry", async () => {
        const ctx = makeCtx();
        const settingsBefore = JSON.stringify(ctx.settings);
        const view = render(Settings, { ctx });
        const parseAnki = vi.spyOn(ankiPackage, "parseAnkiPackage");
        const parseLvCards = vi.spyOn(lvCardsPackage, "parseLvCardsPackage");
        const planObsidian = vi.spyOn(obsidianImport, "planObsidianImport");
        const pickers = [
            [zh.settings.personaImport, "application/json,.json"],
            [zh.settings.ankiImportPick, ".apkg,.colpkg"],
            [zh.settings.lvcardsImportPick, ".lvcards,.json,application/json"],
            [zh.settings.obImportPick, ".md,.markdown,text/markdown"],
        ];

        for (const [name, accept] of pickers) {
            const input = fileInput(view.container, accept);
            const button = view.getByRole("button", { name, exact: true }) as HTMLButtonElement;
            Object.defineProperty(input, "files", { configurable: true, value: [] });
            // A synthetic empty change exercises our cancellation handler. It
            // does not open or validate the operating system file chooser.
            await fireEvent.change(input);
            expect(button.disabled).toBe(false);
            expect(button.getAttribute("aria-busy")).not.toBe("true");
            expect(input.disabled).toBe(false);
        }

        expect(parseAnki).not.toHaveBeenCalled();
        expect(parseLvCards).not.toHaveBeenCalled();
        expect(planObsidian).not.toHaveBeenCalled();
        expect(mocks.detectSqlite).toHaveBeenCalledOnce();
        expect(mocks.confirm).not.toHaveBeenCalled();
        expect(mocks.getNotebooks).not.toHaveBeenCalled();
        expect(mocks.createDoc).not.toHaveBeenCalled();
        expect(mocks.addCards).not.toHaveBeenCalled();
        expect(showMessage).not.toHaveBeenCalled();
        expect(ctx.save).not.toHaveBeenCalled();
        expect(ctx.backup.restore).not.toHaveBeenCalled();
        expect(ctx.importRevlogMerge).not.toHaveBeenCalled();
        expect(ctx.importRevlogCsv).not.toHaveBeenCalled();
        expect(JSON.stringify(ctx.settings)).toBe(settingsBefore);
        expect(view.queryByText(zh.settings.ankiImportParsing)).toBeNull();
    });

    it("resets a share-package selection, blocks overlapping reads, and permits choosing the same file again", async () => {
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        const input = fileInput(view.container, ".lvcards,.json,application/json");
        const button = view.getByRole("button", { name: zh.settings.lvcardsImportPick }) as HTMLButtonElement;
        let finishRead!: (text: string) => void;
        const text = vi.fn(() => new Promise<string>(resolve => { finishRead = resolve; }));
        const file = { name: "repeated.lvcards", text } as unknown as File;
        Object.defineProperty(input, "files", { configurable: true, value: [file] });
        // File chooser values are set by the browser. A writable stand-in lets us
        // verify the reset contract without invoking the operating system picker.
        Object.defineProperty(input, "value", { configurable: true, writable: true, value: "repeated.lvcards" });

        await fireEvent.change(input);
        expect(input.value).toBe("");
        expect(text).toHaveBeenCalledOnce();
        expect(button.disabled).toBe(true);
        expect(input.disabled).toBe(true);
        input.value = "repeated.lvcards";
        await fireEvent.change(input);
        expect(input.value).toBe("");
        expect(text).toHaveBeenCalledOnce();

        finishRead("not a package");
        await waitFor(() => expect(button.disabled).toBe(false));
        expect(input.disabled).toBe(false);
        text.mockResolvedValueOnce("not a package");
        input.value = "repeated.lvcards";
        await fireEvent.change(input);
        await waitFor(() => expect(text).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(button.disabled).toBe(false));
        expect(input.value).toBe("");
        expect(mocks.confirm).not.toHaveBeenCalled();
        expect(mocks.getNotebooks).not.toHaveBeenCalled();
        expect(mocks.createDoc).not.toHaveBeenCalled();
        expect(mocks.addCards).not.toHaveBeenCalled();
    });
});
