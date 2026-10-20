import { describe, expect, it } from "vitest";
import {
    buildImportExecutionPlan,
    inspectLvCardsImportDiff,
    type CardDiffReport,
} from "../src/core/lvcards-diff-inspector";
import type { LvPackageCard } from "../src/core/lvcards-package";

describe("BX-12: LvCards Package Import Diff Inspector (分享包导入差异比对引擎)", () => {
    const existingCards = [
        {
            id: "card-1",
            markdown: "什么是二叉搜索树？\n==左小右大的有序二叉树==",
            memo: "我的本地助记：根节点做中位数",
            tags: ["算法", "树"],
        },
        {
            id: "card-2",
            markdown: "红黑树的五大性质是什么？\n==根黑色、红节点的子节点为黑等==",
            memo: "重要常考点",
            tags: ["红黑树"],
        },
    ];

    it("精准识别全新卡片、完全相同卡片与正文变动卡片", () => {
        const packageCards: LvPackageCard[] = [
            // 完全相同卡片
            {
                id: "card-1",
                markdown: "什么是二叉搜索树？\n==左小右大的有序二叉树==",
                kind: "cloze",
                memo: "我的本地助记：根节点做中位数",
                tags: ["算法", "树"],
            },
            // 正文修改卡片
            {
                id: "card-2",
                markdown: "红黑树的五大性质是什么？\n==1. 根黑 2. 红子黑 3. 黑高相同==", // 答案更精简
                kind: "cloze",
                memo: "重要常考点",
                tags: ["红黑树"],
            },
            // 全新卡片
            {
                id: "card-3",
                markdown: "什么是 AVL 树？\n==左右子树高度差绝对值不超过 1==",
                kind: "cloze",
                tags: ["平衡树"],
            },
        ];

        const summary = inspectLvCardsImportDiff({
            deckName: "数据结构",
            packageCards,
            existingCards,
        });

        expect(summary.deckName).toBe("数据结构");
        expect(summary.totalPackageCards).toBe(3);
        expect(summary.identicalCount).toBe(1);
        expect(summary.modifiedContentCount).toBe(1);
        expect(summary.newCount).toBe(1);

        const card2Report = summary.reports.find(r => r.cardId === "card-2");
        expect(card2Report).toBeDefined();
        expect(card2Report?.status).toBe("modified-content");
        expect(card2Report?.markdownSegments.some(s => s.kind === "del" || s.kind === "add")).toBe(true);
    });

    it("精准识别仅便签或标签变动 (modified-metadata)", () => {
        const packageCards: LvPackageCard[] = [
            {
                id: "card-1",
                markdown: "什么是二叉搜索树？\n==左小右大的有序二叉树==",
                kind: "cloze",
                memo: "来自社区大神的分享便签", // 仅便签改变
                tags: ["算法", "树", "高频必背"], // 增加了标签
            },
        ];

        const summary = inspectLvCardsImportDiff({
            deckName: "算法卡组",
            packageCards,
            existingCards,
        });

        expect(summary.modifiedMetadataCount).toBe(1);
        const report = summary.reports[0];
        expect(report.status).toBe("modified-metadata");
        expect(report.memoDiff.changed).toBe(true);
        expect(report.tagsDiff.added).toContain("高频必背");
    });

    it("冲突决策构建：keep-local 保留本地卡片并统计保护便签数", () => {
        const reports: CardDiffReport[] = [
            {
                cardId: "card-2",
                status: "modified-content",
                localCard: existingCards[1],
                packageCard: {
                    id: "card-2",
                    markdown: "修改后的正文",
                    kind: "cloze",
                },
                markdownSegments: [],
                memoDiff: { changed: false },
                tagsDiff: { added: [], removed: [] },
            },
        ];

        const plan = buildImportExecutionPlan({
            reports,
            defaultAction: "keep-local",
        });

        expect(plan.toSkip).toContain("card-2");
        expect(plan.toUpdate).toHaveLength(0);
        expect(plan.retainedLocalMemoCount).toBe(1); // card-2 的本地 memo 成功保留
    });

    it("冲突决策构建：fork-new 保留本地卡并将包内版本分叉为新 ID", () => {
        const reports: CardDiffReport[] = [
            {
                cardId: "card-2",
                status: "modified-content",
                localCard: existingCards[1],
                packageCard: {
                    id: "card-2",
                    markdown: "修改后的正文",
                    kind: "cloze",
                },
                markdownSegments: [],
                memoDiff: { changed: false },
                tagsDiff: { added: [], removed: [] },
            },
        ];

        const plan = buildImportExecutionPlan({
            reports,
            perCardActions: {
                "card-2": "fork-new",
            },
        });

        expect(plan.toCreate).toHaveLength(1);
        expect(plan.toCreate[0].id).not.toBe("card-2");
        expect(plan.toCreate[0].id).toContain("fork-");
        expect(plan.retainedLocalMemoCount).toBe(1);
    });

    it("冲突决策构建：merge-memo 保留本地正文并合并双方助记与标签", () => {
        const reports: CardDiffReport[] = [
            {
                cardId: "card-1",
                status: "modified-metadata",
                localCard: existingCards[0],
                packageCard: {
                    id: "card-1",
                    markdown: "什么是二叉搜索树？\n==左小右大的有序二叉树==",
                    kind: "cloze",
                    memo: "包内附加的补充线索",
                    tags: ["新考点"],
                },
                markdownSegments: [],
                memoDiff: { changed: true },
                tagsDiff: { added: ["新考点"], removed: [] },
            },
        ];

        const plan = buildImportExecutionPlan({
            reports,
            defaultAction: "merge-memo",
        });

        expect(plan.toUpdate).toHaveLength(1);
        const updateItem = plan.toUpdate[0];
        expect(updateItem.blockId).toBe("card-1");
        expect(updateItem.memo).toContain("我的本地助记");
        expect(updateItem.memo).toContain("包内附加的补充线索");
        expect(updateItem.tags).toContain("算法");
        expect(updateItem.tags).toContain("新考点");
        expect(plan.retainedLocalMemoCount).toBe(1);
    });
});
