import { describe, expect, it } from "vitest";
import { planContext, suggestBatches, TRUNCATION_MARKER, type ContextLayer } from "../src/core/context-budget";

// BU-6 上下文预算器：固定层序拼接、按优先级裁剪、截断不静默、超长材料给分批预览
const layer = (key: ContextLayer["key"], text: string, priority?: number): ContextLayer => ({ key, text, priority });

describe("context-budget（BU-6）", () => {
    it("预算内：固定层序原样拼接（与输入顺序无关），无截断", () => {
        const r = planContext([
            layer("material", "材料正文"), layer("system", "系统约束"), layer("tool", "工具结果"),
        ], 1000);
        expect(r.prompts.map(p => p.key)).toEqual(["system", "material", "tool"]);
        expect(r.prompts.map(p => p.text)).toEqual(["系统约束", "材料正文", "工具结果"]);
        expect(r.reports.every(x => !x.truncated && !x.dropped)).toBe(true);
        expect(r.needsBatching).toBe(false);
    });

    it("超预算：低优先级层先被裁，材料层最后；截断层带可见标记（不静默）", () => {
        // system 40tok + material 200tok + tool 100tok = 340tok，预算 220 → material 保全，system 被截，tool 被丢
        const r = planContext([
            layer("system", "S".repeat(160)),
            layer("material", "M".repeat(800)),
            layer("tool", "T".repeat(400)),
        ], 220);
        const tool = r.reports.find(x => x.key === "tool")!;
        const material = r.reports.find(x => x.key === "material")!;
        const system = r.reports.find(x => x.key === "system")!;
        expect(tool.dropped).toBe(true);                      // priority 5 最先出局
        expect(material.truncated).toBe(false);               // priority 1 保全
        expect(material.keptTokens).toBe(material.originalTokens);
        expect(system.truncated).toBe(true);                  // priority 2 居中被截
        const sysPrompt = r.prompts.find(p => p.key === "system")!;
        expect(sysPrompt.text.endsWith(TRUNCATION_MARKER)).toBe(true); // 截断层带可见标记
        expect(r.prompts.some(p => p.key === "tool")).toBe(false);     // 丢弃层不产出
    });

    it("材料从头保留（来源位置不变），标记计入产出", () => {
        const r = planContext([
            layer("system", "S".repeat(40)),
            layer("material", "证据开头" + "M".repeat(1000)),
        ], 100);
        const mat = r.prompts.find(p => p.key === "material")!;
        expect(mat.text.startsWith("证据开头")).toBe(true);
        expect(mat.text.endsWith(TRUNCATION_MARKER)).toBe(true);
        expect(r.reports.find(x => x.key === "material")!.truncated).toBe(true);
    });

    it("材料独木超预算：needsBatching=true 并给分批建议（≥2），不再硬截整层", () => {
        const r = planContext([layer("material", "M".repeat(8000))], 500);
        expect(r.needsBatching).toBe(true);
        expect(r.batches).toBeGreaterThanOrEqual(2);
    });

    it("suggestBatches：装不下给 ceil 批数；装得下/非法返回 0", () => {
        expect(suggestBatches(1000, 300)).toBe(4);
        expect(suggestBatches(600, 300)).toBe(2);
        expect(suggestBatches(200, 300)).toBe(0);
        expect(suggestBatches(200, 0)).toBe(0);
    });

    it("空层不产出不进报告；totalTokens 反映截断后实际量", () => {
        const r = planContext([layer("system", "S".repeat(80)), layer("tool", "")], 100);
        expect(r.reports.map(x => x.key)).toEqual(["system"]);
        expect(r.totalTokens).toBeLessThanOrEqual(100);
    });
});
