// 隔离式后台 e2e（AT-16）：临时工作区 + 无头内核 + 自动部署/启用插件。
// 与 e2e-launch.ps1 的区别：不杀任何现有思源实例、不占用共享工作区，
// 可与其他插件开发会话并行（每实例独立内核端口 + 独立工作区）。
//
// 用法：
//   node scripts/e2e-isolated.mjs            # 全流程：启动→部署→启用→断言→拆卸
//   node scripts/e2e-isolated.mjs --keep     # 保留环境（输出端口/token/目录供 UI 走查），不拆卸
//   node scripts/e2e-isolated.mjs --ui       # --keep 基础上再尝试拉起 Electron UI（有单实例锁风险，尽力而为）
//
// 断言范围（无头可测）：内核健康/鉴权、插件部署完整性（静态文件可取）、
// petal 启用状态、内核 riff 制卡→到期→评分回环（deck 域）。
// UI 渲染类断言不在本脚本范围（需窗口，走 docs/34 人工/操控清单）。

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import url from "node:url";

const KERNEL = "D:/biji/SiYuan/resources/kernel/SiYuan-Kernel.exe";
const RESOURCES = "D:/biji/SiYuan/resources";
const DIST = path.resolve("dist");
const PLUGIN_ID = "siyuan-lv-cards";
const FRONTEND = "desktop";

const args = new Set(process.argv.slice(2));
const KEEP = args.has("--keep");
const TRY_UI = args.has("--ui");

const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.listen(0, "127.0.0.1", () => {
            const p = srv.address().port;
            srv.close(() => resolve(p));
        });
        srv.on("error", reject);
    });
}

