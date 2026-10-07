/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/libs/dialog.ts
 * @LastEditTime : 2025-08-16 15:39:48
 * @Description  : Kits about dialogs
 */
import { Dialog } from "siyuan";
import { Component, mount, unmount } from "svelte";
import { trapFocus, type FocusTrap } from "./focus-trap";

/**
 * AT-17（v0.174.0）：对话框组件挂载器注入点。
 * dialogs chunk 自带 svelte（组件与挂载同实例，避免与 shell 双份内部状态 split-brain）；
 * chunk 加载后由 shell 安装 mounter，svelteDialog 经其挂载 chunk 编译的组件。
 * 未安装时回退 shell 自有 svelte（dev 模式进程内组件）。
 */
export type DialogMounter = (
    comp: Component<any>,
    target: HTMLElement,
    props: Record<string, any>
) => { destroy: () => void };
let dialogMounter: DialogMounter | null = null;
export function setDialogMounter(m: DialogMounter): void {
    dialogMounter = m;
}
function mountDialog(comp: Component<any>, target: HTMLElement, props: Record<string, any>): { destroy: () => void } {
    if (dialogMounter) {
        return dialogMounter(comp, target, props);
    }
    const app = mount(comp, { target, props });
    return { destroy: () => { void unmount(app); } };
}

interface IConfirmDialogArgs {
    title: string;
    content: string | HTMLElement;
    confirm?: (ele?: HTMLElement) => void;
    cancel?: (ele?: HTMLElement) => void;
    width?: string;
    height?: string;
}

export const confirmDialog = (args: IConfirmDialogArgs) => {
    const { title, content, confirm, cancel, width, height } = args;

    const dialog = new Dialog({
        title,
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword">
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`,
        width: width,
        height: height
    });

    const target: HTMLElement = dialog.element.querySelector(".b3-dialog__content>div.ft__breakword");
    if (typeof content === "string") {
        target.innerHTML = content;
    } else {
        target.appendChild(content);
    }

    // AS-1：确认框捕获焦点（Tab 循环 + Esc 关闭 + 关闭后归还宿主焦点）
    const trap = trapFocus(dialog.element, { onEscape: () => dialog.destroy() });

    const btnsElement = dialog.element.querySelectorAll(".b3-button");
    btnsElement[0].addEventListener("click", () => {
        trap.release();
        if (cancel) {
            cancel(target);
        }
        dialog.destroy();
    });
    btnsElement[1].addEventListener("click", () => {
        trap.release();
        if (confirm) {
            confirm(target);
        }
        dialog.destroy();
    });
};


/** 布尔化确认框：true=确认，false=取消（重复提示等需要分支的流程用） */
export const confirmDialogBool = (args: Omit<IConfirmDialogArgs, "confirm" | "cancel">) =>
    new Promise<boolean>((resolve) => {
        confirmDialog({ ...args, confirm: () => resolve(true), cancel: () => resolve(false) });
    });


export const simpleDialog = (args: {
    title: string, ele: HTMLElement | DocumentFragment,
    width?: string, height?: string,
    callback?: () => void;
}) => {
    const dialog = new Dialog({
        title: args.title,
        content: `<div class="dialog-content" style="display: flex; height: 100%;"/>`,
        width: args.width,
        height: args.height,
        destroyCallback: args.callback
    });
    dialog.element.querySelector(".dialog-content").appendChild(args.ele);
    return {
        dialog,
        close: dialog.destroy.bind(dialog)
    };
}


export const svelteDialog = (args: {
    title: string,
    component: Component<any>, // Svelte 5 component constructor
    props?: Record<string, any>,
    width?: string,
    height?: string,
    callback?: () => void;
}) => {
    // AR-2：打开前记焦点宿主，关闭（任意路径）后归还——键盘流不因弹窗丢焦
    let prevFocus: HTMLElement | null = null;
    try {
        prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } catch { /* 旁路 */ }
    const restoreFocus = () => {
        try {
            if (prevFocus && document.contains(prevFocus)) {
                prevFocus.focus();
            }
        } catch { /* 焦点归还旁路 */ }
    };

    // AR-2：关闭一次性——宿主 X / Esc / 内嵌组件回调并发时只销毁一次
    let destroyed = false;
    let unmounted = false;
    let dialogHandle: { destroy: () => void } | null = null;
    let componentInstance: unknown = null;
    /** AS-1：对话框焦点陷阱（Tab 循环/Esc）；释放归 dialog.ts 既有 restoreFocus（防双重归还传 false） */
    let focusTrap: FocusTrap | null = null;

    // 组件销毁统一出口：chunk mounter 句柄（.destroy）或 shell svelte 实例（unmount）
    const destroyComponent = () => {
        if (unmounted || !componentInstance) {
            return;
        }
        unmounted = true;
        try {
            if (dialogMounter) {
                (componentInstance as { destroy: () => void }).destroy();
            } else {
                unmount(componentInstance as ReturnType<typeof mount>);
            }
        } catch { /* 已卸载 */ }
    };

    const closeOnce = () => {
        if (destroyed) {
            return;
        }
        destroyed = true;
        focusTrap?.release();
        if (dialogHandle) {
            try {
                dialogHandle.destroy(); // destroyCallback 内完成 unmount + 业务 callback
            } catch {
                destroyComponent();
            }
        } else {
            destroyComponent();
        }
        restoreFocus();
    };

    // AR-2：把可用的关闭动作注入内嵌组件的 onClose/onExit（mount 前包装）——
    // 此前调用方传的是空 stub，组件内部「取消/完成/导入成功」根本关不掉对话框；
    // 先执行调用方回调（持久化等语义），再关闭一次
    const props = { ...(args.props || {}) };
    for (const key of ["onClose", "onExit"]) {
        const userFn = props[key];
        if (typeof userFn === "function") {
            props[key] = (...fnArgs: unknown[]) => {
                try {
                    userFn(...fnArgs);
                } finally {
                    closeOnce();
                }
            };
        }
    }

    let container = document.createElement('div')
    container.style.display = 'contents';

    // 内部处理 mount（chunk mounter 已安装时用 chunk 的 svelte 实例挂载）
    componentInstance = mountDialog(args.component, container, props);

    const { dialog } = simpleDialog({
        title: args.title,
        ele: container,
        width: args.width,
        height: args.height,
        callback: () => {
            destroyed = true;
            focusTrap?.release();
            destroyComponent();
            restoreFocus();
            if (args.callback) args.callback();
        }
    });
    dialogHandle = dialog;
    // 样式作用域（R52）：插件对话框挂 lv-dialog，供 index.scss 做按钮语义中性化与滚动条
    dialog.element.classList.add("lv-dialog");
    // AS-1：焦点捕获（Esc→closeOnce 一次性；归还走既有 restoreFocus）
    focusTrap = trapFocus(dialog.element, { onEscape: closeOnce, restoreOnRelease: false });

    return {
        component: componentInstance,
        dialog,
        close: closeOnce
    }
}
