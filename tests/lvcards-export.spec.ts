import { describe, expect, it, vi } from "vitest";
import {
    exportLvCardsDeckPackage,
    inferPackageCardKind,
    readCardsForExport,
    readDeckIDsForExport,
    LvCardsExportError,
} from "../src/core/lvcards-export";
import {
    parseLvCardsPackage,
    previewLvCardsImport,
    normalizeCardFingerprint,
} from "../src/core/lvcards-package";

const incompleteDeck = { name: "LvCardsExportError", code: "incomplete-deck" };
const emptyDeck = { name: "LvCardsExportError", code: "empty-deck" };

describe("lvcards-export: inferPackageCardKind", () => {
    it("identifies cloze cards by highlight markers", () => {
        expect(inferPackageCardKind("光合作用发生于 ==叶绿体==")).toBe("cloze");
        expect(inferPackageCardKind("==A== 与 ==B==")).toBe("cloze");
    });

    it("identifies code cards by markdown code fence", () => {
        expect(inferPackageCardKind("```ts\nconst x = 1;\nconsole.log(x);\n```")).toBe("code");
        expect(inferPackageCardKind("代码示例：\n```python\ndef fn(): pass\n```")).toBe("code");
    });

    it("identifies list cards by markdown list syntax", () => {
        expect(inferPackageCardKind("操作流程：\n1. 第一步\n2. 第二步")).toBe("list");
        expect(inferPackageCardKind("- 苹果\n- 香蕉\n- 橙子")).toBe("list");
    });

    it("falls back to qa for normal question-answer text", () => {
        expect(inferPackageCardKind("什么是 TCP 三次握手？\n\n建立连接时的三次确认。")).toBe("qa");
        expect(inferPackageCardKind("")).toBe("qa");
        expect(inferPackageCardKind(null as unknown as string)).toBe("qa");
    });
});

describe("lvcards-export: readDeckIDsForExport", () => {
    it("reads all pages completely without any 20-page cap", async () => {
        // 模拟超过 20 页的大卡组（25 页，每页 100 张，共 2500 张卡）
        const total = 2500;
        const pageCount = 25;
        const allIds = Array.from({ length: total }, (_, i) => `card-${i + 1}`);

        const readPage = vi.fn().mockImplementation((_deckID, page, pageSize) => {
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            return Promise.resolve({
                blocks: allIds.slice(start, end).map(id => ({ id })),
                total,
                pageCount,
            });
        });

        const ids = await readDeckIDsForExport("large-deck", readPage, 100);
        expect(ids).toHaveLength(2500);
        expect(ids[0]).toBe("card-1");
        expect(ids[2499]).toBe("card-2500");
        expect(readPage).toHaveBeenCalledTimes(25);
    });

    it("returns empty array for empty deck", async () => {
        const readPage = vi.fn().mockResolvedValue({ blocks: [], total: 0, pageCount: 1 });
        const ids = await readDeckIDsForExport("empty-deck", readPage);
        expect(ids).toEqual([]);
        expect(readPage).toHaveBeenCalledTimes(1);
    });

    it("rejects blank deck ID immediately", async () => {
        const readPage = vi.fn();
        await expect(readDeckIDsForExport("   ", readPage)).rejects.toMatchObject(incompleteDeck);
        expect(readPage).not.toHaveBeenCalled();
    });

    it("rejects when page data total drifts midway", async () => {
        const readPage = vi.fn()
            .mockResolvedValueOnce({ blocks: [{ id: "c1" }], total: 2, pageCount: 2 })
            .mockResolvedValueOnce({ blocks: [{ id: "c2" }], total: 3, pageCount: 2 });

        await expect(readDeckIDsForExport("deck", readPage, 1)).rejects.toMatchObject(incompleteDeck);
    });

    it("rejects when duplicate card ID is encountered", async () => {
        const readPage = vi.fn()
            .mockResolvedValueOnce({ blocks: [{ id: "dup" }], total: 2, pageCount: 2 })
            .mockResolvedValueOnce({ blocks: [{ id: "dup" }], total: 2, pageCount: 2 });

        await expect(readDeckIDsForExport("deck", readPage, 1)).rejects.toMatchObject(incompleteDeck);
    });
});

