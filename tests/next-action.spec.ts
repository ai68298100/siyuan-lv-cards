import { describe, expect, it } from "vitest";
import { nextActions, primaryAction, type NextAction } from "../src/core/next-action";
import { CONTENT_STATES } from "../src/core/content-lifecycle";

// BI-6 下一动作建议：每状态有建议、主建议语义正确、i18n 键完整
describe("next-action（BI-6）", () => {
    it("每个内容状态都非空且首位=主建议", () => {
        for (const s of CONTENT_STATES) {
            const hints = nextActions(s);
            expect(hints.length).toBeGreaterThan(0);
            expect(primaryAction(s)).toBe(hints[0].action);
        }
    });

    it("语义：needsRevision 主建议=修订；stale 主建议=回来源", () => {
        expect(primaryAction("needsRevision")).toBe("revise");
        expect(primaryAction("stale")).toBe("openSource");
    });

    it("语义：入库后推正式复习；应用后推练习", () => {
        expect(primaryAction("stocked")).toBe("formalReview");
        expect(primaryAction("inReview")).toBe("formalReview");
        expect(primaryAction("applied")).toBe("practice");
    });

    it("labelKey 契约：nextAction.<action> 形式", () => {
        for (const h of nextActions("candidate")) {
            expect(h.labelKey).toBe(`nextAction.${h.action}`);
        }
    });

    it("所有 NEXT_ACTIONS 至少在一个状态中被建议（无死动作）", () => {
        const used = new Set<NextAction>();
        for (const s of CONTENT_STATES) {
            for (const h of nextActions(s)) used.add(h.action);
        }
        expect(used.size).toBe(7);
    });
});
