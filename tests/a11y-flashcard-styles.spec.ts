import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const indexScss = readFileSync(resolve(import.meta.dirname, "../src/index.scss"), "utf8");

describe("小驴闪卡 · 无障碍与高对比度样式规范 (Epoch 5)", () => {
    it("声明完整的 forced-colors: active 系统颜色与变量映射", () => {
        expect(indexScss).toMatch(/@media\s*\(forced-colors:\s*active\)/);
        expect(indexScss).toMatch(/--lv-color-brand:\s*Highlight/);
        expect(indexScss).toMatch(/--lv-color-on-brand:\s*HighlightText/);
        expect(indexScss).toMatch(/--lv-color-text:\s*CanvasText/);
        expect(indexScss).toMatch(/--lv-color-text-muted:\s*CanvasText/);
        expect(indexScss).toMatch(/--lv-color-canvas:\s*Canvas/);
        expect(indexScss).toMatch(/--lv-color-surface:\s*Canvas/);
        expect(indexScss).toMatch(/--lv-shadow-panel:\s*none/);
    });

    it("forced-colors 模式下卡片、按钮与输入件明确 1px CanvasText 边框", () => {
        expect(indexScss).toMatch(/border:\s*1px\s+solid\s+CanvasText;/);
        expect(indexScss).toMatch(/\.lv-card/);
        expect(indexScss).toMatch(/\.b3-button/);
        expect(indexScss).toMatch(/\.b3-text-field/);
        expect(indexScss).toMatch(/\.lv-mini-track/);
    });

    it("forced-colors 模式下弹窗容器强化为 2px CanvasText 边框并重置背景", () => {
        expect(indexScss).toMatch(/\.b3-dialog__container[\s\S]*border:\s*2px\s+solid\s+CanvasText;\s*background:\s*Canvas;/);
    });

    it("forced-colors 模式下主按钮与激活态元素采用 Highlight 填充与 HighlightText 前景", () => {
        expect(indexScss).toMatch(/background:\s*Highlight\s*!important;\s*color:\s*HighlightText\s*!important;\s*border:\s*1px\s+solid\s+Highlight\s*!important;/);
        expect(indexScss).toMatch(/\.lv-tab\.active/);
        expect(indexScss).toMatch(/\.lv-seg-item\.active/);
    });

    it("forced-colors 模式下保留关键状态指示器 forced-color-adjust: none", () => {
        expect(indexScss).toMatch(/forced-color-adjust:\s*none;/);
        expect(indexScss).toMatch(/\.lv-status-dot/);
        expect(indexScss).toMatch(/\.lv-rating-btn/);
        expect(indexScss).toMatch(/input\[type="checkbox"\]\.b3-switch/);
    });

    it("键盘焦点环 focus-visible 具有明确的 Highlight 与 outline-color", () => {
        expect(indexScss).toMatch(/:where\(button,\s*a,\s*input,\s*select,\s*textarea,\s*\[tabindex="0"\]\):focus-visible/);
        expect(indexScss).toMatch(/outline:\s*2px\s+solid\s+Highlight\s*!important;/);
        expect(indexScss).toMatch(/outline-color:\s*Highlight\s*!important;/);
        expect(indexScss).toMatch(/outline-offset:\s*2px;/);
    });

    it("声明 prefers-contrast: more 强化聚焦边界与粗体区分", () => {
        expect(indexScss).toMatch(/@media\s*\(prefers-contrast:\s*more\)/);
        expect(indexScss).toMatch(/outline:\s*3px\s+solid\s+var\(--b3-theme-primary\);/);
        expect(indexScss).toMatch(/outline-offset:\s*2px;/);
        expect(indexScss).toMatch(/font-weight:\s*700;/);
    });
});
