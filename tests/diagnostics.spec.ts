import { describe, expect, it } from "vitest";
import { buildDiagnosticsText, type DiagnosticsInput } from "../src/core/diagnostics";

describe("buildDiagnosticsText 自诊断格式化", () => {
    const baseInput: DiagnosticsInput = {
        pluginVersion: "0.209.5",
        kernelVersion: "3.8.6",
        v2State: "Active",
        modules: {
            review: true,
            stats: true,
            manager: false,
        },
        revlogCount: 120,
        streak: 5,
        dueToday: 18,
        plansCount: 2,
        persistStats: [
            { key: "settings.json", ok: 10, fail: 0, lastOkTs: 1700000000000 },
        ],
        hasPersistFailures: false,
        dueCacheStats: { hits: 42, misses: 3 },
        recentLogDump: "2026-10-14 [info] test log",
    };

    it("正确汇总环境、版本与开启的模块", () => {
        const text = buildDiagnosticsText(baseInput);
        expect(text).toContain("plugin version: 0.209.5");
        expect(text).toContain("siyuan/kernel: 3.8.6");
        expect(text).toContain("V2 state: Active");
        expect(text).toContain("modules on: review, stats");
        expect(text).not.toContain("manager");
        expect(text).toContain("revlog entries: 120");
        expect(text).toContain("streak: 5");
        expect(text).toContain("due today (badge): 18");
        expect(text).toContain("plans: 2");
    });

    it("包含持久化状态与全部写入成功提示", () => {
        const text = buildDiagnosticsText(baseInput);
        expect(text).toContain("settings.json: ok=10 fail=0");
        expect(text).toContain("all writes ok");
    });

    it("存在持久化失败时展示失败信息且不显示 all writes ok", () => {
        const withFailure: DiagnosticsInput = {
            ...baseInput,
            hasPersistFailures: true,
            persistStats: [
                { key: "revlog.json", ok: 5, fail: 1, lastError: "disk write error" },
            ],
        };
        const text = buildDiagnosticsText(withFailure);
        expect(text).toContain("revlog.json: ok=5 fail=1 lastError=disk write error");
        expect(text).not.toContain("all writes ok");
    });

    it("处理缺省值与空日志回退", () => {
        const emptyInput: DiagnosticsInput = {
            pluginVersion: "",
            kernelVersion: "",
            v2State: null,
            modules: {},
            revlogCount: 0,
            streak: 0,
            dueToday: 0,
            plansCount: 0,
            persistStats: [],
            hasPersistFailures: false,
            dueCacheStats: {},
            recentLogDump: "",
        };
        const text = buildDiagnosticsText(emptyInput);
        expect(text).toContain("plugin version: unknown");
        expect(text).toContain("siyuan/kernel: ?");
        expect(text).toContain("V2 state: N/A (<3.9.0)");
        expect(text).toContain("(empty)");
    });
});
