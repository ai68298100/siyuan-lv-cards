import { describe, expect, it } from "vitest";
import {
    hasDelimitedQa,
    parseDelimitedQa,
    proposeLegacyCardUpgrades,
    upgradeLegacyCardToStandard,
} from "../src/core/delimited-qa";

describe("delimited-qa & legacy card upgrade engine", () => {
    it("parses double-colon concept cards (::)", () => {
        const res = parseDelimitedQa("光合作用的主要产物 :: 葡萄糖与氧气");
        expect(res).toEqual({
            question: "光合作用的主要产物",
            answer: "葡萄糖与氧气",
            format: "double-colon",
        });
        expect(hasDelimitedQa("光合作用的主要产物 :: 葡萄糖与氧气")).toBe(true);
    });

    it("parses Q: / A: and Question: / Answer: cards", () => {
        const res = parseDelimitedQa("Q: 什么是 JavaScript 闭包？\nA: 能够访问其外部函数作用域变量的函数");
        expect(res).toEqual({
            question: "什么是 JavaScript 闭包？",
            answer: "能够访问其外部函数作用域变量的函数",
            format: "qa-prefix",
        });
        expect(hasDelimitedQa("Q: 什么是 JavaScript 闭包？\nA: 能够访问其外部函数作用域变量的函数")).toBe(true);
    });

    it("parses 问：/ 答：and 问题：/ 答案：cards", () => {
        const res = parseDelimitedQa("问题：TCP 三次握手的作用是什么？\n答案：确认客户端与服务端的发送与接收能力正常");
        expect(res).toEqual({
            question: "TCP 三次握手的作用是什么？",
            answer: "确认客户端与服务端的发送与接收能力正常",
            format: "qa-chinese",
        });
        expect(hasDelimitedQa("问：质能方程？\n答：E = mc²")).toBe(true);
    });

    it("ignores text that already contains standard == markers or lacks delimiters", () => {
        expect(parseDelimitedQa("普通段落文本")).toBeNull();
        expect(hasDelimitedQa("普通段落文本")).toBe(false);
        expect(parseDelimitedQa("已有的 ==挖空答案==")).toBeNull();
    });

    it("upgrades legacy cards to standard Little Donkey flashcards with == markers", () => {
        expect(upgradeLegacyCardToStandard("线粒体 :: 细胞的动力工厂")).toEqual({
            markdown: "线粒体 ==细胞的动力工厂==",
            reason: "将概念卡 :: 语法升级为标准闪卡挖空标记",
        });

        expect(upgradeLegacyCardToStandard("Q: 什么是纯函数？\nA: 相同输入始终产生相同输出且无副作用的函数")).toEqual({
            markdown: "什么是纯函数？ ==相同输入始终产生相同输出且无副作用的函数==",
            reason: "将问答文本升级为标准闪卡挖空标记",
        });

        // 块备注合并升级
        expect(upgradeLegacyCardToStandard("mitochondria", "线粒体（真核细胞器）")).toEqual({
            markdown: "mitochondria ==线粒体（真核细胞器）==",
            reason: "将思源块备注合并为标准卡片答案标记",
        });

        // 已是标准卡片不重复处理
        expect(upgradeLegacyCardToStandard("已经标准 ==答案==")).toBeNull();
        expect(upgradeLegacyCardToStandard("普通文本无备注")).toBeNull();
    });

    it("batch proposes legacy card upgrades for maintenance repair pipeline", () => {
        const cards = [
            { blockID: "b1", md: "HTTP 200 :: 请求成功" },
            { blockID: "b2", md: "HTTP 404 ==页面未找到==" },
            { blockID: "b3", md: "HTTP 500", memo: "服务器内部错误" },
            { blockID: "b4", md: "只是一个普通段落" },
        ];

        const proposals = proposeLegacyCardUpgrades(cards);
        expect(proposals).toEqual([
            {
                blockID: "b1",
                afterMarkdown: "HTTP 200 ==请求成功==",
                reason: "将概念卡 :: 语法升级为标准闪卡挖空标记",
            },
            {
                blockID: "b3",
                afterMarkdown: "HTTP 500 ==服务器内部错误==",
                reason: "将思源块备注合并为标准卡片答案标记",
            },
        ]);
    });
});
