import fs from "node:fs";
const conf = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791496775187/conf/conf.json", "utf8"));
const api = async (path, body) => {
    const r = await fetch("http://127.0.0.1:6806" + path, { method: "POST", headers: { Authorization: `Token ${conf.api.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    return t ? JSON.parse(t) : { code: -1, msg: "empty" };
};
const c = await api("/api/notebook/createNotebook", { name: "一致性走查" });
console.log("create:", c.code, c.msg || "", JSON.stringify(c.data)?.slice(0, 120));
await new Promise(r => setTimeout(r, 1000));
const ls = await api("/api/notebook/lsNotebooks");
console.log("list:", ls.data.notebooks.map(n => n.name));
