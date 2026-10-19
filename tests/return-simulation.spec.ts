import { describe, expect, it } from "vitest";
import {
    simulateReturnStrategies,
    createReturnStrategyBatch,
    validateBatchSafety,
    markBatchApplied,
    markBatchReverted,
    RETURN_STRATEGY_KINDS,
} from "../src/core/return-simulation";
import type { ReturnSimulationFacts, ReturnStrategyBatch } from "../src/core/return-simulation";

describe("return-simulation (BI-28 返场前只读影响模拟)", () => {
    const baseFacts: ReturnSimulationFacts = {
        dueCount: 20,
        daysSinceLastStudy: 2,
        activeGoalsCount: 1,
        staleMaterialsCount: 0,
        brokenCardsCount: 0,
        completedPhasesCount: 0,
    };

    it("五大策略全部在场且遵循 ADR-3 内核数据保留契约", () => {
        const report = simulateReturnStrategies(baseFacts);
        expect(report.strategies.map(s => s.kind)).toEqual([
            "continue-old",
            "narrow-scope",
            "maintenance-first",
            "archive-phase",
            "rebuild-fresh",
        ]);

        for (const strategy of report.strategies) {
            // 铁律：所有策略必须保留内核到期、学习历史与目标
            expect(strategy.preserves).toContain("returnCheck.rebuild.due");
            expect(strategy.preserves).toContain("returnCheck.rebuild.goals");
            expect(strategy.preserves).toContain("returnCheck.rebuild.lifecycle");
            expect(strategy.recommendationScore).toBeGreaterThanOrEqual(0);
            expect(strategy.recommendationScore).toBeLessThanOrEqual(100);
        }
    });

    it("常规轻量积压（due=20, gap=2d）：推荐 continue-old（继续旧计划），风险为 low", () => {
        const report = simulateReturnStrategies(baseFacts);
        expect(report.recommendedKind).toBe("continue-old");
        expect(report.recommendationReasonKey).toBe("returnSimulation.reason.normal");

        const cont = report.strategies.find(s => s.kind === "continue-old")!;
        expect(cont.isRecommended).toBe(true);
        expect(cont.riskLevel).toBe("low");
        expect(cont.riskWarningKey).toBeNull();
        expect(cont.workload.projectedCount).toBe(20);
        expect(cont.workload.estimatedMinutes).toBe(10); // 20 * 0.5min
        expect(cont.workload.backlogClearDays).toBe(1);
    });

    it("大积压与中长间隔（due=120, gap=14d）：推荐 narrow-scope（削峰缩小范围），继续旧计划报高危", () => {
        const facts: ReturnSimulationFacts = {
            ...baseFacts,
            dueCount: 120,
            daysSinceLastStudy: 14,
        };
        const report = simulateReturnStrategies(facts);
        expect(report.recommendedKind).toBe("narrow-scope");
        expect(report.recommendationReasonKey).toBe("returnSimulation.reason.backlogRelief");

        const narrow = report.strategies.find(s => s.kind === "narrow-scope")!;
        expect(narrow.isRecommended).toBe(true);
        expect(narrow.workload.projectedCount).toBe(15); // 限额 15 张
        expect(narrow.workload.estimatedMinutes).toBe(8); // ceil(15 * 0.5)
        expect(narrow.workload.backlogClearDays).toBe(8); // ceil(120 / 15)

        const cont = report.strategies.find(s => s.kind === "continue-old")!;
        expect(cont.riskLevel).toBe("high");
        expect(cont.riskWarningKey).toBe("returnSimulation.risk.overload");
    });

    it("检测到坏卡与过时材料（broken=3, stale=2）：推荐 maintenance-first（先修后学）", () => {
        const facts: ReturnSimulationFacts = {
            ...baseFacts,
            dueCount: 45,
            brokenCardsCount: 3,
            staleMaterialsCount: 2,
        };
        const report = simulateReturnStrategies(facts);
        expect(report.recommendedKind).toBe("maintenance-first");
        expect(report.recommendationReasonKey).toBe("returnSimulation.reason.defects");

        const maint = report.strategies.find(s => s.kind === "maintenance-first")!;
        expect(maint.isRecommended).toBe(true);
        expect(maint.workload.projectedCount).toBe(5); // 3 + 2 维护项
        expect(maint.discardsOrChanges).toContain("returnSimulation.change.divertToMaint");
    });

    it("超长间隔返场与超大积压（due=240, gap=45d）：推荐 rebuild-fresh（平滑起跑重启）", () => {
        const facts: ReturnSimulationFacts = {
            ...baseFacts,
            dueCount: 240,
            daysSinceLastStudy: 45,
        };
        const report = simulateReturnStrategies(facts);
        expect(report.recommendedKind).toBe("rebuild-fresh");
        expect(report.recommendationReasonKey).toBe("returnSimulation.reason.rebuildRestart");

        const rebuild = report.strategies.find(s => s.kind === "rebuild-fresh")!;
        expect(rebuild.isRecommended).toBe(true);
        expect(rebuild.workload.projectedCount).toBe(10); // 种子批次 10 张
        expect(rebuild.discardsOrChanges).toContain("returnCheck.rebuild.session");
        expect(rebuild.riskWarningKey).toBe("returnSimulation.risk.sessionReset");
    });

    it("存在已完结学习阶段（completedPhases=2, due=80）：阶段封存大幅加分", () => {
        const facts: ReturnSimulationFacts = {
            ...baseFacts,
            dueCount: 80,
            completedPhasesCount: 2,
        };
        const report = simulateReturnStrategies(facts);
        const archive = report.strategies.find(s => s.kind === "archive-phase")!;
        expect(archive.recommendationScore).toBeGreaterThan(60);
        expect(archive.workload.projectedCount).toBeLessThan(80);
        expect(archive.discardsOrChanges).toContain("returnSimulation.change.phaseArchive");
    });

    it("边界防御性：0到期、无历史（null gap）、自定义单张耗时", () => {
        const emptyFacts: ReturnSimulationFacts = {
            dueCount: 0,
            daysSinceLastStudy: null,
            activeGoalsCount: 0,
            staleMaterialsCount: 0,
            brokenCardsCount: 0,
            averageMinutesPerCard: 1.2,
        };
        const report = simulateReturnStrategies(emptyFacts);
        expect(report.strategies.every(s => s.workload.projectedCount === 0)).toBe(true);
        expect(report.strategies.every(s => s.workload.estimatedMinutes === 0)).toBe(true);
        expect(report.strategies.every(s => s.workload.backlogClearDays === 0 || s.workload.backlogClearDays === 1)).toBe(true);
    });
});

