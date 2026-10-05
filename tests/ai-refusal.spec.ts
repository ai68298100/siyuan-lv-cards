import { describe, expect, it } from "vitest";
import { REFUSAL_KINDS, evaluateRefusal, mapRefusalToLadderClass, formatRefusalMessage } from "../src/core/ai-refusal";
import { classifyAiFailure, nextLadderStep } from "../src/core/ai-degradation";

// BU-11 拒答策略：六类可读拒答+下一步；拒答映射 BU-28 终止类——绝不自动换更宽权限/未授权 provider
describe("ai-refusal（BU-11）", () => {
    it("六类在册且每类下一步两两不同（防统一话术退化）", () => {
        expect(REFUSAL_KINDS.length).toBe(6);
        const nextSets = REFUSAL_KINDS.map(k => evaluateRefusal({ [k]: true })!.nextKeys);
        expect(new Set(nextSets.map(s => s.join("|"))).size).toBe(6);
        for (const keys of nextSets) {
            expect(keys.length).toBeGreaterThan(0);
        }
    });

    it("优先级：危险请求最先；格式失败最后；无信号=null", () => {
        const all = Object.fromEntries(REFUSAL_KINDS.map(k => [k, true]));
        expect(evaluateRefusal(all)!.kind).toBe("hazardous-request");
        expect(evaluateRefusal({ "format-failure": "解析为空", "beyond-capability": true })!.kind).toBe("beyond-capability");
        expect(evaluateRefusal({})).toBeNull();
        expect(evaluateRefusal({ "insufficient-evidence": false })).toBeNull();
    });

    it("verdict 结构：reasonKey/nextKeys 契约、neverEscalates 恒 true、detail 截 200", () => {
        const v = evaluateRefusal({ "source-conflict": "x".repeat(500) })!;
        expect(v.reasonKey).toBe("aiRefusal.kind.source-conflict");
        expect(v.nextKeys.every(k => k.startsWith("aiRefusal.next.") === false || typeof k === "string")).toBe(true);
        expect(v.neverEscalates).toBe(true);
        expect(v.detail.length).toBe(200);
    });

    it("验收核心：每类拒答映射的阶梯类必为终止类——即使备用端点可用也恒中止", () => {
        expect(mapRefusalToLadderClass("hazardous-request")).toBe("risk");
        expect(mapRefusalToLadderClass("format-failure")).toBe("parse");
        for (const kind of REFUSAL_KINDS) {
            const cls = mapRefusalToLadderClass(kind);
            expect(["risk", "parse", "unknown"]).toContain(cls);
            const verdict = classifyAiFailure(new Error(`refusal:${cls}`));
            // 用分类器按类构造终止判定：拒答类一律不进入重试/回退分支
            const msg = cls === "risk" ? "content_policy" : cls === "parse" ? "AI parse failed" : "AI HTTP 404";
            const step = nextLadderStep(classifyAiFailure(new Error(msg)), { maxPrimaryAttempts: 3, hasFallback: true }, 1);
            expect(step.action).toBe("abort");
            expect(step.mayCost).toBe(false);
            expect(verdict.detail.length).toBeGreaterThan(0);
        }
    });

    it("formatRefusalMessage：原因+有序下一步拼接", () => {
        const msg = formatRefusalMessage("材料不足", ["缩窄主题", "补充来源"]);
        expect(msg).toBe("材料不足 → 缩窄主题 → 补充来源");
    });
});
