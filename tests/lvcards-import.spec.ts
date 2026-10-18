import { describe, expect, it, vi } from "vitest";
import {
    applyPackageCardMetadata,
    pairLvCardsBlocks,
    readLvCardsDeckIDs,
    readLvCardsExisting,
    sqlString,
} from "../src/core/lvcards-import";
import type { LvPackageCard } from "../src/core/lvcards-package";

const incompleteDeck = { name: "LvCardsImportError", code: "incomplete-deck" };
const blockMismatch = { name: "LvCardsImportError", code: "block-mismatch" };
const cards: LvPackageCard[] = [
    { id: "package-qa", markdown: "Question\n\nAnswer", kind: "qa" },
    { id: "package-code", markdown: "```ts\nconst n = 1;\n```", kind: "code" },
    { id: "package-list", markdown: "- first\n- second", kind: "list" },
];
const sourceRow = (id: string, markdown: string, overrides: Record<string, unknown> = {}) => ({
    id,
    markdown,
    root_id: "import-root",
    parent_id: "import-root",
    type: "p",
    ...overrides,
});

describe("readLvCardsDeckIDs", () => {
    it("reads every page before returning IDs, including decks larger than 500 cards", async () => {
        const ids = Array.from({ length: 501 }, (_, index) => `card-${index}`);
        const readPage = vi.fn()
            .mockResolvedValueOnce({ blocks: ids.slice(0, 500).map(id => ({ id })), total: 501, pageCount: 2 })
            .mockResolvedValueOnce({ blocks: [{ id: ids[500] }], total: 501, pageCount: 2 });

        await expect(readLvCardsDeckIDs("deck", readPage)).resolves.toEqual(ids);
        expect(readPage.mock.calls).toEqual([["deck", 1, 500], ["deck", 2, 500]]);
    });

    it.each([0, 1])("accepts an empty deck with pageCount %i", async (pageCount) => {
        const readPage = vi.fn().mockResolvedValue({ blocks: [], total: 0, pageCount });
        await expect(readLvCardsDeckIDs("deck", readPage)).resolves.toEqual([]);
        expect(readPage).toHaveBeenCalledTimes(1);
    });

    it("rejects a blank deck identity without requesting host data", async () => {
        const readPage = vi.fn();
        await expect(readLvCardsDeckIDs(" \t", readPage)).rejects.toMatchObject(incompleteDeck);
        expect(readPage).not.toHaveBeenCalled();
    });

    it.each([
        { total: -1, pageCount: 1 },
        { total: 0.5, pageCount: 1 },
        { total: Infinity, pageCount: 1 },
        { total: Number.MAX_SAFE_INTEGER + 1, pageCount: 1 },
        { total: 1, pageCount: -1 },
        { total: 1, pageCount: 0.5 },
        { total: 1, pageCount: NaN },
        { total: 1, pageCount: 0 },
        { total: 1, pageCount: 2 },
        { total: 0, pageCount: 2 },
    ])("rejects invalid pagination metadata (%j)", async (metadata) => {
        const readPage = vi.fn().mockResolvedValue({ blocks: [{ id: "card" }], ...metadata });
        await expect(readLvCardsDeckIDs("deck", readPage)).rejects.toMatchObject(incompleteDeck);
        expect(readPage).toHaveBeenCalledTimes(1);
    });

    it.each([
        { total: 3, pageCount: 2 },
        { total: 2, pageCount: 1 },
    ])("rejects metadata changing midway through a read (%j)", async (metadata) => {
        const readPage = vi.fn()
            .mockResolvedValueOnce({ blocks: [{ id: "first" }], total: 2, pageCount: 2 })
            .mockResolvedValueOnce({ blocks: [{ id: "second" }], ...metadata });
        await expect(readLvCardsDeckIDs("deck", readPage)).rejects.toMatchObject(incompleteDeck);
        expect(readPage).toHaveBeenCalledTimes(2);
    });

    it.each([
        { label: "empty nonempty page", blocks: [], total: 1 },
        { label: "missing ID", blocks: [{}], total: 1 },
        { label: "blank ID", blocks: [{ id: " " }], total: 1 },
        { label: "nonstring ID", blocks: [{ id: 1 }], total: 1 },
        { label: "duplicate ID", blocks: [{ id: "same" }, { id: "same" }], total: 2 },
        { label: "too few cards", blocks: [{ id: "first" }], total: 2 },
        { label: "too many cards", blocks: [{ id: "first" }, { id: "second" }], total: 1 },
        { label: "unexpected card in empty deck", blocks: [{ id: "first" }], total: 0 },
    ])("rejects incomplete page data: $label", async ({ blocks, total }) => {
        const readPage = vi.fn().mockResolvedValue({ blocks, total, pageCount: 1 });
        await expect(readLvCardsDeckIDs("deck", readPage)).rejects.toMatchObject(incompleteDeck);
    });

    it("rejects an empty later page and duplicate IDs across page boundaries", async () => {
        for (const blocks of [[], [{ id: "first" }]]) {
            const readPage = vi.fn()
                .mockResolvedValueOnce({ blocks: [{ id: "first" }], total: 2, pageCount: 2 })
                .mockResolvedValueOnce({ blocks, total: 2, pageCount: 2 });
            await expect(readLvCardsDeckIDs("deck", readPage)).rejects.toMatchObject(incompleteDeck);
        }
    });
});

