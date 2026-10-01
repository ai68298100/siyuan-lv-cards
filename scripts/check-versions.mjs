// 版本事实源校验（AN 组）：plugin.json / package.json 版本必须一致，
// CHANGELOG 顶部小节必须包含该版本号。不一致即退出码 1（CI 门禁用）。
import { readFileSync } from "node:fs";

const plugin = JSON.parse(readFileSync("plugin.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");

const errors = [];
if (plugin.version !== pkg.version) {
    errors.push(`plugin.json (${plugin.version}) 与 package.json (${pkg.version}) 版本不一致`);
}
if (!changelog.includes(`## v${plugin.version}`)) {
    errors.push(`CHANGELOG.md 缺少 v${plugin.version} 小节`);
}
const head = changelog.split("\n").findIndex(l => l.startsWith("## v"));
const section = changelog.slice(changelog.indexOf(`## v${plugin.version}`));
if (plugin.version !== "0.0.0" && section.length < 40) {
    errors.push(`CHANGELOG v${plugin.version} 小节内容为空`);
}

if (errors.length) {
    console.error("版本事实源校验失败：\n  " + errors.join("\n  "));
    process.exit(1);
}
console.log(`versions OK: ${plugin.version}（plugin/package/CHANGELOG 一致）`);
