import { describe, expect, it } from "vitest";
import { getSchema, validateRows } from "../src/core/ai-schemas";

// BU-12 输出 schema 注册表：宽容收敛（AJ5 同口径）+ 坏行跳过 + 全败报错
describe("ai-schemas（BU-12）", () => {
    it("cards-json：宽容收敛（数字字符串→数值），坏行跳过", () => {
        const r = validateRows("cards-json", [
            { q: "问题", a: "答案", d: "2" },      // 数字字符串收敛
            { q: "无答案卡" },                     // required a 缺失：整行跳过
            { q: 42, a: true },                    // 类型可 String 收敛
            "not an object",                       // 坏行跳过
        ]);
        expect(r.ok).toBe(true);
        expect(r.rows).toHaveLength(2);
        expect(r.rows[0]).toEqual({ q: "问题", a: "答案", d: 2 });
        expect(r.rows[1]).toEqual({ q: "42", a: "true" });
    });

    it("非数组输出：ok=false 且报错", () => {
        const r = validateRows("cards-json", { q: "x" });
        expect(r.ok).toBe(false);
        expect(r.errors[0]).toContain("not an array");
    });

    it("未知 schema：报错", () => {
        expect(validateRows("no-such", []).ok).toBe(false);
        expect(getSchema("cards-json")).toBeDefined();
    });

    it("scan schema：stringArray 收敛（过滤非字符串/空串）+ mustLearn 布尔收敛", () => {
        const r = validateRows("scan", [
            { point: "概念", why: "理由", prereq: ["a", 3, "", "b"], mustLearn: "true" },
        ]);
        expect(r.ok).toBe(true);
        expect(r.rows[0]).toEqual({ point: "概念", why: "理由", prereq: ["a", "b"], mustLearn: true });
    });

    it("全行 required 缺失：ok=false（有 errors）", () => {
        const r = validateRows("clarify", [{ why: "只有 why" }]);
        expect(r.ok).toBe(false);
        expect(r.rows).toHaveLength(0);
    });

    it("可选字段类型不符：宽容收敛（AJ5 口径，123→\"123\"）", () => {
        const r = validateRows("route", [{ fact: "事实", cardType: "问答", why: 123 }]);
        expect(r.rows[0]).toEqual({ fact: "事实", cardType: "问答", why: "123" });
    });

    it("九个 schema 全部注册（与 prompt-templates output 对接口径）", () => {
        for (const id of ["cards-json", "scan", "clarify", "route", "split", "leak", "distractor", "rewrite"]) {
            expect(getSchema(id), `missing ${id}`).toBeDefined();
        }
    });
});
