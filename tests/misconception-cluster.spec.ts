import { describe, it, expect } from "vitest";
import {
    buildMisconceptionClusters,
    calculateClusterSeverity,
    generateComparisonAdvice,
    generateCounterExampleAdvice,
    generateSourceRevisionAdvice,
    exportMisconceptionReportMarkdown,
    normalizePairKey,
    type CardConceptContext,
} from "../src/core/misconception-cluster";
import type { ErrorTag } from "../src/core/error-reasons";

describe("BT-3 误解簇地图（Misconception Cluster Map）", () => {
    describe("标准化与严重度评定规则", () => {
        it("normalizePairKey 确保成对混淆概念无序对称性", () => {
            expect(normalizePairKey("防抖", "节流")).toBe(normalizePairKey("节流", "防抖"));
            expect(normalizePairKey(" useMemo ", "useCallback")).toBe("useCallback__vs__useMemo");
        });

        it("calculateClusterSeverity 严重度分级判定边界完整", () => {
            // critical: 发生 >= 5 且卡片 >= 2
            expect(calculateClusterSeverity(5, 2).severity).toBe("critical");
            // critical: 单卡复发 >= 4
            expect(calculateClusterSeverity(4, 1, 4).severity).toBe("critical");

            // high: 发生 >= 3
            expect(calculateClusterSeverity(3, 1).severity).toBe("high");
            expect(calculateClusterSeverity(4, 1).severity).toBe("high");

            // medium: 发生 == 2
            expect(calculateClusterSeverity(2, 1).severity).toBe("medium");

            // low: 发生 == 1
            expect(calculateClusterSeverity(1, 1).severity).toBe("low");
            expect(calculateClusterSeverity(0, 0).severity).toBe("low");
        });
    });

    describe("干预建议生成器", () => {
        it("generateComparisonAdvice 生成四维度对比建议", () => {
            const advice = generateComparisonAdvice("useMemo", "useCallback");
            expect(advice.conceptA).toBe("useMemo");
            expect(advice.conceptB).toBe("useCallback");
            expect(advice.dimensions).toEqual([
                "misconceptionCluster.dimensions.definition",
                "misconceptionCluster.dimensions.applicability",
                "misconceptionCluster.dimensions.behavior",
                "misconceptionCluster.dimensions.pitfalls",
            ]);
            expect(advice.suggestionKey).toBe("misconceptionCluster.advice.buildComparisonTable");
        });

        it("generateCounterExampleAdvice 按主导错因生成不同反例情境", () => {
            const cond = generateCounterExampleAdvice(["条件A"], "condition-missed");
            expect(cond.boundaryScenario).toBe("misconceptionCluster.scenario.edgeCondition");

            const conf = generateCounterExampleAdvice(["概念A", "概念B"], "concept-confusion");
            expect(conf.boundaryScenario).toBe("misconceptionCluster.scenario.counterIntuitive");

            const step = generateCounterExampleAdvice(["步骤1"], "step-error");
            expect(step.boundaryScenario).toBe("misconceptionCluster.scenario.sequenceViolation");

            const other = generateCounterExampleAdvice(["通用"], "memory-blank");
            expect(other.boundaryScenario).toBe("misconceptionCluster.scenario.generalBoundary");
        });

        it("generateSourceRevisionAdvice 高频且卡片集中时建议拆卡与回源", () => {
            const cards: CardConceptContext[] = [
                { cardID: "c1", title: "超长大题", sourceDocTitle: "前端工程化" },
            ];
            const adviceHigh = generateSourceRevisionAdvice(cards, 4);
            expect(adviceHigh.splitRecommended).toBe(true);
            expect(adviceHigh.sourceDocTitle).toBe("前端工程化");
            expect(adviceHigh.actionKey).toBe("misconceptionCluster.advice.splitCardAndAddDistinction");

            const adviceLow = generateSourceRevisionAdvice(cards, 1);
            expect(adviceLow.splitRecommended).toBe(false);
            expect(adviceLow.actionKey).toBe("misconceptionCluster.advice.enrichSourceSummary");
        });
    });

    describe("buildMisconceptionClusters 聚类与聚合", () => {
        it("空输入安全防御返回空数组", () => {
            expect(buildMisconceptionClusters([])).toEqual([]);
            expect(buildMisconceptionClusters(null as any)).toEqual([]);
        });

        it("优先将显式成对混淆聚合为 confusion-pair 误解簇", () => {
            const tags: ErrorTag[] = [
                { cardID: "c1", reason: "concept-confusion", date: "2026-10-18" },
                { cardID: "c2", reason: "concept-confusion", date: "2026-10-19" },
                { cardID: "c1", reason: "condition-missed", date: "2026-10-20" },
            ];

            const contexts: CardConceptContext[] = [
                {
                    cardID: "c1",
                    title: "防抖与节流区别题 1",
                    confusionPair: ["防抖", "节流"],
                    sourceDocTitle: "JavaScript高级进阶",
                },
                {
                    cardID: "c2",
                    title: "防抖与节流区别题 2",
                    confusionPair: ["节流", "防抖"],
                    sourceDocTitle: "JavaScript高级进阶",
                },
            ];

            const clusters = buildMisconceptionClusters(tags, contexts);
            expect(clusters).toHaveLength(1);

            const cluster = clusters[0];
            expect(cluster.clusterType).toBe("confusion-pair");
            expect(cluster.concepts).toEqual(["防抖", "节流"].sort());
            expect(cluster.totalOccurrences).toBe(3);
            expect(cluster.affectedCardIDs).toEqual(["c1", "c2"]);
            expect(cluster.cardTitles).toEqual(["防抖与节流区别题 1", "防抖与节流区别题 2"]);
            expect(cluster.primaryReason).toBe("concept-confusion");
            expect(cluster.reasonCounts).toEqual({
                "concept-confusion": 2,
                "condition-missed": 1,
            });
            expect(cluster.severity).toBe("high");
            expect(cluster.interventions.comparisonTable).toBeDefined();
            expect(cluster.interventions.counterExample).toBeDefined();
            expect(cluster.interventions.sourceRevision).toBeDefined();
        });

        it("按概念标签聚合为单概念或多概念簇", () => {
            const tags: ErrorTag[] = [
                { cardID: "c3", reason: "step-error", date: "2026-10-19" },
                { cardID: "c3", reason: "step-error", date: "2026-10-20" },
            ];

            const contexts: CardConceptContext[] = [
                {
                    cardID: "c3",
                    title: "拓扑排序实现",
                    concepts: ["拓扑排序"],
                    sourceDocTitle: "算法导论",
                },
            ];

            const clusters = buildMisconceptionClusters(tags, contexts);
            expect(clusters).toHaveLength(1);
            expect(clusters[0].clusterType).toBe("single-concept");
            expect(clusters[0].concepts).toEqual(["拓扑排序"]);
            expect(clusters[0].severity).toBe("medium");
            // 单概念不产生 comparisonTable
            expect(clusters[0].interventions.comparisonTable).toBeUndefined();
            // 产生 counterExample
            expect(clusters[0].interventions.counterExample).toBeDefined();
        });

        it("无概念上下文的卡片归入 general-reason 通用错误簇", () => {
            const tags: ErrorTag[] = [
                { cardID: "c_unknown_1", reason: "memory-blank", date: "2026-10-20" },
                { cardID: "c_unknown_2", reason: "memory-blank", date: "2026-10-20" },
            ];

            const clusters = buildMisconceptionClusters(tags, []);
            expect(clusters).toHaveLength(1);
            expect(clusters[0].clusterType).toBe("general-reason");
            expect(clusters[0].concepts).toEqual([]);
            expect(clusters[0].primaryReason).toBe("memory-blank");
            expect(clusters[0].totalOccurrences).toBe(2);
        });

        it("严格按严重度倒序及频次排序", () => {
            const tags: ErrorTag[] = [
                // 1次 low
                { cardID: "c_low", reason: "attention-lapse", date: "2026-10-18" },
                // 5次 critical
                { cardID: "c_crit_1", reason: "concept-confusion", date: "2026-10-15" },
                { cardID: "c_crit_1", reason: "concept-confusion", date: "2026-10-16" },
                { cardID: "c_crit_1", reason: "concept-confusion", date: "2026-10-17" },
                { cardID: "c_crit_2", reason: "concept-confusion", date: "2026-10-18" },
                { cardID: "c_crit_2", reason: "concept-confusion", date: "2026-10-19" },
                // 3次 high
                { cardID: "c_high", reason: "condition-missed", date: "2026-10-20" },
                { cardID: "c_high", reason: "condition-missed", date: "2026-10-20" },
                { cardID: "c_high", reason: "condition-missed", date: "2026-10-20" },
            ];

            const contexts: CardConceptContext[] = [
                { cardID: "c_low", concepts: ["低频概念"] },
                { cardID: "c_crit_1", confusionPair: ["严重A", "严重B"] },
                { cardID: "c_crit_2", confusionPair: ["严重A", "严重B"] },
                { cardID: "c_high", concepts: ["高频概念"] },
            ];

            const clusters = buildMisconceptionClusters(tags, contexts);
            expect(clusters).toHaveLength(3);
            expect(clusters[0].severity).toBe("critical");
            expect(clusters[1].severity).toBe("high");
            expect(clusters[2].severity).toBe("low");
        });

        it("同严重度和频次时按最近发生日期倒序排列", () => {
            const tags: ErrorTag[] = [
                { cardID: "c_older", reason: "concept-confusion", date: "2026-10-10" },
                { cardID: "c_newer", reason: "concept-confusion", date: "2026-10-20" },
            ];
            const contexts: CardConceptContext[] = [
                { cardID: "c_older", concepts: ["旧概念"] },
                { cardID: "c_newer", concepts: ["新概念"] },
            ];

            const clusters = buildMisconceptionClusters(tags, contexts);
            expect(clusters).toHaveLength(2);
            expect(clusters[0].concepts).toEqual(["新概念"]);
            expect(clusters[1].concepts).toEqual(["旧概念"]);
        });
    });

    describe("exportMisconceptionReportMarkdown 报告导出", () => {
        it("空簇输出良好状态说明", () => {
            const md = exportMisconceptionReportMarkdown([]);
            expect(md).toContain("误解簇总数：0");
            expect(md).toContain("所有概念掌握良好");
        });

        it("包含完整结构化诊断与建议且不包含任何由于篡改引起的 due 字段", () => {
            const tags: ErrorTag[] = [
                { cardID: "c1", reason: "concept-confusion", date: "2026-10-20" },
                { cardID: "c2", reason: "concept-confusion", date: "2026-10-20" },
            ];
            const contexts: CardConceptContext[] = [
                { cardID: "c1", title: "卡片1", confusionPair: ["微任务", "宏任务"], sourceDocTitle: "EventLoop" },
                { cardID: "c2", title: "卡片2", confusionPair: ["微任务", "宏任务"], sourceDocTitle: "EventLoop" },
            ];
            const clusters = buildMisconceptionClusters(tags, contexts);
            const md = exportMisconceptionReportMarkdown(clusters, "我的误解复盘报告");

            expect(md).toContain("# 我的误解复盘报告");
            expect(md).toContain("宏任务 ⚡ 微任务");
            expect(md).toContain("💡 对比辨析建议");
            expect(md).toContain("EventLoop");
            expect(md).toContain("绝不篡改内核原生 FSRS 调度历史");
        });
    });
});
