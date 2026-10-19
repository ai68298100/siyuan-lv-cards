/**
 * BT-3 误解簇地图（Misconception Cluster Map，纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 严格基于用户确认的错误原因（ErrorTag）与概念元数据聚类，绝不由算法或模型单独做黑盒诊断；
 * 2. 捍卫 ADR-3 铁律：纯元数据分析与诊断视图，绝不篡改内核原生 FSRS 调度、due 时间戳与历史 revlog；
 * 3. 产出三类结构化干预建议：
 *    - 对比辨析表（Comparison Matrix）：提炼混淆概念对的核心维度与差异；
 *    - 反例与边界测试（Counter-examples & Boundary Conditions）：构建反直觉、边界易错用例；
 *    - 来源修订与拆卡建议（Source Revision & Card Splitting Advice）：向思源源笔记补充说明，拆分复合题；
 * 4. 严重度分级透明：按错误频次、影响卡片数与独立发生天数分级（critical/high/medium/low）；
 * 5. 诊断报告导出：支持一键导出 Markdown 格式的误解复盘报告（带脱敏处理）。
 */

import type { ErrorReason, ErrorTag } from "./error-reasons";

/** 卡片概念与上下文输入 */
export interface CardConceptContext {
    cardID: string;
    /** 卡片题干或摘要 */
    title?: string;
    /** 该卡所属的核心概念标签列表（如 ["useMemo", "useCallback"]） */
    concepts?: string[];
    /** 显式标注的混淆成对概念（如 ["防抖", "节流"]） */
    confusionPair?: [string, string];
    /** 来源思源文档 ID */
    sourceDocId?: string;
    /** 来源思源文档标题 */
    sourceDocTitle?: string;
}

/** 严重度分级 */
export type MisconceptionSeverity = "critical" | "high" | "medium" | "low";

/** 对比辨析表干预建议 */
export interface ComparisonTableAdvice {
    conceptA: string;
    conceptB: string;
    /** 建议比对的核心维度列表（如 ["核心定义", "触发时机", "返回值/副作用", "典型陷阱"]） */
    dimensions: string[];
    suggestionKey: string;
}

/** 反例与边界条件干预建议 */
export interface CounterExampleAdvice {
    targetConcepts: string[];
    boundaryScenario: string;
    suggestionKey: string;
}

/** 来源修订与拆卡干预建议 */
export interface SourceRevisionAdvice {
    affectedCards: string[];
    sourceDocTitle?: string;
    sourceDocId?: string;
    /** 是否建议拆分为更小粒度的原子卡片（频次高且题干长时强烈推荐） */
    splitRecommended: boolean;
    actionKey: string;
}

/** 单个误解簇模型 */
export interface MisconceptionCluster {
    id: string;
    clusterType: "confusion-pair" | "single-concept" | "general-reason";
    /** 涉及的概念列表（标准化排序） */
    concepts: string[];
    /** 主导的错误原因 */
    primaryReason: ErrorReason;
    /** 各类错误原因发生的频次分布 */
    reasonCounts: Partial<Record<ErrorReason, number>>;
    /** 发生总次数 */
    totalOccurrences: number;
    /** 受影响的独立卡片 ID 列表 */
    affectedCardIDs: string[];
    /** 受影响的卡片题干或摘要 */
    cardTitles: string[];
    /** 错误发生的日期记录列表 */
    dates: string[];
    /** 最近一次发生的日期 YYYY-MM-DD */
    lastOccurredDate: string;
    /** 严重度评定 */
    severity: MisconceptionSeverity;
    severityKey: string;
    /** 针对该簇生成的三大干预建议 */
    interventions: {
        comparisonTable?: ComparisonTableAdvice;
        counterExample?: CounterExampleAdvice;
        sourceRevision?: SourceRevisionAdvice;
    };
}

/**
 * 严重度评定规则（纯函数）：
 * - critical: 发生次数 >= 5 且影响 >= 2 张卡片，或单卡高频复发（>= 4 次 烂卡）；
 * - high: 发生次数 >= 3 且影响 >= 1 张卡；
 * - medium: 发生次数 == 2；
 * - low: 发生次数 == 1。
 */
