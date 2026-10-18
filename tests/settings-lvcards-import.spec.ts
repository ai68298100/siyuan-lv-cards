import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import zh from "../public/i18n/zh-CN.json";
import en from "../public/i18n/en.json";
import { defaultSettings } from "../src/core/settings";
import Settings from "../src/ui/settings.svelte";

const fakes = vi.hoisted(() => ({
    detectSqlite: vi.fn(),
    confirm: vi.fn(),
    getNotebooks: vi.fn(),
    createNotebook: vi.fn(),
    createDoc: vi.fn(),
    sqlQuery: vi.fn(),
    getDecks: vi.fn(),
    getCards: vi.fn(),
    createDeck: vi.fn(),
    addCards: vi.fn(),
    setBlockAttrs: vi.fn(),
}));

vi.mock("siyuan", () => ({ showMessage: vi.fn() }));
vi.mock("../src/api/anki-host", () => ({ detectSqlite: fakes.detectSqlite, openSqliteFile: vi.fn() }));
vi.mock("../src/libs/dialog", () => ({ confirmDialog: vi.fn(), confirmDialogBool: fakes.confirm }));
vi.mock("../src/api/siyuan", () => ({
    getNotebooks: fakes.getNotebooks,
    createNotebook: fakes.createNotebook,
    createDocWithMd: fakes.createDoc,
    sqlQuery: fakes.sqlQuery,
    setBlockAttrs: fakes.setBlockAttrs,
}));
vi.mock("../src/api/riff", () => ({
    createRiffDeck: fakes.createDeck,
    getRiffDecks: fakes.getDecks,
    getRiffCards: fakes.getCards,
}));
vi.mock("../src/api/due-shared", () => ({
    addRiffCards: fakes.addCards,
    formatRiffCardEntryError: (_e: unknown, _t: unknown, message: string) => message,
}));

const ID = "20261018000000-abcdefg";
const DOC_ID = "20261018000001-abcdefg";
const NB_ID = "20261018000002-abcdefg";
const DECK_ID = "20261018000003-abcdefg";
const NEW_DECK_ID = "20261018000004-abcdefg";
const existingId = (n: number) => `20261018000000-${n.toString(36).padStart(7, "0")}`;
let existingMarkdown = new Map<string, string>();
let enrolledIDs: string[] = [];
const row = (id: string, markdown: string) => ({ id, markdown, root_id: DOC_ID, parent_id: DOC_ID, type: "p" });

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

function card(id: string, n: number, markdown = `Question ${n} ==Answer ${n}==`, kind: "qa" | "code" | "list" | "cloze" = "qa") {
    return { id, markdown, kind };
}

function packageJson(name: string, cards: ReturnType<typeof card>[]) {
    return JSON.stringify({
        format: "lvcards.v1",
        version: 1,
        createdAt: Date.now(),
        generator: "component-test",
        deck: { id: "pkg-deck", name },
        cards,
    });
}

function inputFor(view: ReturnType<typeof render>) {
    return view.container.querySelector<HTMLInputElement>("input[type=file][accept='.lvcards,.json,application/json']")!;
}

function notices(view: ReturnType<typeof render>) {
    return Array.from(view.container.querySelectorAll(".lv-notice"), node => node.textContent ?? "").join(" ");
}

async function choose(view: ReturnType<typeof render>, raw: string, name = "cards.lvcards") {
    const input = inputFor(view);
    Object.defineProperty(input, "files", { configurable: true, value: [new File([raw], name)] });
    await fireEvent.change(input);
}

