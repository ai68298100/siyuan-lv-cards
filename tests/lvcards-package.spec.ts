import { describe, expect, it } from "vitest";
import {
    serializeLvCardsPackage,
    parseLvCardsPackage,
    previewLvCardsImport,
    normalizeCardFingerprint,
    type LvPackageCard,
} from "../src/core/lvcards-package";

describe("lvcards-package (P1 .lvcards format & deduplication)", () => {
    const sampleCards: LvPackageCard[] = [
        {
            id: "card-1",
            markdown: "HTTP 默认端口是 ==80==。",
            kind: "cloze",
            question: "HTTP 默认端口是 ____。",
            answer: "80",
            memo: "注意与 HTTPS 443 区分",
            tags: ["网络", "基础"],
            fsrsParams: { difficulty: 4.5, stability: 12.0 },
        },
        {
            id: "card-2",
            markdown: "什么是幂等性？\n\n任何多次执行产生与一次执行完全相同的影响。",
            kind: "qa",
            question: "什么是幂等性？",
            answer: "任何多次执行产生与一次执行完全相同的影响。",
            tags: ["架构"],
        },
    ];

    it("serializes deck and cards into valid lvcards.v1 JSON package", () => {
        const json = serializeLvCardsPackage(
            { id: "deck-cs", name: "计算机体系", description: "网络与分布式基础" },
            sampleCards
        );

        expect(typeof json).toBe("string");
        const parsed = JSON.parse(json);
        expect(parsed.format).toBe("lvcards.v1");
        expect(parsed.version).toBe(1);
        expect(parsed.deck.name).toBe("计算机体系");
        expect(parsed.deck.description).toBe("网络与分布式基础");
        expect(parsed.cards).toHaveLength(2);
        expect(parsed.cards[0].id).toBe("card-1");
        expect(parsed.cards[0].memo).toBe("注意与 HTTPS 443 区分");
        expect(parsed.metadata.cardCount).toBe(2);
        expect(parsed.metadata.tags).toEqual(expect.arrayContaining(["网络", "基础", "架构"]));
    });

    it("parses valid lvcards package correctly", () => {
        const json = serializeLvCardsPackage(
            { id: "deck-bio", name: "生物医学" },
            sampleCards
        );

        const result = parseLvCardsPackage(json);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.package.deck.name).toBe("生物医学");
            expect(result.package.cards).toHaveLength(2);
            expect(result.package.cards[0].question).toBe("HTTP 默认端口是 ____。");
        }
    });

    it("rejects invalid or corrupted package payloads with clear error messages", () => {
        expect(parseLvCardsPackage("").ok).toBe(false);
        expect(parseLvCardsPackage("{ not json }").ok).toBe(false);

        const badFormat = JSON.stringify({ format: "anki.v1", deck: { name: "test" }, cards: [] });
        const res1 = parseLvCardsPackage(badFormat);
        expect(res1.ok).toBe(false);
        if (!res1.ok) expect(res1.error).toContain("不支持的分享包格式");

        const noDeck = JSON.stringify({ format: "lvcards.v1", cards: [] });
        const res2 = parseLvCardsPackage(noDeck);
        expect(res2.ok).toBe(false);
        if (!res2.ok) expect(res2.error).toContain("缺少有效的卡组名称");
    });

    it("previews import and categorizes cards into new, duplicates, and updated", () => {
        const pkgResult = parseLvCardsPackage(
            serializeLvCardsPackage({ id: "deck-1", name: "测试卡组" }, [
                { id: "card-1", markdown: "HTTP 默认端口是 ==80==。", kind: "cloze" },
                { id: "card-2", markdown: "什么是幂等性？\n\n新修改后的定义", kind: "qa" },
                { id: "card-3", markdown: "TCP 三次握手的第二个报文是 ==SYN+ACK==。", kind: "cloze" },
                { id: "card-4", markdown: "这是无 ID 依据内容去重的卡片", kind: "qa" },
            ])
        );

        expect(pkgResult.ok).toBe(true);
        if (!pkgResult.ok) return;

        const existingCards = [
            // card-1: 完全一致的重复项
            { id: "card-1", markdown: "HTTP 默认端口是 ==80==。" },
            // card-2: ID 匹配但内容修改项
            { id: "card-2", markdown: "什么是幂等性？\n\n旧定义" },
            // 内容相同但 ID 不同的重复项
            { id: "diff-id", markdown: "这是无 ID 依据内容去重的卡片" },
        ];

        const preview = previewLvCardsImport(pkgResult.package, existingCards);

        expect(preview.deckName).toBe("测试卡组");
        expect(preview.total).toBe(4);

        // card-3 是全新卡
        expect(preview.newCards).toHaveLength(1);
        expect(preview.newCards[0].id).toBe("card-3");

        // card-1 和 card-4 判定为重复项
        expect(preview.duplicateCards).toHaveLength(2);
        expect(preview.duplicateCards.map(c => c.markdown)).toContain("HTTP 默认端口是 ==80==。");

        // card-2 是修改项
        expect(preview.updatedCards).toHaveLength(1);
        expect(preview.updatedCards[0].card.id).toBe("card-2");
        expect(preview.updatedCards[0].existing.markdown).toContain("旧定义");
    });

    it("normalizes fingerprints ignoring CRLF and whitespace variations", () => {
        const fp1 = normalizeCardFingerprint("Hello   World\r\nTest");
        const fp2 = normalizeCardFingerprint("Hello World\nTest");
        expect(fp1).toBe(fp2);
    });
});
