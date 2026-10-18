import { describe, expect, it } from "vitest";
import {
    serializeLvCardsPackage,
    parseLvCardsPackage,
    previewLvCardsImport,
    normalizeCardFingerprint,
    type LvCardsPackage,
    type LvPackageCard,
} from "../src/core/lvcards-package";

describe("lvcards-package (P1 .lvcards format & deduplication)", () => {
    const packageWith = (cards: LvPackageCard[]): LvCardsPackage => ({
        format: "lvcards.v1",
        version: 1,
        createdAt: 0,
        generator: "test",
        deck: { id: "deck-1", name: "测试卡组" },
        cards,
    });

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

    it.each([
        [{ toString: null, valueOf: null }, "unknown"],
        [{ toString: {}, valueOf: "invalid" }, "unknown"],
        [[{ toString: null }], "unknown"],
        [null, "unknown"],
        [42, "42"],
        [false, "false"],
    ])("rejects unknown format structures without coercion errors (%j)", (format, expectedFormat) => {
        const raw = JSON.stringify({ format, deck: { name: "测试" }, cards: [] });
        expect(parseLvCardsPackage(raw)).toEqual({ ok: false, error: `不支持的分享包格式：${expectedFormat}` });
    });

    it("normalizes blank IDs into stable generated identities without replacing explicit IDs", () => {
        const raw = JSON.stringify({
            format: "lvcards.v1",
            deck: { name: "测试" },
            cards: [
                { markdown: "missing ID" },
                { id: " \t", markdown: "blank ID" },
                { id: " gen-1 ", markdown: "explicit ID" },
                { id: "gen-1-1", markdown: "explicit suffix" },
                { id: 12, markdown: "numeric ID" },
            ],
        });
        const first = parseLvCardsPackage(raw);
        const second = parseLvCardsPackage(raw);
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (!first.ok || !second.ok) return;

        const ids = first.package.cards.map(card => card.id);
        expect(ids).toEqual(["gen-1-2", "gen-2", "gen-1", "gen-1-1", "gen-5"]);
        expect(new Set(ids).size).toBe(ids.length);
        expect(second.package.cards.map(card => card.id)).toEqual(ids);
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

    it("normalizes line endings and surrounding whitespace without changing source semantics", () => {
        const fp1 = normalizeCardFingerprint("  Hello World\r\nTest\rLast  ");
        const fp2 = normalizeCardFingerprint("Hello World\nTest\nLast");
        expect(fp1).toBe(fp2);
    });

    it.each([
        ["`a  b` ==answer==", "`a b` ==answer=="],
        ["line  \nsecond ==answer==", "line\nsecond ==answer=="],
        ["```\n    x\n```\n==answer==", "```\n  x\n```\n==answer=="],
    ])("preserves meaningful Markdown whitespace when deduplicating", (existingMarkdown, incomingMarkdown) => {
        const card: LvPackageCard = { id: "incoming", markdown: incomingMarkdown, kind: "code" };
        const existing = { id: "existing", markdown: existingMarkdown };
        expect(previewLvCardsImport(packageWith([card]), [existing]).newCards).toEqual([card]);
        const changed = { ...card, id: existing.id };
        expect(previewLvCardsImport(packageWith([changed]), [existing]).updatedCards).toEqual([{ card: changed, existing }]);
    });

    it.each([null, [], "bad", { markdown: " " }, { markdown: 42 }])("rejects mixed packages rather than silently dropping an invalid card (%j)", invalid => {
        const raw = JSON.stringify({ format: "lvcards.v1", deck: { name: "Mixed" }, cards: [sampleCards[0], invalid] });
        expect(parseLvCardsPackage(raw)).toEqual({ ok: false, error: "分享包第 2 张卡片缺少有效正文" });
    });

    it("deduplicates accepted package content while retaining same-ID conflicts", () => {
        const cards: LvPackageCard[] = [
            { id: "first", markdown: "same content", kind: "qa" },
            { id: "second", markdown: "same content\r\n", kind: "qa" },
            { id: "first", markdown: "same content", kind: "qa" },
            { id: "first", markdown: "changed content", kind: "qa" },
            { id: "third", markdown: "changed content", kind: "qa" },
        ];
        const preview = previewLvCardsImport(packageWith(cards), []);

        expect(preview.total).toBe(5);
        expect(preview.newCards).toEqual([cards[0], cards[4]]);
        expect(preview.duplicateCards).toEqual([cards[1], cards[2]]);
        expect(preview.updatedCards).toEqual([{ card: cards[3], existing: cards[0] }]);
        expect(preview.newCards.length + preview.duplicateCards.length + preview.updatedCards.length).toBe(preview.total);
    });

    it("keeps an existing-ID change visible when its content matches another existing card", () => {
        const card: LvPackageCard = { id: "changed", markdown: "shared content", kind: "qa" };
        const existing = { id: "changed", markdown: "old content" };
        const preview = previewLvCardsImport(packageWith([card]), [
            existing,
            { id: "another", markdown: "shared content" },
        ]);

        expect(preview.newCards).toEqual([]);
        expect(preview.duplicateCards).toEqual([]);
        expect(preview.updatedCards).toEqual([{ card, existing }]);
    });

    it("retains a package-ID conflict even when its first entry was skipped as duplicate content", () => {
        const cards: LvPackageCard[] = [
            { id: "same-id", markdown: "existing content", kind: "qa" },
            { id: "same-id", markdown: "changed content", kind: "qa" },
        ];
        const preview = previewLvCardsImport(packageWith(cards), [
            { id: "existing-id", markdown: "existing content" },
        ]);

        expect(preview.newCards).toEqual([]);
        expect(preview.duplicateCards).toEqual([cards[0]]);
        expect(preview.updatedCards).toEqual([{ card: cards[1], existing: cards[0] }]);
    });

    it("does not treat blank identities as a shared ID when previewing packages directly", () => {
        const cards: LvPackageCard[] = [
            { id: "", markdown: "first content", kind: "qa" },
            { id: " ", markdown: "second content", kind: "qa" },
            { id: "", markdown: "first content\r\n", kind: "qa" },
        ];
        const preview = previewLvCardsImport(packageWith(cards), []);

        expect(preview.newCards).toEqual(cards.slice(0, 2));
        expect(preview.duplicateCards).toEqual([cards[2]]);
        expect(preview.updatedCards).toEqual([]);
    });
});
