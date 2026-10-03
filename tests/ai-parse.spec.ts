import { describe, expect, it } from "vitest";
import { parseCards, estimateTokens, PARSE_LIMITS } from "../src/api/ai-parse";

describe("parseCards（AI 输出宽松解析）", () => {
    it("裸 JSON 数组直读", () => {
        expect(parseCards('[{"q":"Q1","a":"A1"},{"q":"Q2","a":"A2"}]')).toEqual([
            { q: "Q1", a: "A1" },
            { q: "Q2", a: "A2" },
        ]);
    });

    it("容忍 ```json 围栏与前后噪声", () => {
        const raw = '好的，以下是卡片：\n```json\n[{"q":"问","a":"答"}]\n```\n希望有帮助';
        expect(parseCards(raw)).toEqual([{ q: "问", a: "答" }]);
    });

    it("question/answer 字段别名兼容", () => {
        expect(parseCards('[{"question":"Q","answer":"A"}]')).toEqual([{ q: "Q", a: "A" }]);
    });

    it("d 难度标注：1-3 保留，越界/缺失不产出", () => {
        const out = parseCards('[{"q":"a","a":"b","d":2},{"q":"c","a":"d","d":5},{"q":"e","a":"f"}]');
        expect(out[0].d).toBe(2);
        expect(out[1].d).toBeUndefined();
        expect(out[2].d).toBeUndefined();
    });

    it("空 q/空 a 的条目被过滤", () => {
        expect(parseCards('[{"q":"","a":"x"},{"q":"y","a":""},{"q":"ok","a":"ok"}]')).toEqual([{ q: "ok", a: "ok" }]);
    });

    it("非数组/坏 JSON 抛错（调用方展示原因）", () => {
        expect(() => parseCards('{"q":"not an array"}')).toThrow("not an array");
        expect(() => parseCards("完全不是 JSON")).toThrow();
    });

    it("截断噪声中的数组片段可提取（宽容口径边界）", () => {
        expect(parseCards('prefix [{"q":"k","a":"v"}] suffix')).toEqual([{ q: "k", a: "v" }]);
    });
});

describe("AQ-16 余量：解析上限（v0.114.0）", () => {
    it("数量封顶：超过 maxCards 丢弃多余（保留前 N）", () => {
        const many = Array.from({ length: PARSE_LIMITS.maxCards + 10 }, (_, i) => ({ q: `问题${i}`, a: `答案${i}` }));
        const out = parseCards(JSON.stringify(many));
        expect(out).toHaveLength(PARSE_LIMITS.maxCards);
        expect(out[0].q).toBe("问题0");
    });

    it("超长卡丢弃：q/a 超过字符上限不产出（其余正常保留）", () => {
        const ok = { q: "短问题", a: "短答案" };
        const longQ = { q: "长".repeat(PARSE_LIMITS.maxQLen + 1), a: "ok" };
        const longA = { q: "ok", a: "长".repeat(PARSE_LIMITS.maxALen + 1) };
        const out = parseCards(JSON.stringify([longQ, longA, ok]));
        expect(out).toEqual([ok]);
    });
});

describe("estimateTokens", () => {
    it("按 4 字符/token 向上取整", () => {
        expect(estimateTokens("")).toBe(0);
        expect(estimateTokens("abcd")).toBe(1);
        expect(estimateTokens("abcde")).toBe(2);
        expect(estimateTokens("一二三四五六七八")).toBe(2);
    });
});

describe("G3-call 嵌套数组修复（v0.141.0）", () => {
    it("嵌套数组 [[card],[card]] 展平后正常解析", () => {
        const raw = '[{"q":"Q1","a":"A1"},[{"q":"Q2","a":"A2"}],[{"q":"Q3","a":"A3"}]]';
        const cards = parseCards(raw);
        expect(cards).toHaveLength(3);
        expect(cards[0].q).toBe("Q1");
        expect(cards[2].q).toBe("Q3");
    });

    it("嵌套数组 + 围栏 + 数量上限组合", () => {
        const inner = Array.from({ length: 60 }, (_, i) => ({ q: `Q${i}`, a: `A${i}` }));
        const nested = inner.map(c => [c]);
        const raw = "```json\n" + JSON.stringify(nested) + "\n```";
        const cards = parseCards(raw);
        expect(cards).toHaveLength(50); // PARSE_LIMITS.maxCards
    });
});
