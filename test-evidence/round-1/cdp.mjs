// 本地测试辅助：通过原生 WebSocket 驱动独立 Chrome（CDP），用于插件 UI 走查。
// 仅测试用，不进入发布包。用法见底部 usage。
import fs from "node:fs";
import http from "node:http";

const PORT = Number(process.env.CDP_PORT ?? 9223);

const httpJson = (path) => new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: PORT, path }, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    }).on("error", reject);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.console = []; this.exceptions = []; }
    static async connect() {
        const targets = await httpJson("/json/list");
        const page = targets.find((t) => t.type === "page");
        if (!page) throw new Error("no page target");
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws error")); });
        const cdp = new CDP(ws);
        ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && cdp.pending.has(msg.id)) {
                const { res, rej } = cdp.pending.get(msg.id);
                cdp.pending.delete(msg.id);
                msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
            } else if (msg.method === "Runtime.consoleAPICalled") {
                const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
                cdp.console.push(`[${msg.params.type}] ${text.slice(0, 400)}`);
            } else if (msg.method === "Runtime.exceptionThrown") {
                const d = msg.params.exceptionDetails;
                cdp.exceptions.push(`${d.text} ${d.exception?.description ?? ""}`.slice(0, 500));
            }
        };
        for (const m of ["Runtime.enable", "Page.enable", "Console.enable", "Log.enable"]) await cdp.send(m);
        return { cdp, target: page };
    }
    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((res, rej) => {
            this.pending.set(id, { res, rej });
            this.ws.send(JSON.stringify({ id, method, params }));
            setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error(`timeout ${method}`)); } }, 30000);
        });
    }
    async eval(expr) {
        const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error("page eval: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).slice(0, 500));
        return r.result.value;
    }
    async screenshot(file, fullPage = false) {
        const r = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage });
        fs.writeFileSync(file, Buffer.from(r.data, "base64"));
        return file;
    }
    async clickAt(x, y) {
        for (const type of ["mousePressed", "mouseReleased"]) {
            await this.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
        }
    }
    async typeText(text) {
        for (const ch of text) {
            await this.send("Input.insertText", { text: ch });
        }
    }
    async pressKey(key, { ctrl = false, shift = false, alt = false } = {}) {
        const map = {
            Enter: [13, "Enter"], Space: [32, " ", "Space"], Escape: [27, "Escape"], Tab: [9, "Tab"],
            Backspace: [8, "Backspace"], ArrowLeft: [37, "ArrowLeft"], ArrowRight: [39, "ArrowRight"],
            ArrowUp: [38, "ArrowUp"], ArrowDown: [40, "ArrowDown"],
        };
        let code, text, keyName = key;
        if (/^[0-9]$/.test(key)) { code = 48 + Number(key); text = key; }
        else if (/^[a-z]$/i.test(key)) { code = key.toUpperCase().charCodeAt(0); text = key; keyName = key; }
        else if (map[key]) { [code, text, keyName] = map[key]; }
        else throw new Error("unsupported key " + key);
        const mods = (ctrl ? 2 : 0) | (alt ? 1 : 0) | (shift ? 8 : 0);
        const printable = text && text.length === 1 && !ctrl && !alt;
        const base = { modifiers: mods, windowsVirtualKeyCode: code, key: keyName };
        await this.send("Input.dispatchKeyEvent", { type: ctrl || alt || !printable ? "rawKeyDown" : "keyDown", ...base, ...(printable ? { text } : {}) });
        await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    }
    async report() {
        return { console: this.console.slice(-40), exceptions: this.exceptions.slice(-10) };
    }
}

const usage = `usage: node cdp.mjs <cmd> ...
  nav <url>                 导航并等待
  eval <js-file>            页面内执行（awaitPromise），输出 JSON
  shot <file.png> [full]    截图
  click <css-selector>      真实鼠标点击（元素中心）
  type <text>               输入文本
  key <Key> [ctrl|alt|shift]  键盘按键/组合
  viewport <w> <h>          设置视口
  state                     快速状态（siyuan/loading/console）`;

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd) { console.log(usage); process.exit(0); }

const { cdp } = await CDP.connect();

