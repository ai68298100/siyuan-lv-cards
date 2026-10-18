import http from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = 19068;

// Read only the two pure, trusted repository modules. The fixture never loads
// the plugin shell, SiYuan SDK, storage, or a live host's settings.
function readPureModule(relativePath, dependencies = {}) {
    const output = ts.transpileModule(readFileSync(resolve(root, relativePath), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: relativePath,
    }).outputText;
    const exports = {};
    runInNewContext(output, {
        exports,
        require: name => {
            if (Object.hasOwn(dependencies, name)) return dependencies[name];
            throw new Error(`Fixture blocked module dependency: ${name}`);
        },
    }, { filename: relativePath, timeout: 1000 });
    return exports;
}
const modules = readPureModule("src/core/modules.ts");
const settingsModule = readPureModule("src/core/settings.ts", { "./modules": modules });
const settingsJson = JSON.stringify(settingsModule.defaultSettings());
const routes = new Map([
    ["/", ["test-evidence/imports-2026-10-18/fixture.html", "text/html; charset=utf-8"]],
    ["/dist/index.css", ["dist/index.css", "text/css; charset=utf-8"]],
    ["/dist/chunks/dialogs.css", ["dist/chunks/dialogs.css", "text/css; charset=utf-8"]],
    ["/dist/chunks/dialogs.js", ["dist/chunks/dialogs.js", "text/javascript; charset=utf-8"]],
    ["/i18n/zh-CN.json", ["public/i18n/zh-CN.json", "application/json; charset=utf-8"]],
    ["/i18n/en.json", ["public/i18n/en.json", "application/json; charset=utf-8"]],
]);

http.createServer((req, res) => {
    const pathname = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; frame-src 'self'; object-src 'none'; base-uri 'none'");
    if (req.method !== "GET") {
        res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ code: -1, msg: "Fixture blocks every write request", data: null }));
        return;
    }
    if (pathname === "/fixture/default-settings.json") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(settingsJson);
        return;
    }
    const route = routes.get(pathname);
    if (!route) { res.writeHead(404).end("Fixture route not found"); return; }
    try {
        const content = readFileSync(resolve(root, route[0]));
        res.writeHead(200, { "Content-Type": route[1] }).end(content);
    } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end(`Fixture resource unavailable: ${error.message}`);
    }
}).listen(port, "127.0.0.1", () => {
    console.log(`Settings imports production fixture: http://127.0.0.1:${port}/?theme=dark&locale=zh-CN`);
    console.log(`Optional true iframe viewport: http://127.0.0.1:${port}/?theme=dark&locale=zh-CN&width=320&height=568`);
});
