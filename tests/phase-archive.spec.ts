import { describe, expect, it } from "vitest";
import {
    createPhaseProject,
    archivePhase,
    checkReopenPrerequisites,
    planReopenWorkload,
    executeReopen,
    rollbackReopen,
    DEFAULT_DAILY_RAMP_CAP,
    MAX_SAFE_INSTANT_LOAD,
    type PhaseSourceRef,
    type PhaseCardRef,
    type PhaseStatsSnapshot,
} from "../src/core/phase-archive";

describe("BI-29 长期项目阶段封存与复开引擎（Phase Archive & Reopen Engine）", () => {
    const fixedNow = 1700000000000;

    const mockSources: PhaseSourceRef[] = [
        {
            blockId: "src-doc-1",
            title: "日语 N2 核心语法与听力讲义",
            contentHash: "hash-n2-grammar-v1",
            updatedAt: fixedNow - 86400000 * 30,
            notebookId: "nb-lang-1",
        },
        {
            blockId: "src-doc-2",
            title: "N2 高频词汇 2000",
            contentHash: "hash-n2-vocab-v1",
            updatedAt: fixedNow - 86400000 * 25,
            notebookId: "nb-lang-1",
        },
    ];

    const mockCards: PhaseCardRef[] = [
        { cardId: "card-1", deckId: "deck-n2", lastDue: fixedNow - 86400000 * 10, lastStability: 15 },
        { cardId: "card-2", deckId: "deck-n2", lastDue: fixedNow - 86400000 * 5, lastStability: 8 },
        { cardId: "card-3", deckId: "deck-n2", lastDue: fixedNow - 86400000 * 2, lastStability: 20 },
    ];

    const mockStats: PhaseStatsSnapshot = {
        totalCards: 3,
        masteredCount: 2,
        dueCountAtArchive: 1,
        retentionRate: 0.88,
    };

    it("创建阶段项目：初始化为 active 状态并具备初始操作日志", () => {
        const project = createPhaseProject(
            { id: "proj-jlpt-n2", title: "JLPT N2 阶段通关计划", domain: "language" },
            fixedNow,
        );

        expect(project.id).toBe("proj-jlpt-n2");
        expect(project.title).toBe("JLPT N2 阶段通关计划");
        expect(project.domain).toBe("language");
        expect(project.status).toBe("active");
        expect(project.snapshot).toBeNull();
        expect(project.history).toHaveLength(1);
        expect(project.history[0].action).toBe("archive");
    });

    it("阶段封存：完整记录来源指纹、卡片引用与掌握度指标快照，状态流转为 archived", () => {
        const initial = createPhaseProject(
            { id: "proj-jlpt-n2", title: "JLPT N2 阶段通关计划", domain: "language" },
            fixedNow,
        );

        const archived = archivePhase(
            initial,
            {
                reason: "exam-completed",
                note: "7月考试已通过，阶段封存备查",
                sources: mockSources,
                cards: mockCards,
                stats: mockStats,
                originalGoalId: "goal-n2-pass",
            },
            fixedNow + 1000,
        );

        expect(archived.status).toBe("archived");
        expect(archived.snapshot).not.toBeNull();
        expect(archived.snapshot?.reason).toBe("exam-completed");
        expect(archived.snapshot?.note).toBe("7月考试已通过，阶段封存备查");
        expect(archived.snapshot?.sourceRefs).toHaveLength(2);
        expect(archived.snapshot?.cardRefs).toHaveLength(3);
        expect(archived.snapshot?.stats.totalCards).toBe(3);
        expect(archived.snapshot?.stats.retentionRate).toBe(0.88);
        expect(archived.snapshot?.originalGoalId).toBe("goal-n2-pass");
        expect(archived.history).toHaveLength(2);
        expect(archived.history[1].action).toBe("archive");
    });

    describe("复开前预检：先检查版本和来源（验收核心契约 1）", () => {
        it("全部来源健康且版本一致：直接通过校验并建议复开", () => {
            const project = archivePhase(
                createPhaseProject({ id: "p1", title: "专业课复习", domain: "course" }, fixedNow),
                { reason: "curriculum-finished", sources: mockSources, cards: mockCards, stats: mockStats },
                fixedNow,
            );

            const currentSources = new Map([
                ["src-doc-1", { title: "日语 N2 核心语法与听力讲义", contentHash: "hash-n2-grammar-v1" }],
                ["src-doc-2", { title: "N2 高频词汇 2000", contentHash: "hash-n2-vocab-v1" }],
            ]);
            const existingCardIds = new Set(["card-1", "card-2", "card-3"]);

            const report = checkReopenPrerequisites(project, currentSources, existingCardIds, fixedNow + 2000);

            expect(report.canDirectlyReopen).toBe(true);
            expect(report.healthySourcesCount).toBe(2);
            expect(report.driftedSourcesCount).toBe(0);
            expect(report.missingSourcesCount).toBe(0);
            expect(report.sourceIssues).toHaveLength(0);
            expect(report.missingCardsCount).toBe(0);
            expect(report.validCardsCount).toBe(3);
            expect(report.summaryKey).toBe("phaseArchive.check.allHealthy");
        });

        it("来源文档被删除或丢失：阻断直接复开并给出明确缺失项", () => {
            const project = archivePhase(
                createPhaseProject({ id: "p1", title: "专业课复习", domain: "course" }, fixedNow),
                { reason: "curriculum-finished", sources: mockSources, cards: mockCards, stats: mockStats },
                fixedNow,
            );

            // 仅保留 src-doc-1，src-doc-2 丢失
            const currentSources = new Map([
                ["src-doc-1", { title: "日语 N2 核心语法与听力讲义", contentHash: "hash-n2-grammar-v1" }],
            ]);
            const existingCardIds = new Set(["card-1", "card-2", "card-3"]);

            const report = checkReopenPrerequisites(project, currentSources, existingCardIds, fixedNow + 2000);

            expect(report.canDirectlyReopen).toBe(false);
            expect(report.missingSourcesCount).toBe(1);
            expect(report.healthySourcesCount).toBe(1);
            expect(report.sourceIssues[0].issueType).toBe("missing");
            expect(report.sourceIssues[0].blockId).toBe("src-doc-2");
            expect(report.summaryKey).toBe("phaseArchive.check.hasBlockers");
        });

        it("来源内容哈希发生变更（版本漂移）：提示复核差异，不静默覆盖", () => {
            const project = archivePhase(
                createPhaseProject({ id: "p1", title: "专业课复习", domain: "course" }, fixedNow),
                { reason: "curriculum-finished", sources: mockSources, cards: mockCards, stats: mockStats },
                fixedNow,
            );

            // src-doc-1 哈希发生漂移变更
            const currentSources = new Map([
                ["src-doc-1", { title: "日语 N2 核心语法与听力讲义（2026新版修订）", contentHash: "hash-n2-grammar-v2-drifted" }],
                ["src-doc-2", { title: "N2 高频词汇 2000", contentHash: "hash-n2-vocab-v1" }],
            ]);
            const existingCardIds = new Set(["card-1", "card-2", "card-3"]);

            const report = checkReopenPrerequisites(project, currentSources, existingCardIds, fixedNow + 2000);

            expect(report.canDirectlyReopen).toBe(false);
            expect(report.driftedSourcesCount).toBe(1);
            expect(report.healthySourcesCount).toBe(1);
            expect(report.sourceIssues[0].issueType).toBe("drifted");
            expect(report.sourceIssues[0].blockId).toBe("src-doc-1");
            expect(report.sourceIssues[0].expectedHash).toBe("hash-n2-grammar-v1");
            expect(report.sourceIssues[0].actualHash).toBe("hash-n2-grammar-v2-drifted");
            expect(report.summaryKey).toBe("phaseArchive.check.needsReview");
        });

        it("未封存的项目检查返回防御性错误提示", () => {
            const unarchived = createPhaseProject({ id: "p0", title: "草稿", domain: "general" }, fixedNow);
            const report = checkReopenPrerequisites(unarchived, new Map(), new Set(), fixedNow);

            expect(report.canDirectlyReopen).toBe(false);
            expect(report.summaryKey).toBe("phaseArchive.check.noSnapshot");
        });
    });

    describe("零瞬时今日负担调度规划：不自动制造今日负担（验收核心契约 2）", () => {
        it("默认平滑渐进释放（gradual-ramp）：海量积压卡绝不全量灌入今日，严格限制在安全配额内", () => {
            const hugeCardCount = 180; // 封存后堆积了 180 张到期卡

            const plan = planReopenWorkload(hugeCardCount, { strategy: "gradual-ramp" });

            // 今日安排绝不能等于 180！必须受到 DEFAULT_DAILY_RAMP_CAP 保护
            expect(plan.todayAssignedCount).toBe(DEFAULT_DAILY_RAMP_CAP);
            expect(plan.todayAssignedCount).toBeLessThanOrEqual(MAX_SAFE_INSTANT_LOAD);
            expect(plan.spreadDays).toBe(Math.ceil(180 / DEFAULT_DAILY_RAMP_CAP)); // 18 天平滑消解
            expect(plan.strategy).toBe("gradual-ramp");
            expect(plan.warningKey).toBe("phaseArchive.warning.largeBacklogSpread");
        });

        it("用户自定义配额上限：根据用户预算平滑分散", () => {
            const plan = planReopenWorkload(50, { strategy: "gradual-ramp", preferredDailyCap: 15 });

            expect(plan.todayAssignedCount).toBe(15);
            expect(plan.spreadDays).toBe(4);
            expect(plan.dailyCap).toBe(15);
        });

        it("按需抽样摸底测验策略（on-demand-diagnostic）：不加入主队列，限制在安全抽样量内", () => {
            const plan = planReopenWorkload(200, { strategy: "on-demand-diagnostic" });

            expect(plan.strategy).toBe("on-demand-diagnostic");
            expect(plan.todayAssignedCount).toBe(MAX_SAFE_INSTANT_LOAD); // 上限 15 张
            expect(plan.spreadDays).toBe(1);
            expect(plan.warningKey).toBeNull();
        });

        it("挂起待命策略（paused-waiting）：今日安排为 0，零额外认知负担", () => {
            const plan = planReopenWorkload(300, { strategy: "paused-waiting" });

            expect(plan.strategy).toBe("paused-waiting");
            expect(plan.todayAssignedCount).toBe(0);
            expect(plan.spreadDays).toBe(0);
        });

        it("空卡库防呆处理：0 张卡不产生虚假调度天数", () => {
            const plan = planReopenWorkload(0);
            expect(plan.todayAssignedCount).toBe(0);
            expect(plan.spreadDays).toBe(0);
            expect(plan.descriptionKey).toBe("phaseArchive.plan.empty");
        });
    });

    describe("执行复开与 100% 对称回滚保护", () => {
        it("executeReopen：状态成功变更为 reopened 并完整追加调度计划日志", () => {
            const project = archivePhase(
                createPhaseProject({ id: "p1", title: "CPA 审计", domain: "professional" }, fixedNow),
                { reason: "stage-mastered", sources: mockSources, cards: mockCards, stats: mockStats },
                fixedNow,
            );

            const plan = planReopenWorkload(3, { strategy: "gradual-ramp" });
            const reopened = executeReopen(project, plan, fixedNow + 3000);

            expect(reopened.status).toBe("reopened");
            expect(reopened.history).toHaveLength(3);
            const lastLog = reopened.history[reopened.history.length - 1];
            expect(lastLog.action).toBe("reopen");
            expect((lastLog.details as any)?.strategy).toBe("gradual-ramp");
            expect((lastLog.details as any)?.todayAssignedCount).toBe(3);
        });

        it("rollbackReopen：支持一键完全对称回滚，恢复至 archived 状态并留存审计日志", () => {
            const project = archivePhase(
                createPhaseProject({ id: "p1", title: "CPA 审计", domain: "professional" }, fixedNow),
                { reason: "stage-mastered", sources: mockSources, cards: mockCards, stats: mockStats },
                fixedNow,
            );
            const plan = planReopenWorkload(3);
            const reopened = executeReopen(project, plan, fixedNow + 3000);

            // 执行回滚
            const rollbacked = rollbackReopen(reopened, "节奏过密，暂缓重开", fixedNow + 4000);

            expect(rollbacked.status).toBe("archived");
            expect(rollbacked.snapshot).toEqual(project.snapshot); // 完整保留原封存快照
            expect(rollbacked.history).toHaveLength(4);
            const rollbackEntry = rollbacked.history[rollbacked.history.length - 1];
            expect(rollbackEntry.action).toBe("rollback");
            expect(rollbackEntry.note).toBe("节奏过密，暂缓重开");
        });

        it("非 reopened 状态执行回滚保持幂等安全，不修改状态", () => {
            const project = createPhaseProject({ id: "p1", title: "活跃项目", domain: "course" }, fixedNow);
            const res = rollbackReopen(project, "无效回滚", fixedNow + 1000);
            expect(res.status).toBe("active");
            expect(res.history).toHaveLength(1);
        });
    });
});
