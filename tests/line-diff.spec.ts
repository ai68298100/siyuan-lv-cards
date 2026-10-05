import { describe, expect, it } from "vitest";
import { diffLines, diffStats } from "../src/core/line-diff";

describe("line-diff（T05 版本对比）", () => {
    it("完全一致 → 全 same、变更 0", () => {
        const rows = diffLines("a\nb\nc", "a\nb\nc");
        expect(diffStats(rows)).toEqual({ add: 0, del: 0, same: 3 });
    });

    it("纯新增 → add 行", () => {
        const rows = diffLines("a\nc", "a\nb\nc");
        expect(diffStats(rows)).toEqual({ add: 1, del: 0, same: 2 });
        expect(rows.find((r) => r.kind === "add")!.text).toBe("b");
    });

    it("纯删除 → del 行", () => {
        const rows = diffLines("a\nb\nc", "a\nc");
        expect(diffStats(rows)).toEqual({ add: 0, del: 1, same: 2 });
        expect(rows.find((r) => r.kind === "del")!.text).toBe("b");
    });

    it("混合修改保留顺序", () => {
        const rows = diffLines("旧标题\n正文一\n旧结尾", "新标题\n正文一\n新结尾");
        const kinds = rows.map((r) => r.kind);
        expect(kinds.filter((k) => k === "same")).toHaveLength(1);
        expect(diffStats(rows)).toEqual({ add: 2, del: 2, same: 1 });
        expect(rows[0].kind).toBe("del"); // 旧标题先删
        expect(rows[1].kind).toBe("add"); // 新标题后加
    });

    it("空文本 ↔ 有文本：整块 add", () => {
        expect(diffStats(diffLines("", "a\nb"))).toEqual({ add: 2, del: 0, same: 0 });
    });

    it("CRLF 归一：不产生伪差异", () => {
        expect(diffStats(diffLines("a\r\nb", "a\nb"))).toEqual({ add: 0, del: 0, same: 2 });
    });
});
