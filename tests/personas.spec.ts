import { describe, expect, it } from "vitest";
import { PERSONA_PRESETS } from "../src/core/personas";
import { MODULE_DEFS } from "../src/core/modules";
import { normalizeSettings } from "../src/core/settings";

// AQ-23 画像预设数据契约：注册表演进后预设键不漂移、参数值域合法（兜底巡检 v0.110.3）
const MODULE_IDS = new Set(MODULE_DEFS.map(m => m.id));

describe("personas 画像预设数据契约（AQ-23）", () => {
    it("每条预设的 modules 键都在 MODULES 注册表内（防注册表演进漂移）", () => {
        for (const p of PERSONA_PRESETS) {
            for (const key of Object.keys(p.modules)) {
                expect(MODULE_IDS.has(key), `${p.id}.modules 含未知键 "${key}"`).toBe(true);
            }
        }
    });

    it("核心模块（gateway/review）在每条预设中保持开启", () => {
        for (const p of PERSONA_PRESETS) {
            expect(p.modules.gateway, `${p.id} 关闭了 gateway`).toBe(true);
            expect(p.modules.review, `${p.id} 关闭了 review`).toBe(true);
        }
    });

    it("params 值域合法（经 normalizeSettings 同口径约束）", () => {
        for (const p of PERSONA_PRESETS) {
            const merged = normalizeSettings(p.params);
            if (p.params.ratingStyle !== undefined) {
                expect(merged.ratingStyle).toBe(p.params.ratingStyle);
            }
            if (p.params.timeoutMode !== undefined) {
                expect(merged.timeoutMode).toBe(p.params.timeoutMode);
            }
            if (p.params.timeoutSeconds !== undefined) {
                expect(merged.timeoutSeconds).toBe(p.params.timeoutSeconds);
            }
            expect(merged.dailyNewTarget).toBeGreaterThan(0);
            expect(merged.dailyReviewTarget).toBeGreaterThan(0);
        }
    });

    it("预设 id 唯一且 i18n 键非空", () => {
        const ids = PERSONA_PRESETS.map(p => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const p of PERSONA_PRESETS) {
            expect(p.nameKey.length).toBeGreaterThan(0);
            expect(p.descKey.length).toBeGreaterThan(0);
        }
    });
});
