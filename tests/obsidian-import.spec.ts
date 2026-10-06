import { describe, expect, it } from "vitest";
import { parseSrFileBlocks, planObsidianImport, composeObsidianImportMarkdown } from "../src/core/obsidian-import";

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
