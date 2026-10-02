import { describe, expect, it } from "vitest";
import { parseCards, estimateTokens } from "../src/api/ai-parse";

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

describe("estimateTokens", () => {
    it("按 4 字符/token 向上取整", () => {
        expect(estimateTokens("")).toBe(0);
        expect(estimateTokens("abcd")).toBe(1);
        expect(estimateTokens("abcde")).toBe(2);
        expect(estimateTokens("一二三四五六七八")).toBe(2);
    });
});
