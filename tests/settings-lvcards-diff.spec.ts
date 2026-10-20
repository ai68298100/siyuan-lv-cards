import { describe, expect, it } from "vitest";
import {
    inspectLvCardsImportDiff,
    buildImportExecutionPlan,
} from "../src/core/lvcards-diff-inspector";
import type { LvPackageCard } from "../src/core/lvcards-package";

describe("BX-12 Settings Integration: LvCards Diff & Conflict Resolution (设置页分享包差异冲突解决流程)", () => {
    it("模拟用户导入包含修改的分享包，生成计划仅导入新卡并保护本地私有便签", () => {
        const existingCards = [
            {
                id: "card-local-1",
                markdown: "原文档内容",
                memo: "我的核心个人心得便签",
                tags: ["考点A"],
            },
        ];

        const packageCards: LvPackageCard[] = [
            {
                id: "card-local-1",
                markdown: "社区更新后的内容，有重要增补",
                kind: "cloze",
                memo: "社区便签",
            },
            {
                id: "card-new-2",
                markdown: "全新卡片",
                kind: "qa",
            },
        ];

        // 1. 生成比对摘要
        const diffSummary = inspectLvCardsImportDiff({
            deckName: "测试卡组",
            packageCards,
            existingCards,
        });

        expect(diffSummary.modifiedContentCount).toBe(1);
        expect(diffSummary.newCount).toBe(1);

        // 2. 默认选择安全合并策略 (keep-local)
        const plan = buildImportExecutionPlan({
            reports: diffSummary.reports,
            defaultAction: "keep-local",
        });

        // 验证执行计划：仅全新卡进入 toCreate，冲突卡进入 toSkip，本地 memo 得到计数保护
        expect(plan.toCreate).toHaveLength(1);
        expect(plan.toCreate[0].id).toBe("card-new-2");
        expect(plan.toSkip).toContain("card-local-1");
        expect(plan.retainedLocalMemoCount).toBe(1);
    });

    it("选择分叉新建 (fork-new) 策略：同时保留本地卡与包内修改版卡片", () => {
        const existingCards = [
            { id: "c-1", markdown: "版本 A", memo: "便签 A" },
        ];
        const packageCards: LvPackageCard[] = [
            { id: "c-1", markdown: "版本 B", kind: "qa", memo: "便签 B" },
        ];

        const diffSummary = inspectLvCardsImportDiff({
            deckName: "卡组",
            packageCards,
            existingCards,
        });

        const plan = buildImportExecutionPlan({
            reports: diffSummary.reports,
            defaultAction: "fork-new",
        });

        expect(plan.toCreate).toHaveLength(1);
        expect(plan.toCreate[0].markdown).toBe("版本 B");
        expect(plan.toCreate[0].id).not.toBe("c-1");
        expect(plan.retainedLocalMemoCount).toBe(1);
    });
});
