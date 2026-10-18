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

    it.each([
        ["自身 display:none", '<input type="file" style="display:none" />'],
        ["祖先 display:none", '<div style="display:none"><button>隐藏</button></div>'],
        ["样式表隐藏祖先", '<style>.hidden-wrapper{display:none}</style><div class="hidden-wrapper"><button>隐藏</button></div>'],
        ["自身 hidden", '<button hidden>隐藏</button>'],
        ["祖先 hidden", '<div hidden><button>隐藏</button></div>'],
        ["自身 inert", '<button inert>不可交互</button>'],
        ["祖先 inert", '<div inert><button>不可交互</button></div>'],
        ["自身 visibility:hidden", '<button style="visibility:hidden">隐藏</button>'],
        ["继承 visibility:hidden", '<div style="visibility:hidden"><button>隐藏</button></div>'],
        ["visibility:collapse", '<button style="visibility:collapse">隐藏</button>'],
        ["其他负 tabindex", '<button tabindex="-2">负索引</button>'],
        ["带 tabindex 的禁用控件", '<button disabled tabindex="0">禁用</button>'],
        ["带 tabindex 的隐藏类型", '<input type="hidden" tabindex="0" />'],
    ])("getFocusable：跳过%s，保留两侧可见控件", (_name, markup) => {
        container.innerHTML = `<button id="before">前</button>${markup}<button id="after">后</button>`;
        expect(getFocusable(container).map(el => el.id)).toEqual(["before", "after"]);
    });

    it("容器外的隐藏祖先同样阻止进入焦点顺序", () => {
        const wrapper = document.createElement("div");
        wrapper.style.display = "none";
        document.body.appendChild(wrapper);
        wrapper.appendChild(container);
        expect(getFocusable(container)).toEqual([]);
        wrapper.style.display = "block";
        expect(getFocusable(container).map(el => el.id)).toEqual(["a", "b", "e", "f"]);
    });

    it("保留 display:contents 内控件、显式恢复 visibility 的后代及仅语义禁用的控件", () => {
        container.innerHTML = `
            <div style="display:contents"><button id="contents">可见</button></div>
            <div style="visibility:hidden"><button id="visible" style="visibility:visible">可见</button></div>
            <input id="readonly" readonly />
            <button id="transparent" style="opacity:0">透明但可聚焦</button>
            <button id="aria-disabled" aria-disabled="true">语义禁用</button>
            <div id="generic" disabled tabindex="0">非表单元素</div>
        `;
        expect(getFocusable(container).map(el => el.id)).toEqual([
            "contents", "visible", "readonly", "transparent", "aria-disabled", "generic",
        ]);
    });

    it("禁用 fieldset 仅保留首个 legend 内控件及链接，嵌套禁用仍生效", () => {
        container.innerHTML = `
            <fieldset disabled>
                <legend><button id="legend">首图例</button>
                    <fieldset disabled><legend><button id="nested-legend">嵌套首图例</button></legend>
                        <input id="nested-disabled" />
                    </fieldset>
                </legend>
                <input id="disabled-input" tabindex="0" />
                <button id="disabled-button">禁用</button>
                <select id="disabled-select"><option>1</option></select>
                <textarea id="disabled-textarea"></textarea>
                <legend><button id="second-legend">第二图例</button></legend>
                <a id="link" href="#">仍可聚焦的链接</a>
            </fieldset>
            <button id="after">后</button>
        `;
        expect(getFocusable(container).map(el => el.id)).toEqual(["legend", "nested-legend", "link", "after"]);
    });

    it("真实 Tab 与 Shift+Tab 跳过隐藏文件控件，显示后恢复可达，释放后归还宿主", () => {
        container.innerHTML = '<button id="before">前</button><input id="file" type="file" hidden /><button id="after">后</button>';
        const file = container.querySelector<HTMLInputElement>("#file")!;
        const pressTab = (shiftKey = false) => {
            const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
            document.activeElement!.dispatchEvent(event);
            return event;
        };
        const trap = trapFocus(container);
        expect(document.activeElement?.id).toBe("before");
        expect(pressTab().defaultPrevented).toBe(true);
        expect(document.activeElement?.id).toBe("after");
        pressTab(true);
        expect(document.activeElement?.id).toBe("before");
        file.hidden = false;
        pressTab();
        expect(document.activeElement).toBe(file);
        pressTab();
        expect(document.activeElement?.id).toBe("after");
        pressTab(true);
        expect(document.activeElement).toBe(file);
        trap.release();
        expect(document.activeElement).toBe(host);
        const released = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
        container.querySelector("#before")!.dispatchEvent(released);
        expect(released.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(host);
    });

    it("当前控件变为隐藏后，Shift+Tab 从剩余可见控件末尾恢复", () => {
        const trap = trapFocus(container);
        const input = container.querySelector<HTMLInputElement>("#b")!;
        input.focus();
        input.hidden = true;
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
        expect(document.activeElement?.id).toBe("f");
        trap.release();
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

    it.each([
        { key: "Escape", shiftKey: false },
        { key: "Tab", shiftKey: false },
        { key: "Tab", shiftKey: true },
    ])("输入法组合期间不拦截 $key（Shift=$shiftKey），结束后恢复正常键盘流", ({ key, shiftKey }) => {
        let escapes = 0;
        const trap = trapFocus(container, { onEscape: () => { escapes += 1; } });
        const input = container.querySelector<HTMLInputElement>("#b")!;
        input.focus();

        for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
            const event = new KeyboardEvent("keydown", {
                key,
                shiftKey,
                bubbles: true,
                cancelable: true,
                ...composition,
            });
            // 从真实输入元素发出，先经过祖先的捕获监听，再冒泡；避免只测容器自身事件。
            input.dispatchEvent(event);
            expect(escapes).toBe(0);
            expect(event.defaultPrevented).toBe(false);
            expect(document.activeElement).toBe(input);
        }

        const regular = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
        input.dispatchEvent(regular);
        if (key === "Escape") {
            expect(escapes).toBe(1);
            expect(document.activeElement).toBe(input);
        } else {
            expect(document.activeElement?.id).toBe(shiftKey ? "a" : "e");
            expect(regular.defaultPrevented).toBe(true);
        }
        trap.release();
        expect(document.activeElement).toBe(host);
        const released = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
        input.dispatchEvent(released);
        expect(escapes).toBe(key === "Escape" ? 1 : 0);
        expect(released.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(host);
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
