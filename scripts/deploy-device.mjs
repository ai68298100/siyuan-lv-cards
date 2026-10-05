// 部署 dist 构建产物到真机插件目录（本地开发辅助，不在发布链路上）。
// 目标目录从环境变量读取，未设置即失败——本机路径不入仓库（docs/38 P1-D）。
// 用法：LV_DEVICE_PLUGIN_DIR=<思源工作区>/data/plugins/siyuan-lv-cards pnpm deploy:device
import fs from "node:fs";
import path from "node:path";

const src = path.resolve("dist");
const dst = process.env.LV_DEVICE_PLUGIN_DIR;

if (!dst) {
    console.error("缺少 LV_DEVICE_PLUGIN_DIR 环境变量（真机插件目录，如 <工作区>/data/plugins/siyuan-lv-cards）");
    process.exit(1);
}
if (!fs.existsSync(path.join(src, "index.js"))) {
    console.error(`dist 产物不完整，请先 pnpm build：${src}`);
    process.exit(1);
}

for (const f of ["index.js", "index.css", "plugin.json"]) {
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
const i18nSrc = path.join(src, "i18n");
const i18nDst = path.join(dst, "i18n");
if (fs.existsSync(i18nSrc)) {
    for (const f of fs.readdirSync(i18nSrc)) {
        fs.copyFileSync(path.join(i18nSrc, f), path.join(i18nDst, f));
    }
}
// AT-17（v0.158.0）：UI chunks——缺失=复习/闪卡中心页签挂载失败
const chunksSrc = path.join(src, "chunks");
if (fs.existsSync(chunksSrc)) {
    const chunksDst = path.join(dst, "chunks");
    fs.mkdirSync(chunksDst, { recursive: true });
    for (const f of fs.readdirSync(chunksSrc)) {
        fs.copyFileSync(path.join(chunksSrc, f), path.join(chunksDst, f));
    }
}
console.log(`deployed to device: ${dst}`);
