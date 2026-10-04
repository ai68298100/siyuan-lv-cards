/**
 * 通用思源 API（非 riff/V2 域）。
 */
import { fetchSyncPost } from "siyuan";
import { unwrapKernelData, dataStr } from "@/libs/kernel-response";

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
    return unwrapKernelData<Record<string, string>>(resp) ?? {};
};

/** BX-2 W2（v0.162.0）：更新块内容（markdown）。非 0 抛错，成功返回 true */
export const updateBlock = async (dataType: "markdown", data: string, id: string): Promise<boolean> => {
    const resp = await fetchSyncPost("/api/block/updateBlock", { dataType, data, id });
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
    return true;
};

/** 读块 DOM（AQ-20 统一入口）：非 0/字段缺失抛错，调用方 catch 后保留旧卡面 */
export const getBlockDOM = async (id: string): Promise<string> => {
    const resp = await fetchSyncPost("/api/block/getBlockDOM", { id });
    return dataStr(unwrapKernelData(resp), "dom");
};

/** 写块自定义属性 */
export const setBlockAttrs = async (id: string, attrs: Record<string, string>): Promise<void> => {
    const resp = await fetchSyncPost("/api/attr/setBlockAttrs", { id, attrs });
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
};

/** 导出文档为 Markdown（AI 向导「当前文档」源） */
export const exportMdContent = async (id: string): Promise<{ hPath: string; content: string }> => {
    const resp = await fetchSyncPost("/api/export/exportMdContent", { id });
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
    const d = resp.data ?? {};
    return { hPath: String(d.hPath ?? ""), content: String(d.content ?? "") };
};

/** SQL 查询（只读；AI 向导笔记本范围源用） */
export const sqlQuery = async (stmt: string): Promise<Record<string, unknown>[]> => {
    const resp = await fetchSyncPost("/api/query/sql", { stmt });
    if (!resp || resp.code !== 0) {
        throw new Error(resp?.msg || `kernel error (code=${resp?.code ?? "unknown"})`);
    }
    return (resp.data ?? []) as Record<string, unknown>[];
};

export interface BlockDocInfo {
    rootID: string;
    notebookID: string;
}

/** 块 → 文档归属映射（AQ-12 文档维度）：分块 IN 查询，查不到的块不在 Map 中（缺失口径） */
export const getBlockDocMap = async (blockIDs: string[]): Promise<Map<string, BlockDocInfo>> => {
    const out = new Map<string, BlockDocInfo>();
    for (let i = 0; i < blockIDs.length; i += 400) {
        const chunk = blockIDs.slice(i, i + 400).map(id => `'${id.replace(/'/g, "''")}'`).join(",");
        const rows = await sqlQuery(`SELECT id, root_id, box FROM blocks WHERE id IN (${chunk})`);
        for (const r of rows) {
            out.set(String(r.id), { rootID: String(r.root_id ?? ""), notebookID: String(r.box ?? "") });
        }
    }
    return out;
};

/** 文档 ID → 标题（根块 content 首行；空标题由调用方回退展示文档 ID） */
export const getDocTitles = async (docIDs: string[]): Promise<Map<string, string>> => {
    const out = new Map<string, string>();
    for (let i = 0; i < docIDs.length; i += 400) {
        const chunk = docIDs.slice(i, i + 400).map(id => `'${id.replace(/'/g, "''")}'`).join(",");
        const rows = await sqlQuery(`SELECT id, content FROM blocks WHERE id IN (${chunk})`);
        for (const r of rows) {
            out.set(String(r.id), String(r.content ?? "").split("\n")[0].trim());
        }
    }
    return out;
};

/** 思源内核版本号（自诊断用） */
export const kernelVersion = async (): Promise<string> => {
    const resp = await fetchSyncPost("/api/system/version", {});
    return String(resp?.data ?? "?");
};
