// mergeDeckDueResults：「全部卡包」逐组查询合并的去重与计数重算（内核 3.8.6 全局 due 缺陷的插件侧兜底）
import { describe, expect, it } from "vitest";
import { CardState, mergeDeckDueResults, type RiffDueCardsData } from "../src/api/riff";

const card = (id: string, state: CardState, deckID = "deck1") => ({
    deckID,
    cardID: id,
    blockID: `b-${id}`,
    lapses: 0,
    reps: 0,
    state,
    lastReview: 0,
    nextDues: {},
});

const part = (cards: ReturnType<typeof card>[]): RiffDueCardsData => ({
    cards,
    unreviewedCount: cards.length,
    unreviewedNewCardCount: cards.filter(c => c.state === CardState.New).length,
    unreviewedOldCardCount: cards.filter(c => c.state !== CardState.New).length,
});

describe("mergeDeckDueResults", () => {
    it("合并多组卡片并重算新/旧计数", () => {
        const merged = mergeDeckDueResults([
            part([card("c1", CardState.New), card("c2", CardState.Review)]),
            part([card("c3", CardState.Learning, "deck2")]),
        ]);
        expect(merged.cards.map(c => c.cardID)).toEqual(["c1", "c2", "c3"]);
        expect(merged.unreviewedCount).toBe(3);
        expect(merged.unreviewedNewCardCount).toBe(1);
        expect(merged.unreviewedOldCardCount).toBe(2);
    });

    it("同卡多组去重（保留首个）", () => {
        const merged = mergeDeckDueResults([
            part([card("c1", CardState.New, "deck1")]),
            part([card("c1", CardState.New, "deck2")]),
        ]);
        expect(merged.cards).toHaveLength(1);
        expect(merged.cards[0].deckID).toBe("deck1");
        expect(merged.unreviewedCount).toBe(1);
    });

    it("容忍 null/undefined 分组（单组查询失败的降级语义）", () => {
        const merged = mergeDeckDueResults([null, undefined, part([card("c1", CardState.New)])]);
        expect(merged.cards.map(c => c.cardID)).toEqual(["c1"]);
    });

    it("全空输入返回全零结果", () => {
        const merged = mergeDeckDueResults([]);
        expect(merged.cards).toEqual([]);
        expect(merged.unreviewedCount).toBe(0);
        expect(merged.unreviewedNewCardCount).toBe(0);
        expect(merged.unreviewedOldCardCount).toBe(0);
    });
});
