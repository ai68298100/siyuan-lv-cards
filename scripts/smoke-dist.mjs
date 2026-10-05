// AT-17 发布包 smoke（v0.185.1 真机空白回归门禁）：在 build 链尾对 dist 产物做真实执行验证。
// 背景：v0.158.0~v0.185.0 三个 UI chunk 整表覆盖 window.__lvChunks 且 BASE 相对路径——
// 源码级单测（mock 注册表）与离线 e2e（dev 进程内导入）均无法暴露，首个真机安装才炸。
// 门禁内容：
//   1) shell 的 chunk BASE 必须根绝对（桌面端页面在 /stage/build/app/ 下，相对路径必 404）
//   2) happy-dom 全局中逐个执行 dist/chunks/*.js，断言 __lvChunks.<name> 注册形态正确且三 chunk 共存
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
let failed = 0;
const fail = (msg) => { console.error(`✗ ${msg}`); failed += 1; };
const ok = (msg) => console.log(`✓ ${msg}`);

// 1) shell BASE 根绝对（minify 后 BASE 常量独立存在，使用点做模板拼接）
const shell = readFileSync(resolve(dist, "index.js"), "utf8");
if (!shell.includes("`/plugins/siyuan-lv-cards`")) {
    fail("shell 中未找到根绝对 BASE 常量（`/plugins/siyuan-lv-cards`）");
} else {
    ok("shell chunk BASE 根绝对");
}

// 2) chunk 产物真实执行（注册阶段不触达 svelte 挂载，无需完整 DOM 事件）
const win = new Window({ url: "http://127.0.0.1:6806/stage/build/app/index.html" });
globalThis.window = win;
globalThis.document = win.document;
globalThis.__lvSiyuan = {}; // chunk IIFE 的 siyuan 形参，注册阶段仅透传
const checks = {
    hub: (reg) => typeof reg?.hub?.mount === "function",
    review: (reg) => typeof reg?.review?.mount === "function",
    dialogs: (reg) =>
        typeof reg?.dialogs?.mountDialogComponent === "function" &&
        typeof reg?.dialogs?.components?.AIWizard === "function", // Svelte 5 组件=函数
};
for (const name of ["hub", "review", "dialogs"]) {
    const file = resolve(dist, "chunks", `${name}.js`);
    if (!existsSync(file)) { fail(`缺少 dist/chunks/${name}.js`); continue; }
    const hadRegistryBefore = !!win.__lvChunks?.[name];
    try {
        new Function(readFileSync(file, "utf8"))();
    } catch (e) {
        fail(`dist/chunks/${name}.js 顶层执行抛错：${e?.message ?? e}`);
        continue;
    }
    if (hadRegistryBefore) {
        fail(`dist/chunks/${name}.js 重复注册（构建串味？）`);
    } else if (checks[name](win.__lvChunks)) {
        ok(`dist/chunks/${name}.js → __lvChunks.${name} 形态正确`);
    } else {
        fail(`dist/chunks/${name}.js 未按 __lvChunks.${name} 契约注册（整表覆盖回归？）`);
    }
}
if (checks.hub(win.__lvChunks) && checks.review(win.__lvChunks) && checks.dialogs(win.__lvChunks)) {
    ok("三 chunk 注册共存（无整表覆盖）");
}

if (failed) {
    console.error(`\nsmoke-dist：${failed} 项失败`);
    process.exit(1);
}
console.log("smoke-dist：发布包 chunk 契约全部通过");
