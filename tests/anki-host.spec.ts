import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectSqlite } from "../src/api/anki-host";

const settings = readFileSync(resolve(import.meta.dirname, "../src/ui/settings.svelte"), "utf8");

describe("Anki 导入宿主能力探测", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("没有 Node require 时报告不可用", () => {
        vi.stubGlobal("require", undefined);
        expect(detectSqlite()).toEqual({ available: false, reason: "当前环境无 Node require（非桌面端）" });
    });

    it("Node 存在但没有 node:sqlite 时报告原因", () => {
        vi.stubGlobal("require", () => ({}));
        expect(detectSqlite()).toEqual({ available: false, reason: "宿主 Node 缺少 node:sqlite（需较新思源桌面版）" });
    });

    it("存在 DatabaseSync 时允许本地导入", () => {
        vi.stubGlobal("require", (name: string) => name === "node:sqlite" ? { DatabaseSync: class {} } : {});
        expect(detectSqlite()).toEqual({ available: true });
    });

    it("设置页只在宿主可用时显示文件选择器", () => {
        expect(settings).toContain("{#if ankiHost.available}");
        expect(settings).toContain("t.settings.ankiImportNoSqlite");
        expect(settings).toContain('role="status"');
    });
});
