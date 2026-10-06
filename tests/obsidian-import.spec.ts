import { describe, expect, it } from "vitest";
import {
    parseSrFileBlocks, planObsidianImport, composeObsidianImportMarkdown,
    deckNameFor, groupByDeckHint, normalizeObLedger, mergeObLedger, partitionByLedger,
    srExportLine, composeSrExport,
} from "../src/core/obsidian-import";

// Obsidian SR 导入编排：块级解析（多行/单行/挖空混排）、文件内去重、一卡一段落可对位
describe("obsidian-import（导入编排）", () => {
    it("块级解析：多行 ? 块、单行 :: 卡、挖空块混排一文件", () => {
        const md = [
            "多行问题？跨行",
            "?",
            "多行答案",
            "",
            "光的符号是 c :: 真空光速 #flashcards/物理/光学",
            "",
            "TCP 的三次握手是 ==建立可靠连接== 的过程",
        ].join("\n");
        const cards = parseSrFileBlocks(md);
        expect(cards).toHaveLength(3);
        expect(cards[0]).toMatchObject({ kind: "qa", front: "多行问题？跨行", back: "多行答案", deckHint: "" });
        expect(cards[1]).toMatchObject({ kind: "qa", back: "真空光速", deckHint: "物理/光学" });
        expect(cards[2]).toMatchObject({ kind: "cloze" });
    });

    it("计划：指纹去重（同文同向只留一张）、reversed 诚实计数、deckHint 分布", () => {
        const md = [
            "什么是熵 :: 系统无序度的度量 #flashcards/物理",
            "什么是熵 :: 系统无序度的度量 #flashcards/物理",
            "熵的英文 :: entropy",
            "双向卡 ::: 会按正向导入",
            "",
            "==整块挖空==",
        ].join("\n");
        const plan = planObsidianImport(md);
        expect(plan.totalParsed).toBe(5);
        expect(plan.cards).toHaveLength(4);
        expect(plan.duplicates).toBe(1);
        expect(plan.reversed).toBe(1);
        expect(plan.byDeckHint["物理"]).toBe(2);
        expect(plan.byDeckHint["∅"]).toBe(3);
    });

    it("compose：qa 单行内联 ==答案==、多行题面换行后接答案、行首 # 转义、挖空原样", () => {
        const plan = planObsidianImport([
            "# 标题样式问题 :: 答案",
            "",
            "多行",
            "题面",
            "?",
            "多行答案",
            "",
            "# 开头的挖空块 ==内容==",
        ].join("\n"));
        const md = composeObsidianImportMarkdown(plan.cards);
        const blocks = md.split("\n\n");
        expect(blocks[0]).toBe("\\# 标题样式问题 ==答案==");
        expect(blocks[1]).toBe("多行\n题面\n==多行答案==");
        expect(blocks[2]).toBe("\\# 开头的挖空块 ==内容==");
    });

    it("deck tag 从题面/答案剥离（含带子路径与裸 tag 形态）", () => {
        const plan = planObsidianImport("Q :: 答案文字 #flashcards/a/b\n\n裸tag卡 :: 答案2 #flashcards");
        expect(plan.cards[0].markdown).toBe("Q ==答案文字==");
        expect(plan.cards[1].markdown).toBe("裸tag卡 ==答案2==");
    });

    it("对位约定：每卡恰一个空行分段（数量守恒）", () => {
        const plan = planObsidianImport("A :: 1\n\nB :: 2\n\nC ==3==");
        const md = composeObsidianImportMarkdown(plan.cards);
        expect(md.split("\n\n").length).toBe(plan.cards.length);
        expect(plan.cards.map(c => c.kind)).toEqual(["qa", "qa", "cloze"]);
    });

    it("空文件/无闪卡内容回空计划", () => {
        expect(planObsidianImport("").cards).toEqual([]);
        expect(planObsidianImport("普通笔记段落，没有闪卡语法。").cards).toEqual([]);
    });
});

