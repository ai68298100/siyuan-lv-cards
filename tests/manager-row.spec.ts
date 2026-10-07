import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manager = readFileSync(resolve(import.meta.dirname, "../src/ui/manager.svelte"), "utf8");

describe("闪卡管理器行语义", () => {
    it("不把 checkbox 和打开文档按钮嵌入 role=button 行", () => {
        expect(manager).not.toMatch(/class="lv-row"\s+role="button"/);
        expect(manager).toContain('<button type="button" class="lv-row-main" onclick={() => openDetail(b)}>' );
        expect(manager).toContain('<button class="b3-button b3-button--small" onclick={(e: Event) => { e.stopPropagation(); openDoc(b); }}>');
    });

    it("每张卡的选择框有本地化的可访问名称", () => {
        expect(manager).toContain('aria-label={(t.manager.selectCard ?? "Select card ${id}").replace("${id}", b.id)}');
        const zh = readFileSync(resolve(import.meta.dirname, "../public/i18n/zh-CN.json"), "utf8");
        expect(zh).toContain('"selectCard": "选择卡片 ${id}"');
        const en = readFileSync(resolve(import.meta.dirname, "../public/i18n/en.json"), "utf8");
        expect(en).toContain('"selectCard": "Select card ${id}"');
    });
});
