/**
 * 通用思源 API（非 riff/V2 域）。
 */
import { fetchSyncPost } from "siyuan";

export interface Notebook {
    id: string;
    name: string;
}

/** 已打开的笔记本列表（供复习范围选择；加密本由内核在拉卡时报错，这里不做前置过滤——AA 组另测） */
export const getNotebooks = async (): Promise<Notebook[]> => {
    const resp = await fetchSyncPost("/api/notebook/lsNotebooks", {});
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
    const boxes: any[] = resp.data?.notebooks ?? [];
    return boxes.filter(b => !b.closed).map(b => ({ id: b.id as string, name: b.name as string }));
};
