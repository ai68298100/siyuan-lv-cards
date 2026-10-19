import { describe, expect, it } from "vitest";
import {
    HEALTH_METRIC_CATEGORIES,
    inspectSystemHealth,
    exportHealthReportToMarkdown,
} from "../src/core/system-health";
import type { SystemHealthFacts } from "../src/core/system-health";

describe("system-health (BL-12 长期运行健康仪表盘与巡检引擎)", () => {
    it("包含七大长期运行健康维度", () => {
        expect(HEALTH_METRIC_CATEGORIES).toEqual([
            "storage-growth",
            "failed-writes",
            "orphan-sources",
            "broken-media",
            "stale-templates",
            "unprocessed-candidates",
            "pending-reassessments",
        ]);
    });

    const perfectFacts: SystemHealthFacts = {
        totalRevlogEntries: 2000,
        failedWritesCount: 0,
        orphanCardsCount: 0,
        brokenMediaCount: 0,
        staleTemplatesCount: 0,
        unprocessedInboxCount: 0,
        pendingReassessmentCount: 0,
    };

    it("健康状态评定：无任何异常时为 100 分 optimal 等级", () => {
        const report = inspectSystemHealth(perfectFacts);
        expect(report.overallScore).toBe(100);
        expect(report.grade).toBe("optimal");
        expect(report.gradeKey).toBe("systemHealth.grade.optimal");
        expect(report.totalIssues).toBe(0);
        expect(report.criticalCount).toBe(0);
        expect(report.warningCount).toBe(0);

        // 每项检查条目均配备三项动作
        for (const item of report.items) {
            expect(item.actions).toEqual(["fix", "ignore", "export"]);
            expect(item.severity).toBe("healthy");
            expect(item.remedyId).toBeDefined();
        }
    });

    it("严重隐患扣分与退化评级：存储膨胀 + 失败写入较多 + 孤儿卡较多 -> degraded 评级", () => {
        const badFacts: SystemHealthFacts = {
            totalRevlogEntries: 35000, // critical (-20)
            failedWritesCount: 6, // critical (-20)
            orphanCardsCount: 15, // critical (-20)
            brokenMediaCount: 0,
            staleTemplatesCount: 2, // warning (-8)
            unprocessedInboxCount: 0,
            pendingReassessmentCount: 0,
        };

        const report = inspectSystemHealth(badFacts);
        // 100 - 20 - 20 - 20 - 8 = 32
        expect(report.overallScore).toBe(32);
        expect(report.grade).toBe("degraded");
        expect(report.gradeKey).toBe("systemHealth.grade.degraded");
        expect(report.criticalCount).toBe(3);
        expect(report.warningCount).toBe(1);
    });

    it("用户主动忽略（ignore）的条目不计入扣分且不计入活跃隐患数", () => {
        const badFacts: SystemHealthFacts = {
            ...perfectFacts,
            failedWritesCount: 6, // critical (-20)
            brokenMediaCount: 6, // critical (-20)
        };

        // 用户主动忽略 failed-writes
        const ignored = new Set(["health-failed-writes"]);
        const report = inspectSystemHealth(badFacts, ignored);

        // 只扣 brokenMedia 的 20 分 -> 80 分 (good)
        expect(report.overallScore).toBe(80);
        expect(report.grade).toBe("good");
        expect(report.criticalCount).toBe(1); // 忽略的 critical 不计入
        const ignoredItem = report.items.find(i => i.id === "health-failed-writes")!;
        expect(ignoredItem.ignored).toBe(true);
    });

    it("exportHealthReportToMarkdown 导出格式完备", () => {
        const report = inspectSystemHealth({
            ...perfectFacts,
            orphanCardsCount: 3,
        });

        const md = exportHealthReportToMarkdown(report);
        expect(md).toContain("# 小驴闪卡 · 系统健康巡检报告");
        expect(md).toContain("综合健康分：");
        expect(md).toContain("health-orphan-sources");
        expect(md).toContain("[警告]");
    });
});
