import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    computeBlockMenuItems,
    extractBlockIDs,
    formatClozeText,
    type BlockMenuConfig,
} from "../src/bootstrap/block-menu";

describe("block-menu 块图标与选区制卡菜单", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("extractBlockIDs 提取有效块 ID", () => {
        it("正确支持 getAttribute 与 dataset 两种提取方式并过滤空值", () => {
            const elements = [
                { getAttribute: (attr: string) => (attr === "data-node-id" ? "block-1" : null) },
                { dataset: { nodeId: "block-2" } },
                { getAttribute: () => null, dataset: {} },
                { getAttribute: () => "" },
            ];
            expect(extractBlockIDs(elements)).toEqual(["block-1", "block-2"]);
        });

        it("传入空数组或非数组时安全返回空数组", () => {
            expect(extractBlockIDs([])).toEqual([]);
            expect(extractBlockIDs(undefined)).toEqual([]);
        });
    });

    describe("computeBlockMenuItems 菜单项计算", () => {
        const mockI18n = {
            menuAddToDeck: "添加到卡组",
            menuAddToInbox: "加入材料收件箱",
            menuMakeCloze: "挖空并制卡",
            menuMakeOcclusion: "图片遮挡制卡",
            menuRemoveFromDeck: "从卡组移除",
        };

        const createConfig = (blockIDs: string[], inboxEnabled = true): BlockMenuConfig => ({
            blockIDs,
            modules: { inbox: inboxEnabled },
            i18n: mockI18n,
            actions: {
                addToDeck: vi.fn(),
                addToInbox: vi.fn(),
                makeCloze: vi.fn(),
                makeOcclusion: vi.fn(),
                removeFromDeck: vi.fn(),
            },
        });

        it("单块选中时：包含添加到卡组、收件箱、选区挖空、图片遮挡与移除", () => {
            const config = createConfig(["b-1"]);
            const items = computeBlockMenuItems(config);

            const ids = items.map(i => i.id);
            expect(ids).toEqual([
                "add-to-deck",
                "add-to-inbox",
                "make-cloze",
                "make-occlusion",
                "remove-from-deck",
            ]);

            // 单选无数量后缀
            const addToDeckItem = items.find(i => i.id === "add-to-deck");
            expect(addToDeckItem?.label).toBe("添加到卡组");

            // 点击回调测试
            addToDeckItem?.click();
            expect(config.actions.addToDeck).toHaveBeenCalledWith(["b-1"]);

            const makeClozeItem = items.find(i => i.id === "make-cloze");
            makeClozeItem?.click();
            expect(config.actions.makeCloze).toHaveBeenCalledWith("b-1");
        });

        it("多块选中时（如 3 块）：显示数量后缀，并隐藏单块专用的挖空与图片遮挡", () => {
            const config = createConfig(["b-1", "b-2", "b-3"]);
            const items = computeBlockMenuItems(config);

            const ids = items.map(i => i.id);
            expect(ids).toEqual([
                "add-to-deck",
                "add-to-inbox",
                "remove-from-deck",
            ]);

            const addToDeckItem = items.find(i => i.id === "add-to-deck");
            expect(addToDeckItem?.label).toBe("添加到卡组 ×3");

            const addToInboxItem = items.find(i => i.id === "add-to-inbox");
            expect(addToInboxItem?.label).toBe("加入材料收件箱 ×3");

            addToInboxItem?.click();
            expect(config.actions.addToInbox).toHaveBeenCalledWith(["b-1", "b-2", "b-3"]);
        });

        it("收件箱模块关闭时隐藏对应菜单项", () => {
            const config = createConfig(["b-1"], false);
            const items = computeBlockMenuItems(config);

            const ids = items.map(i => i.id);
            expect(ids).not.toContain("add-to-inbox");
        });

        it("块列表为空时返回空数组", () => {
            const config = createConfig([]);
            expect(computeBlockMenuItems(config)).toEqual([]);
        });
    });

    describe("formatClozeText 挖空文本包装", () => {
        it("前后包裹 == 标记", () => {
            expect(formatClozeText("关键定义")).toBe("==关键定义==");
            expect(formatClozeText("  带空格内容  ")).toBe("==带空格内容==");
        });

        it("空字符串或纯空白返回空", () => {
            expect(formatClozeText("")).toBe("");
            expect(formatClozeText("   ")).toBe("");
        });
    });
});
