import { describe, expect, it } from "vitest";
import { availableLevels, hintStats, logHint, nextHint, type HintLevelsInput } from "../src/core/hint-ladder";

// BJ-2 分级提示阶梯：稀疏阶梯/下一级推进/日志与统计/不自动提交评分
const full: HintLevelsInput = {
    "recall-target": "回答：XX 的定义",
    keyword: "线粒体",
    context: "出自细胞生物学第 3 章",
    explanation: "线粒体是有氧呼吸的主要场所，为细胞提供 ATP",
    full: "线粒体是细胞的能量工厂",
};

describe("availableLevels（稀疏阶梯）", () => {
    it("全量输入：五级齐全", () => {
        expect(availableLevels(full)).toEqual(["recall-target", "keyword", "context", "explanation", "full"]);
    });

    it("稀疏输入：缺失级别自动跳过，full 兜底", () => {
        expect(availableLevels({ full: "答案" })).toEqual(["full"]);
        expect(availableLevels({ keyword: "关键词", full: "答案" })).toEqual(["keyword", "full"]);
    });
});

describe("nextHint（下一级推进）", () => {
    it("从 null 开始返回第一个可用级别", () => {
        expect(nextHint(full, null)).toEqual({ level: "recall-target", text: "回答：XX 的定义" });
    });

    it("逐级推进到 full 后循环回首（阶梯可重复使用）", () => {
        expect(nextHint(full, "recall-target")?.level).toBe("keyword");
        expect(nextHint(full, "keyword")?.level).toBe("context");
        expect(nextHint(full, "explanation")?.level).toBe("full");
        expect(nextHint(full, "full")?.level).toBe("recall-target"); // 循环
    });

    it("稀疏阶梯跳过缺失级别", () => {
        const sparse: HintLevelsInput = { keyword: "关键词", full: "答案" };
        expect(nextHint(sparse, null)?.level).toBe("keyword");
        expect(nextHint(sparse, "keyword")?.level).toBe("full"); // 跳过 context/explanation
    });

    it("空输入：full 兜底仍返回（即翻面语义，text 为 undefined）", () => {
        const r = nextHint({} as HintLevelsInput, null);
        expect(r?.level).toBe("full");
        expect(r?.text).toBeUndefined();
    });
});

describe("hintStats（提示使用统计）", () => {
    it("空日志全零", () => {
        expect(hintStats([])).toEqual({ totalHints: 0, cardsWithHints: 0, deepest: null });
    });

    it("计数、去重卡数、最深级别", () => {
        const log = [
            logHint("c1", "keyword", 1000),
            logHint("c1", "context", 2000),
            logHint("c2", "keyword", 3000),
        ];
        const s = hintStats(log);
        expect(s.totalHints).toBe(3);
        expect(s.cardsWithHints).toBe(2);
        expect(s.deepest).toBe("context"); // c2 的 keyword < c1 的 context
    });
});