function api(port, token, ep, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body ?? {});
        const req = http.request({
            host: "127.0.0.1", port, path: ep, method: "POST",
            headers: { "Authorization": `Token ${token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
            timeout: 8000,
        }, res => {
            let buf = "";
            res.on("data", c => (buf += c));
            res.on("end", () => {
                try { resolve(JSON.parse(buf)); } catch { resolve({ raw: buf.slice(0, 200), status: res.statusCode }); }
            });
        });
        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.end(data);
    });
}

function getRaw(port, token, ep) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: "127.0.0.1", port, path: ep, method: "GET",
            headers: { "Authorization": `Token ${token}` }, timeout: 8000,
        }, res => {
            let buf = [];
            res.on("data", c => buf.push(c));
            res.on("end", () => resolve({ status: res.statusCode, size: Buffer.concat(buf).length, head: Buffer.concat(buf).slice(0, 40).toString("utf8") }));
        });
        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.end();
    });
}

const results = [];
function check(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
    if (!ok) process.exitCode = 1;
}

const ws = path.join(os.tmpdir(), `siyuan-lvcards-e2e-${Date.now()}`);
const port = await freePort();
fs.mkdirSync(ws, { recursive: true });

// 1. 启动无头内核（detached：脚本退出内核仍在，--keep 模式供 UI 走查续用）
console.log(`[e2e] workspace: ${ws}`);
console.log(`[e2e] kernel port: ${port}`);
const kproc = spawn(KERNEL, ["--workspace", ws, "serve", "--wd", RESOURCES, "--port", String(port)], {
    detached: true, stdio: "ignore", windowsHide: true,
});
kproc.unref();
fs.writeFileSync(path.join(ws, "e2e-kernel.pid"), String(kproc.pid));

// 2. 等内核就绪并取 token
let token = "";
let up = false;
for (let i = 0; i < 40; i++) {
    await sleep(1500);
    try {
        const v = await api(port, "public", "/api/system/version");
        if (v.code === 0) { up = true; break; }
    } catch { /* 未就绪 */ }
    const confPath = path.join(ws, "conf", "conf.json");
    if (fs.existsSync(confPath)) {
        try {
            const c = JSON.parse(fs.readFileSync(confPath, "utf8"));
            if (c.api?.token) {
                const v = await api(port, c.api.token, "/api/system/version");
                if (v.code === 0) { token = c.api.token; up = true; break; }
            }
        } catch { /* conf 未生成完 */ }
    }
}
if (!token) {
    const confPath = path.join(ws, "conf", "conf.json");
    for (let i = 0; i < 10; i++) {
        await sleep(1000);
        try {
            const c = JSON.parse(fs.readFileSync(confPath, "utf8"));
            if (c.api?.token) {
                const v = await api(port, c.api.token, "/api/system/version");
                if (v.code === 0) { token = c.api.token; break; }
            }
        } catch { /* 重试 */ }
    }
}
check("内核启动（无头）", up, `port=${port} pid=${kproc.pid}`);
if (!up) {
    console.error("[e2e] 内核未就绪，中止（工作区保留诊断）：" + ws);
    process.exit(1);
}
if (!token) {
    try { token = JSON.parse(fs.readFileSync(path.join(ws, "conf", "conf.json"), "utf8")).api.token; } catch { /* 已超时 */ }
}
check("内核鉴权（conf token）", !!token, token ? `token=${token.slice(0, 4)}…` : "未取到");

// 3. 部署插件
const dst = path.join(ws, "data", "plugins", PLUGIN_ID);
fs.mkdirSync(dst, { recursive: true });
for (const f of ["index.js", "index.css", "plugin.json"]) {
    fs.copyFileSync(path.join(DIST, f), path.join(dst, f));
}
if (fs.existsSync(path.join(DIST, "i18n"))) {
    fs.mkdirSync(path.join(dst, "i18n"), { recursive: true });
    for (const f of fs.readdirSync(path.join(DIST, "i18n"))) {
        fs.copyFileSync(path.join(DIST, "i18n", f), path.join(dst, "i18n", f));
    }
}
for (const f of ["icon.png"]) {
    if (fs.existsSync(path.join(DIST, f))) fs.copyFileSync(path.join(DIST, f), path.join(dst, f));
}
const manifest = JSON.parse(fs.readFileSync(path.join(dst, "plugin.json"), "utf8"));
check("插件部署", manifest.version?.length > 0, `v${manifest.version}`);

// 4. 插件静态资源可取（前端加载路径的代理断言）
const asset = await getRaw(port, token, `/plugins/${PLUGIN_ID}/index.js`);
check("插件资源可服务", asset.status === 200 && asset.size > 10000, `GET /plugins/.../index.js → ${asset.status}, ${asset.size}B`);

// 5. 启用 petal 并核验
let enabled = false;
let petals = null;
for (const ep of ["/api/petal/setPetalEnabled"]) {
    try {
        const r = await api(port, token, ep, { frontend: FRONTEND, packageName: PLUGIN_ID, enabled: true });
        if (r.code === 0) { enabled = true; break; }
    } catch { /* 试下一个 */ }
}
petals = await api(port, token, "/api/petal/loadPetals", { frontend: FRONTEND });
const mine = petals?.data?.petals?.find(p => p.pkg === PLUGIN_ID) ?? petals?.data?.find?.(p => p.pkg === PLUGIN_ID);
check("petal 启用", enabled || mine?.enabled === true, JSON.stringify(mine ? { pkg: mine.pkg, enabled: mine.enabled } : petals).slice(0, 120));

// 6. 内核 riff 回环：建笔记本→文档→卡包→卡→到期
const nb = await api(port, token, "/api/notebook/createNotebook", { name: "e2e-isolated" });
check("建笔记本", nb.code === 0, nb.msg || "");
if (nb.code === 0) {
        const doc = await api(port, token, "/api/filetree/createDocWithMd", { notebook: nb.data.notebook.id, path: "e2e/riff-smoke", markdown: "e2e smoke block" });
    check("建文档", doc.code === 0, doc.msg || "");
    if (doc.code === 0) {
        // 与插件 src/api/riff.ts 相同的两段式：createRiffDeck → addRiffCards
        const docID = typeof doc.data === "string" ? doc.data : doc.data?.id;
        const deck = await api(port, token, "/api/riff/createRiffDeck", { name: "e2e-deck" });
        if (deck.code !== 0) {
            check("建卡包+制卡", false, JSON.stringify(deck).slice(0, 160));
        } else {
            const deckID = deck.data?.id ?? deck.data?.deck?.id;
            const added = await api(port, token, "/api/riff/addRiffCards", { deckID, blockIDs: [docID] });
            if (added.code !== 0) {
                check("建卡包+制卡", false, JSON.stringify(added).slice(0, 160));
            } else {
                const cards = await api(port, token, "/api/riff/getRiffDueCards", { deckID, reviewedCards: [] });
                const count = cards?.data?.cards?.length ?? 0;
                check("建卡包+制卡", count > 0, `due cards=${count} (deckID=${deckID})`);
                if (count > 0) {
                    const cardID = cards.data.cards[0].id ?? cards.data.cards[0].cardID;
                    const review = await api(port, token, "/api/riff/reviewRiffCard", { deckID, cardID, rating: 3, reviewedCards: [{ cardID }] });
                    check("内核评分回环", review.code === 0, review.msg || "scored");
                    const after = await api(port, token, "/api/riff/getRiffDueCards", { deckID, reviewedCards: [] });
                    const afterCount = after?.data?.unreviewedCount ?? after?.data?.cards?.length ?? -1;
                    check("评分后队列消费", afterCount === 0, `unreviewed=${afterCount}`);
                }
            }
        }
    }
}

// 7. 汇总
const pass = results.filter(r => r.ok).length;
console.log(`\n[e2e] 结果：${pass}/${results.length} 通过；工作区 ${ws}`);
console.log(`[e2e] 连接信息：port=${port} token=${token}`);

if (TRY_UI) {
    // 尽力而为：Electron 单实例锁可能吞掉 --workspace（AT-16 实测），失败不阻塞
    const { spawn: sp } = await import("node:child_process");
    sp("D:/biji/SiYuan/SiYuan.exe", [`--workspace=${ws}`], { detached: true, stdio: "ignore" }).unref();
    console.log("[e2e] 已尝试拉起 UI（若窗口落到别的工作区即为单实例锁接管，走 UI 菜单 Workspaces 列表打开上面目录）");
}

if (!KEEP) {
    // 拆卸：杀内核、删临时工作区
    try {
        const { execSync } = await import("node:child_process");
        execSync(`taskkill /PID ${kproc.pid} /T /F`, { stdio: "ignore" });
    } catch { /* 可能已退出 */ }
    await sleep(1500);
    try {
        fs.rmSync(ws, { recursive: true, force: true });
        console.log("[e2e] 已拆卸（内核停止 + 临时工作区删除）");
    } catch (e) {
        console.log(`[e2e] 工作区删除失败（内核句柄延迟释放，可手动删）：${ws} — ${e.message.slice(0, 60)}`);
    }
} else {
    console.log("[e2e] --keep：环境保留供 UI 走查；拆卸 = taskkill /PID " + kproc.pid + " /T /F 后删除上面目录");
}
