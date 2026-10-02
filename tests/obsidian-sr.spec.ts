import { describe, expect, it } from "vitest";
import {
    parseSrLine, parseSrMultiline, parseSrMarkdown, toSrLine, toSrMultiline, hasSrCloze, stripSrMarkers,
} from "../src/core/obsidian-sr";

describe("Obsidian SR 单行语法（AQ-11）", () => {
    it("q :: a → qa（与小驴标记语法 `术语:: 定义` 兼容）", () => {
        expect(parseSrLine("什么是FSRS :: 自适应调度算法")).toEqual({
            kind: "qa", front: "什么是FSRS", back: "自适应调度算法", deckHint: "",
        });
        expect(parseSrLine("术语:: 定义")?.kind).toBe("qa");
    });

    it("q ::: a → qa-reversed（双向语法，方向保留在类型上）", () => {
        expect(parseSrLine("front ::: back")).toMatchObject({ kind: "qa-reversed", front: "front", back: "back" });
    });

    it("歧义/缺边返回 null", () => {
        expect(parseSrLine("a :: b :: c")).toBeNull();
        expect(parseSrLine(" ::: back")).toBeNull();
        expect(parseSrLine("front :: ")).toBeNull();
        expect(parseSrLine("普通段落")).toBeNull();
        expect(parseSrLine("")).toBeNull();
    });

    it("deck tag 提取：子路径保留、裸 tag 与无 tag 为空", () => {
        expect(parseSrLine("q :: a #flashcards/考研/政治")?.deckHint).toBe("考研/政治");
        expect(parseSrLine("q :: a #flashcards")?.deckHint).toBe("");
        expect(parseSrLine("q :: a")?.deckHint).toBe("");
        expect(parseSrLine("q :: a #other/tag")?.deckHint).toBe("");
    });

    it("媒体嵌入原样透传（不在解析层剥离）", () => {
        const c = parseSrLine("看图 ![[img.png]] 问什么 :: 答案");
        expect(c?.front).toContain("![[img.png]]");
    });
});

describe("Obsidian SR 多行与 cloze（AQ-11）", () => {
    it("多行 ? 分隔 → qa；?? → qa-reversed", () => {
        expect(parseSrMultiline(["第一行问题", "第二行", "?", "答案行"])).toEqual({
            kind: "qa", front: "第一行问题\n第二行", back: "答案行", deckHint: "",
        });
        expect(parseSrMultiline(["q", "??", "a"])?.kind).toBe("qa-reversed");
    });

    it("分隔符缺位/在首尾/缺边返回 null", () => {
        expect(parseSrMultiline(["q", "a"])).toBeNull();
        expect(parseSrMultiline(["?", "a"])).toBeNull();
        expect(parseSrMultiline(["q", "?"])).toBeNull();
        expect(parseSrMultiline(["q", "?", ""])).toBeNull();
    });

    it("cloze：含非空 ==…== 的块整块即卡", () => {
        expect(hasSrCloze("FSRS 状态是 ==未学习、复习==")).toBe(true);
        expect(hasSrCloze("====")).toBe(false);
        expect(hasSrCloze("无高亮")).toBe(false);
        const cards = parseSrMarkdown("首都 ==北京== 的别名？");
        expect(cards).toEqual([{ kind: "cloze", front: "首都 ==北京== 的别名？", back: "", deckHint: "" }]);
    });

    it("parseSrMarkdown：混合块取全部 qa 行；无 qa 时退多行；再退 cloze", () => {
        const mixed = parseSrMarkdown("a :: b\ntext\n");
        expect(mixed).toHaveLength(1);
        const multi = parseSrMarkdown("问题\n?\n答案\n");
        expect(multi).toHaveLength(1);
        expect(multi?.[0].kind).toBe("qa");
        expect(parseSrMarkdown("普通文本")).toHaveLength(0);
    });

    it("stripSrMarkers 剥高亮/加粗/行内代码；标记制卡侧再剥 deck tag", () => {
        expect(stripSrMarkers("==重点== 和 **粗** 与 `code`")).toBe("重点 和 粗 与 code");
    });
});

describe("Obsidian SR 导出（AQ-11）", () => {
    it("toSrLine 往返幂等（单行解析→导出→再解析）", () => {
        const parsed = parseSrLine("什么是FSRS :: 自适应调度算法")!;
        const line = toSrLine(parsed.front, parsed.back);
        expect(line).toBe("什么是FSRS :: 自适应调度算法");
        expect(parseSrLine(line)).toEqual(parsed);
        // 双向导出
        const rev = toSrLine("f", "b", true);
        expect(parseSrLine(rev)?.kind).toBe("qa-reversed");
    });

    it("toSrMultiline 保留换行并往返", () => {
        const text = toSrMultiline("第一行\n第二行", "答案");
        expect(parseSrMultiline(text.split("\n"))).toMatchObject({ front: "第一行\n第二行", back: "答案" });
        expect(parseSrMultiline(toSrMultiline("f", "b", true).split("\n"))?.kind).toBe("qa-reversed");
    });

    it("空边导出直接抛错（不产出坏卡）", () => {
        expect(() => toSrLine("f", " ")).toThrow();
        expect(() => toSrMultiline("", "b")).toThrow();
    });
});
