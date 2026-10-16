/**
 * 数据导出、打包与备份事务恢复引擎（M10 / BU-25 / 备份恢复中心）
 * 1. 统一处理本地 revlog/settings/cost-ledger 的序列化与 CSV/JSON 下载；
 * 2. 封装备份恢复的多文件事务落盘与原子补偿回滚（Rollback）机制，避免半态数据损坏。
 */

import { aggregateByDay, aggregateByModel, type CostLedgerData } from "./ai-cost-ledger";
import { revlogToCsv, type RevlogData } from "./revlog";
import type { LvCardsSettings } from "./settings";

/**
 * 触发浏览器文件下载
 */
export function downloadFile(filename: string, content: string, mimeType: string): void {
    if (typeof document === "undefined" || typeof URL === "undefined") {
        return;
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => {
        try {
            URL.revokeObjectURL(url);
        } catch {
            // 旁路释放
        }
    }, 1000);
}

/**
 * 导出复习日志为标准格式化 JSON 文本
 */
export function formatRevlogExportJson(revlog: RevlogData): string {
    return JSON.stringify(revlog, null, 2);
}

/**
 * 导出复习日志为带 BOM 的 CSV 文本（Excel 兼容友好）
 */
export function formatRevlogExportCsv(revlog: RevlogData): string {
    return "\ufeff" + revlogToCsv(revlog);
}

/**
 * 导出设置为标准 JSON 文本
 */
export function formatSettingsExportJson(settings: LvCardsSettings): string {
    return JSON.stringify(settings, null, 2);
}

/**
 * 构造 AI 用量账本导出载荷（聚合统计 + 原始明细，不含密钥与敏感原文）
 */
export function buildCostLedgerExportPayload(costLedger: CostLedgerData): {
    exportedAt: string;
    aggregates: {
        byModel: ReturnType<typeof aggregateByModel>;
        byDay: ReturnType<typeof aggregateByDay>;
    };
    entries: CostLedgerData["entries"];
} {
    return {
        exportedAt: new Date().toISOString(),
        aggregates: {
            byModel: aggregateByModel(costLedger),
            byDay: aggregateByDay(costLedger),
        },
        entries: costLedger.entries,
    };
}

/** 深拷贝辅助函数 */
function cloneData<T>(val: T): T {
    try {
        return JSON.parse(JSON.stringify(val)) as T;
    } catch {
        return val;
    }
}

export interface RestoreTransactionParams {
    /** 拟恢复的文件快照字典 */
    restoreFiles: Record<string, unknown>;
    /** 当前已有文件快照字典（用于回滚补偿） */
    currentFiles: Record<string, unknown>;
    /** 单文件保存异步委托 */
    saveFile: (key: string, data: unknown) => Promise<void>;
    /**
     * 某些宿主写入接口可能在落盘后才抛错。开启后会把当前正在写入的
     * key 也加入补偿集合，失败 key 会再次写回旧快照；默认关闭以保持
     * 旧调用方的历史写入序列与语义。
     */
    rollbackFailedKey?: boolean;
    /** 错误日志记录回调 */
    logError?: (msg: string) => void;
}

/**
 * 多文件备份恢复事务执行器：
 * 逐文件保存快照；若任一文件落盘失败，按逆序将已写入文件回滚为原值（Compensating Rollback），
 * 确保内存与磁盘数据不会停留在中间破坏状态。
 */
export async function applyRestoreTransaction(
    params: RestoreTransactionParams,
): Promise<string[]> {
    const { restoreFiles, currentFiles, saveFile, logError, rollbackFailedKey = false } = params;
    const restoreKeys = Object.keys(restoreFiles);
    const appliedKeys: string[] = [];

    try {
        for (const key of restoreKeys) {
            // 保存不可变快照，防止异步竞争更改原引用
            // 对可能“写入后抛错”的适配器，先登记当前 key，补偿阶段也会恢复它。
            if (rollbackFailedKey) appliedKeys.push(key);
            await saveFile(key, cloneData(restoreFiles[key]));
            if (!rollbackFailedKey) appliedKeys.push(key);
        }
        return appliedKeys;
    } catch (error) {
        // 补偿阶段：逆序回滚所有已写入的 key
        for (const key of appliedKeys.reverse()) {
            try {
                await saveFile(key, cloneData(currentFiles[key]));
            } catch (rollbackError) {
                const msg = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
                logError?.(`[backup-rollback] rollback ${key} failed: ${msg}`);
            }
        }
        throw error;
    }
}
