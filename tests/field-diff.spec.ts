import { describe, expect, it } from "vitest";
import { applySelections, charDiff, diffFields, isCancel, type DiffField } from "../src/core/field-diff";

const orig: Record<DiffField, string> = { q: "光合作用需要什么？", a: "光、水、二氧化碳", note: "生物基础" };
const upd: Record<DiffField, string> = { q: "光合作用需要什么原料？", a: "光、水、二氧化碳", note: "生物基础（高中）" };

// BX-9 字段级 diff：字段检测/行内片段/逐项采用/取消语义
describe("field-diff（BX-9）", () => {
    it("diffFields：逐字段 changed 检测", () => {
        const rows = diffFields(orig, upd);
        expect(rows.map(r => r.changed)).toEqual([true, false, true]);
        expect(rows[1].segments).toEqual([{ text: "光、水、二氧化碳", kind: "same" }]);
    });

    it("charDiff：LCS 行内高亮（same/del/add 片段合并）", () => {
        const segs = charDiff("光合作用需要什么", "光合作用需要什么原料");
        const kinds = segs.map(s => s.kind).join(",");
        expect(kinds).toBe("same,add");
        expect(segs[1]).toEqual({ text: "原料", kind: "add" });
    });

    it("charDiff：中段替换", () => {
        const segs = charDiff("ABCDEF", "ABXDEF");
        expect(segs.some(s => s.kind === "del" && s.text === "C")).toBe(true);
        expect(segs.some(s => s.kind === "add" && s.text === "X")).toBe(true);
        expect(segs.filter(s => s.kind === "same").map(s => s.text).join("")).toBe("ABDEF");
    });

    it("charDiff：完全相同返回单段 same；空串安全", () => {
        expect(charDiff("同", "同")).toEqual([{ text: "同", kind: "same" }]);
        expect(charDiff("", "")).toEqual([]);
    });

    it("charDiff：超长退化整段替换（成本有界）", () => {
        const a = "x".repeat(401);
        const b = "y".repeat(10);
        const segs = charDiff(a, b);
        expect(segs).toEqual([
            { text: a, kind: "del" },
            { text: b, kind: "add" },
        ]);
    });

    it("applySelections：任一字段可独立采用", () => {
        const sel = applySelections(orig, upd, { q: true });
        expect(sel.q).toBe(upd.q);
        expect(sel.note).toBe(orig.note);
        expect(sel.a).toBe(orig.a);
    });

    it("全拒绝等价取消：结果深等于原卡", () => {
        expect(applySelections(orig, upd, {})).toEqual(orig);
        expect(applySelections(orig, upd, { q: false, a: false, note: false })).toEqual(orig);
        expect(isCancel({})).toBe(true);
        expect(isCancel({ q: false })).toBe(true);
        expect(isCancel({ note: true })).toBe(false);
    });

    it("拒绝即保留原卡：不静默换内容", () => {
        const merged = applySelections(orig, upd, { note: true, q: false, a: false });
        expect(merged.q).toBe(orig.q);
        expect(merged.a).toBe(orig.a);
        expect(merged.note).toBe(upd.note);
    });
});
