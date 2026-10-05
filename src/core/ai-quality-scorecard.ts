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

export interface Scorecard {
    dimensions: DimensionScore[];
    /** 综合分 0-100（加权扣分；仅审阅提示） */
    composite: number;
    /** 恒 true——综合分不绕过人工闸门（验收断言点） */
    advisoryOnly: true;
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

    // 来源覆盖：答案关键词在来源中无依据（source 未提供=不判，0 分）
    let coverage: DimScore = 0;
    if (typeof input.source === "string" && input.source.trim()) {
        const probe = aCore.slice(0, 24);
        coverage = probe.length >= 4 && !norm(input.source).includes(probe) ? 1 : 0;
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

    return { dimensions: dims, composite, advisoryOnly: true };
}

/** 批量评分：共享批内查重上下文（后出现的重复卡记 duplicate） */
export function scoreBatch(cards: { q: string; a: string; source?: string }[]): Scorecard[] {
    const seen = new Set<string>();
    return cards.map(c => scoreCard(c, seen));
}
