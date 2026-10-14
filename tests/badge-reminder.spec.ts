import { describe, expect, it } from "vitest";
import {
    computeBadgeDescriptor,
    decideBacklogWarning,
    decideExamMilestoneReminder,
    isWithinQuietHours,
    shouldTriggerDailyReminder,
} from "../src/core/badge-reminder";
import type { ExamPlan } from "../src/core/exam";

describe("badge-reminder 状态角标与定时提醒引擎", () => {
    describe("isWithinQuietHours 免打扰时段判定", () => {
        it("常规白天时段（如 13:00 ~ 14:00）正常判定", () => {
            const dateInside = new Date(2026, 9, 14, 13, 30);
            const dateOutside = new Date(2026, 9, 14, 14, 30);

            expect(isWithinQuietHours("13:00", "14:00", dateInside)).toBe(true);
            expect(isWithinQuietHours("13:00", "14:00", dateOutside)).toBe(false);
        });

        it("跨午夜时段（如 23:00 ~ 07:00）深夜与清晨均处于免打扰", () => {
            const lateNight = new Date(2026, 9, 14, 23, 45);
            const earlyMorning = new Date(2026, 9, 15, 6, 15);
            const noon = new Date(2026, 9, 15, 12, 0);

            expect(isWithinQuietHours("23:00", "07:00", lateNight)).toBe(true);
            expect(isWithinQuietHours("23:00", "07:00", earlyMorning)).toBe(true);
            expect(isWithinQuietHours("23:00", "07:00", noon)).toBe(false);
        });

        it("非法格式或首尾相同返回 false", () => {
            expect(isWithinQuietHours("invalid", "07:00")).toBe(false);
            expect(isWithinQuietHours("08:00", "08:00")).toBe(false);
        });
    });

    describe("decideBacklogWarning 积压预警", () => {
        const nowTs = 1700000000000;
        const fourDaysAgo = nowTs - 4 * 86400000;
        const twoDaysAgo = nowTs - 2 * 86400000;

        it("满 3 天未复习且仍有待复习卡片时触发预警", () => {
            const decision = decideBacklogWarning({
                reminderEnabled: true,
                lastDue: 10,
                inQuiet: false,
                lastRevlogTs: fourDaysAgo,
                today: "2026-10-14",
                alreadyWarnedToday: false,
                nowTs,
            });
            expect(decision.shouldWarn).toBe(true);
            expect(decision.days).toBe(4);
        });

        it("不足 3 天、静音期、无到期卡或今日已提醒过时不触发", () => {
            expect(decideBacklogWarning({
                reminderEnabled: true,
                lastDue: 10,
                inQuiet: false,
                lastRevlogTs: twoDaysAgo,
                today: "2026-10-14",
                alreadyWarnedToday: false,
                nowTs,
            }).shouldWarn).toBe(false);

            expect(decideBacklogWarning({
                reminderEnabled: true,
                lastDue: 10,
                inQuiet: true,
                lastRevlogTs: fourDaysAgo,
                today: "2026-10-14",
                alreadyWarnedToday: false,
                nowTs,
            }).shouldWarn).toBe(false);

            expect(decideBacklogWarning({
                reminderEnabled: true,
                lastDue: 0,
                inQuiet: false,
                lastRevlogTs: fourDaysAgo,
                today: "2026-10-14",
                alreadyWarnedToday: false,
                nowTs,
            }).shouldWarn).toBe(false);

            expect(decideBacklogWarning({
                reminderEnabled: true,
                lastDue: 10,
                inQuiet: false,
                lastRevlogTs: fourDaysAgo,
                today: "2026-10-14",
                alreadyWarnedToday: true,
                nowTs,
            }).shouldWarn).toBe(false);
        });
    });

    describe("decideExamMilestoneReminder 考试里程碑提醒", () => {
        const futurePlan = (daysFromNow: number): ExamPlan => {
            const d = new Date();
            d.setDate(d.getDate() + daysFromNow);
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            return {
                id: "plan-1",
                name: "期末考试",
                examDate: iso,
                scopeKind: "all",
                scopeId: "",
                targetScore: 90,
                enabled: true,
                archived: false,
            };
        };

        it("距离考试 30/7/1 天时命中里程碑提醒", () => {
            const plan30 = futurePlan(30);
            const decision = decideExamMilestoneReminder({
                examEnabled: true,
                reminderEnabled: true,
                inQuiet: false,
                plans: [plan30],
                today: "2026-10-14",
                lastNotifiedKey: "",
            });
            expect(decision.shouldNotify).toBe(true);
            expect(decision.daysLeft).toBe(30);
            expect(decision.key).toBe("plan-1:30:2026-10-14");
        });

        it("重复 key 幂等去重：同日同一里程碑不再触发", () => {
            const plan7 = futurePlan(7);
            const decision = decideExamMilestoneReminder({
                examEnabled: true,
                reminderEnabled: true,
                inQuiet: false,
                plans: [plan7],
                today: "2026-10-14",
                lastNotifiedKey: "plan-1:7:2026-10-14",
            });
            expect(decision.shouldNotify).toBe(false);
        });

        it("非关键节点（如 15 天）不触发里程碑", () => {
            const plan15 = futurePlan(15);
            const decision = decideExamMilestoneReminder({
                examEnabled: true,
                reminderEnabled: true,
                inQuiet: false,
                plans: [plan15],
                today: "2026-10-14",
                lastNotifiedKey: "",
            });
            expect(decision.shouldNotify).toBe(false);
        });
    });

    describe("shouldTriggerDailyReminder 每日提醒时刻判定", () => {
        it("到达或超过设定时刻触发提醒", () => {
            const now = new Date(2026, 9, 14, 20, 15);
            expect(shouldTriggerDailyReminder({
                reminderEnabled: true,
                reminderTime: "20:00",
                alreadyShownToday: false,
                now,
            })).toBe(true);

            expect(shouldTriggerDailyReminder({
                reminderEnabled: true,
                reminderTime: "21:00",
                alreadyShownToday: false,
                now,
            })).toBe(false);
        });
    });

    describe("computeBadgeDescriptor 角标数据组装", () => {
        const mockI18n = {
            badgeDue: "${n} 张待复习",
            exam: { daysLeft: "剩余 ${n} 天" },
        };

        it("复习模块关闭或无到期卡时隐藏角标", () => {
            expect(computeBadgeDescriptor({
                reviewEnabled: false,
                count: 10,
                dailyReviewTarget: 0,
                doneToday: 0,
                i18n: mockI18n,
            }).visible).toBe(false);

            expect(computeBadgeDescriptor({
                reviewEnabled: true,
                count: 0,
                dailyReviewTarget: 0,
                doneToday: 0,
                i18n: mockI18n,
            }).visible).toBe(false);
        });

        it("正常展示待复习张数并计算今日达标绿色高亮", () => {
            const descNotDone = computeBadgeDescriptor({
                reviewEnabled: true,
                count: 25,
                dailyReviewTarget: 20,
                doneToday: 15,
                i18n: mockI18n,
            });
            expect(descNotDone.visible).toBe(true);
            expect(descNotDone.text).toBe("25");
            expect(descNotDone.isDone).toBe(false);

            const descDone = computeBadgeDescriptor({
                reviewEnabled: true,
                count: 5,
                dailyReviewTarget: 20,
                doneToday: 20,
                i18n: mockI18n,
            });
            expect(descDone.isDone).toBe(true);
        });

        it("存在活动考试计划时优先显示考试倒计时", () => {
            const d = new Date();
            d.setDate(d.getDate() + 7);
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const plan: ExamPlan = {
                id: "plan-1",
                name: "执业医师模考",
                examDate: iso,
                scopeKind: "all",
                scopeId: "",
                targetScore: 100,
                enabled: true,
                archived: false,
            };

            const desc = computeBadgeDescriptor({
                reviewEnabled: true,
                count: 50,
                activeExamPlan: plan,
                dailyReviewTarget: 0,
                doneToday: 0,
                i18n: mockI18n,
            });

            expect(desc.visible).toBe(true);
            expect(desc.isExam).toBe(true);
            expect(desc.text).toBe("7");
            expect(desc.title).toContain("执业医师模考 · 剩余 7 天");
            expect(desc.milestoneDays).toBe(7);
        });
    });
});
