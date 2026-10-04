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

describe("settings 运行时字段校验（AQ-22）", () => {
    it("数值类型修复 + 范围钳制", () => {
        const s = normalizeSettings({
            timeoutSeconds: "abc",       // 非数字 → 默认 60
            dailyNewTarget: "30",        // 数字字符串收敛
            dailyReviewTarget: 99999,    // 越界钳制
            batchLimit: -5,              // 负值钳 0
            cardFontScale: 9,            // 0.85-1.25 钳制
            ttsRate: 0.1,                // 0.5-2 钳制
            leechThreshold: 0,           // 1-100 钳制
            cardMaxWidth: "720",
            backlogDays: NaN,
        });
        expect(s.timeoutSeconds).toBe(60);
        expect(s.dailyNewTarget).toBe(30);
        expect(s.dailyReviewTarget).toBe(9999);
        expect(s.batchLimit).toBe(0);
        expect(s.cardFontScale).toBe(1.25);
        expect(s.ttsRate).toBe(0.5);
        expect(s.leechThreshold).toBe(1);
        expect(s.cardMaxWidth).toBe(720);
        expect(s.backlogDays).toBe(3);
    });

    it("角标心跳 0 合法（关闭），其余 5-3600", () => {
        expect(normalizeSettings({ badgeRefreshSec: 0 }).badgeRefreshSec).toBe(0);
        expect(normalizeSettings({ badgeRefreshSec: 1 }).badgeRefreshSec).toBe(5);
        expect(normalizeSettings({ badgeRefreshSec: 99999 }).badgeRefreshSec).toBe(3600);
        expect(normalizeSettings({ badgeRefreshSec: "x" }).badgeRefreshSec).toBe(60);
    });

    it("枚举与离散值白名单", () => {
        const s = normalizeSettings({
            ratingStyle: "five",
            timeoutMode: 3,
            ratingDensity: null,
            sfxStyle: "gong",
            aiMode: "openai",
            uiMode: "basic", // 非法枚举
            heatmapWeeks: 30,
        });
        expect(s.ratingStyle).toBe("four");
        expect(s.timeoutMode).toBe("off");
        expect(s.ratingDensity).toBe("cozy");
        expect(s.sfxStyle).toBe("chime");
        expect(s.aiMode).toBe("siyuan");
        expect(s.uiMode).toBe("advanced"); // BI-14：非法枚举回缺省（熟练）
        expect(normalizeSettings({ uiMode: "simple" }).uiMode).toBe("simple");
        expect(s.heatmapWeeks).toBe(17);
        expect(normalizeSettings({ heatmapWeeks: 52 }).heatmapWeeks).toBe(52);
    });

    it("布尔与字符串：类型非法回默认", () => {
        const s = normalizeSettings({
            randomOrder: "yes",
            onboarded: 1,
            mixedRotation: "on", // v0.179.0：非布尔回 false
            aiKey: { leak: true },
            ankiClientUrl: 0,
            reminderTime: "25:99",
            quietStart: "23:00",
            examDate: "2026/11/01",
        });
        expect(s.randomOrder).toBe(false);
        expect(s.onboarded).toBe(false);
        expect(s.mixedRotation).toBe(false);
        expect(normalizeSettings({ mixedRotation: true }).mixedRotation).toBe(true);
        expect(s.aiKey).toBe("");
        expect(s.ankiClientUrl).toBe("http://127.0.0.1:8765");
        expect(s.reminderTime).toBe("20:00");
        expect(s.quietStart).toBe("23:00");
        expect(s.examDate).toBe("");
    });

    it("savedFilters 条目清洗与限量", () => {
        const s = normalizeSettings({
            savedFilters: [
                { name: "a", filter: "x" },
                { name: 1, filter: "y" },
                null,
                { name: "b" },
                { name: "c", filter: "z" },
            ],
        });
        expect(s.savedFilters).toEqual([{ name: "a", filter: "x" }, { name: "c", filter: "z" }]);
        expect(normalizeSettings({ savedFilters: "no" }).savedFilters).toEqual([]);
    });

    it("损坏 JSON 语义（null/数组/字符串）整体落默认", () => {
        for (const raw of [null, [1, 2], "corrupt", 42]) {
            const s = normalizeSettings(raw);
            expect(s.dailyReviewTarget).toBe(200);
            expect(s.aiMode).toBe("siyuan");
        }
    });
});
