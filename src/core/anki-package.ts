/**
 * Anki .apkg/.colpkg 解析器（M1 纯模块，docs/39 §3 立项批准）。
 *
 * 零 npm 依赖：ZIP 中央目录自研解析（stored + deflate，node:zlib inflateRaw）；
 * SQLite 读取经注入适配器（Node 侧用 node:sqlite，Electron 渲染端的接入方式由 M3 决策），
 * 本模块只负责：包结构校验、media 清单解析、行→域对象映射与宽容清洗。
 *
 * 原则（docs/38 P2-1）：解析损失如实记入 issues（损失报告素材），绝不静默丢弃；
 * 调度历史（revlog）只读取计数，导入的历史展示不冒充本插件调度记录（ADR-3）。
 */
import { inflateRawSync } from "node:zlib";

// ---------- ZIP 读取 ----------

export interface ZipEntry {
    name: string;
    data: Uint8Array;
}

/** 解包 ZIP（读 EOCD + 中央目录；支持 stored/deflate，其余方法记入不支持） */
export function readZipEntries(bytes: Uint8Array): { entries: ZipEntry[]; unsupported: string[] } {
    const u16 = (o: number) => bytes[o]! | (bytes[o + 1]! << 8);
    const u32 = (o: number) => (bytes[o]! | (bytes[o + 1]! << 8) | (bytes[o + 2]! << 16) | (bytes[o + 3]! << 24)) >>> 0;
    let eocd = -1;
    const minEocd = Math.max(0, bytes.length - 22 - 65535);
    for (let i = bytes.length - 22; i >= minEocd; i--) {
        if (u32(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("apkg: ZIP 结束记录未找到（不是有效的 .apkg/.colpkg 文件）");
    const count = u16(eocd + 10);
    let off = u32(eocd + 16);
    const entries: ZipEntry[] = [];
    const unsupported: string[] = [];
    const decoder = new TextDecoder();
    for (let i = 0; i < count; i++) {
        if (off + 46 > bytes.length || u32(off) !== 0x02014b50) throw new Error("apkg: 中央目录损坏");
        const method = u16(off + 10);
        const compSize = u32(off + 20);
        const nameLen = u16(off + 28);
        const extraLen = u16(off + 30);
        const commentLen = u16(off + 32);
        const lho = u32(off + 42);
        const name = decoder.decode(bytes.subarray(off + 46, off + 46 + nameLen));
        // 本地头的名字/extra 长度可能与中央目录不同，数据偏移以本地头为准
        const lNameLen = u16(lho + 26);
        const lExtraLen = u16(lho + 28);
        const dataStart = lho + 30 + lNameLen + lExtraLen;
        if (method === 0) {
            entries.push({ name, data: bytes.slice(dataStart, dataStart + compSize) });
        } else if (method === 8) {
            entries.push({ name, data: new Uint8Array(inflateRawSync(bytes.subarray(dataStart, dataStart + compSize))) });
        } else {
            unsupported.push(name);
        }
        off += 46 + nameLen + extraLen + commentLen;
    }
    return { entries, unsupported };
}

/** media 清单（apkg 内 "media" 文件）：{"0":"图片.png", ...} → 有序文件名列表 */
export function parseMediaManifest(entries: ZipEntry[]): { media: string[]; issue?: string } {
    const manifest = entries.find(e => e.name === "media");
    if (!manifest) return { media: [], issue: "media 清单缺失（包可能不含媒体或为旧版 colpkg）" };
    try {
        const parsed = JSON.parse(new TextDecoder().decode(manifest.data)) as Record<string, string>;
        const keys = Object.keys(parsed).sort((a, b) => Number(a) - Number(b));
        return { media: keys.map(k => String(parsed[k])) };
    } catch {
        return { media: [], issue: "media 清单不是合法 JSON（包损坏）" };
    }
}

// ---------- SQLite 注入适配器与行映射 ----------

/** SQLite 读取适配器：调用方提供打开方式（Node=node:sqlite；Electron 接入 M3 决策） */
export interface SqliteAdapter {
    all(sql: string, params?: unknown[]): unknown[];
}

export interface AnkiModel {
    id: string;
    name: string;
    fieldNames: string[];
    templateNames: string[];
}

export interface AnkiNote {
    guid: string;
    modelId: string;
    tags: string[];
    /** \x1f 拆分后的字段值（顺序=模型字段顺序） */
    fields: string[];
    sortField: string;
    mod: number;
}

export interface AnkiCard {
    id: string;
    noteGuid: string;
    deckId: string;
    ord: number;
    /** Anki 卡片类型：0=new 1=learning 2=review 3=relearning */
    type: number;
    queue: number;
    due: number;
    ivl: number;
    factor: number;
    reps: number;
    lapses: number;
}

export interface AnkiPackage {
    /** collection.anki2=apkg（旧导出）；collection.anki21=新版格式 */
    kind: "apkg" | "colpkg";
    models: AnkiModel[];
    notes: AnkiNote[];
    cards: AnkiCard[];
    revlogCount: number;
    media: string[];
    /** 结构问题清单（损失报告素材）：缺表/字段缺失/JSON 损坏/未知模型等 */
    issues: string[];
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

function safeJsonParse(text: string): { value: unknown; issue?: string } {
    try {
        return { value: JSON.parse(text) };
    } catch {
        return { value: null, issue: "JSON 解析失败" };
    }
}

/** col.models JSON（id → {name, flds:[{name}], tmpls:[{name}]}）→ 模型清单 */
export function parseModelsJson(raw: unknown): { models: AnkiModel[]; issue?: string } {
    if (raw == null) return { models: [], issue: "col.models 缺失（无法映射字段名）" };
    const { value, issue } = safeJsonParse(typeof raw === "string" ? raw : String(raw));
    if (value == null) return { models: [], issue: `col.models ${issue ?? ""}` };
    const models: AnkiModel[] = [];
    for (const [id, m] of Object.entries(value as Record<string, any>)) {
        models.push({
            id,
            name: str(m?.name) || `模型 ${id}`,
            fieldNames: Array.isArray(m?.flds) ? m.flds.map((f: any) => str(f?.name)) : [],
            templateNames: Array.isArray(m?.tmpls) ? m.tmpls.map((t: any) => str(t?.name)) : [],
        });
    }
    return { models };
}

/** notes 行 → 域对象（flds 按 \x1f 拆分；tags 空格分隔去重） */
export function mapNoteRow(row: Record<string, unknown>, knownModelIds: Set<string>): { note: AnkiNote; issue?: string } {
    const fields = str(row.flds).split("\x1f");
    const modelId = str(row.mid);
    const tags = [...new Set(str(row.tags).split(/\s+/).filter(Boolean))];
    const note: AnkiNote = {
        guid: str(row.guid),
        modelId,
        tags,
        fields,
        sortField: fields[0] ?? "",
        mod: num(row.mod),
    };
    let issue: string | undefined;
    if (!note.guid) issue = `note(id=${row.id}) 缺 guid`;
    else if (!knownModelIds.has(modelId)) issue = `note(guid=${note.guid}) 引用未知模型 ${modelId}`;
    return { note, issue };
}

/** cards 行 → 域对象（type/queue 宽容：越界值原样保留，损失报告里如实呈现） */
export function mapCardRow(row: Record<string, unknown>, guidByNoteId: Map<string, string>): { card: AnkiCard; issue?: string } {
    const noteId = str(row.nid);
    const card: AnkiCard = {
        id: str(row.id),
        noteGuid: guidByNoteId.get(noteId) ?? "",
        deckId: str(row.did),
        ord: num(row.ord),
        type: num(row.type),
        queue: num(row.queue),
        due: num(row.due),
        ivl: num(row.ivl),
        factor: num(row.factor),
        reps: num(row.reps),
        lapses: num(row.lapses),
    };
    let issue: string | undefined;
    if (!card.noteGuid) issue = `card(id=${card.id}) 的 note(id=${noteId}) 不存在（孤儿卡）`;
    return { card, issue };
}

const COLLECTION_RE = /^collection\.anki2(1)?$/;

/** 解析 .apkg/.colpkg：包结构 + media 清单 + 经适配器映射 notes/cards/models/revlog */
export function parseAnkiPackage(pkgBytes: Uint8Array, openSqlite: (dbBytes: Uint8Array) => SqliteAdapter): AnkiPackage {
    const { entries, unsupported } = readZipEntries(pkgBytes);
    const issues: string[] = unsupported.map(n => `条目 ${n} 使用了不支持的压缩方法，已跳过`);
    const collection = entries.find(e => COLLECTION_RE.test(e.name));
    if (!collection) throw new Error("apkg: 未找到 collection.anki2/anki21（不是 Anki 导出包）");
    const kind: "apkg" | "colpkg" = collection.name === "collection.anki21" ? "colpkg" : "apkg";

    const { media, issue: mediaIssue } = parseMediaManifest(entries);
    if (mediaIssue) issues.push(mediaIssue);

    const db = openSqlite(collection.data);
    const issuesIn = (r: { issue?: string }) => { if (r.issue) issues.push(r.issue); };

    // 模型（col 表首行的 models JSON）
    let models: AnkiModel[] = [];
    try {
        const colRow = db.all("SELECT models FROM col LIMIT 1")[0] as Record<string, unknown> | undefined;
        const parsed = parseModelsJson(colRow ? colRow.models : null);
        models = parsed.models;
        issuesIn(parsed);
    } catch (e) {
        issues.push(`col 表读取失败：${e instanceof Error ? e.message : String(e)}`);
    }
    const knownModelIds = new Set(models.map(m => m.id));

    // notes
    const notes: AnkiNote[] = [];
    try {
        for (const row of db.all("SELECT id, guid, mid, mod, tags, flds FROM notes") as Record<string, unknown>[]) {
            const r = mapNoteRow(row, knownModelIds);
            if (r.note) notes.push(r.note);
            issuesIn(r);
        }
    } catch (e) {
        issues.push(`notes 表读取失败：${e instanceof Error ? e.message : String(e)}`);
    }
    const guidByNoteId = new Map(
        (db.all("SELECT id, guid FROM notes") as Record<string, unknown>[]).map(r => [str(r.id), str(r.guid)]),
    );

    // cards
    const cards: AnkiCard[] = [];
    try {
        for (const row of db.all("SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards") as Record<string, unknown>[]) {
            const r = mapCardRow(row, guidByNoteId);
            if (r.card) cards.push(r.card);
            issuesIn(r);
        }
    } catch (e) {
        issues.push(`cards 表读取失败：${e instanceof Error ? e.message : String(e)}`);
    }

    // revlog：M1 只取计数（历史展示不冒充本插件调度，ADR-3）
    let revlogCount = 0;
    try {
        const row = db.all("SELECT COUNT(*) AS n FROM revlog")[0] as Record<string, unknown> | undefined;
        revlogCount = num(row?.n);
    } catch {
        issues.push("revlog 表不可读（复习历史不计入）");
    }

    return { kind, models, notes, cards, revlogCount, media, issues };
}
