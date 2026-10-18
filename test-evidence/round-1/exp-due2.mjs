import fs from "node:fs";
const _conf = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791466706870/conf/conf.json", "utf8"));
const TOKEN = _conf.api?.token;
const api = async (path, body = {}) => {
    const r = await fetch("http://127.0.0.1:4039" + path, { method: "POST", headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    return t ? JSON.parse(t) : { code: -1 };
};
const deckID = "20261008215118-jxq4uxs";
const due = await api("/api/riff/getRiffDueCards", { deckID, reviewedCards: [] });
const cardIDs = (due.data?.cards ?? []).map(c => c.cardID).slice(0, 3);
const cardDues = cardIDs.map(id => ({ id, due: "20251225000000" }));
const set = await api("/api/riff/batchSetRiffCardsDueTime", { cardDues });
console.log("set:", set.code, set.msg?.slice(0, 60));
await new Promise(r => setTimeout(r, 1500));
const g = await api("/api/riff/getRiffDueCards", { deckID: "", reviewedCards: [] });
console.log("全局 due:", g.data?.cards?.length, "old:", g.data?.unreviewedOldCardCount, "new:", g.data?.unreviewedNewCardCount);
const nb = await api("/api/notebook/lsNotebooks");
for (const n of nb.data?.notebooks ?? []) console.log(n.name, "flashcard=" + n.flashcardCount, "due=" + n.dueFlashcardCount);
