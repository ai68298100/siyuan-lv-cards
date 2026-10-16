import { beforeEach, describe, expect, it, vi } from "vitest";

const { addRiffCards, getBlockAttrs, getRiffDueCards, sqlQuery } = vi.hoisted(() => ({
    addRiffCards: vi.fn(),
    getBlockAttrs: vi.fn(),
    getRiffDueCards: vi.fn(),
    sqlQuery: vi.fn(),
}));

vi.mock("../src/api/riff", () => ({
    addRiffCards,
    getRiffDueCards,
}));

vi.mock("../src/api/siyuan", () => ({
    getBlockAttrs,
    sqlQuery,
    SQL_QUERY_CHUNK_SIZE: 400,
    SQL_QUERY_CONCURRENCY: 3,
}));

import { addRiffCards as addCards, cachedDueBlockIDs, formatRiffCardEntryError, invalidateDueCache, RiffCardEntryGateError } from "../src/api/due-shared";

describe("cachedDueBlockIDs", () => {
    beforeEach(() => {
        invalidateDueCache();
        getRiffDueCards.mockReset();
        addRiffCards.mockReset();
        getBlockAttrs.mockReset();
        sqlQuery.mockReset();
    });

    it("保留读取错误，让依赖它的页面显示可重试错误而不是空结果", async () => {
        getRiffDueCards.mockRejectedValueOnce(new Error("kernel offline"));
        await expect(cachedDueBlockIDs()).rejects.toThrow("kernel offline");
    });

    it("返回有效块 ID，并在失败后允许缓存层重新读取", async () => {
        getRiffDueCards.mockRejectedValueOnce(new Error("kernel offline"));
        getRiffDueCards.mockResolvedValueOnce({ cards: [{ blockID: "a" }, {}, { blockID: "b" }] });

        await expect(cachedDueBlockIDs()).rejects.toThrow("kernel offline");
        await expect(cachedDueBlockIDs()).resolves.toEqual(["a", "b"]);
        expect(getRiffDueCards).toHaveBeenCalledTimes(2);
    });

    it("共享入组门禁先验证整批内容，再调用内核入口", async () => {
        sqlQuery.mockResolvedValueOnce([
            { id: "good", markdown: "Question ==Answer==" },
            { id: "bad", markdown: "==Answer==" },
        ]);

        await expect(addCards("deck", ["good", "bad"])).rejects.toBeInstanceOf(RiffCardEntryGateError);
        expect(addRiffCards).not.toHaveBeenCalled();

        sqlQuery.mockResolvedValueOnce([{ id: "good", markdown: "Question ==Answer==" }]);
        addRiffCards.mockResolvedValueOnce({ id: "deck" });
        await expect(addCards("deck", ["good"])).resolves.toEqual({ id: "deck" });
        expect(addRiffCards).toHaveBeenCalledWith("deck", ["good"]);
    });

    it("仅在图片题面具有非空合法遮挡区域时允许无挖空标记的卡", async () => {
        sqlQuery.mockResolvedValueOnce([{ id: "occlusion", markdown: "![image](img.png)" }]);
        getBlockAttrs.mockResolvedValueOnce({ "lv-occlusion": JSON.stringify({ v: 1, rects: [{ x: 0, y: 0, w: 0.5, h: 0.5 }] }) });
        addRiffCards.mockResolvedValueOnce(null);

        await expect(addCards("deck", ["occlusion"])).resolves.toBeNull();
        expect(getBlockAttrs).toHaveBeenCalledWith("occlusion");
        expect(addRiffCards).toHaveBeenCalledWith("deck", ["occlusion"]);
    });

    it("读取块内容失败时 fail closed，不调用内核写入", async () => {
        sqlQuery.mockRejectedValueOnce(new Error("kernel offline"));
        await expect(addCards("deck", ["unknown"])).rejects.toThrow("kernel offline");
        expect(addRiffCards).not.toHaveBeenCalled();
    });

    it("验证和写入都去除重复 block ID", async () => {
        sqlQuery.mockResolvedValueOnce([{ id: "good", markdown: "Question ==Answer==" }]);
        addRiffCards.mockResolvedValueOnce({ id: "deck" });
        await addCards("deck", ["good", "good"]);
        expect(addRiffCards).toHaveBeenCalledWith("deck", ["good"]);
    });

    it("门禁错误在 UI 边缘映射为本地化提示", () => {
        const error = new RiffCardEntryGateError([{ blockID: "bad", ok: false, issue: "invalid-occlusion" }]);
        expect(formatRiffCardEntryError(error, { editor: { qualityInvalidOcclusion: "遮挡区域无效" } })).toBe("遮挡区域无效");
    });
});
