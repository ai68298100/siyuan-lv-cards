import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createFullSampleWorkspace,
    createOnboardingSampleCards,
    findOrCreateRiffDeck,
} from "../src/core/workspace-samples";

const {
    getRiffDecks,
    createRiffDeck,
    getRiffCards,
    addRiffCards,
    createDocWithMd,
    sqlQuery,
    appendBlock,
    sampleCards,
} = vi.hoisted(() => ({
    getRiffDecks: vi.fn(),
    createRiffDeck: vi.fn(),
    getRiffCards: vi.fn(),
    addRiffCards: vi.fn(),
    createDocWithMd: vi.fn(),
    sqlQuery: vi.fn(),
    appendBlock: vi.fn(),
    sampleCards: vi.fn(),
}));

vi.mock("../src/api/riff", () => ({
    getRiffDecks,
    createRiffDeck,
    getRiffCards,
}));

vi.mock("../src/api/due-shared", () => ({
    addRiffCards,
}));

vi.mock("../src/api/siyuan", () => ({
    createDocWithMd,
    sqlQuery,
    appendBlock,
}));

vi.mock("../src/core/sample-cards", () => ({
    sampleCards,
}));

vi.mock("../src/help", () => ({
    sampleCards,
}));

describe("workspace-samples 示例与引导工作区生成", () => {
    const mockI18n = {
        onboardingDeckName: "示例卡组",
        onboardingSample1: "问答题内容",
        onboardingSample2: "挖空题内容",
        onboardingSample3: "挖空二内容",
        onboardingSample4: "公式题内容",
        onboardingSample5: "列表题内容",
        quickCardFail: "建卡失败",
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("findOrCreateRiffDeck 卡组复用机制", () => {
        it("卡组已存在时直接复用既有卡组，不创建新组", async () => {
            getRiffDecks.mockResolvedValueOnce([
                { id: "deck-existing", name: "示例卡组" },
                { id: "deck-2", name: "其他卡组" },
            ]);

            const deck = await findOrCreateRiffDeck("示例卡组");
            expect(deck).toEqual({ id: "deck-existing", name: "示例卡组" });
            expect(createRiffDeck).not.toHaveBeenCalled();
        });

        it("卡组不存在时调用 createRiffDeck 创建新卡组", async () => {
            getRiffDecks.mockResolvedValueOnce([{ id: "deck-1", name: "其他卡组" }]);
            createRiffDeck.mockResolvedValueOnce({ id: "deck-new" });

            const deck = await findOrCreateRiffDeck("示例卡组");
            expect(deck).toEqual({ id: "deck-new", name: "示例卡组" });
            expect(createRiffDeck).toHaveBeenCalledWith("示例卡组");
        });
    });

    describe("createOnboardingSampleCards 新手示例卡断点恢复与生成", () => {
        it("首次全新创建：5 种核心题型均写入且完整入组", async () => {
            getRiffDecks.mockResolvedValueOnce([{ id: "deck-1", name: "示例卡组" }]);
            createDocWithMd.mockResolvedValueOnce("doc-onboarding-1");
            sqlQuery.mockResolvedValueOnce([]); // 尚无已存在标记块
            appendBlock.mockImplementation((_type, md, _doc) => {
                const marker = md.match(/lv-cards-sample:([a-z0-9-]+)/)?.[1] ?? "unknown";
                return Promise.resolve([`block-${marker}`]);
            });
            getRiffCards.mockResolvedValueOnce({ blocks: [] }); // 卡组中尚无卡
            addRiffCards.mockResolvedValueOnce(undefined);

            const docID = await createOnboardingSampleCards("nb-1", mockI18n);

            expect(docID).toBe("doc-onboarding-1");
            expect(createDocWithMd).toHaveBeenCalledWith("nb-1", "小驴闪卡/示例卡", "");
            expect(appendBlock).toHaveBeenCalledTimes(5);
            expect(addRiffCards).toHaveBeenCalledWith("deck-1", [
                "block-qa",
                "block-cloze",
                "block-cloze-2",
                "block-formula",
                "block-list",
            ]);
        });

        it("断点恢复：若部分卡已存在，仅补充创建缺失的块", async () => {
            getRiffDecks.mockResolvedValueOnce([{ id: "deck-1", name: "示例卡组" }]);
            createDocWithMd.mockResolvedValueOnce("doc-onboarding-1");
            // 假设 qa 与 cloze 之前已写入成功
            sqlQuery.mockResolvedValueOnce([
                { id: "block-qa-exist", markdown: "<!-- lv-cards-sample:qa -->内容" },
                { id: "block-cloze-exist", markdown: "<!-- lv-cards-sample:cloze -->内容" },
            ]);
            appendBlock.mockImplementation((_type, md) => {
                const marker = md.match(/lv-cards-sample:([a-z0-9-]+)/)?.[1] ?? "unknown";
                return Promise.resolve([`block-${marker}`]);
            });
            // 假设 block-qa-exist 已经在卡组里，其余不在
            getRiffCards.mockResolvedValueOnce({ blocks: [{ id: "block-qa-exist" }] });
            addRiffCards.mockResolvedValueOnce(undefined);

            const docID = await createOnboardingSampleCards("nb-1", mockI18n);

            expect(docID).toBe("doc-onboarding-1");
            // 只有后 3 张调用了 appendBlock
            expect(appendBlock).toHaveBeenCalledTimes(3);
            // 缺失入组的包含已存在的 block-cloze-exist 以及新追加的 3 张
            expect(addRiffCards).toHaveBeenCalledWith("deck-1", [
                "block-cloze-exist",
                "block-cloze-2",
                "block-formula",
                "block-list",
            ]);
        });
    });

    describe("createFullSampleWorkspace 完整示例工作区", () => {
        it("已存在示例块时识别 alreadyExisted 为 true，不重复生成", async () => {
            getRiffDecks.mockResolvedValueOnce([{ id: "deck-1", name: "示例卡组" }]);
            createDocWithMd.mockResolvedValueOnce("doc-sample-ws");
            sqlQuery.mockResolvedValueOnce([{ id: "block-sample-1" }]); // 已存在

            const result = await createFullSampleWorkspace("nb-1", mockI18n);

            expect(result).toEqual({
                docID: "doc-sample-ws",
                createdCount: 0,
                alreadyExisted: true,
            });
            expect(appendBlock).not.toHaveBeenCalled();
            expect(addRiffCards).not.toHaveBeenCalled();
        });

        it("初次生成：将 sampleCards 逐项写入并加入示例卡组", async () => {
            getRiffDecks.mockResolvedValueOnce([{ id: "deck-1", name: "示例卡组" }]);
            createDocWithMd.mockResolvedValueOnce("doc-sample-ws");
            sqlQuery.mockResolvedValueOnce([]); // 不存在
            sampleCards.mockReturnValueOnce(["card1 markdown", "card2 markdown"]);
            appendBlock.mockImplementation((_type, _md, _doc) => Promise.resolve(["block-created"]));
            addRiffCards.mockResolvedValueOnce(undefined);

            const result = await createFullSampleWorkspace("nb-1", mockI18n);

            expect(result).toEqual({
                docID: "doc-sample-ws",
                createdCount: 2,
                alreadyExisted: false,
            });
            expect(appendBlock).toHaveBeenCalledTimes(2);
            expect(addRiffCards).toHaveBeenCalledWith("deck-1", ["block-created", "block-created"]);
        });
    });
});
