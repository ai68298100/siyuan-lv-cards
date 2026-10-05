import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { parseAnkiPackage, parseMediaManifest, readZipEntries, type SqliteAdapter } from "../src/core/anki-package";

/**
 * Anki M1 解析器全链验证（docs/39 §3）：测试内用 node:sqlite 构造真实 anki2 库，
 * 用自研 STORED zip 写入器打包成 .apkg，再走完整 parseAnkiPackage 链路。
 * 同时覆盖：负样本（非 zip）、缺 media 清单、未知模型、孤儿卡。
 */

// ---- 测试 zip 写入器（STORED，无压缩，够 fixture 用） ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
function makeZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
    const enc = new TextEncoder();
    const local: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBytes = enc.encode(name);
        const crc = crc32(data);
        const lh = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(lh.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, nameBytes.length, true);
        lh.set(nameBytes, 30);
        local.push(lh, data);
        const ch = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(ch.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(10, 0, true); // stored
        cv.setUint32(16, crc, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint32(42, offset, true);
        ch.set(nameBytes, 46);
        central.push(ch);
        offset += lh.length + data.length;
    }
    const centralSize = central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    const out = new Uint8Array(offset + centralSize + 22);
    let p = 0;
    for (const part of [...local, ...central, eocd]) { out.set(part, p); p += part.length; }
    return out;
}

// ---- fixture：node:sqlite 构造 anki2 库 ----
const MODELS_JSON = JSON.stringify({
    "1607392319001": {
        name: "基础",
        flds: [{ name: "正面" }, { name: "背面" }],
        tmpls: [{ name: "卡 1" }],
    },
});
const DECKS_JSON = JSON.stringify({ "1": { name: "Default" }, "2059400110": { name: "日语::N2" } });

