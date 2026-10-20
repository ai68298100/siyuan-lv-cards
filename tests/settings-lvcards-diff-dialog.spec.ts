import { describe, expect, it } from "vitest";
import {
    inspectLvCardsImportDiff,
    buildImportExecutionPlan,
} from "../src/core/lvcards-diff-inspector";
import type { LvPackageCard } from "../src/core/lvcards-package";

describe("BX-12: Settings LvCards Diff & Conflict Resolution (设置页分享包冲突解决规划)", () => {
    it("当包内卡片与本地卡片正文不一致时，生成包含 modified-content 的比对摘要", () => {
        const pkgCards: LvPackageCard[] = [
            {
                id: "block-1",
                markdown: "原题干\n==原答案修改版==",
                kind: "cloze",
                memo: "包内便签",
            },
            {
                id: "block-2",
                markdown: "全新题干\n==全新答案==",
                kind: "cloze",
            },
        ];

        const localCards = [
            {
                id: "block-1",
                markdown: "原题干\n==原答案本地版==",
                memo: "本地重要便签",
            },
        ];

        const summary = inspectLvCardsImportDiff({
            deckName: "冲突测试卡组",
            packageCards: pkgCards,
            existingCards: localCards,
        });

        expect(summary.newCount).toBe(1);
        expect(summary.modifiedContentCount).toBe(1);

        // 默认保留本地
        const planKeep = buildImportExecutionPlan({
            reports: summary.reports,
            defaultAction: "keep-local",
        });

        expect(planKeep.toCreate).toHaveLength(1);
        expect(planKeep.toCreate[0].id).toBe("block-2");
        expect(planKeep.toSkip).toContain("block-1");
        expect(planKeep.retainedLocalMemoCount).toBe(1);

        // 覆盖更新
        const planOverwrite = buildImportExecutionPlan({
            reports: summary.reports,
            defaultAction: "overwrite",
        });
        expect(planOverwrite.toUpdate).toHaveLength(1);
        expect(planOverwrite.toUpdate[0].blockId).toBe("block-1");
        expect(planOverwrite.toUpdate[0].markdown).toContain("修改版");
    });
});
