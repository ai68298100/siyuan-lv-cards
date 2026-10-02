import { describe, expect, it } from "vitest";
import { normalizeSettings, defaultSettings } from "../src/core/settings";
import { normalizeExamPlans, daysLeft, isCramActive } from "../src/core/exam";

describe("settings 旧 ID 迁移", () => {
    it("dashboard→stats、dailyGoal→gamify、fsrsPanel 丢弃", () => {
        const s = normalizeSettings({
            modules: { dashboard: false, dailyGoal: true, fsrsPanel: true, review: true },
        });
        expect(s.modules.stats).toBe(false);
        expect(s.modules.gamify).toBe(true);
        expect(s.modules.review).toBe(true);
        expect((s.modules as any).fsrsPanel).toBeUndefined();
    });
});

describe("exam（M7）", () => {
    it("daysLeft 计算", () => {
        const d = new Date();
        d.setDate(d.getDate() + 5);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        expect(daysLeft(iso)).toBe(5);
    });

    it("cram 窗口判定", () => {
        const d = new Date();
        d.setDate(d.getDate() + 3);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const plan = { examDate: iso, cramDays: 7 } as any;
        expect(isCramActive(plan)).toBe(true);
        expect(daysLeft(iso)! <= 7).toBe(true);
    });

    it("normalizeExamPlans 过滤非法计划", () => {
        const r = normalizeExamPlans({ plans: [{ id: "a", examDate: "2026-11-01" }, null, { examDate: "x" }] });
        expect(r.plans).toHaveLength(1);
        expect(r.plans[0].scopeKind).toBe("all");
    });

    it("默认设置含新字段", () => {
        const s = defaultSettings();
        expect(s.typingEnabled).toBe(false);
        expect(s.reminderTime).toBe("20:00");
        expect(s.aiMode).toBe("siyuan");
    });

    it("normalizeSettings 幂等（migration round-trip，535）", () => {
        const messy = {
            modules: { dashboard: false, dailyGoal: true, fsrsPanel: true, review: true },
            dailyNewTarget: "30",
            unknownField: { nested: true },
            persona: "phd",
            version: 0,
        };
        const once = normalizeSettings(messy);
        const twice = normalizeSettings(JSON.parse(JSON.stringify(once)));
        expect(once).toEqual(twice);
        // 枚举外 persona 归 custom；未知字段保留（前向兼容：升级只增不删）
        expect(once.persona).toBe("custom");
        expect((twice as any).unknownField).toEqual({ nested: true });
    });
});
