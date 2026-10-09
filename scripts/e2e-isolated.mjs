// 隔离式冒烟/e2e（AT-16 + 2026-10-06 加固约定）：临时工作区 + 无头内核 + 自动部署/启用插件。
// 与 e2e-launch.ps1 的区别：不杀任何现有思源实例、不占用共享工作区，
// 可与其他插件开发会话并行（每实例独立内核端口 + 独立工作区）。
//
// 两种模式（加固约定，共享件见 scripts/lib/smoke-kernel.mjs）：
//   A) 默认：自起隔离靶场——临时 workspace + 无头内核，部署被测插件后全流程冒烟；
//   B) 附着：设置 SIYUAN_BASE_URL / SIYUAN_TOKEN（或 --base/--token，argv 优先）时
//      附着到既有内核直跑（要求被测插件已安装）。启动即防呆：存在任何非
//      siyuan-lv-cards-smoke-* 前缀笔记本 → 判定非隔离靶场拒跑；
//      SIYUAN_E2E_ALLOW_SHARED=1 显式豁免。
// 启动清扫：按前缀注册表清掉上次崩溃残留的临时笔记本（只删自己前缀内的）。
// 外发约定：本脚本无 AI 请求步；凡新增会向模型真实发请求的检查步，
//   必须默认跳过、SIYUAN_E2E_AI=1 才启用。
// 退出码语义：全过=0；任何失败=1（失败路径走 fail()：exitCode+SilentExit，
//   不用 process.exit——Node 24 Win 上带未决句柄的 process.exit 会触发 libuv 断言污染退出码）。
// 用法：
//   node scripts/e2e-isolated.mjs            # 模式 A 全流程：部署→启动→断言→拆卸
//   node scripts/e2e-isolated.mjs --keep     # 模式 A 保留环境（输出端口/token/目录供 UI 走查）
//   SIYUAN_BASE_URL=… SIYUAN_TOKEN=… node scripts/e2e-isolated.mjs   # 模式 B 附着既有内核
// 断言范围（无头可测）：内核健康/鉴权、插件部署完整性（静态文件可取）、
// petal 启用、内核 riff 制卡→到期→评分回环（deck 域）。
// UI 渲染类断言不在本脚本范围（需窗口，走 docs/34 人工/操控清单）。

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { SmokeAbort, guardScratch, makeApi, notebookIdOf, resolveTarget, sweepOrphans } from "./lib/smoke-kernel.mjs";

// 宿主路径支持环境变量覆盖（与 SIYUAN_BASE_URL/SIYUAN_TOKEN 同一约定），默认值保留原参考机路径
const KERNEL = process.env.SIYUAN_KERNEL ?? "D:/biji/SiYuan/resources/kernel/SiYuan-Kernel.exe";
const RESOURCES = process.env.SIYUAN_RESOURCES ?? "D:/biji/SiYuan/resources";
const DIST = path.resolve("dist");
const PLUGIN_ID = "siyuan-lv-cards";
const FRONTEND = "desktop";
const SCRATCH_NB = `siyuan-lv-cards-smoke-${Date.now()}`;

const args = process.argv.slice(2);
const argOf = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
};
const has = (flag) => args.includes(flag);
const KEEP = has("--keep");
const TRY_UI = has("--ui");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 失败退出：exitCode=1 + SilentExit（main 统一吞出，让句柄自然排空） */
class SilentExit {}
const fail = (msg) => {
    if (msg) console.error(msg);
    process.exitCode = 1;
    throw new SilentExit("fail");
};

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

