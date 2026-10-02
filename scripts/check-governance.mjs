// 治理一致性校验（docs/17 ↔ docs/31 计数核对自动化）：
// ① docs/17 的 [x] 总数 == docs/31 checkbox="x" 总数
// ② docs/31 summary 块（total/done/open/special/pending）与 entries 实际统计一致
// ③ docs/31 每包 summary.total == 该包 entries 实际数
// ④ docs/17「总计」统计行与 docs/31 summary 一致
// ⑤ 每条 entry 恰有一个主归属（primaryPackage 非空且在 packages 中存在）
// 用法：node scripts/check-governance.mjs（CI 门禁用，不一致退出码 1）
import { readFileSync } from "node:fs";

const failures = [];
const md = readFileSync("docs/17-待办清单.md", "utf8");
const idx = JSON.parse(readFileSync("docs/31-待办工作包索引.json", "utf8"));

// ① 勾选总数一致
const mdChecked = (md.match(/^- \[x\]/gm) || []).length;
const idxDone = idx.entries.filter(e => e.checkbox === "x").length;
if (mdChecked !== idxDone) {
    failures.push(`docs/17 [x]=${mdChecked} vs docs/31 done=${idxDone}`);
}

// ② docs/31 summary 与 entries 实际统计
const actualDone = idx.entries.filter(e => e.checkbox === "x").length;
const actualSpecial = idx.entries.filter(e => e.checkbox === "🧪" || e.checkbox === "🧰").length;
const actualTotal = idx.entries.length;
const actualOpen = actualTotal - actualDone - actualSpecial;
const s = idx.summary;
if (s.total !== actualTotal) failures.push(`summary.total=${s.total} vs actual=${actualTotal}`);
if (s.done !== actualDone) failures.push(`summary.done=${s.done} vs actual=${actualDone}`);
if (s.open !== actualOpen) failures.push(`summary.open=${s.open} vs actual=${actualOpen}`);
if (s.special !== actualSpecial) failures.push(`summary.special=${s.special} vs actual=${actualSpecial}`);
if (s.pending !== actualOpen + actualSpecial) failures.push(`summary.pending=${s.pending} vs actual=${actualOpen + actualSpecial}`);

// ③ 每包 summary.total == 实际 entries 数
const byPackage = {};
for (const e of idx.entries) {
    byPackage[e.primaryPackage] = (byPackage[e.primaryPackage] || 0) + 1;
}
for (const pkg of idx.packages) {
    const actual = byPackage[pkg.id] || 0;
    if (pkg.summary.total !== actual) {
        failures.push(`package ${pkg.id} summary.total=${pkg.summary.total} vs actual=${actual}`);
    }
}
for (const key of Object.keys(byPackage)) {
    if (!idx.packages.some(p => p.id === key)) {
        failures.push(`entry primaryPackage "${key}" not found in packages`);
    }
}

// ④ docs/17 总计统计行与 docs/31 summary 一致（单元格数字带 ** 加粗）
const totalRow = md.match(/\|\s*\*\*总计\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|/);
if (!totalRow) {
    failures.push("docs/17 总计统计行未找到");
} else {
    const [, total, done, open, special, pending] = totalRow.map(Number);
    if (total !== s.total) failures.push(`docs/17 总计 total=${total} vs summary=${s.total}`);
    if (done !== s.done) failures.push(`docs/17 总计 done=${done} vs summary=${s.done}`);
    if (open !== s.open) failures.push(`docs/17 总计 open=${open} vs summary=${s.open}`);
    if (special !== s.special) failures.push(`docs/17 总计 special=${special} vs summary=${s.special}`);
    if (pending !== s.pending) failures.push(`docs/17 总计 pending=${pending} vs summary=${s.pending}`);
}

// ⑤ 每条 entry 恰有一个主归属
for (const e of idx.entries) {
    if (!e.primaryPackage) {
        failures.push(`entry ${e.id} missing primaryPackage`);
    }
}

// ⑥ docs/17 分组统计行的 AQ/BZ 抽查（最近治理新增组，防手改漂移）
for (const [groupId, idPrefix] of [["AQ", "AQ-"], ["BZ", "BZ-"]]) {
    const groupEntries = idx.entries.filter(e => e.group === groupId);
    const doneN = groupEntries.filter(e => e.checkbox === "x").length;
    const openN = groupEntries.length - doneN;
    const row = md.match(new RegExp(`\\|\\s*${groupId} [^|]*\\|\\s*(\\d+)\\s*\\|\\s*(\\d+)\\s*\\|\\s*(\\d+)\\s*\\|`));
    if (row) {
        const [, total, done, open] = row.map(Number);
        if (total !== groupEntries.length) failures.push(`${groupId} 组统计 total=${total} vs actual=${groupEntries.length}`);
        if (done !== doneN) failures.push(`${groupId} 组统计 done=${done} vs actual=${doneN}`);
        if (open !== openN) failures.push(`${groupId} 组统计 open=${open} vs actual=${openN}`);
    } else {
        failures.push(`${groupId} 组统计行未找到`);
    }
}

// ⑦ 存储披露一致性：src/index.ts 声明的每个 *_DATA 文件必须在 docs/PRIVACY.md 披露
const indexTs = readFileSync("src/index.ts", "utf8");
const dataFiles = [...indexTs.matchAll(/_DATA = "([^"]+)"/g)].map(m => m[1]);
const privacy = readFileSync("docs/PRIVACY.md", "utf8");
for (const f of dataFiles) {
    if (!privacy.includes(f)) {
        failures.push(`storage file "${f}" not disclosed in docs/PRIVACY.md`);
    }
}

if (failures.length > 0) {
    console.error("治理一致性校验失败：");
    for (const f of failures) {
        console.error("  - " + f);
    }
    process.exit(1);
}
console.log(`governance OK: ${actualTotal} entries, ${actualDone} done, ${idx.packages.length} packages, docs/17 ↔ docs/31 一致`);