// W2：deckHint 分组落库 + 跨运行弱台账（幂等重导）
describe("obsidian-import W2（分组与台账）", () => {
    it("deckNameFor：根与子路径两种命名", () => {
        expect(deckNameFor("笔记", "")).toBe("Obsidian: 笔记");
        expect(deckNameFor("笔记", "物理/光学")).toBe("Obsidian: 笔记/物理/光学");
    });

    it("groupByDeckHint：按首现顺序分组，根组跟随其首现位置", () => {
        const plan = planObsidianImport("A :: 1 #flashcards/物理\n\nB :: 2\n\nC :: 3 #flashcards/物理");
        const groups = groupByDeckHint(plan.cards);
        expect(groups.map(g => g.hint)).toEqual(["物理", ""]);
        expect(groups[0].cards).toHaveLength(2);
        expect(groups[1].cards).toHaveLength(1);
    });

    it("台账清洗：坏条目剔除、同指纹保留最新、限量", () => {
        const raw = [
            { fingerprint: "f1", deckID: "d1", blockID: "b1", importedAt: 100 },
            { fingerprint: "f1", deckID: "d2", blockID: "b2", importedAt: 200 }, // 更新落点
            { fingerprint: "", blockID: "b3", importedAt: 300 },          // 剔除
            { fingerprint: "f4", deckID: "d", blockID: "", importedAt: 400 }, // 剔除
            { fingerprint: "f5", blockID: "b5" },                          // importedAt 缺省 0
        ];
        const ledger = normalizeObLedger(raw);
        expect(ledger).toHaveLength(2);
        expect(ledger.find(e => e.fingerprint === "f1")?.deckID).toBe("d2");
        const many = Array.from({ length: 60000 }, (_, i) => ({ fingerprint: `f${i}`, blockID: `b${i}`, importedAt: i }));
        expect(normalizeObLedger(many)).toHaveLength(50000);
    });

    it("merge 覆盖同指纹；partition：台账已有指纹进 already、其余 fresh", () => {
        const current = normalizeObLedger([{ fingerprint: "f1", deckID: "d0", blockID: "b0", importedAt: 1 }]);
        const merged = mergeObLedger(current, [{ fingerprint: "f1", deckID: "d1", blockID: "b1", importedAt: 2 }, { fingerprint: "f2", blockID: "b2", importedAt: 2 }]);
        expect(merged).toHaveLength(2);
        expect(merged.find(e => e.fingerprint === "f1")?.blockID).toBe("b1");

        const plan = planObsidianImport("A :: 1\n\nB :: 2\n\nC :: 3");
        const { fresh, already } = partitionByLedger(plan.cards, normalizeObLedger([{ fingerprint: plan.cards[1].fingerprint, blockID: "bx", importedAt: 9 }]));
        expect(already.map(c => c.markdown)).toEqual(["B ==2=="]);
        expect(fresh).toHaveLength(2);
    });
});

// W3：导出回 Obsidian SR（qa 识别/cloze 降级/往返闭环）
describe("obsidian-import W3（SR 导出）", () => {
    it("快速问答块（front ==back==）→ qa 行；带子路径 tag", () => {
        expect(srExportLine("什么是熵 ==系统无序度的度量==")).toEqual({ kind: "qa", line: "什么是熵 :: 系统无序度的度量 #flashcards" });
        expect(srExportLine("Q ==A==", { deckHint: "物理/" }).line).toBe("Q :: A #flashcards/物理");
    });

    it("多挖空/尾部有内容/无标记 → cloze 原样降级（不强行拆问答）", () => {
        expect(srExportLine("TCP 的 ==三次握手== 与 ==四次挥手==").kind).toBe("cloze");
        expect(srExportLine("前缀 ==答案== 还有后缀").kind).toBe("cloze");
        expect(srExportLine("纯文本卡面没有标记").kind).toBe("cloze");
        expect(srExportLine("纯文本卡面没有标记").line).toBe("纯文本卡面没有标记 #flashcards");
    });

    it("往返闭环：导出行可被块级解析器原样解析回同文卡", () => {
        const exported = composeSrExport([
            srExportLine("什么是熵 ==系统无序度的度量=="),
            srExportLine("TCP 的 ==三次握手== 与 ==四次挥手=="),
        ]);
        const blocks = exported.split("\n\n");
        expect(blocks[0]).toBe("什么是熵 :: 系统无序度的度量 #flashcards");
        expect(blocks[1].endsWith("#flashcards")).toBe(true);
        const reparsed = parseSrFileBlocks(exported);
        expect(reparsed[0]).toMatchObject({ kind: "qa", front: "什么是熵", back: "系统无序度的度量" });
        expect(reparsed[1].kind).toBe("cloze");
    });
});
