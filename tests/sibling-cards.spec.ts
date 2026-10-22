import { describe, expect, it } from "vitest";
import {
    disperseSiblings,
    filterBurySiblings,
    type SiblingCardLike,
} from "../src/core/sibling-cards";

describe("sibling-cards bury & disperse engine", () => {
    const mockCards: SiblingCardLike[] = [
        { blockID: "block-1", cardID: "card-1-1" },
        { blockID: "block-1", cardID: "card-1-2" }, // 同源兄弟卡
        { blockID: "block-2", cardID: "card-2-1" },
        { blockID: "block-3", cardID: "card-3-1" },
        { blockID: "block-2", cardID: "card-2-2" }, // 同源兄弟卡
    ];

    it("filters out same-block sibling cards to prevent immediate spoiler in the same session", () => {
        const { retained, buriedCount, buriedBlockIDs } = filterBurySiblings(mockCards);
        expect(retained).toHaveLength(3);
        expect(retained.map(c => c.cardID)).toEqual(["card-1-1", "card-2-1", "card-3-1"]);
        expect(buriedCount).toBe(2);
        expect(buriedBlockIDs).toEqual(["block-1", "block-2"]);
    });

    it("handles cards with empty blockID safely without burying them", () => {
        const cardsWithEmpty: SiblingCardLike[] = [
            { blockID: "", cardID: "card-empty-1" },
            { blockID: "", cardID: "card-empty-2" },
            { blockID: "block-a", cardID: "card-a-1" },
        ];
        const { retained, buriedCount } = filterBurySiblings(cardsWithEmpty);
        expect(retained).toHaveLength(3);
        expect(buriedCount).toBe(0);
    });

    it("disperses siblings to maximize distance when retaining full queue", () => {
        const dispersed = disperseSiblings(mockCards);
        expect(dispersed).toHaveLength(5);
        // 第一轮各出一张，第二轮再出各自的兄弟卡
        const firstRound = dispersed.slice(0, 3).map(c => c.blockID);
        expect(new Set(firstRound).size).toBe(3);
    });
});
