/**
 * BX-9 字段级 diff 预览与逐项采用（纯逻辑，node 可单测；BX-2 W2 前置）。
 * 对问面/答案/解释字段的局部编辑先出字段级差异（行内高亮 segments），
 * 用户逐字段采用或拒绝；全拒绝等价取消（结果深等于原卡）；
 * 不产生正式评分、不外发（验收硬性要求）。AI 改写意图/生成归 BX-2。
 */

export const DIFF_FIELDS = ["q", "a", "note"] as const;
export type DiffField = (typeof DIFF_FIELDS)[number];

export type SegKind = "same" | "add" | "del";
export interface DiffSegment {
    text: string;
    kind: SegKind;
}

export interface FieldDiff {
    field: DiffField;
    changed: boolean;
    /** 行内高亮片段（changed=false 时为原文单段 same） */
    segments: DiffSegment[];
}

/** LCS 行内 diff（O(n·m) DP；任一侧超长时退化为整段替换，防卡顿） */
export function charDiff(a: string, b: string): DiffSegment[] {
    if (a === b) return a ? [{ text: a, kind: "same" }] : [];
    // 预算护栏：400×400=16 万格 DP 上限，超限整段替换（预览价值仍在，成本有界）
    if (a.length > 400 || b.length > 400) {
        return [
            { text: a, kind: "del" },
            { text: b, kind: "add" },
        ];
    }
    const n = a.length;
    const m = b.length;
    // dp[i][j] = a[i:] 与 b[j:] 的 LCS 长度
    const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const out: DiffSegment[] = [];
    const push = (text: string, kind: SegKind) => {
        const last = out[out.length - 1];
        if (last && last.kind === kind) last.text += text;
        else out.push({ text, kind });
    };
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            push(a[i], "same");
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            push(a[i], "del");
            i++;
        } else {
            push(b[j], "add");
            j++;
        }
    }
    if (i < n) push(a.slice(i), "del");
    if (j < m) push(b.slice(j), "add");
    return out;
}

/** 三字段全量 diff（调用方给原文/新文对象，缺字段按空串） */
export function diffFields(
    original: Record<DiffField, string>,
    updated: Record<DiffField, string>,
): FieldDiff[] {
    return DIFF_FIELDS.map(field => {
        const o = original[field] ?? "";
        const u = updated[field] ?? "";
        const changed = o !== u;
        return { field, changed, segments: changed ? charDiff(o, u) : [{ text: o, kind: "same" as const }] };
    });
}

export type FieldSelections = Partial<Record<DiffField, boolean>>;

/**
 * 逐字段采用：选中=true 的字段取新文，其余保留原文。
 * 全拒绝（ selections 空或全 false）返回与原文等价的新对象 = 取消语义。
 */
export function applySelections(
    original: Record<DiffField, string>,
    updated: Record<DiffField, string>,
    selections: FieldSelections,
): Record<DiffField, string> {
    const out = { ...original };
    for (const field of DIFF_FIELDS) {
        if (selections[field] === true) out[field] = updated[field] ?? "";
    }
    return out;
}

/** 全拒绝等价取消：没有任何字段被采用 */
export function isCancel(selections: FieldSelections): boolean {
    return !DIFF_FIELDS.some(f => selections[f] === true);
}