describe("lvcards-export: readCardsForExport", () => {
    it("batches SQL queries and retrieves original markdown with memo", async () => {
        const query = vi.fn().mockImplementation(async (sql: string) => {
            if (sql.includes("SELECT id, markdown, memo")) {
                return [
                    { id: "c1", markdown: "问答题题干\n\n答案解析", memo: "这是助记便签" },
                    { id: "c2", markdown: "==公式==: $$E=mc^2$$", memo: null },
                ];
            }
            throw new Error("unexpected query");
        });

        const cards = await readCardsForExport(["c1", "c2"], query, 400);
        expect(cards).toHaveLength(2);
        expect(cards[0]).toEqual({
            id: "c1",
            markdown: "问答题题干\n\n答案解析",
            kind: "qa",
            memo: "这是助记便签",
        });
        expect(cards[1]).toEqual({
            id: "c2",
            markdown: "==公式==: $$E=mc^2$$",
            kind: "cloze",
            memo: undefined,
        });
    });

    it("gracefully falls back when memo column is unavailable", async () => {
        const query = vi.fn().mockImplementation(async (sql: string) => {
            if (sql.includes("SELECT id, markdown, memo")) {
                throw new Error("no such column: memo");
            }
            if (sql.includes("SELECT id, markdown FROM blocks")) {
                return [
                    { id: "c1", markdown: "```python\nprint(1)\n```" },
                ];
            }
            throw new Error("unexpected query");
        });

        const cards = await readCardsForExport(["c1"], query, 400);
        expect(cards).toHaveLength(1);
        expect(cards[0].id).toBe("c1");
        expect(cards[0].kind).toBe("code");
        expect(cards[0].memo).toBeUndefined();
    });

    it("rejects when block has empty or missing markdown", async () => {
        const query = vi.fn().mockResolvedValue([{ id: "c1", markdown: "   " }]);
        await expect(readCardsForExport(["c1"], query)).rejects.toMatchObject(incompleteDeck);
    });
});

describe("lvcards-export: exportLvCardsDeckPackage & Round-trip Integrity", () => {
    it("throws empty-deck when deck has 0 cards", async () => {
        const readPage = vi.fn().mockResolvedValue({ blocks: [], total: 0, pageCount: 1 });
        const query = vi.fn();

        await expect(
            exportLvCardsDeckPackage({ id: "empty", name: "空卡组" }, readPage, query)
        ).rejects.toMatchObject(emptyDeck);
    });

    it("preserves exact Markdown format (LaTeX, code, lists, blanks) and achieves round-trip deduplication", async () => {
        const sourceData = [
            {
                id: "b-math",
                markdown: "质能方程是什么？\n\n$$E = mc^2$$\n其中 $c$ 为光速常数。",
                memo: "物理学核心定律",
            },
            {
                id: "b-code",
                markdown: "实现深拷贝的 TS 函数：\n```ts\nfunction clone<T>(x: T): T {\n    return JSON.parse(JSON.stringify(x));\n}\n```",
                memo: undefined,
            },
            {
                id: "b-cloze",
                markdown: "Vue 3 的响应式原理核心是基于 ES6 的 ==Proxy==，而 Vue 2 是 ==Object.defineProperty==。",
                memo: "面试常考题",
            },
            {
                id: "b-list",
                markdown: "敏捷开发基本流程：\n1. 需求梳理\n2. 迭代计划\n3. 每日站会\n4. 演示复盘",
                memo: undefined,
            },
        ];

        const readPage = vi.fn().mockResolvedValue({
            blocks: sourceData.map(d => ({ id: d.id })),
            total: sourceData.length,
            pageCount: 1,
        });

        const query = vi.fn().mockResolvedValue(sourceData);

        // 1. 执行导出
        const { pkgJson, cards } = await exportLvCardsDeckPackage(
            { id: "deck-cs", name: "全栈知识库", description: "前端与计算机基础" },
            readPage,
            query,
            { generator: "test-exporter" }
        );

        expect(cards).toHaveLength(4);
        expect(typeof pkgJson).toBe("string");

        // 2. 校验导出 JSON 结构
        const parseRes = parseLvCardsPackage(pkgJson);
        expect(parseRes.ok).toBe(true);
        if (!parseRes.ok) return;

        const pkg = parseRes.package;
        expect(pkg.format).toBe("lvcards.v1");
        expect(pkg.deck.name).toBe("全栈知识库");
        expect(pkg.cards).toHaveLength(4);

        // 3. 严格核验原始 Markdown 没有发生任何剥离或损失
        expect(pkg.cards[0].markdown).toBe(sourceData[0].markdown);
        expect(pkg.cards[0].memo).toBe("物理学核心定律");
        expect(pkg.cards[0].kind).toBe("qa");

        expect(pkg.cards[1].markdown).toBe(sourceData[1].markdown);
        expect(pkg.cards[1].kind).toBe("code");

        expect(pkg.cards[2].markdown).toBe(sourceData[2].markdown);
        expect(pkg.cards[2].kind).toBe("cloze");

        expect(pkg.cards[3].markdown).toBe(sourceData[3].markdown);
        expect(pkg.cards[3].kind).toBe("list");

        // 4. 关键：往返无损与幂等去重校验 (Round-trip preview)
        // 使用导出的分享包对比原有卡片库，所有 4 张卡片必须 100% 被判定为 duplicateCards，
        // newCards 必须为 0，updatedCards 必须为 0！
        const existingCards = sourceData.map(d => ({ id: d.id, markdown: d.markdown }));
        const preview = previewLvCardsImport(pkg, existingCards);

        expect(preview.newCards).toHaveLength(0);
        expect(preview.updatedCards).toHaveLength(0);
        expect(preview.duplicateCards).toHaveLength(4);
        expect(preview.total).toBe(4);
    });
});
