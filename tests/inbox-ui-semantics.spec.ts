import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const inbox = readFileSync(resolve(import.meta.dirname, "../src/ui/inbox-page.svelte"), "utf8");

describe("材料收件箱行语义", () => {
    it("把材料标题区域暴露为可键盘触发的按钮，避免依赖行点击", () => {
        expect(inbox).toContain('<div class="lv-row">');
        expect(inbox).toContain('<button type="button" class="lv-content" onclick={() => toggle(item.blockID)}>');
        expect(inbox).not.toContain('role="presentation" onclick={() => toggle(item.blockID)}');
    });

    it("每条材料的选择框和来源按钮都有可访问名称", () => {
        expect(inbox).toContain('aria-label={t.selectItem}');
        expect(inbox).toContain('title={t.openSource}');
    });
});
