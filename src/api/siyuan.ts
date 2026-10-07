/**
 * 通用思源 API（非 riff/V2 域）。
 */
import { fetchSyncPost } from "siyuan";
import { dataStr } from "@/libs/kernel-response";
import { requestKernelData } from "@/libs/kernel-request";
import { mapChunksOrdered } from "@/core/query-chunks";

/** 通用内核请求上限：避免文档/DOM/SQL 请求永久挂起。 */
export const SIYUAN_API_TIMEOUT_MS = 15000;

/** SQL IN 查询分块与并发上限，避免大批量卡片刷新时串行放大等待时间。 */
export const SQL_QUERY_CHUNK_SIZE = 400;
export const SQL_QUERY_CONCURRENCY = 3;

async function kernelPost<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
    return requestKernelData<T>(fetchSyncPost, endpoint, payload, SIYUAN_API_TIMEOUT_MS);
}

export interface Notebook {
    id: string;
    name: string;
}

/** 已打开的笔记本列表（供复习范围选择；加密本由内核在拉卡时报错，这里不做前置过滤——AA 组另测） */
export const getNotebooks = async (): Promise<Notebook[]> => {
    const data = await kernelPost<{ notebooks?: any[] }>("/api/notebook/lsNotebooks", {});
    const boxes: any[] = data?.notebooks ?? [];
    return boxes.filter(b => !b.closed).map(b => ({ id: b.id as string, name: b.name as string }));
};

/** 创建笔记本（Anki 导入落点；同名已存在时内核报错由调用方处理） */
export const createNotebook = async (name: string): Promise<string | null> => {
    const d: any = await kernelPost("/api/notebook/createNotebook", { name });
    return d?.notebook?.id ?? d?.notebook ?? d?.id ?? null;
};

/** Markdown 创建文档，返回文档块 ID（快速制卡/示例卡落点） */
export const createDocWithMd = async (notebook: string, path: string, markdown: string): Promise<string | null> => {
    return (await kernelPost<string | null>("/api/filetree/createDocWithMd", { notebook, path, markdown })) ?? null;
};

/** 在指定父块下追加块（快速制卡问答对） */
export const appendBlock = async (dataType: "markdown", data: string, parentID: string): Promise<string[]> => {
    const body = await kernelPost<{ operations?: { id?: string }[] }>("/api/block/insertBlock", { dataType, data, parentID });
    return (body?.operations?.map(o => o.id).filter(Boolean) ?? []) as string[];
};

/** 读块自定义属性（遮挡数据存于 lv-occlusion 属性） */
export const getBlockAttrs = async (id: string): Promise<Record<string, string>> => {
    return await kernelPost<Record<string, string>>("/api/attr/getBlockAttrs", { id }) ?? {};
};

/** BX-2 W2（v0.162.0）：更新块内容（markdown）。非 0 抛错，成功返回 true */
export const updateBlock = async (dataType: "markdown", data: string, id: string): Promise<boolean> => {
    await kernelPost<unknown>("/api/block/updateBlock", { dataType, data, id });
    return true;
};

/** 读块 DOM（AQ-20 统一入口）：非 0/字段缺失抛错，调用方 catch 后保留旧卡面 */
export const getBlockDOM = async (id: string): Promise<string> => {
    return dataStr(await kernelPost<Record<string, unknown>>("/api/block/getBlockDOM", { id }), "dom");
};

/** 写块自定义属性 */
export const setBlockAttrs = async (id: string, attrs: Record<string, string>): Promise<void> => {
    await kernelPost<unknown>("/api/attr/setBlockAttrs", { id, attrs });
};

/** 导出文档为 Markdown（AI 向导「当前文档」源） */
export const exportMdContent = async (id: string): Promise<{ hPath: string; content: string }> => {
    const d = (await kernelPost<Record<string, unknown>>("/api/export/exportMdContent", { id })) ?? {};
    return { hPath: String(d.hPath ?? ""), content: String(d.content ?? "") };
};

/** SQL 查询（只读；AI 向导笔记本范围源用） */
export const sqlQuery = async (stmt: string): Promise<Record<string, unknown>[]> => {
    return (await kernelPost<Record<string, unknown>[]>("/api/query/sql", { stmt })) ?? [];
};

export interface BlockDocInfo {
    rootID: string;
    notebookID: string;
}

/** 块 → 文档归属映射（AQ-12 文档维度）：分块 IN 查询，查不到的块不在 Map 中（缺失口径） */
export const getBlockDocMap = async (blockIDs: string[]): Promise<Map<string, BlockDocInfo>> => {
    const out = new Map<string, BlockDocInfo>();
    const chunks = Array.from({ length: Math.ceil(blockIDs.length / SQL_QUERY_CHUNK_SIZE) }, (_, index) =>
        blockIDs.slice(index * SQL_QUERY_CHUNK_SIZE, (index + 1) * SQL_QUERY_CHUNK_SIZE),
    );
    const rowsByChunk = await mapChunksOrdered(chunks, chunkIDs => {
        const chunk = chunkIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
        return sqlQuery(`SELECT id, root_id, box FROM blocks WHERE id IN (${chunk})`);
    }, SQL_QUERY_CONCURRENCY);
    for (const rows of rowsByChunk) {
        for (const r of rows) {
            out.set(String(r.id), { rootID: String(r.root_id ?? ""), notebookID: String(r.box ?? "") });
        }
    }
    return out;
};

/** 文档 ID → 标题（根块 content 首行；空标题由调用方回退展示文档 ID） */
export const getDocTitles = async (docIDs: string[]): Promise<Map<string, string>> => {
    const out = new Map<string, string>();
    const chunks = Array.from({ length: Math.ceil(docIDs.length / SQL_QUERY_CHUNK_SIZE) }, (_, index) =>
        docIDs.slice(index * SQL_QUERY_CHUNK_SIZE, (index + 1) * SQL_QUERY_CHUNK_SIZE),
    );
    const rowsByChunk = await mapChunksOrdered(chunks, chunkIDs => {
        const chunk = chunkIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
        return sqlQuery(`SELECT id, content FROM blocks WHERE id IN (${chunk})`);
    }, SQL_QUERY_CONCURRENCY);
    for (const rows of rowsByChunk) {
        for (const r of rows) {
            out.set(String(r.id), String(r.content ?? "").split("\n")[0].trim());
        }
    }
    return out;
};

/** 思源内核版本号（自诊断用） */
export const kernelVersion = async (): Promise<string> => {
    return String(await kernelPost<unknown>("/api/system/version", {}) ?? "?");
};
