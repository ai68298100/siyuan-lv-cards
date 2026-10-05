/**
 * 逐行 diff（T05 版本对比，docs/40）：历史版本 vs 当前内容的行级差异。
 * 纯模块：LCS 动态规划（卡面文本量级 O(n·m) 足够）；输出保留顺序的行序列，
 * same/add/del 三种行类型，供 UI 直接渲染。
 */

export interface DiffRow {
    kind: "same" | "add" | "del";
    text: string;
}

/** 逐行 diff：a = 旧（版本），b = 新（当前）。a 独有 → del；b 独有 → add */
export function diffLines(a: string, b: string): DiffRow[] {
    const al = a.length === 0 ? [] : a.replace(/\r\n/g, "\n").split("\n");
    const bl = b.length === 0 ? [] : b.replace(/\r\n/g, "\n").split("\n");
    const n = al.length;
    const m = bl.length;

    // LCS 长度表（(n+1)×(m+1)）
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = al[i] === bl[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const rows: DiffRow[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (al[i] === bl[j]) {
            rows.push({ kind: "same", text: al[i] });
            i += 1;
            j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            rows.push({ kind: "del", text: al[i] });
            i += 1;
        } else {
            rows.push({ kind: "add", text: bl[j] });
            j += 1;
        }
    }
    while (i < n) { rows.push({ kind: "del", text: al[i] }); i += 1; }
    while (j < m) { rows.push({ kind: "add", text: bl[j] }); j += 1; }
    return rows;
}

/** diff 统计：变更行数（add+del）为 0 即两文本逐行一致 */
export function diffStats(rows: DiffRow[]): { add: number; del: number; same: number } {
    const acc = { add: 0, del: 0, same: 0 };
    for (const r of rows) acc[r.kind] += 1;
    return acc;
}
