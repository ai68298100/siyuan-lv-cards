/**
 * 统一确认弹窗（Kit·344）：confirmDialog 的 Promise 化封装——
 * await lvConfirm({...}) 得到布尔值，替代回调嵌套。
 */
import { confirmDialog } from "@/libs/dialog";

export interface LvConfirmArgs {
    title: string;
    /** 纯文本或 HTML 片段（调用方负责转义用户输入） */
    content: string;
    width?: string;
}

export function lvConfirm(args: LvConfirmArgs): Promise<boolean> {
    return new Promise((resolve) => {
        confirmDialog({
            title: args.title,
            content: args.content,
            width: args.width,
            confirm: () => resolve(true),
            cancel: () => resolve(false),
        });
    });
}