describe("readLvCardsExisting", () => {
    const readTwoCards = () => vi.fn().mockResolvedValue({
        blocks: [{ id: "first" }, { id: "second" }], total: 2, pageCount: 1,
    });

    it("reads source Markdown rather than rendered content, without requiring SQL row order", async () => {
        const rows = [
            { id: "second", markdown: "source ==answer==", content: "rendered answer" },
            { id: "first", markdown: "Question\n\nAnswer", content: "Question Answer" },
        ];
        const query = vi.fn().mockResolvedValue(rows);

        await expect(readLvCardsExisting("deck", readTwoCards(), query)).resolves.toEqual([
            { id: "second", markdown: "source ==answer==" },
            { id: "first", markdown: "Question\n\nAnswer" },
        ]);
        expect(query.mock.calls[0][0]).toMatch(/SELECT id, markdown FROM blocks .* LIMIT 2$/);
    });

    it.each([
        { label: "missing row", rows: [{ id: "first", markdown: "first" }] },
        { label: "duplicate row ID", rows: [{ id: "first", markdown: "first" }, { id: "first", markdown: "other" }] },
        { label: "unknown row ID", rows: [{ id: "first", markdown: "first" }, { id: "unknown", markdown: "second" }] },
        { label: "missing row ID", rows: [{ id: "first", markdown: "first" }, { markdown: "second" }] },
        { label: "nonstring Markdown", rows: [{ id: "first", markdown: "first" }, { id: "second", markdown: 42 }] },
        { label: "missing source Markdown", rows: [{ id: "first", markdown: "first" }, { id: "second", content: "rendered only" }] },
        { label: "blank Markdown", rows: [{ id: "first", markdown: "first" }, { id: "second", markdown: " \n" }] },
        { label: "null row", rows: [{ id: "first", markdown: "first" }, null] },
        { label: "nonarray SQL response", rows: null },
    ])("rejects SQL data that cannot prove complete source identity: $label", async ({ rows }) => {
        const query = vi.fn().mockResolvedValue(rows);
        await expect(readLvCardsExisting("deck", readTwoCards(), query)).rejects.toMatchObject(incompleteDeck);
    });

    it("does not query source blocks when deck pagination is incomplete", async () => {
        const readPage = vi.fn().mockResolvedValue({ blocks: [{ id: "first" }], total: 2, pageCount: 1 });
        const query = vi.fn();
        await expect(readLvCardsExisting("deck", readPage, query)).rejects.toMatchObject(incompleteDeck);
        expect(query).not.toHaveBeenCalled();
    });

    it("batches 805 cards into 400-row SQL requests with an explicit limit per request", async () => {
        const ids = Array.from({ length: 805 }, (_, index) => `card-${index}`);
        const readPage = vi.fn()
            .mockResolvedValueOnce({ blocks: ids.slice(0, 500).map(id => ({ id })), total: 805, pageCount: 2 })
            .mockResolvedValueOnce({ blocks: ids.slice(500).map(id => ({ id })), total: 805, pageCount: 2 });
        const rowsFor = (start: number, end: number) => ids.slice(start, end).reverse().map(id => ({ id, markdown: `source ${id}` }));
        const query = vi.fn()
            .mockResolvedValueOnce(rowsFor(0, 400))
            .mockResolvedValueOnce(rowsFor(400, 800))
            .mockResolvedValueOnce(rowsFor(800, 805));

        const result = await readLvCardsExisting("deck", readPage, query);
        expect(result).toHaveLength(805);
        expect(new Set(result.map(row => row.id))).toEqual(new Set(ids));
        expect(query).toHaveBeenCalledTimes(3);
        expect(query.mock.calls[0][0]).toContain("'card-0'");
        expect(query.mock.calls[0][0]).toContain("'card-399'");
        expect(query.mock.calls[0][0]).not.toContain("'card-400'");
        expect(query.mock.calls[1][0]).toContain("'card-400'");
        expect(query.mock.calls[1][0]).toContain("'card-799'");
        expect(query.mock.calls[2][0]).toContain("'card-800'");
        expect(query.mock.calls.map(([sql]) => sql.match(/LIMIT \d+$/)?.[0])).toEqual(["LIMIT 400", "LIMIT 400", "LIMIT 5"]);
    });

    it("escapes apostrophes in block identities used in SQL literals", async () => {
        const id = "card' OR '1'='1";
        const readPage = vi.fn().mockResolvedValue({ blocks: [{ id }], total: 1, pageCount: 1 });
        const query = vi.fn().mockResolvedValue([{ id, markdown: "source" }]);
        await expect(readLvCardsExisting("deck", readPage, query)).resolves.toEqual([{ id, markdown: "source" }]);
        expect(query.mock.calls[0][0]).toContain("IN ('card'' OR ''1''=''1') LIMIT 1");
        expect(sqlString("O'Reilly's")).toBe("'O''Reilly''s'");
    });

    it("does not issue SQL for a verified empty deck", async () => {
        const readPage = vi.fn().mockResolvedValue({ blocks: [], total: 0, pageCount: 0 });
        const query = vi.fn();
        await expect(readLvCardsExisting("deck", readPage, query)).resolves.toEqual([]);
        expect(query).not.toHaveBeenCalled();
    });
});