function readyDefaults() {
    fakes.detectSqlite.mockReturnValue({ available: true });
    fakes.confirm.mockResolvedValue(true);
    fakes.getNotebooks.mockResolvedValue([{ id: NB_ID, name: "小驴闪卡/分享导入" }]);
    fakes.createNotebook.mockResolvedValue(NB_ID);
    fakes.createDoc.mockResolvedValue(DOC_ID);
    fakes.getDecks.mockResolvedValue([{ id: DECK_ID, name: "Demo", size: 0 }]);
    enrolledIDs = [];
    fakes.getCards.mockImplementation(async () => ({
        blocks: enrolledIDs.map(id => ({ id, content: "Rendered imported card" })),
        total: enrolledIDs.length,
        pageCount: enrolledIDs.length ? 1 : 0,
    }));
    existingMarkdown = new Map();
    fakes.sqlQuery.mockImplementation(async (sql: string) => {
        if (/where\s+root_id\s*=/i.test(sql)) return [row(ID, "Question 1 ==Answer 1==")];
        return [...sql.matchAll(/'(\d{14}-[a-z0-9]{7})'/g)]
            .map(match => match[1])
            .filter(id => existingMarkdown.has(id))
            .map(id => row(id, existingMarkdown.get(id)!));
    });
    fakes.createDeck.mockResolvedValue({ id: NEW_DECK_ID, name: "Demo" });
    fakes.addCards.mockImplementation(async (_deck: string, ids: string[]) => { enrolledIDs = [...ids]; return null; });
}

