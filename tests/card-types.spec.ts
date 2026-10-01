import { describe, expect, it } from "vitest";
import { gradeTyping, registerCardType, getCardType, listCardTypes } from "../src/core/card-types";

describe("gradeTyping（M4·FR2）", () => {
    it("宽松模式忽略大小写与标点", () => {
        const g = gradeTyping("Hello, World!", "hello world", false);
        expect(g.suggested).toBe(3);
        expect(g.ratio).toBeGreaterThanOrEqual(0.9);
    });

    it("严格模式区分标点", () => {
        const g = gradeTyping("Hello, World!", "hello world", true);
        expect(g.ratio).toBeLessThan(1);
    });

    it("相似度阈值映射 2/1", () => {
        expect(gradeTyping("普遍存在的", "普遍存在", true).suggested).toBe(2);
        expect(gradeTyping("普遍存在的", "完全不同", true).suggested).toBe(1);
    });

    it("逐字符对齐：命中为 ok", () => {
        const g = gradeTyping("abc", "axc", true);
        expect(g.chars.map(c => c.ok)).toEqual([true, false, true]);
    });

    it("空期望 ratio=1", () => {
        expect(gradeTyping("", "anything", true).ratio).toBe(1);
    });
});

describe("card-type registry", () => {
    it("内置打字题已注册，可注销", () => {
        expect(getCardType("type")).toBeTruthy();
        const off = registerCardType({ typeName: "temp", displayNameKey: "x", gradable: false });
        expect(getCardType("temp")).toBeTruthy();
        off();
        expect(getCardType("temp")).toBeUndefined();
        expect(listCardTypes().length).toBeGreaterThan(0);
    });
});