describe("pairLvCardsBlocks", () => {
    it("maps shuffled source rows to package order and accepts code/list block types", () => {
        const rows = [
            sourceRow("list-block", cards[2].markdown, { type: "l" }),
            sourceRow("qa-block", " \r\nQuestion\r\n\r\nAnswer\r\n "),
            sourceRow("code-block", cards[1].markdown, { type: "c" }),
        ];
        expect(pairLvCardsBlocks(cards, rows, "import-root")).toEqual(["qa-block", "code-block", "list-block"]);
    });

    it.each([
        { label: "missing row", rows: [] },
        { label: "extra row", rows: [sourceRow("first", cards[0].markdown), sourceRow("extra", "extra")] },
        { label: "different document root", rows: [sourceRow("first", cards[0].markdown, { root_id: "another-root" })] },
        { label: "nested block instead of imported top-level block", rows: [sourceRow("first", cards[0].markdown, { parent_id: "nested-parent" })] },
        { label: "missing block ID", rows: [sourceRow("", cards[0].markdown)] },
        { label: "blank block ID", rows: [sourceRow(" \t", cards[0].markdown)] },
        { label: "nonstring block ID", rows: [sourceRow("first", cards[0].markdown, { id: 1 })] },
        { label: "document row", rows: [sourceRow("first", cards[0].markdown, { type: "d" })] },
        { label: "missing block type", rows: [sourceRow("first", cards[0].markdown, { type: undefined })] },
        { label: "empty block type", rows: [sourceRow("first", cards[0].markdown, { type: "" })] },
        { label: "object block type with invalid coercion", rows: [sourceRow("first", cards[0].markdown, { type: { toString: null, valueOf: null } })] },
        { label: "nonstring Markdown", rows: [sourceRow("first", cards[0].markdown, { markdown: 1 })] },
        { label: "blank Markdown", rows: [sourceRow("first", " \n")] },
        { label: "unrelated source content", rows: [sourceRow("first", "Question\n\nA different answer")] },
        { label: "null row", rows: [null] },
    ])("rejects unsafe block correspondence: $label", ({ rows }) => {
        expect(() => pairLvCardsBlocks([cards[0]], rows, "import-root")).toThrowError(expect.objectContaining(blockMismatch));
    });

    it.each(["", " \t"])("rejects a blank target document identity (%j)", (rootID) => {
        expect(() => pairLvCardsBlocks([cards[0]], [sourceRow("first", cards[0].markdown)], rootID))
            .toThrowError(expect.objectContaining(blockMismatch));
    });

    it("rejects repeated block IDs and repeated source bodies even when row count matches", () => {
        const rowSets = [
            [sourceRow("same-id", cards[0].markdown), sourceRow("same-id", cards[1].markdown)],
            [sourceRow("first", cards[0].markdown), sourceRow("second", cards[0].markdown)],
        ];
        for (const rows of rowSets) {
            expect(() => pairLvCardsBlocks(cards.slice(0, 2), rows, "import-root"))
                .toThrowError(expect.objectContaining(blockMismatch));
        }
    });

    it("does not normalize meaningful internal whitespace when proving inserted source content", () => {
        const code: LvPackageCard = { id: "package-code", markdown: "```py\nif ok:\n    run()\n```", kind: "code" };
        const changedIndentation = sourceRow("code-block", "```py\nif ok:\n  run()\n```", { type: "c" });
        expect(() => pairLvCardsBlocks([code], [changedIndentation], "import-root"))
            .toThrowError(expect.objectContaining(blockMismatch));
    });

    it("refuses to map two package cards onto the same source fingerprint", () => {
        const repeatedCards = [cards[0], { ...cards[0], id: "another-package-id" }];
        const rows = [sourceRow("qa-block", cards[0].markdown), sourceRow("other-block", cards[1].markdown)];
        expect(() => pairLvCardsBlocks(repeatedCards, rows, "import-root"))
            .toThrowError(expect.objectContaining(blockMismatch));
    });
});

