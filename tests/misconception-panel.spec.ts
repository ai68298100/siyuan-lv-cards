import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import MisconceptionPanel from "../src/ui/misconception-panel.svelte";
import zhJson from "../public/i18n/zh-CN.json";
import type { MisconceptionCluster } from "../src/core/misconception-cluster";

describe("BT-3: MisconceptionPanel UI Component (误解簇交互面板)", () => {
    afterEach(() => {
        cleanup();
    });

    const mockClusters: MisconceptionCluster[] = [
        {
            id: "cluster-pair-1",
            clusterType: "confusion-pair",
            concepts: ["进程", "线程"],
            primaryReason: "concept-confusion",
            reasonCounts: { "concept-confusion": 4 },
            totalOccurrences: 4,
            affectedCardIDs: ["card-os-1", "card-os-2"],
            cardTitles: ["什么是进程与线程的区别？"],
            dates: ["2026-10-18", "2026-10-19"],
            lastOccurredDate: "2026-10-19",
            severity: "high",
            severityKey: "misconceptionCluster.severity.high",
            interventions: {
                comparisonTable: {
                    conceptA: "进程",
                    conceptB: "线程",
                    dimensions: ["definition", "behavior", "applicability"],
                    suggestionKey: "misconceptionCluster.advice.buildComparisonTable",
                },
                counterExample: {
                    targetConcepts: ["进程", "线程"],
                    boundaryScenario: "misconceptionCluster.scenario.generalBoundary",
                    suggestionKey: "misconceptionCluster.advice.createCounterExample",
                },
                sourceRevision: {
                    affectedCards: ["card-os-1"],
                    splitRecommended: true,
                    actionKey: "misconceptionCluster.advice.splitCardAndAddDistinction",
                },
            },
        },
    ];

    it("空态呈现：无误解簇数据时展示标准 LvEmpty 空态卡片", () => {
        render(MisconceptionPanel, {
            clusters: [],
            i18n: zhJson,
        });

        expect(screen.getByText("误解簇地图")).toBeTruthy();
        expect(screen.getByText("暂无误解聚类数据")).toBeTruthy();
    });

    it("列表渲染：正确展示概念混淆对、严重度徽标与发生频次", () => {
        render(MisconceptionPanel, {
            clusters: mockClusters,
            i18n: zhJson,
        });

        expect(screen.getByText("进程 ⚡ 线程")).toBeTruthy();
        expect(screen.getByText("高")).toBeTruthy();
        expect(screen.getByText("发生 4 次")).toBeTruthy();
        expect(screen.getByText(/建议对比 核心概念定义、输入输出与行为特征、适用边界与条件/)).toBeTruthy();
    });

    it("交互触发：点击“做辨析卡”回调传入对应混淆概念", async () => {
        const onCreateCounterExample = vi.fn();
        render(MisconceptionPanel, {
            clusters: mockClusters,
            i18n: zhJson,
            onCreateCounterExample,
        });

        const btn = screen.getByRole("button", { name: "做辨析卡" });
        await fireEvent.click(btn);

        expect(onCreateCounterExample).toHaveBeenCalledWith("进程", "线程");
    });

    it("交互触发：点击“查看卡片”回调传入受影响卡片 ID", async () => {
        const onOpenCard = vi.fn();
        render(MisconceptionPanel, {
            clusters: mockClusters,
            i18n: zhJson,
            onOpenCard,
        });

        const btn = screen.getByRole("button", { name: "查看卡片" });
        await fireEvent.click(btn);

        expect(onOpenCard).toHaveBeenCalledWith("card-os-1");
    });

    it("报告导出：点击“导出报告”触发回调并生成 Markdown 文本", async () => {
        const onExportReport = vi.fn();
        render(MisconceptionPanel, {
            clusters: mockClusters,
            i18n: zhJson,
            onExportReport,
        });

        const btn = screen.getByTestId("export-misconception-btn");
        await fireEvent.click(btn);

        expect(onExportReport).toHaveBeenCalledOnce();
        const generatedMd = onExportReport.mock.calls[0][0];
        expect(generatedMd).toContain("误解簇地图");
        expect(generatedMd).toContain("进程");
    });
});
