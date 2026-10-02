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

    const btnsElement = dialog.element.querySelectorAll(".b3-button");
    btnsElement[0].addEventListener("click", () => {
        if (cancel) {
            cancel(target);
        }
        dialog.destroy();
    });
    btnsElement[1].addEventListener("click", () => {
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
    let componentInstance: ReturnType<typeof mount> | null = null;

    const doUnmount = () => {
        if (unmounted || !componentInstance) {
            return;
        }
        unmounted = true;
        try {
            unmount(componentInstance);
        } catch { /* 已卸载 */ }
    };

    const closeOnce = () => {
        if (destroyed) {
            return;
        }
        destroyed = true;
        if (dialogHandle) {
            try {
                dialogHandle.destroy(); // destroyCallback 内完成 unmount + 业务 callback
            } catch {
                doUnmount();
            }
        } else {
            doUnmount();
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

    // 内部处理 mount
    componentInstance = mount(args.component, {
        target: container,
        props,
    });

    const { dialog } = simpleDialog({
        title: args.title,
        ele: container,
        width: args.width,
        height: args.height,
        callback: () => {
            destroyed = true;
            doUnmount();
            restoreFocus();
            if (args.callback) args.callback();
        }
    });
    dialogHandle = dialog;

    return {
        component: componentInstance,
        dialog,
        close: closeOnce
    }
}
