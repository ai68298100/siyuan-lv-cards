const fs = await import("node:fs");
const conf = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791488256926/conf/conf.json", "utf8"));
const api = async (path, body) => {
    const r = await fetch("http://127.0.0.1:6676" + path, { method: "POST", headers: { Authorization: `Token ${conf.api.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
};
const decks = await api("/api/riff/getRiffDecks");
const deck = decks.data.find(d => d.name === "示例卡组");
// 找示例卡片文档
const sql = await api("/api/query/sql", { stmt: "SELECT root_id FROM blocks WHERE content LIKE '示例 1%' LIMIT 1" });
const docId = sql.data[0].root_id;
// 插入一个空块（零宽空格是思源惯例，但这里用纯空格测试空内容口径）
const ins = await api("/api/block/insertBlock", { dataType: "markdown", data: "  ", parentID: docId });
const ops = Array.isArray(ins.data) ? ins.data.flatMap(t => t.doOperations ?? []) : (ins.data?.operations ?? []);
const ids = ops.map(o => o.id).filter(Boolean);
await new Promise(r => setTimeout(r, 2500));
const added = await api("/api/riff/addRiffCards", { deckID: deck.id, blockIDs: ids.slice(0, 1) });
console.log("empty card added:", added.data?.size);
