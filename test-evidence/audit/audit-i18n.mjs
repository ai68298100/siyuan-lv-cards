// i18n 引用完整性审计（高精度版，可作门禁）：
// 只检查可确认绑定到 i18n 的访问：
//   1) this.i18n.X.Y            2) i18n.X.Y
//   3) t.X.Y —— 仅当文件里 t 绑定到 i18n（const t = $derived(i18n) 等）
//   4) e.X.Y —— 仅当本行有 (this.i18n as any) 声明上下文
// 跳过注释行。用法: node test-evidence/audit/audit-i18n.mjs [--gate]（--gate 时缺失以退出码 1 结束）
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const zh = JSON.parse(fs.readFileSync(path.join(ROOT, "public/i18n/zh-CN.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(ROOT, "public/i18n/en.json"), "utf8"));

const files = [];
const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.(ts|svelte)$/.test(f.name)) files.push(p);
    }
};
walk(path.join(ROOT, "src"));

const missing = [];
const seen = new Set();
let totalRefs = 0;

for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const tBound = /\bconst t = \$derived\((?:.*\.)?i18n\)|\bconst t = (?:this\.)?i18n\b|\bt = this\.i18n\b/.test(src);
    const lines = src.split("\n");
    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return;
        const hasI18nLine = /(?:this\.)?i18n\./.test(line) || /\(this\.i18n as any\)/.test(line);
        let m;
        const refRe = /(?:this\.i18n|\bi18n\b|\bt\b|\be\b)\.([A-Za-z][A-Za-z0-9_]*)(?:\.([A-Za-z][A-Za-z0-9_]*))?(?:\.([A-Za-z][A-Za-z0-9_]*))?/g;
        while ((m = refRe.exec(line))) {
            const kind = m[0].split(".")[0].replace("this.", "");
            const isThisI18n = m[0].startsWith("this.i18n");
            if (kind === "t" && !tBound) continue;
            if (kind === "e" && !/\(this\.i18n as any\)/.test(line)) continue;
            if (kind !== "i18n" && kind !== "t" && kind !== "e" && !isThisI18n) continue;
            // 丢弃紧跟 "(" 的尾段（方法调用链：i18n.key.replace(...) / .trim() 等）
            let segs = [m[1], m[2], m[3]].filter(Boolean);
            let tail = line.slice(refRe.lastIndex);
            while (segs.length > 1 && /^\s*\(/.test(tail)) {
                segs.pop();
                tail = tail.replace(/^\s*\([^)]*\)\s*/, "");
                // 继续跟进链式调用（.replace(x).trim()）
                const more = tail.match(/^\.([A-Za-z][A-Za-z0-9_]*)\s*\(/);
                if (!more) break;
                tail = tail.slice(more[0].length);
            }
            if (segs.length < 2) continue; // 只查二级以上路径（一级键多为根命名空间使用）
            const key = segs.join(".");
            const id = key + "@" + file + ":" + i;
            if (seen.has(id)) continue;
            seen.add(id);
            totalRefs++;
            const probe = (tree) => segs.reduce((n, k) => (n && typeof n === "object") ? n[k] : undefined, tree);
            const vz = probe(zh);
            const ve = probe(en);
            if (vz === undefined || ve === undefined) {
                missing.push({ file: path.relative(ROOT, file), line: i + 1, key, zh: vz !== undefined, en: ve !== undefined, lineText: trimmed.slice(0, 130) });
            }
        }
    });
}

console.log(`扫描 ${files.length} 个文件，检查 ${totalRefs} 处二级以上 i18n 引用`);
if (!missing.length) {
    console.log("✅ 全部引用在 zh-CN 与 en 键树中均存在");
    process.exitCode = 0;
} else {
    console.log(`❌ ${missing.length} 处引用缺失：`);
    for (const m of missing) {
        console.log(`  [${m.zh ? "en缺" : m.en ? "zh缺" : "双缺"}] ${m.key}  @ ${m.file}:${m.line}`);
        console.log(`      ${m.lineText}`);
    }
    if (process.argv.includes("--gate")) process.exitCode = 1;
}
