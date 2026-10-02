import { describe, expect, it } from "vitest";
import { normalizeMigrationStatus } from "../src/api/v2-contract";

describe("normalizeMigrationStatus（AQ-6 V2 状态白名单）", () => {
    it("四种已知状态放行", () => {
        for (const state of ["Legacy", "Preparing", "Active", "LegacyDiverged"] as const) {
            expect(normalizeMigrationStatus({ state }).state).toBe(state);
        }
    });

    it("未知状态/缺字段/非对象 → Unknown（端点在但契约不可识别）", () => {
        expect(normalizeMigrationStatus({ state: "Migrating" }).state).toBe("Unknown");
        expect(normalizeMigrationStatus({}).state).toBe("Unknown");
        expect(normalizeMigrationStatus({ state: 42 }).state).toBe("Unknown");
        expect(normalizeMigrationStatus(null).state).toBe("Unknown");
        expect(normalizeMigrationStatus("Active").state).toBe("Unknown");
    });

    it("report 字段白名单清洗：非数值/缺字段丢弃", () => {
        const r = normalizeMigrationStatus({
            state: "Active",
            report: {
                Complete: true,
                MigratedCards: "12",     // 数字字符串按修复收敛
                ArchivedCards: NaN,      // 丢弃
                ReviewSets: 3,
                Bogus: "x",              // 白名单外丢弃
            },
        }).report;
        expect(r).toEqual({ Complete: true, MigratedCards: 12, ReviewSets: 3 });
    });

    it("report 全空/非法 → undefined", () => {
        expect(normalizeMigrationStatus({ state: "Active", report: null }).report).toBeUndefined();
        expect(normalizeMigrationStatus({ state: "Active", report: "x" }).report).toBeUndefined();
        expect(normalizeMigrationStatus({ state: "Active", report: { Bogus: 1 } }).report).toBeUndefined();
    });
});
