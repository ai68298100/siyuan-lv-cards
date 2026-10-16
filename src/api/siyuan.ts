/**
 * 通用思源 API（非 riff/V2 域）。
 */
import { fetchSyncPost } from "siyuan";
import { dataStr } from "@/libs/kernel-response";
import { requestKernelData } from "@/libs/kernel-request";
import type { KernelRequestOptions } from "@/libs/kernel-request";
import { withTimeout } from "@/libs/timeout";
import { mapChunksOrdered } from "@/core/query-chunks";

/** 通用内核请求上限：避免文档/DOM/SQL 请求永久挂起。 */
export const SIYUAN_API_TIMEOUT_MS = 15000;

/** SQL IN 查询分块与并发上限，避免大批量卡片刷新时串行放大等待时间。 */
export const SQL_QUERY_CHUNK_SIZE = 400;
export const SQL_QUERY_CONCURRENCY = 3;

async function kernelPost<T>(
    endpoint: string,
    payload: Record<string, unknown>,
    options: KernelRequestOptions = {},
): Promise<T> {
    return requestKernelData<T>(fetchSyncPost, endpoint, payload, SIYUAN_API_TIMEOUT_MS, options);
}

/** Read-only kernel call with single-flight coalescing and bounded retries. */
function kernelRead<T>(endpoint: string, payload: Record<string, unknown> = {}, options: KernelRequestOptions = {}): Promise<T> {
    return kernelPost<T>(endpoint, payload, {
        readOnly: true,
        retries: 1,
        dedupeKey: `${endpoint}:${JSON.stringify(payload)}`,
        ...options,
    });
}

export interface Notebook {
    id: string;
    name: string;
}

/** 已打开的笔记本列表（供复习范围选择；加密本由内核在拉卡时报错，这里不做前置过滤——AA 组另测） */
export const getNotebooks = async (): Promise<Notebook[]> => {
    const data = await kernelRead<{ notebooks?: any[] }>("/api/notebook/lsNotebooks", {});
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
    // 内核 3.8.x 事务响应双形态兼容：旧 {operations:[{id}]} / 新 [{doOperations:[{id, action}]}]
    // （后者是 3.8.6 实测形态；解析不到 id 会让快速制卡/示例卡/标记制卡全部「制卡失败」）
    const body = await kernelPost<
        { operations?: { id?: string; action?: string }[] } | { doOperations?: { id?: string; action?: string }[] }[]
    >("/api/block/insertBlock", { dataType, data, parentID });
    const ids: string[] = [];
    const collect = (ops: { id?: string; action?: string }[] | undefined) => {
        for (const op of ops ?? []) {
            if (op.id && (op.action ?? "insert") !== "delete") ids.push(op.id);
        }
    };
    if (Array.isArray(body)) {
        for (const tx of body) collect(tx?.doOperations);
    } else {
        collect(body?.operations);
    }
    return ids;
};

/** 读块自定义属性（遮挡数据存于 lv-occlusion 属性） */
export const getBlockAttrs = async (id: string): Promise<Record<string, string>> => {
    return await kernelRead<Record<string, string>>("/api/attr/getBlockAttrs", { id }) ?? {};
};

/** BX-2 W2（v0.162.0）：更新块内容（markdown）。非 0 抛错，成功返回 true */
export const updateBlock = async (dataType: "markdown", data: string, id: string): Promise<boolean> => {
    await kernelPost<unknown>("/api/block/updateBlock", { dataType, data, id });
    return true;
};

/** 读块 DOM（AQ-20 统一入口）：非 0/字段缺失抛错，调用方 catch 后保留旧卡面 */
export const getBlockDOM = async (id: string): Promise<string> => {
    return dataStr(await kernelRead<Record<string, unknown>>("/api/block/getBlockDOM", { id }), "dom");
};

/** 写块自定义属性 */
export const setBlockAttrs = async (id: string, attrs: Record<string, string>): Promise<void> => {
    await kernelPost<unknown>("/api/attr/setBlockAttrs", { id, attrs });
};

/** 导出文档为 Markdown（AI 向导「当前文档」源） */
export const exportMdContent = async (id: string): Promise<{ hPath: string; content: string }> => {
    const d = (await kernelRead<Record<string, unknown>>("/api/export/exportMdContent", { id })) ?? {};
    return { hPath: String(d.hPath ?? ""), content: String(d.content ?? "") };
};

/** SQL 查询（只读；AI 向导笔记本范围源用） */
export const sqlQuery = async (stmt: string): Promise<Record<string, unknown>[]> => {
    return (await kernelRead<Record<string, unknown>[]>("/api/query/sql", { stmt })) ?? [];
};

export interface AssetProbeResult {
    /** 明确由宿主确认存在的本地资源。 */
    present: string[];
    /** 明确由 statAsset 返回 code=1 判定缺失的本地资源。 */
    missing: string[];
    /** 超时、权限、未知响应等无法判定的资源；调用方不得把它们当成损坏。 */
    unknown: string[];
}

/**
 * 只读检查一批本地媒体引用。
 *
 * statAsset 对不存在资源使用 code=1（而普通 kernelRead 会把非 0 直接抛错），
 * 因此这里保留响应码并把权限/网络/宿主差异降级为 unknown，避免维护扫描误报。
 */
export const probeAssetRefs = async (refs: string[], concurrency = 4): Promise<AssetProbeResult> => {
    const unique = [...new Set(refs.map(ref => String(ref ?? "").trim()).filter(Boolean))];
    const out: AssetProbeResult = { present: [], missing: [], unknown: [] };
    let cursor = 0;
    const worker = async () => {
        while (cursor < unique.length) {
            const index = cursor++;
            const path = unique[index];
            // statAsset only accepts workspace asset paths (or file URLs). The
            // parser deliberately keeps other relative references for display,
            // but they are not safe to label missing without document context.
            if (!/^assets\//i.test(path)) {
                out.unknown.push(path);
                continue;
            }
            try {
                const response = await withTimeout(fetchSyncPost("/api/asset/statAsset", { path }), SIYUAN_API_TIMEOUT_MS, "/api/asset/statAsset");
                const code = Number((response as { code?: unknown } | null)?.code);
                if (code === 0) out.present.push(path);
                else if (code === 1) out.missing.push(path);
                else out.unknown.push(path);
            } catch {
                out.unknown.push(path);
            }
        }
    };
    const workers = Array.from({ length: Math.min(Math.max(1, concurrency), unique.length || 1) }, () => worker());
    await Promise.all(workers);
    out.present.sort();
    out.missing.sort();
    out.unknown.sort();
    return out;
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
    return String(await kernelRead<unknown>("/api/system/version", {}) ?? "?");
};
