import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getFocusable, trapFocus } from "../src/libs/focus-trap";

// AS-1 真模态焦点陷阱：焦点移入、Tab 循环（Shift 反向）、Esc 回调、释放归还、幂等 release
describe("focus-trap（AS-1）", () => {
    let host: HTMLButtonElement;
    let container: HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = "";
        host = document.createElement("button");
        host.textContent = "宿主按钮";
        document.body.appendChild(host);
        host.focus();
        container = document.createElement("div");
        container.innerHTML = `
            <button id="a">A</button>
            <input id="b" type="text" />
            <button id="c" disabled>禁用</button>
            <button id="d" tabindex="-1">负 tabindex</button>
            <select id="e"><option>1</option></select>
            <button id="f">F</button>
        `;
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("getFocusable：排除 disabled 与负 tabindex，文档序返回", () => {
        const ids = getFocusable(container).map(el => el.id);
        expect(ids).toEqual(["a", "b", "e", "f"]);
    });

    it("捕获即移入首个可聚焦元素；Tab 循环到下一元素并阻止默认", () => {
        const trap = trapFocus(container);
        expect(document.activeElement?.id).toBe("a");
        const next = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
        container.dispatchEvent(next);
        expect(document.activeElement?.id).toBe("b");
        expect(next.defaultPrevented).toBe(true);
        trap.release();
    });

    it("Tab 到末尾回绕首元素；Shift+Tab 反向回绕", () => {
        const trap = trapFocus(container);
        (container.querySelector("#f") as HTMLElement).focus();
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
        expect(document.activeElement?.id).toBe("a"); // 末→首
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
        expect(document.activeElement?.id).toBe("f"); // 首→末（反向）
        trap.release();
    });

    it("焦点在容器外时 Tab 从首个开始（当前元素不在列表）", () => {
        const trap = trapFocus(container);
        (document.querySelector("#b") as HTMLInputElement).blur();
        (host as HTMLElement).focus();
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
        expect(document.activeElement?.id).toBe("a"); // idx=-1 → delta=+1 → 首个
        trap.release();
    });

    it("Esc 只回调不关闭；非 Tab/Esc 键不拦截", () => {
        let escapes = 0;
        const trap = trapFocus(container, { onEscape: () => { escapes += 1; } });
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        expect(escapes).toBe(1);
        const other = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
        container.dispatchEvent(other);
        expect(other.defaultPrevented).toBe(false);
        trap.release();
        container.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        expect(escapes).toBe(1); // release 后监听移除
    });

    it("release 归还焦点到打开前宿主；restoreOnRelease=false 不归还；幂等", () => {
        const trap = trapFocus(container);
        trap.release();
        expect(document.activeElement).toBe(host);
        trap.release(); // 幂等：第二次无害
        expect(document.activeElement).toBe(host);

        const trap2 = trapFocus(container, { restoreOnRelease: false });
        trap2.release();
        expect(document.activeElement).not.toBe(host);
    });

    it("无可聚焦容器：Tab 被吃掉防逃逸，焦点尝试落到容器本身不抛错", () => {
        const empty = document.createElement("div");
        document.body.appendChild(empty);
        const trap = trapFocus(empty, { restoreOnRelease: false });
        const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
        empty.dispatchEvent(tab);
        expect(tab.defaultPrevented).toBe(true);
        trap.release();
    });
});
