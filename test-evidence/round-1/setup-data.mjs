// 走查测试数据准备：笔记本/文档/卡组/制卡（走查完成后可整册删除）
import fs from "node:fs";
const _conf = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791466706870/conf/conf.json", "utf8"));
const TOKEN = _conf.api?.token ?? _conf.conf?.api?.token;
const BASE = "http://127.0.0.1:4039";
const api = async (path, body = {}) => {
    const r = await fetch(BASE + path, {
        method: "POST",
        headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const text = await r.text();
    console.log(`[api] ${path} -> ${r.status} ${text.slice(0, 150) || "(empty)"}`);
    if (!text) return { code: -1, msg: "empty response" };
    try { return JSON.parse(text); } catch { return { code: -1, msg: "bad json: " + text.slice(0, 100) }; }
};
const nbIdOf = (d) => (typeof d === "string" ? d : d?.notebook?.id ?? d?.notebook ?? d?.id ?? "");
const out = {};

// 清理上次残留的重复笔记本
const ls = await api("/api/notebook/lsNotebooks");
for (const n of ls.data?.notebooks ?? []) {
    if (n.name === "小驴走查") await api("/api/notebook/removeNotebook", { notebook: n.id });
}

const nb = await api("/api/notebook/createNotebook", { name: "小驴走查" });
out.notebook = nbIdOf(nb.data);

const doc1 = await api("/api/filetree/createDocWithMd", {
    notebook: out.notebook, path: "/术语与概念", markdown:
        "FSRS 是一种基于深度学习模型的间隔重复调度算法，能更准确地预测记忆状态。\n\n" +
        "间隔重复：一种利用间隔效应安排复习时间的学习方法，能在更少的重复次数下形成长期记忆。\n\n" +
        "测试挖空：思源笔记的[核心特性是块引用](块引用是思源的基本操作单元)。\n\n" +
        "思源笔记是什么？\n\n" +
        "本地优先是思源笔记的设计理念，数据完全存储在用户设备上。\n",
});
out.doc1 = nbIdOf(doc1.data);

const doc2 = await api("/api/filetree/createDocWithMd", {
    notebook: out.notebook, path: "/快速问答素材", markdown:
        "问：FSRS 的全称是什么？\n答：Free Spaced Repetition Scheduler\n\n" +
        "问：小驴闪卡的调度由谁负责？\n答：思源内核的原生 FSRS\n",
});
out.doc2 = nbIdOf(doc2.data);

const deck = await api("/api/riff/createRiffDeck", { name: "走查卡组" });
out.deck = nbIdOf(deck.data);

const sql = await api("/api/query/sql", { stmt: `SELECT id, content FROM blocks WHERE root_id = '${out.doc1}' AND type = 'p' ORDER BY id LIMIT 8` });
out.blocks = (sql.data ?? []).length;
const ids = (sql.data ?? []).map((b) => b.id);
if (ids.length) {
    const add = await api("/api/riff/addRiffCards", { deckID: out.deck, blockIDs: ids.slice(0, 4) });
    out.added = add.code === 0 ? (add.data?.newAddedCardCount ?? add.data) : add;
}
const due = await api("/api/riff/getRiffDueCards", { deckID: out.deck, reviewedCards: [] });
out.dueCount = due.data?.cards?.length ?? due.code;
console.log(JSON.stringify(out, null, 2));
