import { describe, expect, it } from "vitest";
import { loadReliefChoices, LOAD_CHOICES } from "../src/core/load-relief";

// BI-13 减负选择：五种路径，每条必带对 due/历史的影响说明（验收硬性要求）
describe("load-relief（BI-13）", () => {
    it("五种选择齐全有序（阻力从小到大），标签与影响说明键成对", () => {
        const choices = loadReliefChoices();
        expect(choices.map(c => c.key)).toEqual([...LOAD_CHOICES]);
        for (const c of choices) {
            expect(c.labelKey).toBe(c.key);
            expect(c.impactKey).toBe(`impact.${c.key}`);
        }
    });

    it("重建计划在列但永远排最后（阻力最大的出路，非默认推荐）", () => {
        const keys = loadReliefChoices().map(c => c.key);
        expect(keys[keys.length - 1]).toBe("rebuild");
        expect(keys).toContain("narrow");
        expect(keys).toContain("readOnly");
    });
});
