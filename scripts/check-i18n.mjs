// i18n 键位完整性校验：zh-CN 与 en 的 key 集合必须一致（递归）。
// 用法：node scripts/check-i18n.mjs（CI 门禁用，缺失/多出即退出码 1）
import { readFileSync } from "node:fs";

const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const flatten = (obj, prefix = "") =>
    Object.entries(obj).flatMap(([k, v]) =>
        typeof v === "object" && v !== null ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]
    );

const zh = new Set(flatten(load("public/i18n/zh-CN.json")));
const en = new Set(flatten(load("public/i18n/en.json")));

const missingInEn = [...zh].filter(k => !en.has(k));
const missingInZh = [...en].filter(k => !zh.has(k));

if (missingInEn.length || missingInZh.length) {
    if (missingInEn.length) console.error("Missing in en.json:\n  " + missingInEn.join("\n  "));
    if (missingInZh.length) console.error("Missing in zh-CN.json:\n  " + missingInZh.join("\n  "));
    process.exit(1);
}
console.log(`i18n OK: ${zh.size} keys, zh-CN ↔ en aligned`);
