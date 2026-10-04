import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getTemplate, missingInputs, PROMPT_TEMPLATES, renderTemplate } from "../src/core/prompt-templates";

// BU-5/BV 模板注册表：id 唯一、占位符渲染、输入完整性预检（注册表演进防漂移）
describe("prompt-templates 注册表契约（BU-5/BV）", () => {
    it("id 唯一且分类合法", () => {
        const ids = PROMPT_TEMPLATES.map(t => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const t of PROMPT_TEMPLATES) {
            expect(["authoring", "capture", "language", "exam", "maintenance", "routing"]).toContain(t.category);
        }
    });

    it("既有三预设在册（generic/exam/language 迁移迁移源）", () => {
        expect(getTemplate("generic")?.nameKey).toBe("aiPromptGenericLabel");
        expect(getTemplate("exam")?.category).toBe("exam");
        expect(getTemplate("language")?.category).toBe("language");
    });

    it("BV 家族在册（七件套 + BV-8/9 扩容）", () => {
        for (const id of ["material-scan", "goal-clarify", "card-type-route", "atomic-split", "cloze-leak-check", "distractor-with-cause", "answer-rubric", "list-table-bidi"]) {
            expect(getTemplate(id), `missing ${id}`).toBeDefined();
        }
        expect(getTemplate("leech-rewrite")).toBeDefined();
    });

    it("renderTemplate：已知变量填充、未提供变量保留原样（预检可检测残留）", () => {
        const t = getTemplate("generic")!;
        const out = renderTemplate(t, { count: 5, language: "中文", type: "问答" });
        expect(out).not.toContain("${count}");
        expect(out).not.toContain("${language}");
        expect(out).toContain("5 张闪卡");
        // material 走 user 消息不入 system——system 内无该占位符属预期
        expect(out).not.toMatch(/\$\{\w+\}/);
    });

    it("missingInputs：报告缺失的必需键", () => {
        const t = getTemplate("generic")!;
        expect(missingInputs(t, {})).toEqual(t.inputs);
        expect(missingInputs(t, { material: "x", count: 3, language: "中", type: "问答" })).toEqual([]);
    });

    it("未知 id 返回 undefined（调用方回退 generic）", () => {
        expect(getTemplate("no-such-template")).toBeUndefined();
    });

    it("nameKey 必须在 zh-CN 与 en i18n 中都可解析（v0.163.0 防回归：10 模板标签曾整体缺失）", () => {
        const read = (p: string): Record<string, unknown> =>
            JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
        const zh = read("../public/i18n/zh-CN.json");
        const en = read("../public/i18n/en.json");
        expect(PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(10);
        for (const t of PROMPT_TEMPLATES) {
            expect(typeof zh[t.nameKey]).toBe("string");
            expect(typeof en[t.nameKey]).toBe("string");
        }
    });
});
