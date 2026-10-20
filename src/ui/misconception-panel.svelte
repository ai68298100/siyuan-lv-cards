<script lang="ts">
    import LvSection from "./kit/LvSection.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import type { MisconceptionCluster } from "../core/misconception-cluster";
    import { exportMisconceptionReportMarkdown } from "../core/misconception-cluster";

    let {
        clusters = [],
        i18n = {},
        onOpenCard,
        onCreateCounterExample,
        onExportReport,
    }: {
        clusters?: MisconceptionCluster[];
        i18n?: Record<string, any>;
        onOpenCard?: (cardId: string) => void;
        onCreateCounterExample?: (conceptA: string, conceptB?: string) => void;
        onExportReport?: (markdown: string) => void;
    } = $props();

    const t = $derived(i18n.misconceptionCluster ?? {});

    function severityTone(sev: string): "error" | "warn" | "primary" | "default" {
        if (sev === "critical") return "error";
        if (sev === "high") return "warn";
        if (sev === "medium") return "primary";
        return "default";
    }

    function severityLabel(sev: string): string {
        return t.severity?.[sev] ?? sev;
    }

    function exportMarkdown() {
        const md = exportMisconceptionReportMarkdown(clusters, t.title ?? "误解复盘报告");
        if (onExportReport) {
            onExportReport(md);
        } else {
            // 复制至剪贴板兜底
            navigator.clipboard?.writeText(md);
        }
    }
</script>

<div class="lv-misconception-panel" data-testid="misconception-panel">
    <LvSection
        title={t.title ?? "误解簇地图"}
        sub={t.subtitle ?? "按错误原因与混淆概念聚类"}
    >
        {#snippet actions()}
            {#if clusters.length > 0}
                <button
                    type="button"
                    class="b3-button b3-button--text"
                    onclick={exportMarkdown}
                    data-testid="export-misconception-btn"
                >
                    {i18n.export ?? "导出报告"}
                </button>
            {/if}
        {/snippet}

        {#if clusters.length === 0}
            <LvEmpty
                text={i18n.noData ?? "暂无误解聚类数据"}
            />
        {:else}
            <div class="lv-cluster-list">
                {#each clusters as cluster (cluster.id)}
                    <div class="lv-cluster-card" data-testid={`cluster-${cluster.id}`}>
                        <div class="lv-cluster-header">
                            <div class="lv-cluster-title">
                                <span class="lv-cluster-name">
                                    {#if cluster.clusterType === "confusion-pair"}
                                        {cluster.concepts.join(" ⚡ ")}
                                    {:else if cluster.concepts.length > 0}
                                        {cluster.concepts.join(", ")}
                                    {:else}
                                        {cluster.primaryReason}
                                    {/if}
                                </span>
                                <LvChip tone={severityTone(cluster.severity)}>
                                    {severityLabel(cluster.severity)}
                                </LvChip>
                            </div>
                            <span class="lv-cluster-count">
                                {(i18n.occurrences ?? "发生 ${n} 次").replace("${n}", String(cluster.totalOccurrences))}
                            </span>
                        </div>

                        <!-- 介入建议卡片群 -->
                        <div class="lv-interventions">
                            <!-- 1. 概念对比辨析 -->
                            {#if cluster.interventions.comparisonTable}
                                {@const comp = cluster.interventions.comparisonTable}
                                <div class="lv-advice-block lv-advice-block--compare">
                                    <div class="lv-advice-header">
                                        <span class="lv-advice-tag">⚖️ {t.advice?.buildComparisonTable ?? "对比辨析"}</span>
                                        {#if comp.conceptA && comp.conceptB}
                                            <button
                                                type="button"
                                                class="b3-button b3-button--text b3-button--cancel"
                                                data-testid="create-compare-card-btn"
                                                onclick={() => onCreateCounterExample?.(comp.conceptA, comp.conceptB)}
                                            >
                                                {i18n.createComparisonCard ?? "做辨析卡"}
                                            </button>
                                        {/if}
                                    </div>
                                    <div class="lv-advice-desc">
                                        {comp.conceptA} 与 {comp.conceptB}：建议对比 {comp.dimensions.map(d => t.dimensions?.[d] ?? d).join("、")}
                                    </div>
                                </div>
                            {/if}

                            <!-- 2. 反例与边界测试 -->
                            {#if cluster.interventions.counterExample}
                                {@const ce = cluster.interventions.counterExample}
                                <div class="lv-advice-block lv-advice-block--counter">
                                    <div class="lv-advice-header">
                                        <span class="lv-advice-tag">🎯 {t.advice?.createCounterExample ?? "反例辨析"}</span>
                                        <button
                                            type="button"
                                            class="b3-button b3-button--text b3-button--cancel"
                                            onclick={() => onCreateCounterExample?.(ce.targetConcepts[0], ce.targetConcepts[1])}
                                        >
                                            {i18n.createCard ?? "出反例题"}
                                        </button>
                                    </div>
                                    <div class="lv-advice-desc">
                                        测试场景：{t.scenario?.[ce.boundaryScenario.split('.').pop() ?? ''] ?? ce.boundaryScenario}
                                    </div>
                                </div>
                            {/if}

                            <!-- 3. 来源拆卡与修订建议 -->
                            {#if cluster.interventions.sourceRevision}
                                {@const rev = cluster.interventions.sourceRevision}
                                <div class="lv-advice-block lv-advice-block--revision">
                                    <div class="lv-advice-header">
                                        <span class="lv-advice-tag">✂️ {rev.splitRecommended ? (t.advice?.splitCardAndAddDistinction ?? "拆分卡片") : (t.advice?.enrichSourceSummary ?? "扩充笔记")}</span>
                                        {#if rev.affectedCards.length > 0}
                                            <button
                                                type="button"
                                                class="b3-button b3-button--text b3-button--cancel"
                                                onclick={() => onOpenCard?.(rev.affectedCards[0])}
                                            >
                                                {i18n.openCard ?? "查看卡片"}
                                            </button>
                                        {/if}
                                    </div>
                                    <div class="lv-advice-desc">
                                        {rev.splitRecommended ? "复合概念题干过重，建议拆解为原子单选或问答" : "建议在来源笔记补充概念区别小结"}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </LvSection>
</div>

<style>
    .lv-cluster-list {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-3);
    }
    .lv-cluster-card {
        padding: var(--lv-sp-3);
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
    }
    .lv-cluster-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--lv-sp-2);
    }
    .lv-cluster-title {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
    }
    .lv-cluster-name {
        font-weight: 600;
        font-size: 14px;
        color: var(--b3-theme-on-surface);
    }
    .lv-cluster-count {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
    }
    .lv-interventions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: var(--lv-sp-2);
        margin-top: var(--lv-sp-2);
    }
    .lv-advice-block {
        padding: var(--lv-sp-2);
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
    }
    .lv-advice-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--lv-sp-1);
    }
    .lv-advice-tag {
        font-size: 12px;
        font-weight: 500;
    }
    .lv-advice-desc {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.4;
    }
</style>