describe("return-simulation 可撤销批次生命周期与安全性", () => {
    const sampleFacts: ReturnSimulationFacts = {
        dueCount: 150,
        daysSinceLastStudy: 20,
        activeGoalsCount: 1,
        staleMaterialsCount: 0,
        brokenCardsCount: 0,
    };

    it("创建 narrow-scope 批次：生成动作与撤销动作严格对称，初始状态为 prepared", () => {
        const batch = createReturnStrategyBatch("narrow-scope", sampleFacts, {
            customSessionCap: 15,
            previousSessionCap: 60,
        });

        expect(batch.strategyKind).toBe("narrow-scope");
        expect(batch.status).toBe("prepared");
        expect(batch.appliedAt).toBeNull();
        expect(batch.revertedAt).toBeNull();
        expect(batch.actions).toEqual([
            { type: "set-session-budget", cap: 15, previousCap: 60 },
        ]);
        expect(batch.rollbackActions).toEqual([
            { type: "set-session-budget", cap: 60, previousCap: 15 },
        ]);

        const safety = validateBatchSafety(batch);
        expect(safety.safe).toBe(true);
        expect(safety.violatesDuePolicy).toBe(false);
        expect(safety.reasons).toHaveLength(0);
    });

    it("创建 maintenance-first 批次：正确导流至维护工作台", () => {
        const batch = createReturnStrategyBatch("maintenance-first", sampleFacts);
        expect(batch.actions).toEqual([
            { type: "route-to-maintenance", targetView: "maintenance" },
        ]);
        expect(batch.rollbackActions).toEqual([
            { type: "route-to-maintenance", targetView: "maintenance" },
        ]);
    });

    it("安全校验拦截破坏性动作（delete-card / purge-revlog / override-kernel-due）", () => {
        const maliciousBatch: ReturnStrategyBatch = {
            batchId: "malicious-1",
            strategyKind: "narrow-scope",
            createdAt: Date.now(),
            appliedAt: null,
            revertedAt: null,
            status: "prepared",
            actions: [
                { type: "delete-card" as any },
            ],
            rollbackActions: [],
            factsSnapshot: sampleFacts,
        };

        const safety = validateBatchSafety(maliciousBatch);
        expect(safety.safe).toBe(false);
        expect(safety.violatesDuePolicy).toBe(true);
        expect(safety.reasons[0]).toContain("Forbidden destructive action type: delete-card");
    });

    it("批次状态机转移：prepared -> applied -> reverted，非法转移抛出错误", () => {
        const batch = createReturnStrategyBatch("narrow-scope", sampleFacts);
        expect(batch.status).toBe("prepared");

        // 无法直接 revert 未生效的批次
        expect(() => markBatchReverted(batch)).toThrowError(/Cannot revert batch in status: prepared/);

        // 应用批次
        const applied = markBatchApplied(batch, 1000);
        expect(applied.status).toBe("applied");
        expect(applied.appliedAt).toBe(1000);

        // 无法重复 apply
        expect(() => markBatchApplied(applied)).toThrowError(/Cannot apply batch in status: applied/);

        // 撤销批次
        const reverted = markBatchReverted(applied, 2000);
        expect(reverted.status).toBe("reverted");
        expect(reverted.revertedAt).toBe(2000);

        // 无法再次 revert
        expect(() => markBatchReverted(reverted)).toThrowError(/Cannot revert batch in status: reverted/);
    });
});