// Emulation 覆盖是会话级的——单发 viewport 命令进程退出即失效；
// mobile 命令在【同一会话】内 设视口→导航→截图（390px 走查用）
if (cmd === "mobile") {
    const [w, h, url, shotFile] = rest;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: Number(w), height: Number(h), deviceScaleFactor: Number(process.env.DPR ?? 2), mobile: true });
    await cdp.send("Page.navigate", { url });
    await sleep(Number(process.env.NAV_WAIT ?? 10000));
    const size = await cdp.eval(`({ iw: window.innerWidth, ih: window.innerHeight })`);
    if (shotFile) await cdp.screenshot(shotFile);
    console.log(JSON.stringify({ size, shot: shotFile ?? null }));
    cdp.ws.close();
    process.exit(0);
}
try {
    if (cmd === "nav") {
        await cdp.send("Page.navigate", { url: rest[0] });
        await sleep(Number(process.env.NAV_WAIT ?? 6000));
        console.log(JSON.stringify(await cdp.report()));
    } else if (cmd === "eval") {
        const code = fs.readFileSync(rest[0], "utf8");
        const out = await cdp.eval(code);
        console.log(JSON.stringify(out, null, 2));
        console.log("---CDP-REPORT---");
        console.log(JSON.stringify(await cdp.report()));
    } else if (cmd === "shot") {
        await cdp.screenshot(rest[0], rest[1] === "full");
        console.log("saved " + rest[0]);
    } else if (cmd === "click") {
        const rect = await cdp.eval(`(() => { const el = document.querySelector(${JSON.stringify(rest[0])}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()`);
        if (!rect) { console.error("element not found: " + rest[0]); process.exit(1); }
        if (rect.w < 2 || rect.h < 2) { console.error("element too small: " + JSON.stringify(rect)); process.exit(1); }
        await cdp.clickAt(rect.x, rect.y);
        await sleep(600);
        console.log("clicked at " + JSON.stringify(rect));
        console.log(JSON.stringify(await cdp.report()));
    } else if (cmd === "dialog") {
    // 用法: dialog <行文本片段> <按钮文本> — 在 .b3-dialog 内点行再点按钮，返回对话框状态
    const p1 = await cdp.eval(`(() => {
      const dlg = document.querySelector(".b3-dialog");
      if (!dlg) return { nodialog: true };
      const hit = [...dlg.querySelectorAll("*")].filter(e => e.offsetParent !== null && e.textContent.replace(/\\s+/g, " ").trim().includes(${JSON.stringify(rest[0])})).pop();
      if (!hit) return { notfound: [...dlg.querySelectorAll("*")].filter(e => e.offsetParent !== null && e.children.length === 0).map(e => e.textContent.trim().slice(0, 16)) };
      const r = hit.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (p1.nodialog) { console.error("no dialog open"); process.exit(1); }
    if (p1.notfound) { console.log("row candidates: " + JSON.stringify(p1.notfound)); process.exit(1); }
    await cdp.clickAt(p1.x, p1.y);
    await sleep(900);
    const p2 = await cdp.eval(`(() => {
      const btn = [...document.querySelectorAll(".b3-dialog button, .b3-dialog .b3-button")].filter(e => e.offsetParent !== null && e.textContent.includes(${JSON.stringify(rest[1] ?? "确定")})).pop();
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!p2) { console.error("button not found: " + (rest[1] ?? "确定")); process.exit(1); }
    await cdp.clickAt(p2.x, p2.y);
    await sleep(1500);
    const after = await cdp.eval(`({ dialogStillOpen: !!document.querySelector(".b3-dialog"), msg: document.querySelector("#message")?.textContent?.replace(/\\s+/g, " ")?.slice(0, 120) ?? null })`);
    console.log(JSON.stringify(after, null, 1));
    console.log(JSON.stringify(await cdp.report()));
  } else if (cmd === "gutter") {
    // 用法: gutter <块文本片段> [菜单文本] — 悬停块→点 gutter；给菜单文本则再点菜单项，返回点击后弹层内容
    const pos = await cdp.eval(`(() => {
      const b = [...document.querySelectorAll(".protyle-wysiwyg [data-node-id]")].find(e => e.textContent.includes(${JSON.stringify(rest[0])}));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { bx: r.x + 30, by: r.y + r.height / 2 };
    })()`);
    if (!pos) { console.error("block not found: " + rest[0]); process.exit(1); }
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pos.bx, y: pos.by });
    await sleep(800);
    const gpos = await cdp.eval(`(() => {
      const gs = [...document.querySelectorAll(".protyle-gutters button")];
      if (!gs.length) return null;
      const r = gs[0].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!gpos) { console.error("gutter not visible"); process.exit(1); }
    await cdp.clickAt(gpos.x, gpos.y);
    await sleep(900);
    if (rest[1]) {
      // 插件入口位于「插件」子菜单：先悬停展开，再点击目标项（仅取可见元素）
      const plug = await cdp.eval(`(() => {
        const it = [...document.querySelectorAll(".b3-menu .b3-menu__item")].filter(e => e.textContent.includes("插件") && e.offsetParent !== null).pop();
        if (!it) return null;
        const r = it.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      if (plug) {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: plug.x, y: plug.y });
        await sleep(700);
      }
      const mpos = await cdp.eval(`(() => {
        const items = [...document.querySelectorAll(".b3-menu .b3-menu__item")].filter(e => e.textContent.includes(${JSON.stringify(rest[1])}) && e.offsetParent !== null);
        const it = items[items.length - 1];
        if (!it) return { notfound: true, items: [...document.querySelectorAll(".b3-menu .b3-menu__item")].filter(e => e.offsetParent !== null).map(e => e.textContent.trim().slice(0, 24)) };
        const r = it.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      if (mpos?.notfound) { console.log("menu items: " + JSON.stringify(mpos.items)); process.exit(1); }
      await cdp.clickAt(mpos.x, mpos.y);
      await sleep(1200);
    }
    const after = await cdp.eval(`(() => {
      const menu = document.querySelector(".b3-menu");
      const dlg = document.querySelector(".b3-dialog");
      return { menuItems: menu ? [...menu.querySelectorAll(".b3-menu__item")].map(e => e.textContent.trim().slice(0, 24)) : null, dialogText: dlg?.textContent?.replace(/\\s+/g, " ")?.slice(0, 120) ?? null };
    })()`);
    console.log(JSON.stringify(after, null, 1));
    console.log(JSON.stringify(await cdp.report()));
  } else if (cmd === "move") {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Number(rest[0]), y: Number(rest[1]) });
    await sleep(600);
    console.log("moved to " + rest[0] + "," + rest[1]);
  } else if (cmd === "clicktext") {
    // 用法: clicktext <selector> <text>  — 在匹配 selector 的元素中找文本相等的第一个，真实点击其中心
    const rect = await cdp.eval(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(rest[0])})];
      const el = els.find(e => e.textContent.trim() === ${JSON.stringify(rest[1])});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!rect) { console.error("not found: " + rest[1]); process.exit(1); }
    await cdp.clickAt(rect.x, rect.y);
    await sleep(1200);
    console.log("clicked " + JSON.stringify(rect));
    console.log(JSON.stringify(await cdp.report()));
  } else if (cmd === "clickat") {
    await cdp.clickAt(Number(rest[0]), Number(rest[1]));
    await sleep(1500);
    console.log("clicked at " + rest[0] + "," + rest[1]);
    console.log(JSON.stringify(await cdp.report()));
  } else if (cmd === "type") {
        await cdp.typeText(rest[0]);
        console.log("typed");
    } else if (cmd === "key") {
        await cdp.pressKey(rest[0], { ctrl: rest.includes("ctrl"), alt: rest.includes("alt"), shift: rest.includes("shift") });
        await sleep(400);
        console.log("key " + rest[0]);
        console.log(JSON.stringify(await cdp.report()));
    } else if (cmd === "viewport") {
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: Number(rest[0]), height: Number(rest[1]), deviceScaleFactor: 1, mobile: Number(rest[0]) < 500 });
        console.log("viewport set");
    } else if (cmd === "state") {
        const s = await cdp.eval(`({ booted: !!window.siyuan, loadingShown: (() => { const l = document.querySelector("#loading"); return !!l && getComputedStyle(l).display !== "none"; })(), plugins: (window.siyuan?.plugins ?? []).map(p => p.name), title: document.title, url: location.href.slice(0, 120) })`);
        console.log(JSON.stringify(s, null, 2));
        console.log(JSON.stringify(await cdp.report()));
    }
} finally {
    cdp.ws.close();
}
