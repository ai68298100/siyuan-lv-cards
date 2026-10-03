import { describe, expect, it } from "vitest";
import {
    emptyErrorTags, errorReasonStats, errorTagCoverage,
    normalizeErrorReason, tagError, ERROR_REASONS,
} from "../src/core/error-reasons";

// BJ-4 错误原因分类：标注可改选 / 统计按分类 / 覆盖率
describe("error-reasons（BJ-4）", () => {
    it("七类原因全量在册", () => {
        expect(ERROR_REASONS).toHaveLength(7);
    });

    it("归一：合法值透传，未知返回 null", () => {
        expect(normalizeErrorReason("memory-blank")).toBe("memory-blank");
        expect(normalizeErrorReason("bogus")).toBeNull();
        expect(normalizeErrorReason(42)).toBeNull();
    });

    it("tagError：新建/覆盖/无效 cardID 拒绝", () => {
        const d = emptyErrorTags();
        expect(tagError(d, "c1", "memory-blank", "2026-10-04")).toBe(true);
        expect(d.tags).toHaveLength(1);
        // 可改选：同卡同日覆盖
        expect(tagError(d, "c1", "concept-confusion", "2026-10-04")).toBe(true);
        expect(d.tags).toHaveLength(1);
        expect(d.tags[0].reason).toBe("concept-confusion");
        // 无效 cardID
        expect(tagError(d, "", "step-error", "2026-10-04")).toBe(false);
    });

    it("不同日期不覆盖（跨日独立记录）", () => {
        const d = emptyErrorTags();
        tagError(d, "c1", "memory-blank", "2026-10-04");
        tagError(d, "c1", "step-error", "2026-10-05");
        expect(d.tags).toHaveLength(2);
    });

    it("errorReasonStats：按日期过滤 + 分类计数", () => {
        const d = emptyErrorTags();
        tagError(d, "c1", "memory-blank", "2026-10-04");
        tagError(d, "c2", "memory-blank", "2026-10-04");
        tagError(d, "c3", "step-error", "2026-10-05");
        const all = errorReasonStats(d.tags);
        expect(all["memory-blank"]).toBe(2);
        expect(all["step-error"]).toBe(1);
        const today = errorReasonStats(d.tags, "2026-10-04");
        expect(today["memory-blank"]).toBe(2);
        expect(today["step-error"]).toBe(0);
    });

    it("errorTagCoverage：覆盖率 = 标注数/遗忘数", () => {
        expect(errorTagCoverage(0, [])).toBe(0);
        expect(errorTagCoverage(5, [{ cardID: "c1", reason: "memory-blank", date: "d" }])).toBe(20);
        expect(errorTagCoverage(4, [
            { cardID: "c1", reason: "memory-blank", date: "d" },
            { cardID: "c2", reason: "step-error", date: "d" },
        ])).toBe(50);
    });

    it("emptyErrorTags 回空", () => {
        expect(emptyErrorTags()).toEqual({ version: 1, tags: [] });
    });
});
