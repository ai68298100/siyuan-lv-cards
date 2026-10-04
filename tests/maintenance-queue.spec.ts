import { describe, expect, it } from "vitest";
import {
    detectDebts, groupDebts, normalizeCardText, extractMarkedAnswers, stripMarkedSegments,
    TOO_LONG_CHARS, type ScanCard,
} from "../src/core/maintenance-queue";

// BI-25 维护债务：四类启发式检测，只读诊断（暂停=宿主通道，不在此模块）
const card = (blockID: string, md: string, state?: string): ScanCard => ({ blockID, md, state });

describe("maintenance-queue（BI-25）", () => {
    it("normalize：去标记保留内文、去全部空白与排版记号、小写", () => {
        expect(normalizeCardText("线粒体是 ==能量工厂==  的\n核心")).toBe("线粒体是能量工厂的核心");
        expect(extractMarkedAnswers("A ==x== B ==y==")).toEqual(["x", "y"]);
        expect(stripMarkedSegments("题面 ==答案== 继续")).toBe("题面 继续");
    });

    it("重复：归一化全同（≥2 张）全组命中；过短内容不判", () => {
        const out = detectDebts([
            card("a", "线粒体是能量工厂"),
            card("b", "线粒体是  能量工厂 "),   // 空白差异仍算重复
            card("c", "线粒体是能量工厂！"),     // 归一化不删标点→不同文本（当前口径）
            card("d", "短"),
        ]);
        const dup = out.filter(x => x.kind === "duplicate");
        expect(dup.map(x => x.blockID).sort()).toEqual(["a", "b"]);
        expect(dup[0].detail).toBe("2");
    });

    it("泄漏：挖空答案文本出现在题面即命中（≥2 字），多答案命中一次", () => {
        const out = detectDebts([
            card("a", "细胞的==能量工厂==是线粒体，能量工厂很重要"),
            card("b", "细胞的==能量工厂==是线粒体"),
            card("c", "首字母 ==A== 泄漏单字符不判"),
        ]);
        const leaks = out.filter(x => x.kind === "leak");
        expect(leaks.map(x => x.blockID)).toEqual(["a"]);
        expect(leaks[0].detail).toBe("能量工厂");
    });

    it(`过长：归一化文本超 ${TOO_LONG_CHARS} 字命中并带长度`, () => {
        const long = "x".repeat(TOO_LONG_CHARS + 10);
        const out = detectDebts([card("a", long), card("b", "正常卡")]);
        const tl = out.filter(x => x.kind === "tooLong");
        expect(tl).toHaveLength(1);
        expect(tl[0].blockID).toBe("a");
        expect(Number(tl[0].detail)).toBeGreaterThan(TOO_LONG_CHARS);
    });

    it("待审核：仅 lifecycle needsRevision 命中（无档案卡不误报）", () => {
        const out = detectDebts([card("a", "卡一", "needsRevision"), card("b", "卡二", "inReview"), card("c", "卡三")]);
        expect(out.filter(x => x.kind === "needsReview").map(x => x.blockID)).toEqual(["a"]);
    });

    it("groupDebts：按四类分节，组内保序", () => {
        const cards = [card("a", "线粒体是能量工厂"), card("b", "线粒体是能量工厂", "needsRevision"), card("c", "x".repeat(300))];
        const grouped = groupDebts(detectDebts(cards));
        expect(Object.keys(grouped).sort()).toEqual(["duplicate", "leak", "needsReview", "tooLong"]);
        expect(grouped.duplicate.map(d => d.blockID)).toEqual(["a", "b"]);
        expect(grouped.needsReview.map(d => d.blockID)).toEqual(["b"]);
        expect(grouped.leak).toEqual([]);
    });
});
