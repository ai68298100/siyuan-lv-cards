/**
 * BI-25 维护债务队列（纯逻辑，node 可单测）。
 * 集中检测重复 / 题面泄漏 / 过长 / 待审核四类债务——只读诊断，不写内核不改调度；
 * 「暂停」（今日不学）由宿主通道承担（可逆、次日恢复，天然满足「维护不改变 due」）。
 * 结构检查复用入组门禁；重复/泄漏/过长等启发式检测给出人工审阅候选。
 */
import { validateCardEntry } from "./card-entry-gate";

export const DEBT_KINDS = ["invalidCard", "duplicate", "leak", "tooLong", "needsReview", "mediaBroken", "sourceHealth"] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];

export interface ScanCard {
    blockID: string;
    /** 块 markdown（含 ==挖空== 标记） */
    md: string;
    /** 块备注（思源 memo 属性，可作为存量问答答案） */
    memo?: string;
    /** BI-5 生命周期状态（可空——原生卡无档案） */
    state?: string;
    /** 宿主已验证的图片遮挡数据；门禁仍需核对可见题面图片和 Markdown 标记。 */
    occlusion?: boolean;
    /** 来源块是否仍存在；缺失时归入 invalidCard/missing-block。 */
    exists?: boolean;
    /** SQL 可见的来源归属；空值只表示暂时无法解析来源，不等同于无来源。 */
    rootID?: string;
    /** 宿主 statAsset 明确确认缺失的本地媒体；未知/权限失败不得填入。 */
    mediaBroken?: string[];
    /** 来源指纹重新核对后发现的问题；不改变调度。 */
    sourceHealthIssues?: { kind: string; detail: string }[];
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
        .normalize("NFC")
        .replace(/==([^=]*)==/g, "$1")
        .replace(/[#*_`~>[\]()]/g, "")
        .replace(/[\s\p{P}]/gu, "")
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

/**
 * 近似重复候选（只读 advisory）。
 *
 * `detectDebts` 的 `duplicate` 只报告归一化全文完全相同的卡片；这里补充
 * 一个独立的候选扫描器，比较的是挖空答案之外的题面。它故意不加入
 * `DebtKind`：语义相似并不等于重复，最终是否合并必须由用户确认。
 */
export interface ApproximateDuplicateCandidate {
    /** 输入顺序稳定的候选对；两张卡的 block ID 不会相同。 */
    blockIDs: [string, string];
    /** 0..1，相似度越高越值得人工查看。 */
    similarity: number;
    /** 命中的启发式依据，供维护页解释提示。 */
    method: "containment" | "ngram";
}

/** 题面至少达到这个长度才参与近似重复扫描，避免「什么是」一类噪声。 */
export const APPROX_DUP_MIN_QUESTION_CHARS = 8;
/** 较短题面占较长题面的最低比例（包含关系判定）。 */
export const APPROX_DUP_MIN_LENGTH_RATIO = 0.72;
/** 字符 3-gram Jaccard 的最低阈值（不含完全相同题面）。 */
export const APPROX_DUP_NGRAM_THRESHOLD = 0.72;

/** 只取题面，去掉答案标记和会把图片路径带入相似度的媒体语法。 */
export function normalizeCardQuestion(md: string): string {
    return normalizeCardText(
        stripMarkedSegments(md)
            .replace(/<img\b[^>]*>/gi, " ")
            .replace(/<audio\b[^>]*>[\s\S]*?<\/audio>/gi, " ")
            .replace(/!\[[^\]]*\]\([^)]+\)/g, " "),
    );
}

function characterNgrams(value: string, size = 3): Set<string> {
    const chars = Array.from(value);
    const grams = new Set<string>();
    for (let index = 0; index + size <= chars.length; index++) {
        grams.add(chars.slice(index, index + size).join(""));
    }
    return grams;
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
    if (left.size === 0 || right.size === 0) return 0;
    let intersection = 0;
    for (const gram of left) {
        if (right.has(gram)) intersection += 1;
    }
    return intersection / (left.size + right.size - intersection);
}

/**
 * Find conservative near-duplicate pairs by question text.
 *
 * The scan is intentionally pairwise and bounded by cheap character sets: a
 * shorter question must be an almost-contained part of the longer one, or the
 * two 3-gram sets must have a high Jaccard overlap. Exact full-card duplicates
 * are left to `detectDebts` and therefore are not repeated here. Duplicate
 * block IDs are collapsed to their first occurrence before comparison.
 */
export function findApproximateDuplicateCandidates(
    cards: readonly Pick<ScanCard, "blockID" | "md">[],
): ApproximateDuplicateCandidate[] {
    const unique = new Map<string, { blockID: string; full: string; question: string; grams: Set<string> }>();
    for (const card of cards) {
        const blockID = String(card.blockID ?? "");
        if (!blockID || unique.has(blockID)) continue;
        const full = normalizeCardText(card.md);
        const question = normalizeCardQuestion(card.md);
        if (question.length < APPROX_DUP_MIN_QUESTION_CHARS) continue;
        unique.set(blockID, { blockID, full, question, grams: characterNgrams(question) });
    }

    const rows = [...unique.values()];
    const out: ApproximateDuplicateCandidate[] = [];
    for (let leftIndex = 0; leftIndex < rows.length; leftIndex++) {
        const left = rows[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex++) {
            const right = rows[rightIndex];
            // Full-card exact duplicates already have a precise maintenance debt.
            if (left.full && left.full === right.full) continue;

            const shorter = left.question.length <= right.question.length ? left.question : right.question;
            const longer = left.question.length <= right.question.length ? right.question : left.question;
            const lengthRatio = shorter.length / longer.length;
            if (lengthRatio < APPROX_DUP_MIN_LENGTH_RATIO) continue;

            if (longer.includes(shorter)) {
                out.push({
                    blockIDs: [left.blockID, right.blockID],
                    similarity: Number(lengthRatio.toFixed(3)),
                    method: "containment",
                });
                continue;
            }

            const similarity = jaccardSimilarity(left.grams, right.grams);
            if (similarity >= APPROX_DUP_NGRAM_THRESHOLD) {
                out.push({
                    blockIDs: [left.blockID, right.blockID],
                    similarity: Number(similarity.toFixed(3)),
                    method: "ngram",
                });
            }
        }
    }
    return out;
}

/** 质量债务 + 四类启发式检测（无副作用，同块可多条） */
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
        let qualityIssue: string | undefined;
        if (c.exists === false) qualityIssue = "missing-block";
        else if (c.rootID !== undefined && !c.rootID) qualityIssue = "source-unresolved";
        else qualityIssue = validateCardEntry({
            blockID: c.blockID,
            markdown: c.md,
            exists: c.exists,
            occlusionValid: c.occlusion === true,
        }).issue;
        if (qualityIssue) {
            out.push({ blockID: c.blockID, kind: "invalidCard", detail: qualityIssue });
        }
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
        if (c.mediaBroken?.length) {
            out.push({ blockID: c.blockID, kind: "mediaBroken", detail: c.mediaBroken.join(", ") });
        }
        if (c.sourceHealthIssues?.length) {
            out.push({ blockID: c.blockID, kind: "sourceHealth", detail: c.sourceHealthIssues.map(issue => `${issue.kind}: ${issue.detail}`).join("; ") });
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
