import { describe, expect, it } from "vitest";
import { composeCardLine, composeImportMarkdown, mergeLedger, normalizeLedger, pairImportedBlocks, partitionNew } from "../src/core/anki-import";
import type { PreviewCard } from "../src/core/anki-preview";

function card(guid: string, question: string, answer = "答案"): PreviewCard {
    return {
        guid, deckId: "deck", modelName: "基础",
        question, answer, tags: [], mediaRefs: [],
        fingerprint: "fp-" + guid, cloze: false, extraAnswer: "",
    };
}

describe("composeCardLine / composeImportMarkdown", () => {
    it("问答序列化为思源挖空格式，换行折叠", () => {
        expect(composeCardLine(card("g1", "两行\n问题", "多行\n答案"))).toBe("两行 / 问题 ==多行 / 答案==");
    });
    it("拒绝空答案，不再伪造占位卡", () => {
        expect(() => composeCardLine(card("g2", "只有问面", ""))).toThrow("invalid flashcard");
    });
    it("完形卡把答案字段中的普通文本也隐藏，避免附加字段漏到题面", () => {
        const cloze = { ...card("g-cloze", "句子 ==答案=="), cloze: true, answer: "==答案==\n\n备注：补充说明" };
        expect(composeCardLine(cloze)).toBe("句子 ==答案== ==答案== ==备注：补充说明==");
    });
    it("完形答案字段里有损坏标记时拒绝序列化", () => {
        const cloze = { ...card("g-cloze-bad", "句子 ==答案=="), cloze: true, answer: "==答案" };
        expect(() => composeCardLine(cloze)).toThrow("invalid cloze markup");
    });
    it("文档：一卡一行、顺序保持", () => {
        const md = composeImportMarkdown([card("a", "Q1"), card("b", "Q2")]);
        expect(md).toBe("Q1 ==答案==\n\nQ2 ==答案==");
    });
});

describe("pairImportedBlocks", () => {
    const cards = [card("a", "Q1"), card("b", "Q2"), card("c", "Q3")];
    it("整行精确配对；缺失行进 unmatched", () => {
        const { byGuid, unmatchedGuids } = pairImportedBlocks(
            [
                { id: "blk1", content: "Q1 ==答案==" },
                { id: "blk2", content: "Q3 ==答案==" },
            ],
            cards,
        );
        expect(byGuid.get("a")).toBe("blk1");
        expect(byGuid.get("c")).toBe("blk2");
        expect(byGuid.has("b")).toBe(false);
        expect(unmatchedGuids).toEqual(["b"]);
    });
});

describe("幂等台账", () => {
    it("normalize：坏条目剔除、同 guid 留最新、限量", () => {
        const ledger = normalizeLedger([
            { guid: "a", deckID: "d", blockID: "b1", importedAt: 100 },
            { guid: "a", deckID: "d", blockID: "b2", importedAt: 200 },
            { guid: "", blockID: "x" },
            { guid: "b" },
        ]);
        expect(ledger).toEqual([{ guid: "a", deckID: "d", blockID: "b2", importedAt: 200 }]);
    });

    it("重导过滤：已导入 guid 进 already（幂等核心）", () => {
        const ledger = normalizeLedger([{ guid: "a", deckID: "d", blockID: "b1", importedAt: 1 }]);
        const { fresh, already } = partitionNew([card("a", "Q1"), card("b", "Q2")], ledger);
        expect(fresh.map((c) => c.guid)).toEqual(["b"]);
        expect(already).toEqual(["a"]);
    });

    it("merge：新旧合并，同 guid 新条目胜出", () => {
        const merged = mergeLedger([{ guid: "a", deckID: "d", blockID: "b1", importedAt: 1 }], [
            { guid: "a", deckID: "d", blockID: "b2", importedAt: 2 },
            { guid: "c", deckID: "d", blockID: "b3", importedAt: 3 },
        ]);
        expect(merged).toHaveLength(2);
        expect(merged.find((e) => e.guid === "a")!.blockID).toBe("b2");
    });
});
