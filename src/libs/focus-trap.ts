/**
 * AS-1 真模态焦点陷阱（纯 DOM 工具，happy-dom 可单测）。
 * WAI-ARIA Dialog 口径：打开时焦点移入（首个可聚焦元素）、Tab/Shift+Tab 在容器内循环、
 * Esc 触发关闭回调、释放时归还焦点到打开前宿主。
 * 边界口径：本模块只管焦点行为，不做任何关闭/销毁——关闭语义归调用方（libs/dialog 已有
 * AR-2 关闭一次性与焦点归还；svelteDialog 接线时 restoreOnRelease=false 防双重归还）。
 */

const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

/** 容器内可聚焦元素（文档序）；排除 disabled/负 tabindex（属性排除在代码层做——happy-dom 属性选择器口径不一） */
export function getFocusable(container: HTMLElement): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
        .filter(el => el.getAttribute("tabindex") !== "-1");
}

export interface TrapOptions {
    /** Esc 触发（本模块只回调，不执行关闭） */
    onEscape?: () => void;
    /** 释放时归还焦点到打开前宿主（默认 true；libs/dialog 自带归还时传 false 防双重） */
    restoreOnRelease?: boolean;
}

export interface FocusTrap {
    release: () => void;
}

/**
 * 捕获容器内焦点：记打开前宿主 → 焦点移入首个可聚焦元素 → Tab 循环（Shift 反向）→
 * Esc 回调；release 移除监听并按选项归还焦点。重复 release 幂等。
 */
export function trapFocus(container: HTMLElement, opts: TrapOptions = {}): FocusTrap {
    const restoreOnRelease = opts.restoreOnRelease !== false;
    let prevFocus: HTMLElement | null = null;
    try {
        prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } catch { /* 旁路 */ }

    const focusables = () => getFocusable(container);
    // 焦点移入：优先首元素；无可聚焦元素时聚焦容器本身（需 tabindex=-1 才可靠，尽力而为）
    const first = focusables()[0];
    try {
        (first ?? container).focus({ preventScroll: true });
    } catch { /* 聚焦旁路 */ }

    const onKeydown = (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === "Escape") {
            opts.onEscape?.();
            return;
        }
        if (ke.key !== "Tab") {
            return;
        }
        const items = focusables();
        if (items.length === 0) {
            // 无可聚焦元素：吃掉 Tab 防焦点逃逸
            ke.preventDefault();
            return;
        }
        const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const idx = current ? items.indexOf(current) : -1;
        const delta = ke.shiftKey ? -1 : 1;
        const next = items[(idx + delta + items.length) % items.length];
        ke.preventDefault();
        try {
            next.focus({ preventScroll: true });
        } catch { /* 聚焦旁路 */ }
    };

    container.addEventListener("keydown", onKeydown, true);
    let released = false;
    return {
        release: () => {
            if (released) {
                return;
            }
            released = true;
            container.removeEventListener("keydown", onKeydown, true);
            if (restoreOnRelease && prevFocus && document.contains(prevFocus)) {
                try {
                    prevFocus.focus({ preventScroll: true });
                } catch { /* 归还旁路 */ }
            }
        },
    };
}
