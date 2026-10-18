// mock v2：普通端点即时返回；/slow 延迟 12s（断点恢复测试）；/refuse 返回拒答文本
import http from "node:http";
const cards = [
    { q: "审计卡1：FSRS 是什么算法的缩写？", a: "Free Spaced Repetition Scheduler。", d: 1 },
    { q: "审计卡2：小驴闪卡的调度由谁负责？", a: "思源内核的原生 FSRS。", d: 2 },
];
const okBody = JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify(cards) } }], usage: { total_tokens: 100 } });
const refuseBody = JSON.stringify({ choices: [{ message: { role: "assistant", content: "抱歉，我无法根据这段材料生成闪卡，材料内容超出我的知识范围，也无法继续这个请求。" } }] });
const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
http.createServer((req, res) => {
    let raw = "";
    req.on("data", c => (raw += c));
    req.on("end", () => {
        console.log(`[mock] ${req.method} ${req.url}`);
        if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
        if (req.url.includes("slow")) {
            setTimeout(() => { res.writeHead(200, { ...cors, "Content-Type": "application/json" }); res.end(okBody); }, 12000);
            return;
        }
        if (req.url.includes("refuse")) { res.writeHead(200, { ...cors, "Content-Type": "application/json" }); res.end(refuseBody); return; }
        res.writeHead(200, { ...cors, "Content-Type": "application/json" });
        res.end(okBody);
    });
}).listen(18787, "127.0.0.1", () => console.log("[mock] v2 listening"));