function buildAnki2DbBytes(opts: { orphanCard?: boolean; unknownModel?: boolean } = {}): Uint8Array {
    const dir = mkdtempSync(join(tmpdir(), "anki-m1-"));
    const dbPath = join(dir, "collection.anki2");
    const db = new DatabaseSync(dbPath);
    db.exec(`
        CREATE TABLE col (id INTEGER PRIMARY KEY, models TEXT, decks TEXT);
        CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT, mid TEXT, mod INTEGER, tags TEXT, flds TEXT);
        CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER, type INTEGER, queue INTEGER, due INTEGER, ivl INTEGER, factor INTEGER, reps INTEGER, lapses INTEGER);
        CREATE TABLE revlog (id INTEGER PRIMARY KEY, cid INTEGER, ease INTEGER, ivl INTEGER, type INTEGER);
    `);
    db.prepare("INSERT INTO col (id, models, decks) VALUES (1, ?, ?)").run(MODELS_JSON, DECKS_JSON);
    const insNote = db.prepare("INSERT INTO notes (id, guid, mid, mod, tags, flds) VALUES (?, ?, ?, ?, ?, ?)");
    insNote.run(1700000000001, "guidA", "1607392319001", 1700000000, "日语 标签二", "こんにちは\x1fhello");
    insNote.run(1700000000002, "guidB", "1607392319001", 1700000001, "", "瓜\x1fmelon");
    if (opts.unknownModel) insNote.run(1700000000003, "guidX", "999999", 1700000002, "", "?\x1f?");
    const insCard = db.prepare("INSERT INTO cards (id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    insCard.run(1700000001001, 1700000000001, 2059400110, 0, 2, 2, 0, 3, 2500, 4, 1);
    insCard.run(1700000001002, 1700000000002, 1, 0, 0, 0, 1700000002, 0, 0, 0, 0);
    if (opts.orphanCard) insCard.run(1700000001003, 999999999, 1, 0, 0, 0, 0, 0, 0, 0, 0);
    db.prepare("INSERT INTO revlog (id, cid, ease, ivl, type) VALUES (1, 1700000001001, 3, 3, 1)").run();
    db.prepare("INSERT INTO revlog (id, cid, ease, ivl, type) VALUES (2, 1700000001001, 4, 7, 1)").run();
    db.close();
    const bytes = new Uint8Array(readFileSync(dbPath));
    rmSync(dir, { recursive: true, force: true });
    return bytes;
}

/** node:sqlite 适配器：字节 → 临时文件 → DatabaseSync */
function nodeSqliteAdapter(dbBytes: Uint8Array): SqliteAdapter {
    const dir = mkdtempSync(join(tmpdir(), "anki-m1-open-"));
    const dbPath = join(dir, "collection.anki2");
    writeFileSync(dbPath, dbBytes);
    const db = new DatabaseSync(dbPath);
    return {
        all: (sql, params = []) => db.prepare(sql).all(...(params as never[])),
    };
}

const enc = new TextEncoder();
function buildApkg(dbBytes: Uint8Array, opts: { withMedia?: boolean } = { withMedia: true }): Uint8Array {
    const entries = [{ name: "collection.anki2", data: dbBytes }];
    if (opts.withMedia) {
        entries.push({ name: "media", data: enc.encode(JSON.stringify({ "0": "audio/hello.mp3", "1": "img/瓜.png" })) });
        entries.push({ name: "0", data: new Uint8Array([1, 2, 3]) });
    }
    return makeZip(entries);
}

afterAll(() => {
    // 临时目录交给系统清理；这里无需逐个删除
});

describe("readZipEntries", () => {
    it("读出全部条目（STORED）", () => {
        const { entries, unsupported } = readZipEntries(buildApkg(buildAnki2DbBytes()));
        expect(entries.map(e => e.name).sort()).toEqual(["0", "collection.anki2", "media"]);
        expect(unsupported).toEqual([]);
        expect(entries.find(e => e.name === "0")!.data).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("非 zip 输入 → 明确报错", () => {
        expect(() => readZipEntries(enc.encode("hello, not a zip"))).toThrow(/EOCD|ZIP/);
    });
});

describe("parseMediaManifest", () => {
    it("按序号排序输出文件名", () => {
        const entries = [{ name: "media", data: enc.encode(JSON.stringify({ "1": "b.png", "0": "a.mp3" })) }];
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
        const pkg = parseAnkiPackage(buildApkg(buildAnki2DbBytes()), nodeSqliteAdapter);
        expect(pkg.kind).toBe("apkg");
        expect(pkg.models).toHaveLength(1);
        expect(pkg.models[0]).toMatchObject({ id: "1607392319001", name: "基础", fieldNames: ["正面", "背面"], templateNames: ["卡 1"] });
        expect(pkg.notes).toHaveLength(2);
        expect(pkg.notes[0]).toMatchObject({ guid: "guidA", tags: ["日语", "标签二"], fields: ["こんにちは", "hello"], sortField: "こんにちは" });
        expect(pkg.cards).toHaveLength(2);
        expect(pkg.cards[0]).toMatchObject({ noteGuid: "guidA", deckId: "2059400110", type: 2, ivl: 3, factor: 2500, reps: 4, lapses: 1 });
        expect(pkg.revlogCount).toBe(2);
        expect(pkg.media).toEqual(["audio/hello.mp3", "img/瓜.png"]);
        expect(pkg.issues).toEqual([]);
    });

    it("未知模型与孤儿卡 → issues 如实记录，其余照常解析", () => {
        const pkg = parseAnkiPackage(buildApkg(buildAnki2DbBytes({ orphanCard: true, unknownModel: true })), nodeSqliteAdapter);
        expect(pkg.notes).toHaveLength(3);
        expect(pkg.cards).toHaveLength(3);
        expect(pkg.issues.some(i => i.includes("未知模型"))).toBe(true);
        expect(pkg.issues.some(i => i.includes("孤儿卡"))).toBe(true);
    });

    it("缺 media 清单 → issue 记录，不抛错", () => {
        const pkg = parseAnkiPackage(buildApkg(buildAnki2DbBytes(), { withMedia: false }), nodeSqliteAdapter);
        expect(pkg.issues.some(i => i.includes("media 清单缺失"))).toBe(true);
        expect(pkg.notes).toHaveLength(2);
    });

    it("非 Anki 包（zip 但无 collection）→ 明确报错", () => {
        expect(() => parseAnkiPackage(makeZip([{ name: "readme.txt", data: enc.encode("hi") }]), nodeSqliteAdapter))
            .toThrow(/collection\.anki2/);
    });
});
