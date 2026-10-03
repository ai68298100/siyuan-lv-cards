// 后台取证 step5：提取 common.js 第 5326/5329 行（require shim xe/Pe）
import fs from "node:fs";
const js = fs.readFileSync(".tmp-common.js", "utf8");
const lines = js.split("\n");
console.log("total lines:", lines.length);
for (const ln of [5326, 5329]) {
    const line = lines[ln - 1] ?? "";
    console.log(`\n===== line ${ln} (len ${line.length}) =====`);
    // 列 20011 附近（xe）与列 836 附近（Pe）
    console.log("[xe @20011]:", line.slice(19900 - 1, 20600));
    console.log("[Pe @836]:", line.slice(700 - 1, 1400));
}
