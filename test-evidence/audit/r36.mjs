const fs = await import("node:fs");
const TOKEN = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791480918226/conf/conf.json", "utf8")).api.token;
const api = async (path, body) => {
    const r = await fetch("http://127.0.0.1:4967" + path, { method: "POST", headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
};
const j = await api("/api/query/sql", { stmt: "SELECT id, content FROM blocks WHERE root_id='20261009013904-97lfeac' AND type='p'" });
(j.data ?? []).forEach(b => console.log(b.id, JSON.stringify((b.content ?? "").slice(0, 34))));
