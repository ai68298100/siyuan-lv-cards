import { describe, expect, it } from "vitest";
import { parseAnkiPackage } from "../src/core/anki-package";
import { planForModel } from "../src/core/anki-map";
import { cardFingerprint } from "../src/core/anki-dedupe";
import { buildImportPreview } from "../src/core/anki-preview";
import { buildAnki2DbBytes, buildApkg, nodeSqliteAdapter } from "./helpers/anki-fixture";

/**
 * Anki M2 全链：真实 .apkg → M1 解析 → 映射/清洗/查重 → 导入预览。
 * 覆盖：HTML 清洗、媒体引用与缺失、完形剥壳、包内重复、空问面损失、映射规则。
 */

const NOTE_MAIN = { guid: "g-main", tags: "网络", flds: `<b>三次握手</b>中每步确认了什么？\x1f交换序列号，<i>逐步确认</i>能力` };
const NOTE_MEDIA = { guid: "g-media", flds: `<img src="pic.png">细胞器图\x1f见[sound:read.mp3]` };
const NOTE_MEDIA_MISSING = { guid: "g-missing", flds: `引用缺失图\x1f<img src="nope.png">没了` };
const NOTE_CLOZE = { guid: "g-cloze", flds: `{{c1::线粒体::细胞器提示}}是细胞的\x1f能量工厂` };
const NOTE_DUP_A = { guid: "g-dup-a", flds: `握手的作用？\x1f同步序列号` };
const NOTE_DUP_B = { guid: "g-dup-b", tags: "重复", flds: `握手的作用？ \x1f同步序列号` };
const NOTE_EMPTY_Q = { guid: "g-empty", flds: `\x1f只有答案` };

const ALL_NOTES = [NOTE_MAIN, NOTE_MEDIA, NOTE_MEDIA_MISSING, NOTE_CLOZE, NOTE_DUP_A, NOTE_DUP_B, NOTE_EMPTY_Q];

function buildPkg() {
    const db = buildAnki2DbBytes(
        ALL_NOTES,
        ALL_NOTES.map((_, i) => ({ nid: 1700000000000 + i })),
    );
    return parseAnkiPackage(
        buildApkg(db, { "0": "pic.png", "1": "read.mp3" }, [{ name: "0", data: new Uint8Array([1]) }, { name: "1", data: new Uint8Array([2]) }]),
        nodeSqliteAdapter,
    );
}

describe("planForModel（映射规则）", () => {
    it("常规模型：第一字段问面、第二答面、其余附带", () => {
        const plan = planForModel({ id: "m", name: "基础", fieldNames: ["正面", "背面", "备注"], templateNames: [] });
        expect(plan).toMatchObject({ questionField: 0, answerField: 1, extraFields: [2], ok: true });
    });
    it("单字段模型：问答同源并标注", () => {
        const plan = planForModel({ id: "m", name: "填空", fieldNames: ["内容"], templateNames: [] });
        expect(plan).toMatchObject({ questionField: 0, answerField: 0, ok: true });
        expect(plan.issue).toContain("同源");
    });
    it("无字段模型：不可映射", () => {
        expect(planForModel({ id: "m", name: "空", fieldNames: [], templateNames: [] }).ok).toBe(false);
    });
});

describe("buildImportPreview（M2 全链）", () => {
    const pkg = buildPkg();
    const preview = buildImportPreview(pkg);
    const byGuid = new Map(preview.cards.map((c) => [c.guid, c]));

    it("统计口径一致：可导入 = 笔记数 - 空问面", () => {
        expect(preview.stats.notes).toBe(ALL_NOTES.length);
        expect(preview.cards).toHaveLength(ALL_NOTES.length - 1);
        expect(byGuid.has("g-empty")).toBe(false);
        expect(preview.losses.some((l) => l.guid === "g-empty" && l.reason.includes("问面为空"))).toBe(true);
    });

    it("HTML 清洗：粗斜体/换行/实体", () => {
        expect(byGuid.get("g-main")!.question).toBe("**三次握手**中每步确认了什么？");
        expect(byGuid.get("g-main")!.answer).toContain("*逐步确认*");
    });

    it("媒体引用收集 + 包内核对：缺失如实标注", () => {
        expect(byGuid.get("g-media")!.mediaRefs).toEqual(["pic.png", "read.mp3"]);
        expect(byGuid.get("g-media")!.answer).toContain("[音频: read.mp3]");
        expect(preview.stats.mediaMissing).toBeGreaterThanOrEqual(1);
        expect(preview.losses.some((l) => l.guid === "g-missing" && l.reason.includes("nope.png"))).toBe(true);
    });

    it("完形填空剥壳 + 提示丢弃记损失", () => {
        const c = byGuid.get("g-cloze")!;
        expect(c.cloze).toBe(true);
        expect(c.question).toContain("线粒体");
        expect(c.question).not.toContain("{{c1::");
        expect(preview.clozeGuids).toContain("g-cloze");
        expect(preview.losses.some((l) => l.guid === "g-cloze" && l.reason.includes("细胞器提示"))).toBe(true);
    });

    it("包内重复：归一化问面相同 → 一组两 guid", () => {
        expect(preview.duplicates).toHaveLength(1);
        expect(new Set(preview.duplicates[0].guids)).toEqual(new Set(["g-dup-a", "g-dup-b"]));
        expect(cardFingerprint("握手的作用？")).toBe(cardFingerprint("  握手的作用？。"));
    });

    it("指纹稳定且异文异指纹", () => {
        expect(cardFingerprint("TCP")).toBe(cardFingerprint("tcp"));
        expect(cardFingerprint("TCP")).not.toBe(cardFingerprint("UDP"));
    });
});