export function calculateClusterSeverity(
    totalOccurrences: number,
    distinctCardCount: number,
    maxCardRepetitions: number = 0,
): { severity: MisconceptionSeverity; severityKey: string } {
    if ((totalOccurrences >= 5 && distinctCardCount >= 2) || maxCardRepetitions >= 4) {
        return { severity: "critical", severityKey: "misconceptionCluster.severity.critical" };
    }
    if (totalOccurrences >= 3) {
        return { severity: "high", severityKey: "misconceptionCluster.severity.high" };
    }
    if (totalOccurrences >= 2) {
        return { severity: "medium", severityKey: "misconceptionCluster.severity.medium" };
    }
    return { severity: "low", severityKey: "misconceptionCluster.severity.low" };
}

/**
 * 标准化混淆对的键名（无序对统一排序，如 ["B", "A"] -> "A__vs__B"）
 */
export function normalizePairKey(a: string, b: string): string {
    const sorted = [a.trim(), b.trim()].sort();
    return `${sorted[0]}__vs__${sorted[1]}`;
}

/**
 * 生成对比辨析表建议（纯函数）
 */
export function generateComparisonAdvice(conceptA: string, conceptB: string): ComparisonTableAdvice {
    return {
        conceptA,
        conceptB,
        dimensions: [
            "misconceptionCluster.dimensions.definition",
            "misconceptionCluster.dimensions.applicability",
            "misconceptionCluster.dimensions.behavior",
            "misconceptionCluster.dimensions.pitfalls",
        ],
        suggestionKey: "misconceptionCluster.advice.buildComparisonTable",
    };
}

/**
 * 生成反例与边界测试建议（纯函数）
 */
export function generateCounterExampleAdvice(concepts: string[], primaryReason: ErrorReason): CounterExampleAdvice {
    let scenarioKey = "misconceptionCluster.scenario.generalBoundary";
    if (primaryReason === "condition-missed") {
        scenarioKey = "misconceptionCluster.scenario.edgeCondition";
    } else if (primaryReason === "concept-confusion") {
        scenarioKey = "misconceptionCluster.scenario.counterIntuitive";
    } else if (primaryReason === "step-error") {
        scenarioKey = "misconceptionCluster.scenario.sequenceViolation";
    }

    return {
        targetConcepts: concepts,
        boundaryScenario: scenarioKey,
        suggestionKey: "misconceptionCluster.advice.createCounterExample",
    };
}

/**
 * 生成来源修订与拆卡建议（纯函数）
 */
export function generateSourceRevisionAdvice(
    affectedContexts: CardConceptContext[],
    totalOccurrences: number,
): SourceRevisionAdvice {
    const cardIDs = affectedContexts.map(c => c.cardID);
    const sourceTitles = Array.from(new Set(affectedContexts.map(c => c.sourceDocTitle).filter(Boolean))) as string[];
    const sourceDocId = affectedContexts.find(c => c.sourceDocId)?.sourceDocId;

    // 发生次数高（>= 3）且卡片少（集中于 1-2 张），多半是卡片定义过于复杂或包含复合考点，建议原子化拆卡
    const splitRecommended = totalOccurrences >= 3 && cardIDs.length <= 2;

    return {
        affectedCards: cardIDs,
        sourceDocTitle: sourceTitles[0],
        sourceDocId,
        splitRecommended,
        actionKey: splitRecommended
            ? "misconceptionCluster.advice.splitCardAndAddDistinction"
            : "misconceptionCluster.advice.enrichSourceSummary",
    };
}

/**
 * BT-3 误解簇构建主函数（纯函数，完全确定性）：
 * 聚类策略：
 * 1. 优先按照显式 confusionPair（成对混淆）进行精确匹配归类；
 * 2. 其次按照 cardContexts 中的 concepts 概念标签归类；
 * 3. 其余无概念元数据的卡片按错误原因（如 concept-confusion / condition-missed）聚类；
 * 4. 严格按照发生频次与严重度倒序排列。
 */
