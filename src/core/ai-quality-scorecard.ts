/**
 * BU-13 AI 卡片质量评分卡（纯逻辑，node 可单测；与 ai-lint 静态 lint 互补）。
 * 八维度分别打分（0=良好 1=提示 2=问题）：原子性/答案泄漏/来源覆盖/重复/歧义/难度/认知层级/语言自然度。
 * 验收硬性要求：每张卡给出可解释问题（noteKey）与修复建议（suggestKey）；综合分恒为 advisoryOnly=true
 * ——只作审阅提示，**不能绕过人工闸门**（入库资格由向导 T03 已接受状态决定，评分无写权限）。
 * 离线启发式：只判定可静态确认的形态问题；语义级质量（事实正确性）不在本模块口径内，不冒充掌握度。
 */

export const SCORECARD_DIMENSIONS = [
    "atomicity",      // 原子性：一卡一事实
    "answer-leak",    // 答案泄漏：题面含答案
    "source-coverage",// 来源覆盖：答案在来源中无依据
    "duplicate",      // 重复：批内重复
    "ambiguity",      // 歧义：指代不明/题面过宽
    "difficulty",     // 难度：答案体量过大难回忆
    "cognitive",      // 认知层级：记忆/理解/应用
    "naturalness",    // 语言自然度：残留标记/占位符
] as const;
export type DimensionKey = (typeof SCORECARD_DIMENSIONS)[number];

export type DimScore = 0 | 1 | 2;

export interface DimensionScore {
    key: DimensionKey;
    score: DimScore;
    /** 问题说明 i18n 键（aiScore.note.<key>.<n>，n=分数）；0 分无 note */
    noteKey?: string;
    /** 修复建议 i18n 键（aiScore.fix.<key>）；0-1 分无建议 */
    suggestKey?: string;
    /** 认知层级的判定结果（仅 cognitive 维度）：remember/understand/apply */
    level?: "remember" | "understand" | "apply";
}

export type AssertionSupportStatus = "supported" | "unsupported" | "partial";

/** 单个事实断言及其在来源材料中的依据情况。 */
export interface CardAssertion {
    /** 断言文本片段（原子命题或分句） */
    text: string;
    /** 该断言在来源中的支持状态 */
    status: AssertionSupportStatus;
    /** 在来源材料中匹配到的依据片段（如有） */
    matchedSourceExcerpt?: string;
    /** 重叠度/置信度 0-1 */
    confidence: number;
}

/** 整张卡片逐断言来源对齐报告。 */
export interface CardAssertionReport {
    assertions: CardAssertion[];
    /** 是否所有断言均有可靠来源支持 */
    allSupported: boolean;
    /** 存在未支持断言的数量 */
    unsupportedCount: number;
    /** 综合来源可信度评分 0-100 */
    sourceTrustScore: number;
}

export interface Scorecard {
    dimensions: DimensionScore[];
    /** 综合分 0-100（加权扣分；仅审阅提示） */
    composite: number;
    /** 恒 true——综合分不绕过人工闸门（验收断言点） */
    advisoryOnly: true;
    /** 逐断言来源依据对齐报告（提供了 source 时计算） */
    assertionReport?: CardAssertionReport;
}

/** 维度权重（综合分扣分用；leak/duplicate 直接决定可用性故权重最高） */
export const DIMENSION_WEIGHTS: Record<Exclude<DimensionKey, "difficulty" | "cognitive">, number> = {
    "answer-leak": 30,
    duplicate: 25,
    atomicity: 15,
    "source-coverage": 15,
    ambiguity: 10,
    naturalness: 5,
};

