import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    checkDuplicateCards,
    executeQuickCardCreation,
    extractMarkerCardItems,
    removeCardsFromDeckFlow,
} from "../src/core/card-operations";
import type { CardRelationsData } from "../src/core/card-relations";
import type { KnowledgeObjectsData } from "../src/core/knowledge-objects";

const {
    getRiffCardsByBlockIDs,
    removeRiffCards,
    addRiffCards,
    invalidateDueCache,
    createDocWithMd,
    appendBlock,
} = vi.hoisted(() => ({
    getRiffCardsByBlockIDs: vi.fn(),
    removeRiffCards: vi.fn(),
    addRiffCards: vi.fn(),
    invalidateDueCache: vi.fn(),
    createDocWithMd: vi.fn(),
    appendBlock: vi.fn(),
}));

vi.mock("../src/api/riff", () => ({
    getRiffCardsByBlockIDs,
    removeRiffCards,
}));

vi.mock("../src/api/due-shared", () => ({
    addRiffCards,
    invalidateDueCache,
}));

vi.mock("../src/api/siyuan", () => ({
    createDocWithMd,
    appendBlock,
}));

describe("card-operations 卡片操作与制卡核心引擎", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("checkDuplicateCards 查重", () => {
        it("正确统计已存在于 Riff 中的闪卡数量", async () => {
            getRiffCardsByBlockIDs.mockResolvedValueOnce({
                blocks: [{ id: "c1" }, { id: "" }, { id: "c2" }],
            });

            const dupes = await checkDuplicateCards(["b1", "b2", "b3"]);
            expect(dupes).toBe(2);
        });

        it("查询异常时安全返回 0", async () => {
            getRiffCardsByBlockIDs.mockRejectedValueOnce(new Error("Network fail"));
            const dupes = await checkDuplicateCards(["b1"]);
            expect(dupes).toBe(0);
        });
    });

    describe("removeCardsFromDeckFlow 批量移除与关系图清理", () => {
        it("待移除块不是闪卡时，直接返回 hadCards: false，不执行移除", async () => {
            getRiffCardsByBlockIDs.mockResolvedValueOnce({ blocks: [] });
            const mutateRelations = vi.fn();
            const relations: CardRelationsData = { version: 1, relations: [] };

            const result = await removeCardsFromDeckFlow(["b1"], relations, mutateRelations);

            expect(result.hadCards).toBe(false);
            expect(result.removedCount).toBe(0);
            expect(removeRiffCards).not.toHaveBeenCalled();
            expect(mutateRelations).not.toHaveBeenCalled();
        });

        it("待移除块是闪卡时，调用 removeRiffCards，使缓存失效，并级联清理关系图端点", async () => {
            getRiffCardsByBlockIDs.mockResolvedValueOnce({
                blocks: [{ id: "card-1" }, { id: "card-2" }],
            });
            removeRiffCards.mockResolvedValueOnce(undefined);

            const relations: CardRelationsData = {
                version: 1,
                relations: [{ from: "card-1", to: "card-other", type: "prerequisite" }],
            };
            const mutateRelations = vi.fn().mockImplementation(async (cb) => {
                cb(relations);
            });

            const result = await removeCardsFromDeckFlow(["b1", "b2"], relations, mutateRelations);

            expect(result.hadCards).toBe(true);
            expect(result.removedCount).toBe(2);
            expect(removeRiffCards).toHaveBeenCalledWith("", ["card-1", "card-2"]);
            expect(invalidateDueCache).toHaveBeenCalledTimes(1);
            expect(mutateRelations).toHaveBeenCalledTimes(1);
            // 验证关系图中涉及 card-1 的端点已被 detach
            expect(relations.relations).toHaveLength(0);
        });
    });

    describe("executeQuickCardCreation 快速制卡流程", () => {
        it("顺利落块入组并自动派生知识对象实例", async () => {
            createDocWithMd.mockResolvedValueOnce("doc-quick-1");
            appendBlock.mockResolvedValueOnce(["block-created-1"]);
            addRiffCards.mockResolvedValueOnce(undefined);
            getRiffCardsByBlockIDs.mockResolvedValueOnce({ blocks: [{ id: "card-new-1" }] });

            const koData: KnowledgeObjectsData = { version: 1, objects: [] };
            const mutateKO = vi.fn().mockImplementation(async (cb) => {
                cb(koData);
            });

            const res = await executeQuickCardCreation({
                nbId: "nb-1",
                markdown: "什么是光合作用？ ==植物将光能转化为化学能==",
                deckID: "deck-bio",
                q: "什么是光合作用？",
                a: "光合作用",
                mutateKnowledgeObjects: mutateKO,
            });

            expect(res).toEqual({ docID: "doc-quick-1", blockID: "block-created-1" });
            expect(createDocWithMd).toHaveBeenCalledWith("nb-1", "小驴闪卡/快速制卡", "");
            expect(appendBlock).toHaveBeenCalledWith("markdown", expect.any(String), "doc-quick-1");
            expect(addRiffCards).toHaveBeenCalledWith("deck-bio", ["block-created-1"]);
            expect(mutateKO).toHaveBeenCalledTimes(1);

            // 验证自动派生知识对象实例
            expect(koData.objects).toHaveLength(1);
            expect(koData.objects[0].fact).toBe("什么是光合作用？");
            expect(koData.objects[0].instances).toHaveLength(1);
            expect(koData.objects[0].instances[0].cardID).toBe("card-new-1");
            expect(koData.objects[0].instances[0].capability).toBe("fact");
        });

        it("文档创建或块写入失败时抛出异常", async () => {
            createDocWithMd.mockResolvedValueOnce(null);

            await expect(
                executeQuickCardCreation({
                    nbId: "nb-1",
                    markdown: "Q ==A==",
                    deckID: "d1",
                }),
            ).rejects.toThrow("quickCardFail");
        });

        it("没有有效挖空答案时在创建文档前拒绝", async () => {
            await expect(executeQuickCardCreation({ nbId: "nb-1", markdown: "只有题面", deckID: "d1" }))
                .rejects.toThrow("quickCardInvalid");
            expect(createDocWithMd).not.toHaveBeenCalled();
            expect(addRiffCards).not.toHaveBeenCalled();
        });

        it("题面为空时在写块前拒绝，避免留下孤儿块", async () => {
            await expect(executeQuickCardCreation({ nbId: "nb-1", markdown: "==答案==", deckID: "d1" }))
                .rejects.toThrow("quickCardInvalid");
            expect(createDocWithMd).not.toHaveBeenCalled();
            expect(appendBlock).not.toHaveBeenCalled();
        });
    });

    describe("extractMarkerCardItems 标记符解析", () => {
        it("解析问答与有效挖空块，忽略没有答案的问号段落", () => {
            const rows = [
                { id: "b1", markdown: "光合作用::绿色植物吸收光能合成有机物的过程" },
                { id: "b2", markdown: "光合作用的场所是哪里？\n?\n叶绿体" },
                { id: "b3", markdown: "为什么植物叶片多为绿色？" },
                { id: "b4", markdown: "叶片为什么是绿色？ ==叶绿素==" },
                { id: "b5", markdown: "普通段落文本不带标记" },
            ];

            const { items, wholeIds } = extractMarkerCardItems(rows);

            expect(items).toHaveLength(3);
            expect(items[0]).toEqual({
                blockID: "b1",
                kind: "qa",
                front: "光合作用",
                back: "绿色植物吸收光能合成有机物的过程",
            });
            expect(items[1].kind).toBe("qa");
            expect(items[2]).toEqual({
                blockID: "b4",
                kind: "whole",
                front: "叶片为什么是绿色？ ==叶绿素==",
                back: "",
            });
            expect(wholeIds).toEqual(["b4"]);
        });
    });
});
