// 闪卡一致性走查语料
import fs from "node:fs";
const conf = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791496775187/conf/conf.json", "utf8"));
const api = async (path, body) => {
    const r = await fetch("http://127.0.0.1:6806" + path, { method: "POST", headers: { Authorization: `Token ${conf.api.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    return t ? JSON.parse(t) : { code: -1 };
};
const ls = await api("/api/notebook/lsNotebooks");
console.log("notebooks:", ls.data.notebooks.map(n => n.name));
const nb = ls.data.notebooks.find(n => !n.name.startsWith("siyuan-lv-cards-smoke"));
const md = [
    "# 闪卡语料",
    "",
    "普通卡A：思源的闪卡调度算法叫什么？FSRS。",
    "",
    "多行卡Q：这座城市的别称是什么？\n多行卡A：鹭岛。",
    "",
    "单挖空卡：闪卡的核心循环是 ==提问、作答、评分==。",
    "",
    "多挖空卡：==间隔重复==与==主动回忆==是两大支柱。",
    "",
    "公式卡：质能方程 $E = mc^2$ 中的 $c$ 是什么？\n光速。",
    "",
    "代码卡：这段代码输出什么？\n```js\nconsole.log(1 + 1)\n```\n输出 2。",
    "",
    "列表卡：FSRS 的四个评分档？\n* 遗忘\n* 困难\n* 良好\n* 简单",
    "",
    "表格卡：如下\n\n| 档位 | 含义 |\n| ---- | ---- |\n| 忘记 | 重来 |\n| 良好 | 继续 |",
    "",
    "Anki 语法卡：{{c1::线粒体}}是细胞的动力工厂。",
    "",
    "引用卡：引用块也能制卡吗？可以。",
    "",
].join("\n");
const created = await api("/api/filetree/createDocWithMd", { notebook: nb.id, path: "/闪卡语料", markdown: md });
console.log("doc:", created.data);
await new Promise(r => setTimeout(r, 3000));
const sql = await api("/api/query/sql", { stmt: `SELECT id, content FROM blocks WHERE root_id='${created.data}' AND type IN ('p','b') ORDER BY id` });
const ids = sql.data.map(b => b.id);
console.log("blocks:", ids.length, sql.data.map(b => (b.content || "").slice(0, 12)));
const deck = await api("/api/riff/createRiffDeck", { name: "一致性对照卡组" });
const added = await api("/api/riff/addRiffCards", { deckID: deck.data.id, blockIDs: ids });
console.log("deck size:", added.data?.size);
fs.writeFileSync("C:/Users/Admin/AppData/Local/Temp/audit-corpus.json", JSON.stringify({ docId: created.data, deckId: deck.data.id, blocks: sql.data }, null, 1));