export function buildMisconceptionClusters(
    tags: ErrorTag[],
    cardContexts: CardConceptContext[] = [],
): MisconceptionCluster[] {
    if (!tags || tags.length === 0) return [];

    const contextMap = new Map<string, CardConceptContext>();
    for (const ctx of cardContexts) {
        if (ctx.cardID) contextMap.set(ctx.cardID, ctx);
    }

    // 临时聚类桶
    interface ClusterBucket {
        id: string;
        clusterType: "confusion-pair" | "single-concept" | "general-reason";
        concepts: string[];
        tags: ErrorTag[];
        contexts: CardConceptContext[];
    }

    const bucketMap = new Map<string, ClusterBucket>();

    for (const tag of tags) {
        const ctx = contextMap.get(tag.cardID);
        let bucketKey = "";
        let clusterType: "confusion-pair" | "single-concept" | "general-reason" = "general-reason";
        let concepts: string[] = [];

        if (ctx?.confusionPair && ctx.confusionPair.length === 2 && ctx.confusionPair[0] && ctx.confusionPair[1]) {
            // 显式成对混淆
            const pairKey = normalizePairKey(ctx.confusionPair[0], ctx.confusionPair[1]);
            bucketKey = `pair:${pairKey}`;
            clusterType = "confusion-pair";
            concepts = [ctx.confusionPair[0].trim(), ctx.confusionPair[1].trim()].sort();
        } else if (ctx?.concepts && ctx.concepts.length > 0) {
            // 单概念或复合概念
            const sortedConcepts = Array.from(new Set(ctx.concepts.map(c => c.trim()).filter(Boolean))).sort();
            if (sortedConcepts.length > 0) {
                bucketKey = `concept:${sortedConcepts.join("__")}`;
                clusterType = sortedConcepts.length > 1 ? "confusion-pair" : "single-concept";
                concepts = sortedConcepts;
            }
        }

        if (!bucketKey) {
            // 通用错误原因聚类
            bucketKey = `reason:${tag.reason}`;
            clusterType = "general-reason";
            concepts = [];
        }

        let bucket = bucketMap.get(bucketKey);
        if (!bucket) {
            bucket = {
                id: bucketKey,
                clusterType,
                concepts,
                tags: [],
                contexts: [],
            };
            bucketMap.set(bucketKey, bucket);
        }

        bucket.tags.push(tag);
        if (ctx && !bucket.contexts.some(c => c.cardID === ctx.cardID)) {
            bucket.contexts.push(ctx);
        }
    }

    // 将桶转化为 MisconceptionCluster
    const clusters: MisconceptionCluster[] = [];

    for (const bucket of bucketMap.values()) {
        const totalOccurrences = bucket.tags.length;
        const affectedCardIDs = Array.from(new Set(bucket.tags.map(t => t.cardID)));
        const dates = Array.from(new Set(bucket.tags.map(t => t.date))).sort();
        const lastOccurredDate = dates[dates.length - 1] ?? "";

        // 统计错误原因分布与主导原因
        const reasonCounts: Partial<Record<ErrorReason, number>> = {};
        for (const t of bucket.tags) {
            reasonCounts[t.reason] = (reasonCounts[t.reason] ?? 0) + 1;
        }

        let primaryReason: ErrorReason = bucket.tags[0].reason;
        let maxReasonCount = 0;
        for (const [r, count] of Object.entries(reasonCounts) as [ErrorReason, number][]) {
            if (count > maxReasonCount) {
                maxReasonCount = count;
                primaryReason = r;
            }
        }

        // 计算单卡最大重复发生频次
        const cardRepetitions: Record<string, number> = {};
        for (const t of bucket.tags) {
            cardRepetitions[t.cardID] = (cardRepetitions[t.cardID] ?? 0) + 1;
        }
        const maxRepetition = Math.max(0, ...Object.values(cardRepetitions));

        const { severity, severityKey } = calculateClusterSeverity(
            totalOccurrences,
            affectedCardIDs.length,
            maxRepetition,
        );

        // 收集受影响卡片标题
        const cardTitles: string[] = [];
        for (const cid of affectedCardIDs) {
            const ctx = bucket.contexts.find(c => c.cardID === cid);
            if (ctx?.title) cardTitles.push(ctx.title);
        }

        // 生成干预建议
        const interventions: MisconceptionCluster["interventions"] = {};

        // 1. 若为成对混淆（两个概念），生成对比表建议
        if (bucket.concepts.length === 2) {
            interventions.comparisonTable = generateComparisonAdvice(bucket.concepts[0], bucket.concepts[1]);
        }

        // 2. 边界反例建议
        if (bucket.concepts.length > 0) {
            interventions.counterExample = generateCounterExampleAdvice(bucket.concepts, primaryReason);
        }

        // 3. 来源修订与拆卡建议
        if (bucket.contexts.length > 0) {
            interventions.sourceRevision = generateSourceRevisionAdvice(bucket.contexts, totalOccurrences);
        }

        clusters.push({
            id: bucket.id,
            clusterType: bucket.clusterType,
            concepts: bucket.concepts,
            primaryReason,
            reasonCounts,
            totalOccurrences,
            affectedCardIDs,
            cardTitles,
            dates,
            lastOccurredDate,
            severity,
            severityKey,
            interventions,
        });
    }

    // 排序：严重度从高到低（critical > high > medium > low），同级按发生频次降序，再按最近发生时间降序
    const severityWeight: Record<MisconceptionSeverity, number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
    };

    return clusters.sort((a, b) => {
        const sDiff = severityWeight[b.severity] - severityWeight[a.severity];
        if (sDiff !== 0) return sDiff;
        const countDiff = b.totalOccurrences - a.totalOccurrences;
        if (countDiff !== 0) return countDiff;
        return b.lastOccurredDate.localeCompare(a.lastOccurredDate);
    });
}

