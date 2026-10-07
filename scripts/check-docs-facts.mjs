// 当前文档事实源校验：防止版本、快捷键和已实现能力回退到旧口径。
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const pkg = JSON.parse(read("package.json"));
const plugin = JSON.parse(read("plugin.json"));
const version = `v${pkg.version}`;
const failures = [];

if (pkg.version !== plugin.version) {
    failures.push(`package.json (${pkg.version}) 与 plugin.json (${plugin.version}) 版本不一致`);
}

const requiredFacts = [
    ["README.md", version],
    ["README.en.md", version],
    ["docs/17-待办清单.md", `当前基线：${version}`],
    ["docs/21-用户上手指南.md", `当前指南按 ${version} 的已实现入口编写`],
    ["docs/21-用户上手指南.md", "Ctrl+K 或 ⌘K"],
    ["docs/30-待办治理与执行顺序.md", `均为 ${version}`],
    ["docs/43-当前状态审计与开发交接.md", `代码基线：${version}`],
    ["docs/PRIVACY.md", `当前 ${version} 无遥测、无埋点`],
    ["docs/集市PR材料.md", `当前为 ${version}`],
    ["docs/40-原型全页核对清单.md", "学习日历与负载预测已落地"],
];

for (const [file, fact] of requiredFacts) {
    if (!read(file).includes(fact)) {
        failures.push(`${file} 缺少当前事实：${fact}`);
    }
}

const docs21 = read("docs/21-用户上手指南.md");
if (!docs21.includes("网络故障、超时、5xx 或限流时可自动尝试") || !docs21.includes("鉴权、配额、策略、解析错误和用户取消不会回退")) {
    failures.push("docs/21-用户上手指南.md 的 AI 备用端点条件未与当前降级契约一致");
}

if (failures.length > 0) {
    console.error("文档当前事实校验失败：");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`docs facts OK: ${version}, keyboard Ctrl+K/⌘K, calendar implemented`);
