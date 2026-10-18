const fs = await import("node:fs");
const TOKEN = JSON.parse(fs.readFileSync("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791480918226/conf/conf.json", "utf8")).api.token;
const api = async (path, body) => {
    const r = await fetch("http://127.0.0.1:4967" + path, { method: "POST", headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
};
await api("/api/block/updateBlock", { dataType: "markdown", data: "FSRS 的中文全称是什么？", id: "20261009013904-161yurd" });
await api("/api/block/updateBlock", { dataType: "markdown", data: "主动回忆是形成长期记忆的关键。", id: "20261009013904-4pfu4ey" });
await api("/api/block/updateBlock", { dataType: "markdown", data: "间隔重复:: 一种按记忆规律安排复习时点的学习方法", id: "20261009013904-gxa8tai" });
console.log("rewritten clean");
