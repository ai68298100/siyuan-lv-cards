// 实验：以笔记本 ID 命名内置卡组后，全局 due / 笔记本计数是否可见
import fs from "node:fs";
const _conf = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791466706870/conf/conf.json", "utf8"));
const TOKEN = _conf.api?.token ?? _conf.conf?.api?.token;
const BASE = "http://127.0.0.1:4039";
const api = async (path, body = {}) => {
    const r = await fetch(BASE + path, { method: "POST", headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    return t ? JSON.parse(t) : { code: -1 };
};
const NB = "20261008215118-7j4w3hc";
const deck = await api("/api/riff/createRiffDeck", { name: NB });
console.log("created deck:", deck.data?.id);
const rootRow = await api("/api/query/sql", { stmt: `SELECT root_id FROM blocks WHERE id='20261008215118-jpar3ng'` });
const ROOT = rootRow.data?.[0]?.root_id;
console.log("doc root:", ROOT);
const blocks = await api("/api/query/sql", { stmt: `SELECT id FROM blocks WHERE root_id='${ROOT}' AND type='p' LIMIT 2` });
const ids = (blocks.data ?? []).map(b => b.id);
console.log("blocks:", ids.length);
const added = await api("/api/riff/addRiffCards", { deckID: deck.data.id, blockIDs: ids });
console.log("added:", added.data?.newAddedCardCount ?? added);
await new Promise(r => setTimeout(r, 2000));
const due = await api("/api/riff/getRiffDueCards", { deckID: "", reviewedCards: [] });
console.log("全局 due cards:", due.data?.cards?.length, "unreviewed:", due.data?.unreviewedCount);
const nb = await api("/api/notebook/lsNotebooks");
for (const n of nb.data?.notebooks ?? []) console.log(n.name, "flashcard=" + n.flashcardCount, "due=" + n.dueFlashcardCount, "new=" + n.newFlashcardCount);
const deckDue = await api("/api/riff/getRiffDueCards", { deckID: deck.data.id, reviewedCards: [] });
console.log("内置名卡组 due:", deckDue.data?.cards?.length);
