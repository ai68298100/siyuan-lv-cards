/**
 * Anki 测试夹具共享件：STORED zip 写入器 + node:sqlite 构造 anki2 库 + 适配器。
 * 供 anki-package.spec / anki-preview.spec 复用（测试内构造真实 .apkg 走全链）。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SqliteAdapter } from "../../src/core/anki-package";

// ---- STORED zip 写入器 ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
export function crc32(b: Uint8Array): number {
    let c = 0xffffffff;
    for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
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

export const bytesOf = (s: string) => new TextEncoder().encode(s);

// ---- node:sqlite 构造 anki2 库 ----
export const MODELS_JSON = JSON.stringify({
    "1607392319001": {
        name: "基础",
        flds: [{ name: "正面" }, { name: "背面" }],
        tmpls: [{ name: "卡 1" }],
    },
});
export const DECKS_JSON = JSON.stringify({ "1": { name: "Default" }, "2059400110": { name: "日语::N2" } });

export function buildAnki2DbBytes(notes: { guid: string; mid?: string; tags?: string; flds: string }[], cards?: { nid: number; orphan?: boolean }[]): Uint8Array {
    const dir = mkdtempSync(join(tmpdir(), "anki-m2-"));
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
    notes.forEach((n, i) => {
        insNote.run(1700000000000 + i, n.guid, n.mid ?? "1607392319001", 1700000000 + i, n.tags ?? "", n.flds);
    });
    const insCard = db.prepare("INSERT INTO cards (id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const cardRows = cards ?? notes.map((_, i) => ({ nid: 1700000000000 + i }));
    cardRows.forEach((c, i) => {
        if (c.orphan) insCard.run(1700000001000 + i, 999999999, 1, 0, 0, 0, 0, 0, 0, 0, 0);
        else insCard.run(1700000001000 + i, c.nid, 2059400110, 0, 0, 0, 0, 0, 0, 0, 0);
    });
    db.prepare("INSERT INTO revlog (id, cid, ease, ivl, type) VALUES (1, 1700000001000, 3, 3, 1)").run();
    db.close();
    const bytes = new Uint8Array(readFileSync(dbPath));
    rmSync(dir, { recursive: true, force: true });
    return bytes;
}

export function buildApkg(dbBytes: Uint8Array, mediaManifest?: Record<string, string>, mediaFiles?: { name: string; data: Uint8Array }[]): Uint8Array {
    const entries = [{ name: "collection.anki2", data: dbBytes }];
    if (mediaManifest) {
        entries.push({ name: "media", data: bytesOf(JSON.stringify(mediaManifest)) });
        for (const f of mediaFiles ?? []) entries.push(f);
    }
    return makeZip(entries);
}

/** node:sqlite 适配器：字节 → 临时文件 → DatabaseSync */
export function nodeSqliteAdapter(dbBytes: Uint8Array): SqliteAdapter {
    const dir = mkdtempSync(join(tmpdir(), "anki-open-"));
    const dbPath = join(dir, "collection.anki2");
    writeFileSync(dbPath, dbBytes);
    const db = new DatabaseSync(dbPath);
    return {
        all: (sql, params = []) => db.prepare(sql).all(...(params as never[])),
    };
}
