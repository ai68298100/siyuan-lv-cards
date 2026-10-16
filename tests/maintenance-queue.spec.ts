import { describe, expect, it } from "vitest";
import {
    detectDebts, findApproximateDuplicateCandidates, groupDebts, normalizeCardQuestion,
    normalizeCardText, extractMarkedAnswers, stripMarkedSegments,
    TOO_LONG_CHARS, type ScanCard,
} from "../src/core/maintenance-queue";

// BI-25 维护债务：结构有效性 + 四类启发式检测，只读诊断（暂停=宿主通道，不在此模块）
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
            card("c", "线粒体是能量工厂！"),     // 标点差异也算重复
            card("d", "短"),
        ]);
        const dup = out.filter(x => x.kind === "duplicate");
        expect(dup.map(x => x.blockID).sort()).toEqual(["a", "b", "c"]);
        expect(dup[0].detail).toBe("3");
    });

    it("近似重复：只比较题面，报告高置信包含关系而不重复报告全文相同卡", () => {
        const candidates = findApproximateDuplicateCandidates([
            card("a", "如何使用间隔重复算法？ ==按遗忘曲线安排复习=="),
            card("b", "如何使用间隔重复？ ==按间隔复习记忆=="),
            card("exact", "如何使用间隔重复算法？ ==按遗忘曲线安排复习=="),
            card("other", "什么是操作系统？ ==管理计算机资源的软件=="),
        ]);
        expect(candidates).toContainEqual({ blockIDs: ["a", "b"], similarity: 0.8, method: "containment" });
        // a/exact are full-card duplicates and are left to detectDebts' exact duplicate debt.
        expect(candidates).not.toContainEqual({ blockIDs: ["a", "exact"], similarity: 1, method: "containment" });
        expect(normalizeCardQuestion("什么是间隔重复算法？ ==答案==")).toBe("什么是间隔重复算法");
    });

    it("近似重复：轻微拼写变化可由 3-gram 捕获，短题面与泛化前缀不入候选", () => {
        const candidates = findApproximateDuplicateCandidates([
            card("a", "What is spaced repetition? ==A=="),
            card("b", "What is spaced repetiton? ==B=="),
            card("short", "What is? ==C=="),
            card("different", "What is spaced retrieval? ==D=="),
        ]);
        expect(candidates).toEqual([
            { blockIDs: ["a", "b"], similarity: 0.773, method: "ngram" },
        ]);
    });

    it("近似重复：重复 blockID 只取首条，函数不写入、不改变输入", () => {
        const cards: ScanCard[] = [
            card("same", "如何创建数据库索引？ ==A=="),
            card("same", "如何创建数据库索引的步骤？ ==B=="),
            card("other", "如何创建数据库索引的步骤？ ==C=="),
        ];
        const snapshot = cards.map(c => ({ ...c }));
        expect(findApproximateDuplicateCandidates(cards)).toEqual([
            { blockIDs: ["same", "other"], similarity: 0.75, method: "containment" },
        ]);
        expect(cards).toEqual(snapshot);
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

    it("卡面质量：报告空卡、缺答案和损坏标记，但放过遮挡卡", () => {
        const out = detectDebts([
            card("empty", ""),
            card("missing", "只有题面？"),
            card("broken", "题面 ==答案"),
            { ...card("occlusion", "![图](assets/map.png)"), occlusion: true },
            { ...card("broken-occlusion", "![图](assets/map.png) ==答案="), occlusion: true },
            { ...card("missing-block", ""), exists: false },
            { ...card("source-unresolved", "题面 ==答案=="), rootID: "" },
        ]);
        expect(out.filter(x => x.kind === "invalidCard").map(x => [x.blockID, x.detail])).toEqual([
            ["empty", "empty-card"],
            ["missing", "missing-answer"],
            ["broken", "invalid-markup"],
            ["broken-occlusion", "invalid-markup"],
            ["missing-block", "missing-block"],
            ["source-unresolved", "source-unresolved"],
        ]);
    });

    it("媒体健康：只报告宿主明确确认缺失的引用", () => {
        const out = detectDebts([
            { ...card("broken-media", "看图 ==答案=="), mediaBroken: ["assets/missing.png"] },
            { ...card("unknown-media", "听音频 ==答案=="), mediaBroken: [] },
        ]);
        expect(out.filter(x => x.kind === "mediaBroken")).toEqual([
            { blockID: "broken-media", kind: "mediaBroken", detail: "assets/missing.png" },
        ]);
    });

    it("纯答案旧卡进入质量债务；排版、实体、零宽字符和答案内图片不构成题面", () => {
        const out = detectDebts([
            card("answer-only", "==线粒体=="),
            card("multiple-answers", "==线粒体== ==叶绿体=="),
            card("formatting-only", "# ** ==线粒体== **"),
            card("html-only", "<p><strong>==线粒体==</strong></p>"),
            card("entity-only", "&nbsp; ==线粒体=="),
            card("invisible-only", "\u200b\u2060 ==线粒体=="),
            card("image-in-answer", "==![答案图](assets/answer.png)=="),
            card("normal", "细胞的能量工厂是 ==线粒体=="),
            card("image-question", "![题面图](assets/question.png) ==线粒体=="),
        ]);
        expect(out.filter(item => item.kind === "invalidCard")).toEqual([
            { blockID: "answer-only", kind: "invalidCard", detail: "missing-question" },
            { blockID: "multiple-answers", kind: "invalidCard", detail: "missing-question" },
            { blockID: "formatting-only", kind: "invalidCard", detail: "missing-question" },
            { blockID: "html-only", kind: "invalidCard", detail: "missing-question" },
            { blockID: "entity-only", kind: "invalidCard", detail: "missing-question" },
            { blockID: "invisible-only", kind: "invalidCard", detail: "missing-question" },
            { blockID: "image-in-answer", kind: "invalidCard", detail: "missing-question" },
        ]);
    });

    it("遮挡标志不能绕过可见图片与标记校验，来源未知状态仍优先单独报告", () => {
        const out = detectDebts([
            { ...card("valid-occlusion", "![图](assets/map.png)"), occlusion: true },
            { ...card("unverified-occlusion", "![图](assets/map.png)"), occlusion: false },
            { ...card("fake-occlusion", "只有普通文本"), occlusion: true },
            { ...card("hidden-image", "==![图](assets/map.png)=="), occlusion: true },
            { ...card("invalid-markup", "![图](assets/map.png) ==坏标记="), occlusion: true },
            { ...card("unresolved", "==答案=="), rootID: "" },
            { ...card("deleted", "==答案=="), rootID: "", exists: false },
        ]);
        expect(out.filter(item => item.kind === "invalidCard").map(item => [item.blockID, item.detail])).toEqual([
            ["unverified-occlusion", "missing-answer"],
            ["fake-occlusion", "missing-answer"],
            ["hidden-image", "missing-question"],
            ["invalid-markup", "invalid-markup"],
            ["unresolved", "source-unresolved"],
            ["deleted", "missing-block"],
        ]);
    });

    it("修正旧卡题面后重扫消除结构债务，扫描本身不更改来源与调度字段", () => {
        const source = { ...card("legacy", "==答案=="), due: 1234, rating: 3, revlog: [1, 2] };
        const snapshot = structuredClone(source);
        expect(detectDebts([source])).toContainEqual({ blockID: "legacy", kind: "invalidCard", detail: "missing-question" });
        expect(source).toEqual(snapshot);
        const fixed = { ...source, md: "问题是什么？ ==答案==" };
        expect(detectDebts([fixed]).filter(item => item.kind === "invalidCard")).toEqual([]);
        expect(source).toEqual(snapshot);
    });

    it("来源健康：同卡多问题聚合为一项，保留每个问题细节", () => {
        const out = detectDebts([{ ...card("source", "题面 ==答案=="), sourceHealthIssues: [
            { kind: "moved", detail: "r1 → r2" },
            { kind: "changed", detail: "h1 → h2" },
            { kind: "media-broken", detail: "assets/a.png" },
        ] }]);
        expect(out.filter(item => item.kind === "sourceHealth")).toEqual([
            { blockID: "source", kind: "sourceHealth", detail: "moved: r1 → r2; changed: h1 → h2; media-broken: assets/a.png" },
        ]);
    });

    it("groupDebts：按类型分节，组内保序", () => {
        const cards = [card("a", "线粒体是能量工厂"), card("b", "线粒体是能量工厂", "needsRevision"), card("c", "x".repeat(300))];
        const grouped = groupDebts(detectDebts(cards));
        expect(Object.keys(grouped).sort()).toEqual(["duplicate", "invalidCard", "leak", "mediaBroken", "needsReview", "sourceHealth", "tooLong"]);
        expect(grouped.duplicate.map(d => d.blockID)).toEqual(["a", "b"]);
        expect(grouped.needsReview.map(d => d.blockID)).toEqual(["b"]);
        expect(grouped.leak).toEqual([]);
    });
});
