import { describe, expect, it } from "vitest";
import {
    DRILL_SCENARIOS,
    simulateRecoveryDrill,
} from "../src/core/recovery-drill";
import type { CurrentHostSnapshot } from "../src/core/recovery-drill";
import type { BackupBundle } from "../src/core/backup";

describe("recovery-drill (BL-10 备份与灾难恢复演练中心)", () => {
    const mockBundle: BackupBundle = {
        lvBackup: true,
        manifest: {
            version: 1,
            app: "siyuan-lv-cards",
            createdAt: 1700000000000,
            schemaVersion: 1,
            files: {},
        },
        files: {
            "card-catalog.json": [
                { id: "c1", deckId: "d1" },
                { id: "c2", deckId: "d1" },
                { id: "c3-novel", deckId: "d2" },
            ],
            "revlog.json": [
                { id: "r1", timestamp: 1700000000000 },
                { id: "r2", timestamp: 1700000005000 },
            ],
            "card-relations.json": {
                relations: [
                    { from: "c1", to: "c2", type: "prerequisite" },
                    { from: "c1", to: "orphan-target", type: "sibling" }, // 破损关联
                ],
            },
            "learning-goals.json": [
                { id: "g1", title: "考试目标" },
            ],
        },
    };

    const hostSnapshot: CurrentHostSnapshot = {
        cardIds: ["c1", "c2", "c-local-only"],
        deckIds: ["d1"],
        revlogCount: 5,
        latestRevlogTime: 1700000000000,
    };

    it("覆盖五大灾难恢复演练场景", () => {
        expect(DRILL_SCENARIOS).toEqual([
            "device-migration",
            "accidental-deletion",
            "upgrade-failure",
            "sync-conflict",
            "media-corruption",
        ]);
    });

    it("设备迁移演练（device-migration）：本地有数据时预警并建议 full-replace", () => {
        const report = simulateRecoveryDrill("device-migration", mockBundle, hostSnapshot);
        expect(report.scenario).toBe("device-migration");
        expect(report.suggestedMode).toBe("full-replace");
        expect(report.verdict).toBe("warning");
        expect(report.verdictKey).toBe("recoveryDrill.verdict.warningOverlap");
        expect(report.riskWarningKeys).toContain("recoveryDrill.risk.overwriteExistingLocal");
    });

    it("误删回滚演练（accidental-deletion）：发现新卡片推荐 incremental-merge 增量合并", () => {
        const report = simulateRecoveryDrill("accidental-deletion", mockBundle, hostSnapshot);
        expect(report.scenario).toBe("accidental-deletion");
        expect(report.suggestedMode).toBe("incremental-merge");
        expect(report.integrity.idIntegrity.novelIds).toBe(1); // c3-novel
    });

    it("四大核心指标完整核对沙盒：ID 一致性、聚合、历史连续性、关联破损检测", () => {
        const report = simulateRecoveryDrill("accidental-deletion", mockBundle, hostSnapshot);
        const { integrity } = report;

        // 1. ID 一致性
        expect(integrity.idIntegrity.totalIncomingIds).toBe(3);
        expect(integrity.idIntegrity.existingMatchedIds).toBe(2); // c1, c2
        expect(integrity.idIntegrity.novelIds).toBe(1); // c3-novel
        expect(integrity.idIntegrity.passed).toBe(true);

        // 2. 聚合统计
        expect(integrity.aggregation.currentCardsCount).toBe(3);
        expect(integrity.aggregation.incomingCardsCount).toBe(3);
        expect(integrity.aggregation.projectedTotalCards).toBe(4); // 3 current + 1 novel

        // 3. 历史连续性
        expect(integrity.history.currentRevlogCount).toBe(5);
        expect(integrity.history.incomingRevlogCount).toBe(2);
        expect(integrity.history.historyOverlapped).toBe(true);

        // 4. 联动与关系
        expect(integrity.linkage.brokenRelationsCount).toBe(1); // orphan-target
        expect(integrity.linkage.incomingGoalsCount).toBe(1);
        expect(report.riskWarningKeys).toContain("recoveryDrill.risk.brokenRelationsDetected");
    });

    it("长间隔风险提示（时间差 > 30 天）", () => {
        const staleHost: CurrentHostSnapshot = {
            cardIds: ["c1"],
            deckIds: ["d1"],
            revlogCount: 1,
            latestRevlogTime: 1700000000000 + 40 * 86400 * 1000, // 40 天后
        };

        const report = simulateRecoveryDrill("sync-conflict", mockBundle, staleHost);
        expect(report.riskWarningKeys).toContain("recoveryDrill.risk.largeTimeGap");
        expect(report.integrity.history.timeSpanGapDays).toBe(40);
    });
});
