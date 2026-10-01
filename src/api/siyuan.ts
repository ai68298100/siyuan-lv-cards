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

/** Markdown 创建文档，返回文档块 ID（快速制卡/示例卡落点） */
export const createDocWithMd = async (notebook: string, path: string, markdown: string): Promise<string | null> => {
    const resp = await fetchSyncPost("/api/filetree/createDocWithMd", { notebook, path, markdown });
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
    return (resp.data as string) ?? null;
};

/** 在指定父块下追加块（快速制卡问答对） */
export const appendBlock = async (dataType: "markdown", data: string, parentID: string): Promise<string[]> => {
    const resp = await fetchSyncPost("/api/block/insertBlock", { dataType, data, parentID });
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
    return (resp.data?.operations?.map((o: any) => o.id).filter(Boolean) ?? []) as string[];
};

/** 读块自定义属性（遮挡数据存于 lv-occlusion 属性） */
export const getBlockAttrs = async (id: string): Promise<Record<string, string>> => {
    const resp = await fetchSyncPost("/api/attr/getBlockAttrs", { id });
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
    return (resp.data ?? {}) as Record<string, string>;
};

/** 写块自定义属性 */
export const setBlockAttrs = async (id: string, attrs: Record<string, string>): Promise<void> => {
    const resp = await fetchSyncPost("/api/attr/setBlockAttrs", { id, attrs });
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
};