describe("applyPackageCardMetadata", () => {
    it("sets memo and tags for cards with metadata", async () => {
        const metaCards: LvPackageCard[] = [
            { id: "c1", markdown: "Q1\n\nA1", kind: "qa", memo: "第一张便签", tags: ["计算机", "网络"] },
            { id: "c2", markdown: "Q2\n\nA2", kind: "qa" }, // 无元数据
            { id: "c3", markdown: "Q3\n\nA3", kind: "qa", memo: "仅便签" },
            { id: "c4", markdown: "Q4\n\nA4", kind: "qa", tags: ["仅标签"] },
        ];
        const blockIDs = ["b1", "b2", "b3", "b4"];

        const recorded: Record<string, Record<string, string>> = {};
        const setAttrs = vi.fn().mockImplementation(async (id: string, attrs: Record<string, string>) => {
            recorded[id] = attrs;
        });

        const count = await applyPackageCardMetadata(metaCards, blockIDs, setAttrs);

        expect(count).toBe(3);
        expect(setAttrs).toHaveBeenCalledTimes(3);

        expect(recorded["b1"]).toEqual({
            memo: "第一张便签",
            tags: "计算机,网络",
            "custom-card-tags": "计算机,网络",
        });
        expect(recorded["b2"]).toBeUndefined();
        expect(recorded["b3"]).toEqual({
            memo: "仅便签",
        });
        expect(recorded["b4"]).toEqual({
            tags: "仅标签",
            "custom-card-tags": "仅标签",
        });
    });

    it("safely exits when cards and blockIDs length mismatch", async () => {
        const setAttrs = vi.fn();
        const res1 = await applyPackageCardMetadata([cards[0]], [], setAttrs);
        const res2 = await applyPackageCardMetadata([], ["b1"], setAttrs);
        const res3 = await applyPackageCardMetadata(null as unknown as LvPackageCard[], ["b1"], setAttrs);

        expect(res1).toBe(0);
        expect(res2).toBe(0);
        expect(res3).toBe(0);
        expect(setAttrs).not.toHaveBeenCalled();
    });

    it("isolates single-block failure and notifies onError callback without breaking overall flow", async () => {
        const metaCards: LvPackageCard[] = [
            { id: "c1", markdown: "Q1\n\nA1", kind: "qa", memo: "便签1" },
            { id: "c2", markdown: "Q2\n\nA2", kind: "qa", memo: "失败便签" },
            { id: "c3", markdown: "Q3\n\nA3", kind: "qa", memo: "便签3" },
        ];
        const blockIDs = ["b1", "b2", "b3"];

        const setAttrs = vi.fn().mockImplementation(async (id: string) => {
            if (id === "b2") throw new Error("attr write failed");
        });
        const onError = vi.fn();

        const count = await applyPackageCardMetadata(metaCards, blockIDs, setAttrs, { onError });

        expect(count).toBe(2);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith("b2", expect.any(Error));
    });

    it("batches calls in bounded chunks", async () => {
        const metaCards: LvPackageCard[] = Array.from({ length: 7 }, (_, i) => ({
            id: `c${i + 1}`,
            markdown: `Q${i + 1}\n\nA${i + 1}`,
            kind: "qa",
            memo: `便签${i + 1}`,
        }));
        const blockIDs = metaCards.map((_, i) => `b${i + 1}`);

        let activeConcurrent = 0;
        let maxConcurrent = 0;

        const setAttrs = vi.fn().mockImplementation(async () => {
            activeConcurrent++;
            maxConcurrent = Math.max(maxConcurrent, activeConcurrent);
            await new Promise(resolve => setTimeout(resolve, 10));
            activeConcurrent--;
        });

        const count = await applyPackageCardMetadata(metaCards, blockIDs, setAttrs, { batchSize: 3 });

        expect(count).toBe(7);
        expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
});
