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

    it("空期望不产「完美匹配」误导（E-09）", () => {
        expect(gradeTyping("", "anything", true).ratio).toBe(0);
    });
});

describe("gradeTyping 关键符号保真（E-09，宽松模式）", () => {
    it("-1 与 1 不再等价", () => {
        expect(gradeTyping("-1", "1", false).suggested).toBe(1);
        expect(gradeTyping("-1", "-1", false).suggested).toBe(3);
    });

    it("1.2 与 12 不再等价（小数点保留）", () => {
        expect(gradeTyping("1.2", "12", false).suggested).toBe(2);
        expect(gradeTyping("1.2", "1.2", false).suggested).toBe(3);
    });

    it("全角输入折叠后可正常判分（不再整段被剥离）", () => {
        expect(gradeTyping("123", "１２３", false).suggested).toBe(3);
        expect(gradeTyping("hello", "ｈｅｌｌｏ", false).suggested).toBe(3);
    });

    it("额外错误命题拉低相似度（分母含作答长度）", () => {
        const g = gradeTyping("北京是中国的首都", "北京是中国的首都而且上海也很美", false);
        expect(g.suggested).toBe(1);
        // 干净作答不受影响
        expect(gradeTyping("北京是中国的首都", "北京是中国的首都", false).suggested).toBe(3);
    });

    it("普通宽松行为保持：大小写/普通标点仍忽略", () => {
        const g = gradeTyping("Hello, World!", "hello world", false);
        expect(g.suggested).toBe(3);
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

describe("宽松判分欧式小数点归一化（BX-1 离线子集）", () => {
    it("3,14 与 3.14 匹配（欧式小数逗号）", () => {
        expect(gradeTyping("3.14", "3,14", false).suggested).toBe(3);
    });

    it("1,000 与 1.000 匹配（千位分隔逗号不干扰）", () => {
        expect(gradeTyping("1.000", "1,000", false).suggested).toBe(3);
    });

    it("非数字间逗号仍剥离（不影响普通文本判分）", () => {
        expect(gradeTyping("hello, world", "hello world", false).suggested).toBe(3);
    });

    it("严格模式不归一化（3,14 ≠ 3.14 → Hard 建议）", () => {
        expect(gradeTyping("3.14", "3,14", true).suggested).toBe(2);
    });
});
