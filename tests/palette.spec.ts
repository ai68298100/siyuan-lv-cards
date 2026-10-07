import { describe, expect, it } from "vitest";
import { filterPaletteCommands, flattenPaletteGroups, matchPaletteCommand, type PaletteCommand } from "../src/core/palette";

const cmds: PaletteCommand[] = [
    { id: "review", group: "actions", label: "开始复习", keywords: "review study" },
    { id: "wizard", group: "actions", label: "AI 制卡", keywords: "ai generate" },
    { id: "overview", group: "nav", label: "总览", keywords: "dashboard overview" },
    { id: "exam", group: "nav", label: "考试", keywords: "exam cram" },
];

describe("matchPaletteCommand", () => {
    it("空查询全命中", () => {
        expect(matchPaletteCommand(cmds[0], "")).toBe(true);
        expect(matchPaletteCommand(cmds[0], "   ")).toBe(true);
    });
    it("label 子串命中（大小写折叠）", () => {
        expect(matchPaletteCommand(cmds[0], "复习")).toBe(true);
        expect(matchPaletteCommand(cmds[2], "总览")).toBe(true);
    });
    it("keywords 命中英文别名", () => {
        expect(matchPaletteCommand(cmds[1], "AI")).toBe(true);
        expect(matchPaletteCommand(cmds[3], "CRAM")).toBe(true);
    });
    it("不匹配返回 false", () => {
        expect(matchPaletteCommand(cmds[0], "考试")).toBe(false);
    });
});

describe("filterPaletteCommands", () => {
    it("空查询返回原序分组", () => {
        const groups = filterPaletteCommands(cmds, "");
        expect(groups.map(g => g.group)).toEqual(["actions", "nav"]);
        expect(groups[0].items.map(i => i.id)).toEqual(["review", "wizard"]);
    });
    it("查询过滤后组保持原相对顺序", () => {
        const groups = filterPaletteCommands(cmds, "e"); // review/wizard/overview/exam 均命中
        const flat = flattenPaletteGroups(groups).map(i => i.id);
        expect(flat).toEqual(["review", "wizard", "overview", "exam"]);
    });
    it("limit 限制总条数", () => {
        const groups = filterPaletteCommands(cmds, "", 2);
        expect(flattenPaletteGroups(groups)).toHaveLength(2);
    });
    it("无命中返回空数组", () => {
        expect(filterPaletteCommands(cmds, "zzz")).toEqual([]);
    });
});

describe("flattenPaletteGroups", () => {
    it("组序 + 组内序", () => {
        const groups = filterPaletteCommands(cmds, "");
        expect(flattenPaletteGroups(groups).map(i => i.id)).toEqual(["review", "wizard", "overview", "exam"]);
    });
});