const norm = (s: string): string => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const ATOMIC_MULTI = /[;；]|以及|\band\b/i;
const PRONOUN = /^(它|它们|他们|她们|这个|那个|这些|那些|该|上述|其中|此|this|these)\s*[^，。；？?]{0,6}(是|有|的|作用|功能|意义|区别|影响|特点)/i;
const MARKUP = /==|\*\*|__|<\/?[a-z][^>]*>|\{\{|\}\}|\$\{/;
const COGNITIVE_APPLY = /应用|举例|设计|计算|编写|实现|演示|apply|demonstrate|compute/i;
const COGNITIVE_UNDERSTAND = /为什么|解释|比较|区别|分析|说明.{0,4}原因|why|explain|compare|analyze/i;

/** n-gram 重叠：aCore 的任意 4 字片段出现在题面（比整串包含更符合「答案主体进题面」直觉） */
function hasCommonGram(qNorm: string, aNorm: string, n = 4): boolean {
    if (aNorm.length < n) {
        return false;
    }
    for (let i = 0; i + n <= aNorm.length; i++) {
        if (qNorm.includes(aNorm.slice(i, i + n))) {
            return true;
        }
    }
    return false;
}

/** 将答案文本拆分为原子断言片段。 */
export function extractAssertions(answer: string, _question?: string): string[] {
    const raw = String(answer ?? "").trim();
    if (!raw) return [];
    // 按语义标点与换行切分为断言候选
    const parts = raw
        .split(/[。；;！!\n\r]+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
    return parts;
}

/** 逐断言在原材料中进行滑动窗口与 n-gram 对齐。 */
export function alignAssertionsWithSource(assertions: string[], sourceText: string): CardAssertionReport {
    const rawSource = String(sourceText ?? "").trim();
    if (!rawSource || assertions.length === 0) {
        return {
            assertions: assertions.map(text => ({ text, status: "unsupported" as const, confidence: 0 })),
            allSupported: false,
            unsupportedCount: assertions.length,
            sourceTrustScore: 0,
        };
    }

    const passages = rawSource.split(/[。；;！!？?\n\r]+/).map(text => ({
        text: text.trim(),
        clean: norm(text).replace(/[^\p{L}\p{N}]/gu, ""),
    })).filter(passage => passage.clean.length > 0);
    let totalConfidence = 0;
    let unsupportedCount = 0;

    const alignedAssertions: CardAssertion[] = assertions.map(assertionText => {
        const clean = norm(assertionText).replace(/[^\p{L}\p{N}]/gu, "");
        if (clean.length === 0) {
            unsupportedCount++;
            return { text: assertionText, status: "unsupported", confidence: 0 };
        }

        // 1. 完全包含直接命中
        const matchedPassage = passages.find(passage => passage.clean.includes(clean));
        if (matchedPassage) {
            // 摘录必须来自原文，不能将规范化后的答案伪装成来源引文。
            const idx = matchedPassage.text.indexOf(assertionText);
            const excerpt = matchedPassage.text.slice(Math.max(0, idx - 40), Math.max(0, idx) + Math.max(200, assertionText.length + 40));
            totalConfidence += 1;
            return { text: assertionText, status: "supported", matchedSourceExcerpt: excerpt, confidence: 1 };
        }

        // 2. 2-gram 窗口重叠度计算
        const n = 2;
        const totalGrams = Math.max(1, clean.length - n + 1);
        const ratio = passages.reduce((best, passage) => {
            let matchedGrams = 0;
            for (let i = 0; i < totalGrams; i++) {
                if (passage.clean.includes(clean.slice(i, i + n))) matchedGrams++;
            }
            return Math.max(best, matchedGrams / totalGrams);
        }, 0);

        // 字词重叠无法证明数值、否定关系或改写后的事实正确；只提示可能相关，留给人工核对。
        if (ratio >= 0.25) {
            const conf = Math.round(ratio * 100) / 100;
            totalConfidence += conf;
            return { text: assertionText, status: "partial", confidence: conf };
        } else {
            const conf = Math.round(ratio * 100) / 100;
            totalConfidence += conf;
            unsupportedCount++;
            return { text: assertionText, status: "unsupported", confidence: conf };
        }
    });

    const avgConfidence = totalConfidence / Math.max(1, assertions.length);
    const sourceTrustScore = Math.round(avgConfidence * 100);

    return {
        assertions: alignedAssertions,
        allSupported: unsupportedCount === 0 && alignedAssertions.every(a => a.status === "supported"),
        unsupportedCount,
        sourceTrustScore,
    };
}

/** 单卡评分：seenKeys 提供批内查重上下文（调用方可复用 scoreBatch）；source 缺省=不判来源覆盖 */
export function scoreCard(input: { q: string; a: string; source?: string }, seenKeys?: Set<string>): Scorecard {
    const q = input.q ?? "";
    const a = input.a ?? "";
    const dims: DimensionScore[] = [];
    const seen = seenKeys ?? new Set<string>();
    const key = `${norm(q)}|${norm(a)}`;
    const dup = seen.has(key);
    seen.add(key);

    // 原子性：题面含分号（强信号，一卡多问）或「以及/and」并列（提示）
    const atomicScore: DimScore = /[;；]/.test(q) ? 2 : ATOMIC_MULTI.test(q) ? 1 : 0;
    dims.push({
        key: "atomicity",
        score: atomicScore,
        ...(atomicScore > 0 ? { noteKey: `aiScore.note.atomicity.${atomicScore}`, suggestKey: "aiScore.fix.atomicity" } : {}),
    });

    // 答案泄漏：答案的任意 4 字片段出现在题面（<4 字短答案不判——题面难以避开术语）
    const aCore = norm(a).replace(/[。．.，,、\s]/g, "");
    const leak = hasCommonGram(norm(q), aCore);
    dims.push({
        key: "answer-leak",
        score: leak ? 2 : 0,
        ...(leak ? { noteKey: "aiScore.note.answer-leak.2", suggestKey: "aiScore.fix.answer-leak" } : {}),
    });

    // 来源覆盖：基于逐断言来源依据对齐进行精准判定（source 未提供=不判，0 分）
    let coverage: DimScore = 0;
    let assertionReport: CardAssertionReport | undefined = undefined;
    if (typeof input.source === "string" && input.source.trim()) {
        const assertions = extractAssertions(a, q);
        assertionReport = alignAssertionsWithSource(assertions, input.source);
        if (assertionReport.unsupportedCount > 0 || !assertionReport.allSupported) {
            coverage = 1;
        }
    }
    dims.push({
        key: "source-coverage",
        score: coverage,
        ...(coverage > 0 ? { noteKey: "aiScore.note.source-coverage.1", suggestKey: "aiScore.fix.source-coverage" } : {}),
    });

    // 重复：批内完全同文
    dims.push({
        key: "duplicate",
        score: dup ? 2 : 0,
        ...(dup ? { noteKey: "aiScore.note.duplicate.2", suggestKey: "aiScore.fix.duplicate" } : {}),
    });

    // 歧义：代词开头（指代无着落）
    const amb: DimScore = PRONOUN.test(q.trim()) ? 1 : 0;
    dims.push({
        key: "ambiguity",
        score: amb,
        ...(amb > 0 ? { noteKey: "aiScore.note.ambiguity.1", suggestKey: "aiScore.fix.ambiguity" } : {}),
    });

    // 难度：答案体量（>120 字=2 提示难回忆；>60=1）——标签性维度，不扣综合分
    const diff: DimScore = a.length > 120 ? 2 : a.length > 60 ? 1 : 0;
    dims.push({
        key: "difficulty",
        score: diff,
        ...(diff > 0 ? { noteKey: `aiScore.note.difficulty.${diff}` } : {}),
    });

    // 认知层级：按动词分类（标签性维度，不扣分）
    let level: DimensionScore["level"] = "remember";
    if (COGNITIVE_APPLY.test(q)) {
        level = "apply";
    } else if (COGNITIVE_UNDERSTAND.test(q)) {
        level = "understand";
    }
    dims.push({ key: "cognitive", score: 0, level });

    // 语言自然度：残留高亮/HTML/模板占位符
    const nat: DimScore = MARKUP.test(q) || MARKUP.test(a) ? 1 : 0;
    dims.push({
        key: "naturalness",
        score: nat,
        ...(nat > 0 ? { noteKey: "aiScore.note.naturalness.1", suggestKey: "aiScore.fix.naturalness" } : {}),
    });

    const composite = Math.max(0, 100 - dims.reduce((sum, d) => {
        const w = (DIMENSION_WEIGHTS as Record<string, number>)[d.key] ?? 0;
        return sum + w * d.score;
    }, 0));

    return { dimensions: dims, composite, advisoryOnly: true, assertionReport };
}

/** 批量评分：共享批内查重上下文（后出现的重复卡记 duplicate） */
export function scoreBatch(cards: { q: string; a: string; source?: string }[]): Scorecard[] {
    const seen = new Set<string>();
    return cards.map(c => scoreCard(c, seen));
}