/**
 * 导出 Markdown 格式的误解复盘报告（纯函数，隐私脱敏）
 */
export function exportMisconceptionReportMarkdown(
    clusters: MisconceptionCluster[],
    title: string = "误解簇与知识混淆诊断地图",
): string {
    const lines: string[] = [];
    lines.push(`# ${title}`);
    lines.push(`> 生成时间：${new Date().toISOString().slice(0, 10)} | 误解簇总数：${clusters.length}`);
    lines.push("");

    if (clusters.length === 0) {
        lines.push("当前没有记录到任何概念混淆或错误标注，所有概念掌握良好。");
        return lines.join("\n");
    }

    lines.push("## 一、 核心误解分布总览");
    lines.push("| 误解簇 | 类型 | 严重度 | 发生频次 | 影响卡片数 | 主导错因 |");
    lines.push("|---|---|:---:|:---:|:---:|---|");
    for (const c of clusters) {
        const conceptName = c.concepts.length > 0 ? c.concepts.join(" ⚡ ") : `[${c.primaryReason}] 通用簇`;
        lines.push(`| ${conceptName} | ${c.clusterType} | **${c.severity.toUpperCase()}** | ${c.totalOccurrences} 次 | ${c.affectedCardIDs.length} 张 | \`${c.primaryReason}\` |`);
    }
    lines.push("");

    lines.push("## 二、 重点干预与改善清单");
    for (const [index, c] of clusters.entries()) {
        const conceptHeader = c.concepts.length > 0 ? c.concepts.join(" ↔ ") : c.primaryReason;
        lines.push(`### ${index + 1}. [${c.severity.toUpperCase()}] ${conceptHeader}`);
        lines.push(`- **主导错因**：\`${c.primaryReason}\` (共记录 ${c.totalOccurrences} 次，覆盖卡片: ${c.affectedCardIDs.length} 张)`);
        lines.push(`- **最后发生日期**：${c.lastOccurredDate}`);
        if (c.cardTitles.length > 0) {
            lines.push(`- **代表卡片**：${c.cardTitles.slice(0, 3).map(t => `"${t}"`).join("、")}`);
        }

        const { comparisonTable, counterExample, sourceRevision } = c.interventions;
        if (comparisonTable) {
            lines.push(`- **💡 对比辨析建议**：建议建立 \`${comparisonTable.conceptA}\` 与 \`${comparisonTable.conceptB}\` 的对比辨析表，重点对比核心定义、适用条件与行为表现。`);
        }
        if (counterExample) {
            lines.push(`- **🎯 反例构建建议**：针对常见思维定势，设计区分 \`${counterExample.targetConcepts.join(", ")}\` 的边界反例卡片。`);
        }
        if (sourceRevision) {
            if (sourceRevision.splitRecommended) {
                lines.push(`- **✂️ 拆卡与重构建议**：卡片反复混淆，建议将复合卡片拆解为两张独立的单概念原子卡。`);
            }
            if (sourceRevision.sourceDocTitle) {
                lines.push(`- **📝 笔记回源**：在来源笔记《${sourceRevision.sourceDocTitle}》中补充该概念的辨析总结。`);
            }
        }
        lines.push("");
    }

    lines.push("---");
    lines.push("*注：本报告完全基于个人复习时主动确认的错误原因标注与概念关联，绝不篡改内核原生 FSRS 调度历史。*");
    return lines.join("\n");
}
