import fs from "node:fs";
const conf = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791502295745/conf/conf.json", "utf8"));
const api = async (path, body) => {
    const r = await fetch("http://127.0.0.1:3977" + path, { method: "POST", headers: { Authorization: `Token ${conf.api.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    return t ? JSON.parse(t) : { code: -1 };
};
// 示例卡片文档追加含敏感词的块
const sql = await api("/api/query/sql", { stmt: "SELECT id, root_id FROM blocks WHERE content LIKE '示例 1%' LIMIT 1" });
const docId = sql.data[0].root_id;
const ins = await api("/api/block/insertBlock", { dataType: "markdown", data: "敏感词测试：本项目代号为蓝图计划，请牢记。", parentID: docId });
console.log("inserted:", ins.code === 0);
