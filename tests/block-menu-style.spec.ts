import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileString } from "sass";
import { afterEach, describe, expect, it } from "vitest";
import { BLOCK_MENU_ICON_CLASS } from "../src/bootstrap/block-menu";

afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
});

describe("block menu icon size containment (#12/#13)", () => {
    it("contains flashcard icons at 16px when a theme enlarges menu SVGs, without affecting other plugins", () => {
        const sheet = document.createElement("style");
        sheet.textContent = compileString(readFileSync(resolve(import.meta.dirname, "../src/index.scss"), "utf8")).css
            + ".b3-menu .b3-menu__icon { width: 96px; height: 96px; min-width: 96px; min-height: 96px; }";
        document.head.append(sheet);
        document.body.innerHTML = `<div class="b3-menu"><button class="b3-menu__item"><svg class="b3-menu__icon ${BLOCK_MENU_ICON_CLASS}"></svg><span>挖空并制卡</span></button><svg class="b3-menu__icon other-plugin-icon"></svg></div>`;

        const ours = document.querySelector(`.${BLOCK_MENU_ICON_CLASS}`)!;
        const style = getComputedStyle(ours);
        expect(style.width).toBe("16px");
        expect(style.height).toBe("16px");
        expect(style.minWidth).toBe("16px");
        expect(style.maxWidth).toBe("16px");
        expect(style.minHeight).toBe("16px");
        expect(style.maxHeight).toBe("16px");
        expect(style.flexGrow).toBe("0");
        expect(style.flexShrink).toBe("0");
        expect(style.flexBasis).toBe("16px");
        expect(getComputedStyle(document.querySelector(".other-plugin-icon")!).width).toBe("96px");
    });
});
