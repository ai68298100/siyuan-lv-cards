// 实验：把新卡设为到期时间（已排期），全局 due 是否可见
import fs from "node:fs";
const _conf = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791466706870/conf/conf.json", "utf8"));
const TOKEN = _conf.api?.token ?? _conf.conf?.api?.token;
const BASE = "http://127.0.0.1:4039";
const api = async (path, body = {}) => {
    const r = await fetch(BASE + path, { method: "POST", headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    return t ? JSON.parse(t) : { code: -1, msg: "empty" };
};
// 找 deck 里的卡 ID
const deckID = "20261008215118-jxq4uxs";
const due = await api("/api/riff/getRiffDueCards", { deckID, reviewedCards: [] });
const cardIDs = (due.data?.cards ?? []).map(c => c.cardID);
console.log("deck due cards:", cardIDs.length, cardIDs.slice(0, 2));
if (!cardIDs.length) process.exit(1);
// 尝试设定到期时间（参数形态探测）
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const dueTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
let set = await api("/api/riff/batchSetRiffCardsDueTime", { deckID, cardIDs, dueTime });
console.log("batchSet try1:", set.code, set.msg?.slice(0, 80), JSON.stringify(set.data)?.slice(0, 100));
if (set.code !== 0) {
    set = await api("/api/riff/batchSetRiffCardsDueTime", { cardIDs, dueTime });
    console.log("batchSet try2:", set.code, set.msg?.slice(0, 80));
}
await new Promise(r => setTimeout(r, 1500));
const g = await api("/api/riff/getRiffDueCards", { deckID: "", reviewedCards: [] });
console.log("全局 due after set:", g.data?.cards?.length, "unreviewed:", g.data?.unreviewedCount, "old:", g.data?.unreviewedOldCardCount, "new:", g.data?.unreviewedNewCardCount);
const nb = await api("/api/notebook/lsNotebooks");
for (const n of nb.data?.notebooks ?? []) console.log(n.name, "flashcard=" + n.flashcardCount, "due=" + n.dueFlashcardCount, "new=" + n.newFlashcardCount);
