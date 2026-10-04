/**
 * BI-25 维护债务队列（纯逻辑，node 可单测）。
 * 集中检测重复 / 题面泄漏 / 过长 / 待审核四类债务——只读诊断，不写内核不改调度；
 * 「暂停」（今日不学）由宿主通道承担（可逆、次日恢复，天然满足「维护不改变 due」）。
 * 检测全部为启发式：给出的是「值得看一眼」的候选，不是判决。
 */

export const DEBT_KINDS = ["duplicate", "leak", "tooLong", "needsReview"] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];

export interface ScanCard {
    blockID: string;
    /** 块 markdown（含 ==挖空== 标记） */
    md: string;
    /** BI-5 生命周期状态（可空——原生卡无档案） */
    state?: string;
}

export interface DebtItem {
    blockID: string;
    kind: DebtKind;
    /** 展示细节（组内张数/超长长度/泄漏片段），i18n 之外的原始值 */
    detail: string;
}

/** 过长阈值（归一化纯文本字符数）：一卡一知识点的可读性护栏 */
export const TOO_LONG_CHARS = 280;

/** 归一化文本：去 ==标记==（保留内文）、去全部空白、去排版记号、小写——重复判定与泄漏判定的共同底座 */
export function normalizeCardText(md: string): string {
    return (md ?? "")
        .replace(/==([^=]*)==/g, "$1")
        .replace(/[#*_`~>[\]()]/g, "")
        .replace(/\s+/g, "")
        .trim()
        .toLowerCase();
}

/** 提取挖空答案文本集合 */
export function extractMarkedAnswers(md: string): string[] {
    return (md ?? "")
        .match(/==([^=]+)==/g)
        ?.map(s => s.slice(2, -2).trim())
        .filter(Boolean) ?? [];
}

/** 去掉挖空段后的题面文本（泄漏判定用：答案是否同时出现在题面里） */
export function stripMarkedSegments(md: string): string {
    return (md ?? "").replace(/==[^=]*==/g, " ").replace(/\s+/g, " ").trim();
}
/** 四类检测（无副作用；顺序=duplicate/leak/tooLong/needsReview，同块可多条） */
export function detectDebts(cards: ScanCard[]): DebtItem[] {
    const out: DebtItem[] = [];
    const byText = new Map<string, string[]>();
    for (const c of cards) {
        const norm = normalizeCardText(c.md);
        if (norm.length < 4) continue; // 过短内容不做重复判定（模板/空卡噪声）
        const group = byText.get(norm) ?? [];
        group.push(c.blockID);
        byText.set(norm, group);
    }
    for (const c of cards) {
        // 重复：归一化后与至少一张其他卡全同
        const norm = normalizeCardText(c.md);
        const group = byText.get(norm);
        if (norm.length >= 4 && group && group.length >= 2) {
            out.push({ blockID: c.blockID, kind: "duplicate", detail: String(group.length) });
        }
        // 泄漏：挖空答案文本同时出现在题面（答案长度 ≥2 才判）
        const face = normalizeCardText(stripMarkedSegments(c.md));
        for (const a of extractMarkedAnswers(c.md)) {
            if (a.length >= 2 && face.includes(normalizeCardText(a))) {
                out.push({ blockID: c.blockID, kind: "leak", detail: a });
                break;
            }
        }
        // 过长：归一化纯文本超阈值
        if (norm.length > TOO_LONG_CHARS) {
            out.push({ blockID: c.blockID, kind: "tooLong", detail: String(norm.length) });
        }
        // 待审核：生命周期 needsRevision（原生无档案卡不误报）
        if (c.state === "needsRevision") {
            out.push({ blockID: c.blockID, kind: "needsReview", detail: "" });
        }
    }
    return out;
}

/** 按类型分组（UI 分节渲染用；组内保持输入顺序） */
export function groupDebts(debts: DebtItem[]): Record<DebtKind, DebtItem[]> {
    const out = Object.fromEntries(DEBT_KINDS.map(k => [k, []])) as Record<DebtKind, DebtItem[]>;
    for (const d of debts) out[d.kind].push(d);
    return out;
}