function getRaw(base, token, ep) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: "127.0.0.1", port: Number(new URL(base).port || 80), path: ep, method: "GET",
            headers: { Authorization: `Token ${token}` }, timeout: 8000,
        }, (res) => {
            const buf = [];
            res.on("data", (c) => buf.push(c));
            res.on("end", () => resolve({ status: res.statusCode, size: Buffer.concat(buf).length }));
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

async function main() {
    // ---- 模式判定：给了 SIYUAN_BASE_URL/SIYUAN_TOKEN（或 --base/--token）任一 → 附着既有内核（模式 B） ----
    const baseArg = argOf("--base") ?? process.env.SIYUAN_BASE_URL;
    const tokenArg = argOf("--token") ?? process.env.SIYUAN_TOKEN;
    const MODE_B = Boolean(baseArg || tokenArg);

    let base = "";
    let token = "";
    let ws = "";
    let kproc = null;

    if (MODE_B) {
        // 缺 token 由 resolveTarget 明确报错退出（绝不默认 token）
        const t = resolveTarget({ baseArg, tokenArg });
        base = t.base;
        token = t.token;
        console.log(`[e2e] 模式 B：附着既有内核 ${base}`);
    } else {
        // 模式 A：自起隔离靶场
        ws = path.join(os.tmpdir(), `siyuan-lvcards-e2e-${Date.now()}`);
        const port = await freePort();
        fs.mkdirSync(ws, { recursive: true });
        base = `http://127.0.0.1:${port}`;
        console.log(`[e2e] 模式 A：隔离靶场 workspace: ${ws}`);
        console.log(`[e2e] kernel port: ${port}`);

        // 部署插件（必须在内核启动前！内核只在工作区初始化时扫描插件目录；
        // 先启动后部署时 setPetalEnabled 会假成功但 loadPetals 恒空，petal 断言假通过——2026-10-06 实测）
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
        // AT-17：UI chunks（hub/review/dialogs 独立 IIFE + css）——缺失=页签挂载失败
        const chunksSrc = path.join(DIST, "chunks");
        if (fs.existsSync(chunksSrc)) {
            fs.mkdirSync(path.join(dst, "chunks"), { recursive: true });
            for (const f of fs.readdirSync(chunksSrc)) {
                fs.copyFileSync(path.join(chunksSrc, f), path.join(dst, "chunks", f));
            }
        }
        if (fs.existsSync(path.join(DIST, "icon.png"))) {
            fs.copyFileSync(path.join(DIST, "icon.png"), path.join(dst, "icon.png"));
        }
        const manifest = JSON.parse(fs.readFileSync(path.join(dst, "plugin.json"), "utf8"));
        check("插件部署", manifest.version?.length > 0, `v${manifest.version}`);

        const out = fs.openSync(path.join(ws, "kernel.log"), "a");
        kproc = spawn(KERNEL, ["--workspace", ws, "serve", "--wd", RESOURCES, "--port", String(port)], {
            detached: true, stdio: ["ignore", out, out], windowsHide: true,
        });
        kproc.unref();

        // 等内核就绪并取 token（临时工作区 conf 生成后读取）
        let up = false;
        for (let i = 0; i < 40; i++) {
            await sleep(1500);
            try {
                const r = await fetch(`${base}/api/system/version`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                if (r.status === 200) { up = true; break; }
            } catch { /* 未就绪 */ }
        }
        check("内核启动（无头）", up, `port=${port} pid=${kproc.pid}`);
        if (!up) fail("[e2e] 内核未就绪，中止（工作区保留诊断）：" + ws);
        const confPath = path.join(ws, "conf", "conf.json");
        for (let i = 0; i < 10 && !token; i++) {
            await sleep(1000);
            try {
                token = JSON.parse(fs.readFileSync(confPath, "utf8")).api.token ?? "";
            } catch { /* conf 未生成完 */ }
        }
        check("内核鉴权（conf token）", !!token, token ? `token=${token.slice(0, 4)}…` : "未取到");
        if (!token) fail("[e2e] 未取得 token，中止：" + ws);
    }

    const api = makeApi(base, token);

    // ---- 靶场防呆 + 残留清扫（两种模式都执行；模式 A 空工作区天然通过） ----
    try {
        await sweepOrphans(api);
        await guardScratch(api, { base });
        check("靶场防呆（guardScratch）", true, MODE_B ? "附着模式：已确认为隔离靶场或显式豁免" : "模式 A 隔离靶场");
    } catch (e) {
        if (!(e instanceof SmokeAbort)) check("靶场防呆（guardScratch）", false, String(e).slice(0, 160));
        if (!KEEP && kproc) {
            try {
                const { execSync } = await import("node:child_process");
                execSync(`taskkill /PID ${kproc.pid} /T /F`, { stdio: "ignore" });
            } catch { /* 忽略 */ }
        }
        // 指引已由共享件打印；此处让退出码生效并终止
        process.exitCode = 1;
        throw new SilentExit("guard");
    }

    // ---- 模式 B：确认被测插件已安装（静态可取） ----
    if (MODE_B) {
        const probe = await getRaw(base, token, `/plugins/${PLUGIN_ID}/index.js`);
        check("被测插件已安装（静态可取）", probe.status === 200 && probe.size > 10000, `GET /plugins/.../index.js → ${probe.status}`);
        if (probe.status !== 200) fail("[e2e] 靶场未安装被测插件——模式 B 不自动部署，请先安装后重试");
    }

    // ---- 插件静态资源可取（前端加载路径的代理断言） ----
    const asset = await getRaw(base, token, `/plugins/${PLUGIN_ID}/index.js`);
    check("插件资源可服务", asset.status === 200 && asset.size > 10000, `GET /plugins/.../index.js → ${asset.status}, ${asset.size}B`);
    for (const c of ["chunks/hub.js", "chunks/review.js", "chunks/dialogs.js", "chunks/hub.css", "chunks/review.css", "chunks/dialogs.css"]) {
        const cr = await getRaw(base, token, `/plugins/${PLUGIN_ID}/${c}`);
        check(`chunk 可服务 ${c}`, cr.status === 200 && cr.size > 500, `→ ${cr.status}, ${cr.size}B`);
    }

    // ---- 启用 petal。
    // 已知限制（2026-10-06 阳性对照实测）：无头内核 loadPetals 对所有插件恒返回 []（正常工作的
    // glean 插件同样为空）——petal 真实生效需前端会话，UI 挂载断言不在无头范围；此处只验证
    // setPetalEnabled 调用成功。
    let enabled = false;
    try {
        const r = await api("/api/petal/setPetalEnabled", { frontend: FRONTEND, packageName: PLUGIN_ID, enabled: true });
        enabled = r.code === 0;
    } catch { /* 下一语义 */ }
    check("petal 启用（setPetalEnabled）", enabled, `frontend=${FRONTEND}`);

    // ---- 内核 riff 回环：建临时笔记本→文档→卡包→卡→到期→评分→清扫 ----
    let scratchNbId = "";
    let scratchDeckId = "";
    const nb = await api("/api/notebook/createNotebook", { name: SCRATCH_NB });
    check("建临时笔记本（前缀注册表内）", nb.code === 0, nb.msg || SCRATCH_NB);
    if (nb.code === 0) {
        scratchNbId = notebookIdOf(nb.data);
        // 抗抖动：冷启动内核索引未就绪时 createDocWithMd 偶发 "block not found"，重试一次
        let doc = await api("/api/filetree/createDocWithMd", { notebook: scratchNbId, path: "smoke/riff", markdown: "e2e smoke block" });
        if (doc.code !== 0) {
            await sleep(1500);
            doc = await api("/api/filetree/createDocWithMd", { notebook: scratchNbId, path: "smoke/riff", markdown: "e2e smoke block" });
        }
        check("建文档", doc.code === 0, doc.msg || "");
        if (doc.code === 0) {
            const docID = typeof doc.data === "string" ? doc.data : doc.data?.id;
            const deck = await api("/api/riff/createRiffDeck", { name: SCRATCH_NB });
            if (deck.code !== 0) {
                check("建卡包+制卡", false, JSON.stringify(deck).slice(0, 160));
            } else {
                scratchDeckId = deck.data?.id ?? deck.data?.deck?.id ?? "";
                const added = await api("/api/riff/addRiffCards", { deckID: scratchDeckId, blockIDs: [docID] });
                if (added.code !== 0) {
                    check("建卡包+制卡", false, JSON.stringify(added).slice(0, 160));
                } else {
                    const cards = await api("/api/riff/getRiffDueCards", { deckID: scratchDeckId, reviewedCards: [] });
                    const count = cards?.data?.cards?.length ?? 0;
                    check("建卡包+制卡", count > 0, `due cards=${count}`);
                    if (count > 0) {
                        const cardID = cards.data.cards[0].id ?? cards.data.cards[0].cardID;
                        const review = await api("/api/riff/reviewRiffCard", { deckID: scratchDeckId, cardID, rating: 3, reviewedCards: [{ cardID }] });
                        check("内核评分回环", review.code === 0, review.msg || "scored");
                        const after = await api("/api/riff/getRiffDueCards", { deckID: scratchDeckId, reviewedCards: [] });
                        const afterCount = after?.data?.unreviewedCount ?? after?.data?.cards?.length ?? -1;
                        check("评分后队列消费", afterCount === 0, `unreviewed=${afterCount}`);
                    }
                }
            }
        }
    }

    // ---- 收尾清扫：临时卡组 + 临时笔记本（验收 b：结束时不留任何临时笔记本） ----
    if (scratchDeckId) {
        try {
            await api("/api/riff/removeRiffDeck", { deck: scratchDeckId });
            console.log(`  清扫临时卡组：${scratchDeckId}`);
        } catch { /* 尽力而为 */ }
    }
    if (scratchNbId) {
        try {
            await api("/api/notebook/removeNotebook", { notebook: scratchNbId });
            console.log(`  清扫临时笔记本：${SCRATCH_NB}`);
        } catch (e) {
            console.log(`  ⚠ 临时笔记本清理失败：${String(e).slice(0, 60)}`);
            process.exitCode = 1;
        }
    }
    const leftover = await api("/api/notebook/lsNotebooks", {});
    const leftovers = (leftover.data?.notebooks ?? []).filter((n) => n.name.startsWith("siyuan-lv-cards-smoke-"));
    check("无临时笔记本残留", leftovers.length === 0, leftovers.map((n) => n.name).join(",") || "clean");

    // ---- 汇总 ----
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n[e2e] 结果：${pass}/${results.length} 通过${ws ? `；工作区 ${ws}` : `；附着内核 ${base}`}`);

    if (TRY_UI && !MODE_B) {
        // 尽力而为：Electron 单实例锁可能吞掉 --workspace（AT-16 实测），失败不阻塞
        const { spawn: sp } = await import("node:child_process");
        sp("D:/biji/SiYuan/SiYuan.exe", [`--workspace=${ws}`], { detached: true, stdio: "ignore" }).unref();
        console.log("[e2e] 已尝试拉起 UI（若窗口落到别的工作区即为单实例锁接管，走 UI 菜单 Workspaces 列表打开上面目录）");
    }

    if (!MODE_B && !KEEP) {
        // 拆卸：杀内核、删临时工作区（临时笔记本已在上方显式清扫）
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
    } else if (MODE_B) {
        console.log("[e2e] 模式 B：附着内核保持运行，临时笔记本/卡组已清扫");
    } else {
        console.log("[e2e] --keep：环境保留供 UI 走查；拆卸 = taskkill /PID " + kproc.pid + " /T /F 后删除上面目录");
    }
}

try {
    await main();
} catch (e) {
    if (!(e instanceof SilentExit)) {
        console.error(e?.stack ?? e);
        process.exitCode = 1;
    }
}
