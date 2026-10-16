import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manager = readFileSync(resolve(import.meta.dirname, "../src/ui/manager.svelte"), "utf8");

describe("闪卡管理器行语义", () => {
    it("不把 checkbox 和打开文档按钮嵌入 role=button 行", () => {
        expect(manager).not.toMatch(/class="lv-row"\s+role="button"/);
        expect(manager).toContain('<button');
        expect(manager).toContain('type="button"');
        expect(manager).toContain('class="lv-row-main"');
        expect(manager).toContain('onclick={() => openDetail(b)}');
        expect(manager).toContain('<button class="b3-button b3-button--small" onclick={(e: Event) => { e.stopPropagation(); openDoc(b); }}>');
    });

    it("每张卡的选择框有本地化的可访问名称", () => {
        expect(manager).toContain('aria-label={(t.manager.selectCard ?? "Select card ${id}").replace("${id}", b.id)}');
        const zh = readFileSync(resolve(import.meta.dirname, "../public/i18n/zh-CN.json"), "utf8");
        expect(zh).toContain('"selectCard": "选择卡片 ${id}"');
        const en = readFileSync(resolve(import.meta.dirname, "../public/i18n/en.json"), "utf8");
        expect(en).toContain('"selectCard": "Select card ${id}"');
    });

    it("管理器搜索框始终提供本地化的可访问名称", () => {
        expect(manager).toContain('aria-label={t.manager.filterLabel}');
        const zh = readFileSync(resolve(import.meta.dirname, "../public/i18n/zh-CN.json"), "utf8");
        expect(zh).toContain('"filterLabel": "搜索当前卡片库"');
        const en = readFileSync(resolve(import.meta.dirname, "../public/i18n/en.json"), "utf8");
        expect(en).toContain('"filterLabel": "Search the current card library"');
    });

    it("主行提供键盘导航、删除快捷键和可见的快捷键语义", () => {
        expect(manager).toContain("{#each filteredBlocks as b, rowIndex (b.id)}");
        expect(manager).toContain("onkeydown={(event) => onRowKeydown(event, b, rowIndex)}");
        expect(manager).toContain('aria-keyshortcuts="ArrowUp ArrowDown Delete Enter"');
        expect(manager).toContain("event.key === \"ArrowUp\" || event.key === \"ArrowDown\"");
        expect(manager).toContain('event.key === "Enter"');
        expect(manager).toContain('event.key === "Delete"');
        expect(manager).toContain("focusRowAt(Math.min(rowIndex, filteredBlocks.length - 1))");
    });

    it("单卡删除文案在中英文资源中保持一致", () => {
        const zh = JSON.parse(readFileSync(resolve(import.meta.dirname, "../public/i18n/zh-CN.json"), "utf8"));
        const en = JSON.parse(readFileSync(resolve(import.meta.dirname, "../public/i18n/en.json"), "utf8"));
        for (const key of ["deleteCard", "deleteConfirm", "deleteDone"]) {
            expect(typeof zh.manager[key]).toBe("string");
            expect(typeof en.manager[key]).toBe("string");
            expect(zh.manager[key].length).toBeGreaterThan(0);
            expect(en.manager[key].length).toBeGreaterThan(0);
        }
    });

    it("搜索、状态与遗忘卡筛选变更回到第 1 页并重新加载", () => {
        expect(manager).toMatch(/deferredFilter = nextFilter;[\s\S]*?page = 1;[\s\S]*?filterDirty = false;\s*void load\(\);/);
        expect(manager).toContain("oninput={() => { selected = []; filterDirty = true; }}");
        expect(manager).toMatch(/function applyStatusFilter\(event: Event\)[\s\S]*?page = 1;[\s\S]*?selected = \[\];\s*void onStatusChange\(\);/);
        expect(manager).toMatch(/function toggleLeechFilter\(\)[\s\S]*?leechOnly = !leechOnly;[\s\S]*?page = 1;[\s\S]*?void load\(\);/);
        expect(manager).toContain("onchange={applyStatusFilter}");
        expect(manager).toContain("onclick={toggleLeechFilter}");
    });

    it("筛选空态说明只检查已加载页，删除保存筛选不改搜索词", () => {
        expect(manager).toContain("当前页无匹配项，筛选仅作用于已加载页");
        const deleteSaved = manager.slice(manager.indexOf("function deleteSaved()"), manager.indexOf("</script>"));
        expect(deleteSaved).toContain("ctx.deleteFilter(name)");
        expect(deleteSaved).not.toContain("filterText = \"\"");
    });
});
