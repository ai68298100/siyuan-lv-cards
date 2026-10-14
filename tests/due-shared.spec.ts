import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRiffDueCards } = vi.hoisted(() => ({ getRiffDueCards: vi.fn() }));

vi.mock("../src/api/riff", () => ({
    addRiffCards: vi.fn(),
    getRiffDueCards,
}));

import { cachedDueBlockIDs, invalidateDueCache } from "../src/api/due-shared";

describe("cachedDueBlockIDs", () => {
    beforeEach(() => {
        invalidateDueCache();
        getRiffDueCards.mockReset();
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
});
