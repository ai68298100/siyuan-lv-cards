// mock v3：即时返回（AI 全链审核步走查用）
import http from "node:http";
const cards = [
    { q: "审计卡1：FSRS 是什么算法的缩写？", a: "Free Spaced Repetition Scheduler。", d: 1 },
    { q: "审计卡2：小驴闪卡的调度由谁负责？", a: "思源内核的原生 FSRS。", d: 2 },
    { q: "审计卡3：本地优先意味着什么？", a: "数据完全保存在用户设备。", d: 3 },
];
const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const body = JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify(cards) } }], usage: { total_tokens: 100 } });
http.createServer((req, res) => {
    let raw = "";
    req.on("data", c => (raw += c));
    req.on("end", () => {
        console.log(`[mock] ${req.method} ${req.url}`);
        if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        res.end(body);
    });
}).listen(18787, "127.0.0.1", () => console.log("[mock] v3 listening"));
