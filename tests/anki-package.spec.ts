import { describe, expect, it } from "vitest";
import { parseAnkiPackage, parseMediaManifest, readZipEntries } from "../src/core/anki-package";
import { buildAnki2DbBytes, buildApkg, bytesOf, makeZip, nodeSqliteAdapter } from "./helpers/anki-fixture";

/**
 * Anki M1 解析器全链验证：node:sqlite 构造真实 anki2 库 + STORED zip 写入器
 * 打包成 .apkg，走完整 parseAnkiPackage 链路；负样本（非 zip/缺清单/未知模型/孤儿卡）。
 */

const enc = bytesOf;
const NOTE_A = { guid: "guidA", tags: "日语 标签二", flds: "こんにちは\x1fhello" };
const NOTE_B = { guid: "guidB", flds: "瓜\x1fmelon" };
const NOTES_AB_CARDS = [
    { nid: 1700000000000 },
    { nid: 1700000000001 },
];

describe("readZipEntries", () => {
    it("读出全部条目（STORED）", () => {
        const { entries, unsupported } = readZipEntries(buildApkg(buildAnki2DbBytes([NOTE_A, NOTE_B], NOTES_AB_CARDS), { "0": "a.png" }, [{ name: "0", data: new Uint8Array([1, 2, 3]) }]));
        expect(entries.map((e) => e.name).sort()).toEqual(["0", "collection.anki2", "media"]);
        expect(unsupported).toEqual([]);
        expect(entries.find((e) => e.name === "0")!.data).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("非 zip 输入 → 明确报错", () => {
        expect(() => readZipEntries(enc("hello, not a zip"))).toThrow(/EOCD|ZIP/);
    });
});

describe("parseMediaManifest", () => {
    it("按序号排序输出文件名", () => {
        const entries = [{ name: "media", data: enc(JSON.stringify({ "1": "b.png", "0": "a.mp3" })) }];
        expect(parseMediaManifest(entries).media).toEqual(["a.mp3", "b.png"]);
    });
    it("缺失清单 → issue", () => {
        const r = parseMediaManifest([{ name: "x", data: new Uint8Array() }]);
        expect(r.media).toEqual([]);
        expect(r.issue).toContain("media");
    });
});

describe("parseAnkiPackage 全链", () => {
    it("apkg：模型/笔记字段拆分/卡片/revlog 计数/media", () => {
        const pkg = parseAnkiPackage(buildApkg(buildAnki2DbBytes([NOTE_A, NOTE_B], NOTES_AB_CARDS), { "0": "audio/hello.mp3" }, [{ name: "0", data: new Uint8Array([1]) }]), nodeSqliteAdapter);
        expect(pkg.kind).toBe("apkg");
        expect(pkg.models).toHaveLength(1);
        expect(pkg.models[0]).toMatchObject({ id: "1607392319001", name: "基础", fieldNames: ["正面", "背面"], templateNames: ["卡 1"] });
        expect(pkg.notes).toHaveLength(2);
        expect(pkg.notes[0]).toMatchObject({ guid: "guidA", tags: ["日语", "标签二"], fields: ["こんにちは", "hello"], sortField: "こんにちは" });
        expect(pkg.cards).toHaveLength(2);
        expect(pkg.cards[0]).toMatchObject({ noteGuid: "guidA", type: 0 });
        expect(pkg.revlogCount).toBe(1);
        expect(pkg.media).toEqual(["audio/hello.mp3"]);
        expect(pkg.issues).toEqual([]);
    });

    it("未知模型与孤儿卡 → issues 如实记录，其余照常解析", () => {
        const pkg = parseAnkiPackage(
            buildApkg(buildAnki2DbBytes(
                [NOTE_A, NOTE_B, { guid: "guidX", mid: "999999", flds: "?\x1f?" }],
                [{ nid: 1700000000000 }, { nid: 1700000000001 }, { orphan: true }],
            )),
            nodeSqliteAdapter,
        );
        expect(pkg.notes).toHaveLength(3);
        expect(pkg.cards).toHaveLength(3);
        expect(pkg.issues.some((i) => i.includes("未知模型"))).toBe(true);
        expect(pkg.issues.some((i) => i.includes("孤儿卡"))).toBe(true);
    });

    it("缺 media 清单 → issue 记录，不抛错", () => {
        const pkg = parseAnkiPackage(buildApkg(buildAnki2DbBytes([NOTE_A, NOTE_B], NOTES_AB_CARDS)), nodeSqliteAdapter);
        expect(pkg.issues.some((i) => i.includes("media 清单缺失"))).toBe(true);
        expect(pkg.notes).toHaveLength(2);
    });

    it("非 Anki 包（zip 但无 collection）→ 明确报错", () => {
        expect(() => parseAnkiPackage(makeZip([{ name: "readme.txt", data: enc("hi") }]), nodeSqliteAdapter))
            .toThrow(/collection\.anki2/);
    });
});
