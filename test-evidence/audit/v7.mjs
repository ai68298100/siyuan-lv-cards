import fs from "node:fs";
const conf = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791496775187/conf/conf.json", "utf8"));
const api = async (path, body) => {
    const r = await fetch("http://127.0.0.1:6806" + path, { method: "POST", headers: { Authorization: `Token ${conf.api.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    return t ? JSON.parse(t) : { code: -1 };
};
const corpus = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/audit-corpus.json", "utf8"));
const due = await api("/api/riff/getRiffDueCards", { deckID: corpus.deckId, reviewedCards: [] });
console.log("评分后 deck due:", due.data?.cards?.length, "(应为 0——全部排到未来)");
const deck = (await api("/api/riff/getRiffDecks")).data.find(d => d.id === corpus.deckId);
console.log("deck size:", deck.size);
// 内核侧卡片状态抽查（第一张卡）
const cards = await api("/api/riff/getRiffCards", { deckID: corpus.deckId });
const c0 = cards.data?.blocks?.[0] ?? cards.data?.[0];
console.log("第一张卡内核状态:", JSON.stringify(c0)?.slice(0, 220));
