// i18n 键位完整性校验：
//  1) zh-CN 与 en 的 key 集合必须一致（递归）
//  2) 代码引用完整性：src/ 中可确认绑定到 i18n 的访问路径（this.i18n.X.Y / i18n.X.Y /
//     t.X.Y（t 绑定 i18n 的文件）/ e.X.Y（(this.i18n as any) 行）必须真实存在于键树——
//     防止「键数对齐但代码引用缺失」类的空白文案/崩溃（v0.208.x audit F-1 教训）
// 用法：node scripts/check-i18n.mjs（CI 门禁用，缺失/多出即退出码 1）
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const flatten = (obj, prefix = "") =>
    Object.entries(obj).flatMap(([k, v]) =>
        typeof v === "object" && v !== null ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]
    );

const zh = new Set(flatten(load("public/i18n/zh-CN.json")));
const en = new Set(flatten(load("public/i18n/en.json")));

const missingInEn = [...zh].filter(k => !en.has(k));
const missingInZh = [...en].filter(k => !zh.has(k));

let failed = false;
if (missingInEn.length || missingInZh.length) {
    failed = true;
    if (missingInEn.length) console.error("Missing in en.json:\n  " + missingInEn.join("\n  "));
    if (missingInZh.length) console.error("Missing in zh-CN.json:\n  " + missingInZh.join("\n  "));
}

// ---- 代码引用完整性（高精度：只检查可确认绑定到 i18n 的访问） ----
const zhTree = load("public/i18n/zh-CN.json");
const enTree = load("public/i18n/en.json");
const walk = (dir, out = []) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p, out);
        else if (/\.(ts|svelte)$/.test(f.name)) out.push(p);
    }
    return out;
};
const refRe = /(?:this\.i18n|\bi18n\b|\bt\b|\be\b)\.([A-Za-z][A-Za-z0-9_]*)(?:\.([A-Za-z][A-Za-z0-9_]*))?(?:\.([A-Za-z][A-Za-z0-9_]*))?/g;
const missingRefs = [];
const seen = new Set();
for (const file of walk("src")) {
    const src = readFileSync(file, "utf8");
    const tBound = /\bconst t = \$derived\((?:[\w.]*?)i18n\)|\bconst t = (?:this\.)?i18n\b|\bt = this\.i18n\b/.test(src);
    src.split("\n").forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;
        refRe.lastIndex = 0;
        let m;
        while ((m = refRe.exec(line))) {
            const kind = m[0].split(".")[0].replace("this.", "");
            const isThisI18n = m[0].startsWith("this.i18n");
            if (kind === "t" && !tBound) continue;
            if (kind === "e" && !/\(this\.i18n as any\)/.test(line)) continue;
            if (kind !== "i18n" && kind !== "t" && kind !== "e" && !isThisI18n) continue;
            // 丢弃紧跟 "(" 的尾段（方法调用链：i18n.key.replace(...)）
            const segs = [m[1], m[2], m[3]].filter(Boolean);
            if (segs.length >= 2 && /^\s*\(/.test(line.slice(refRe.lastIndex))) segs.pop();
            if (segs.length < 2) continue;
            const key = segs.join(".");
            const id = key + "@" + file + ":" + i;
            if (seen.has(id)) continue;
            seen.add(id);
            const probe = (tree) => segs.reduce((n, k) => (n && typeof n === "object") ? n[k] : undefined, tree);
            if (probe(zhTree) === undefined || probe(enTree) === undefined) {
                missingRefs.push(`${key} @ ${file.replace(/\\/g, "/")}:${i + 1}`);
            }
        }
    });
}
if (missingRefs.length) {
    failed = true;
    console.error("代码引用但键树缺失（会导致空白文案/undefined）：\n  " + missingRefs.join("\n  "));
}

if (failed) process.exit(1);
console.log(`i18n OK: ${zh.size} keys, zh-CN ↔ en aligned, ${seen.size} 处代码引用全部命中`);