describe("Settings .lvcards import integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        readyDefaults();
        Object.defineProperty(window, "siyuan", { configurable: true, value: { languages: { cancel: "Cancel", confirm: "Save" } } });
    });
    afterEach(() => cleanup());

    it("reads every existing-card page, so a duplicate after card 500 is not written", async () => {
        const existing = Array.from({ length: 500 }, (_, i) => ({ id: existingId(i), content: `Rendered old ${i}` }));
        existingMarkdown = new Map(existing.map((item, i) => [item.id, `Old question ${i} ==Answer ${i}==`]));
        existingMarkdown.set(existingId(500), "Question 1 ==Answer 1==");
        fakes.getDecks.mockResolvedValue([{ id: DECK_ID, name: "Demo", size: 501 }]);
        fakes.getCards.mockImplementation(async (_deck: string, page: number) => page === 1
            ? { blocks: existing, total: 501, pageCount: 2 }
            : { blocks: [{ id: existingId(500), content: "Rendered text without answer markers" }], total: 501, pageCount: 2 });
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Demo", [card("pkg-1", 1)]));

        await waitFor(() => expect(notices(view)).toContain("均已存在"));
        expect(fakes.getCards).toHaveBeenCalledWith(DECK_ID, 2, 500);
        expect(fakes.confirm).not.toHaveBeenCalled();
        expect(fakes.createDoc).not.toHaveBeenCalled();
        expect(fakes.addCards).not.toHaveBeenCalled();
    });

    it("does not confirm or write when a later existing-card page fails", async () => {
        const existing = Array.from({ length: 500 }, (_, i) => ({ id: existingId(i), content: `Rendered old ${i}` }));
        existingMarkdown = new Map(existing.map((item, i) => [item.id, `Old question ${i} ==Answer ${i}==`]));
        fakes.getDecks.mockResolvedValue([{ id: DECK_ID, name: "Demo", size: 501 }]);
        fakes.getCards.mockImplementation(async (_deck: string, page: number) => {
            if (page === 1) return { blocks: existing, total: 501, pageCount: 2 };
            throw new Error("page two unavailable");
        });
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Demo", [card("pkg-1", 1)]));

        await waitFor(() => expect(notices(view)).toContain(zh.settings.lvcardsImportIncomplete));
        expect(fakes.confirm).not.toHaveBeenCalled();
        expect(fakes.createDoc).not.toHaveBeenCalled();
        expect(fakes.addCards).not.toHaveBeenCalled();
    });

    it("does not confirm or write when existing Markdown cannot be read", async () => {
        fakes.getCards.mockResolvedValue({ blocks: [{ id: existingId(0), content: "Rendered content" }], total: 1, pageCount: 1 });
        fakes.sqlQuery.mockRejectedValue(new Error("existing Markdown read failed"));
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Demo", [card("pkg-1", 1)]));

        await waitFor(() => expect(notices(view)).toContain(zh.settings.lvcardsImportIncomplete));
        expect(fakes.confirm).not.toHaveBeenCalled();
        expect(fakes.createDoc).not.toHaveBeenCalled();
        expect(fakes.addCards).not.toHaveBeenCalled();
    });

    it.each([["zh-CN", zh], ["en", en]] as const)("rejects a mixed valid and damaged package before any host write in %s", async (_locale, i18n) => {
        const damaged = JSON.stringify({
            format: "lvcards.v1",
            version: 1,
            deck: { id: "deck", name: "Damaged" },
            cards: [card("ok", 1), { id: "bad", kind: "qa", markdown: "" }],
        });
        const view = render(Settings, { ctx: makeCtx(i18n), initialSection: "imports" });
        await choose(view, damaged);

        await waitFor(() => expect(notices(view)).toContain(i18n.settings.lvcardsImportFail.split("${m}")[0].trim()));
        expect(fakes.getDecks).not.toHaveBeenCalled();
        expect(fakes.confirm).not.toHaveBeenCalled();
        expect(fakes.getNotebooks).not.toHaveBeenCalled();
        expect(fakes.createNotebook).not.toHaveBeenCalled();
        expect(fakes.createDoc).not.toHaveBeenCalled();
        expect(fakes.createDeck).not.toHaveBeenCalled();
        expect(fakes.addCards).not.toHaveBeenCalled();
    });

    it.each([
        "Question without an answer marker",
        "==answer only==",
    ])("rejects a parsed card without a valid question and answer marker before confirmation: %s", async markdown => {
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Invalid card", [card("invalid", 1, markdown)]));

        await waitFor(() => expect(notices(view)).toContain(zh.settings.lvcardsImportInvalid));
        expect(fakes.confirm).not.toHaveBeenCalled();
        expect(fakes.getNotebooks).not.toHaveBeenCalled();
        expect(fakes.createNotebook).not.toHaveBeenCalled();
        expect(fakes.createDoc).not.toHaveBeenCalled();
        expect(fakes.createDeck).not.toHaveBeenCalled();
        expect(fakes.addCards).not.toHaveBeenCalled();
    });

    it("escapes an untrusted deck name in the confirmation preview", async () => {
        fakes.getDecks.mockResolvedValue([]);
        fakes.confirm.mockResolvedValue(false);
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson(`<img src=x onerror=alert(1)>`, [card("pkg-1", 1)]));

        await waitFor(() => expect(fakes.confirm).toHaveBeenCalledOnce());
        const content = String(fakes.confirm.mock.calls[0][0]?.content ?? "");
        expect(content).toContain("&lt;img");
        expect(content).not.toContain("<img");
        const preview = document.createElement("div");
        preview.innerHTML = content;
        expect(preview.querySelector("img")).toBeNull();
        expect(fakes.createDoc).not.toHaveBeenCalled();
    });

    it("preserves placeholder-shaped text in a literal deck name", async () => {
        fakes.getDecks.mockResolvedValue([]);
        fakes.confirm.mockResolvedValue(false);
        const name = "Literal ${n} ${dup} ${total} ${deck}";
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson(name, [card("pkg-1", 1)]));

        await waitFor(() => expect(fakes.confirm).toHaveBeenCalledOnce());
        expect(fakes.confirm.mock.calls[0][0].content).toContain(name);
        expect(fakes.createDoc).not.toHaveBeenCalled();
    });

    it("escapes a malicious Obsidian filename in its confirmation preview", async () => {
        fakes.confirm.mockResolvedValue(false);
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        const input = view.container.querySelector<HTMLInputElement>("input[type=file][accept='.md,.markdown,text/markdown']")!;
        const file = new File(["#flashcards\nQuestion :: Answer\n"], "<img src=x onerror=alert(1)>.md");
        Object.defineProperty(input, "files", { configurable: true, value: [file] });
        await fireEvent.change(input);

        await waitFor(() => expect(fakes.confirm).toHaveBeenCalledOnce());
        const content = String(fakes.confirm.mock.calls[0][0].content);
        expect(content).toContain("&lt;img");
        expect(content).not.toContain("<img");
        const preview = document.createElement("div");
        preview.innerHTML = content;
        expect(preview.querySelector("img")).toBeNull();
        expect(fakes.createDoc).not.toHaveBeenCalled();
        expect(fakes.addCards).not.toHaveBeenCalled();
    });

    it.each([
        ["fewer blocks", [row(ID, "Question 1 ==Answer 1==")], 2],
        ["more blocks", [row(ID, "Question 1 ==Answer 1=="), row(existingId(2), "Question 2 ==Answer 2==")], 1],
        ["same count but wrong markdown", [row(ID, "Wrong ==Answer==")], 1],
        ["same count but changed internal whitespace", [row(ID, "Question 1  ==Answer 1==")], 1],
        ["empty block id", [row("", "Question 1 ==Answer 1==")], 1],
        ["duplicate block id", [row(ID, "Question 1 ==Answer 1=="), row(ID, "Question 2 ==Answer 2==")], 2],
        ["nested block from another parent", [{ ...row(ID, "Question 1 ==Answer 1=="), parent_id: existingId(25) }], 1],
    ] as const)("stops safely for %s and never adds cards", async (_name, rows, count) => {
        fakes.sqlQuery.mockResolvedValue(rows);
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Demo", Array.from({ length: count }, (_, i) => card(`pkg-${i + 1}`, i + 1))));
        await waitFor(() => expect(view.container.querySelector(".lv-notice--warn")).toBeTruthy());
        expect(fakes.addCards).not.toHaveBeenCalled();
    });

    it.each([
        ["notebook", () => fakes.createNotebook.mockResolvedValue("")],
        ["deck", () => fakes.createDeck.mockResolvedValue({ id: "" })],
    ] as const)("reports an empty %s id instead of claiming success", async (_name, configure) => {
        fakes.getNotebooks.mockResolvedValue([]);
        fakes.getDecks.mockResolvedValue([]);
        configure();
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Demo", [card("pkg-1", 1)]));
        await waitFor(() => expect(notices(view)).toMatch(/失败|空|创建/));
        expect(notices(view)).not.toContain("已成功导入");
        expect(fakes.addCards).not.toHaveBeenCalled();
    });

    it("imports a normal package with the exact block count and IDs", async () => {
        const rows = [row(existingId(1), "Question 1 ==Answer 1=="), row(existingId(2), "Question 2 ==Answer 2==")];
        fakes.sqlQuery.mockResolvedValue(rows);
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Demo", [card("pkg-1", 1), card("pkg-2", 2)]));

        await waitFor(() => expect(fakes.addCards).toHaveBeenCalledOnce());
        expect(fakes.addCards).toHaveBeenCalledWith(DECK_ID, rows.map(row => row.id));
        expect(notices(view)).toContain("已成功导入 2 张");
    });

    it("matches valid imported Markdown when SQL returns the blocks in a different order", async () => {
        const first = row(existingId(1), "Question 1 ==Answer 1==");
        const second = row(existingId(2), "Question 2 ==Answer 2==");
        fakes.sqlQuery.mockResolvedValue([second, first]);
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Demo", [card("pkg-1", 1), card("pkg-2", 2)]));

        await waitFor(() => expect(fakes.addCards).toHaveBeenCalledOnce());
        const ids = fakes.addCards.mock.calls[0][1] as string[];
        expect(ids).toHaveLength(2);
        expect(new Set(ids)).toEqual(new Set([first.id, second.id]));
        expect(notices(view)).toContain("已成功导入 2 张");
    });

    it.each([
        ["code", "c", "```ts\nconst answer = ==1==;\n```"],
        ["list", "l", "- First ==answer==\n- Second item"],
    ] as const)("accepts a single direct %s block with its source Markdown intact", async (kind, type, markdown) => {
        fakes.sqlQuery.mockResolvedValue([{ ...row(ID, markdown), type }]);
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Demo", [card("pkg-1", 1, markdown, kind)]));

        await waitFor(() => expect(notices(view)).toContain("已成功导入 1 张"));
        expect(fakes.addCards).toHaveBeenCalledWith(DECK_ID, [ID]);
    });

    it("does not mislabel an ID conflict with changed content as all duplicates", async () => {
        fakes.confirm.mockResolvedValue(false);
        existingMarkdown.set(existingId(0), "Old question ==Old answer==");
        fakes.getCards.mockResolvedValue({ blocks: [{ id: existingId(0), content: "Rendered old question" }], total: 1, pageCount: 1 });
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Demo", [card(existingId(0), 1)]));

        await waitFor(() => expect(notices(view)).toMatch(/冲突|修改|变动|变更/));
        expect(notices(view)).not.toContain("均已存在");
        expect(fakes.createDoc).not.toHaveBeenCalled();
        expect(fakes.addCards).not.toHaveBeenCalled();
    });

    it("does not write when confirmation is cancelled", async () => {
        fakes.confirm.mockResolvedValue(false);
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Demo", [card("pkg-1", 1)]));
        await waitFor(() => expect(fakes.confirm).toHaveBeenCalledOnce());
        expect(fakes.createDoc).not.toHaveBeenCalled();
        expect(fakes.addCards).not.toHaveBeenCalled();
    });

    it("reports an add failure honestly and releases the busy gate for retry", async () => {
        fakes.addCards.mockRejectedValueOnce(new Error("riff add failed"));
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        const input = inputFor(view);
        await choose(view, packageJson("Demo", [card("pkg-1", 1)]));
        await waitFor(() => expect(notices(view)).toContain("riff add failed"));
        const button = view.getByRole("button", { name: zh.settings.lvcardsImportPick }) as HTMLButtonElement;
        await waitFor(() => expect(button.disabled).toBe(false));
        expect(input.disabled).toBe(false);
        expect(notices(view)).not.toContain("已成功导入");
    });

    it.each(["missing ID", "readback rejected"] as const)("does not claim successful enrollment when add resolves but %s", async (mode) => {
        const rows = [row(existingId(1), "Question 1 ==Answer 1=="), row(existingId(2), "Question 2 ==Answer 2==")];
        fakes.sqlQuery.mockResolvedValue(rows);
        fakes.getCards.mockImplementation(async () => {
            if (enrolledIDs.length && mode === "readback rejected") throw new Error("post-add readback failed");
            if (enrolledIDs.length) return { blocks: [{ id: enrolledIDs[0], content: "First imported card only" }], total: 1, pageCount: 1 };
            return { blocks: [], total: 0, pageCount: 0 };
        });
        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageJson("Demo", [card("pkg-1", 1), card("pkg-2", 2)]));

        await waitFor(() => expect(fakes.addCards).toHaveBeenCalledOnce());
        await waitFor(() => expect(notices(view)).toContain(zh.settings.lvcardsImportUncertain));
        expect(notices(view)).not.toContain("已成功导入");
        const button = view.getByRole("button", { name: zh.settings.lvcardsImportPick }) as HTMLButtonElement;
        await waitFor(() => expect(button.disabled).toBe(false));
        expect(inputFor(view).disabled).toBe(false);
        expect(fakes.createDoc).toHaveBeenCalledOnce();
    });

    it("restores memo and tags metadata onto created blocks upon successful import", async () => {
        const rows = [
            row(existingId(1), "Question 1 ==Answer 1=="),
            row(existingId(2), "Question 2 ==Answer 2=="),
        ];
        fakes.sqlQuery.mockResolvedValue(rows);

        const packageWithMetadata = JSON.stringify({
            format: "lvcards.v1",
            version: 1,
            createdAt: 123456789,
            generator: "test",
            deck: { id: "d-meta", name: "元数据卡组" },
            cards: [
                {
                    id: "pkg-1",
                    markdown: "Question 1 ==Answer 1==",
                    kind: "cloze",
                    memo: "这是第一张卡的助记便签",
                    tags: ["标签A", "标签B"],
                },
                {
                    id: "pkg-2",
                    markdown: "Question 2 ==Answer 2==",
                    kind: "cloze",
                },
            ],
        });

        const view = render(Settings, { ctx: makeCtx(), initialSection: "imports" });
        await choose(view, packageWithMetadata);

        await waitFor(() => expect(notices(view)).toContain("已成功导入 2 张新卡片"));
        expect(fakes.setBlockAttrs).toHaveBeenCalledOnce();
        expect(fakes.setBlockAttrs).toHaveBeenCalledWith(existingId(1), {
            memo: "这是第一张卡的助记便签",
            tags: "标签A,标签B",
            "custom-card-tags": "标签A,标签B",
        });
    });
});
