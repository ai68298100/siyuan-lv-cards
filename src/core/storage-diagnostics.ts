/**
 * 本地私有存储体检与外部连接探测引擎（Storage Diagnostics）
 * 集中管理各模块 JSON 存储体检行统计与 AnkiConnect 联通性探测格式化。
 */

import { getAnkiConnectVersion } from "../api/anki-connect";

export interface StorageStatsInput {
    settingsVersion: number;
    revlogCount: number;
    suspendTodayCount: number;
    examPlansCount: number;
    aiBatchesCount: number;
    aiJobsCount: number;
    knowledgeObjectsCount: number;
    relationsCount: number;
    errorTagsCount: number;
    inboxCount: number;
    learningGoalsCount: number;
    entryContextsCount: number;
    contentLifecyclesCount: number;
    killSwitchDisabledCount: number;
    killSwitchQuarantinedCount: number;
    storageLastWrite: Record<string, number>;
}

export interface StorageStatRow {
    file: string;
    size: string;
    lastWrite: number;
}

/**
 * 计算全部私有存储的健康体检摘要（设置页存储健康视图）
 */
export function computeStorageStats(input: StorageStatsInput): StorageStatRow[] {
    const rows: StorageStatRow[] = [];
    const push = (file: string, desc: string) => {
        rows.push({
            file,
            size: desc,
            lastWrite: input.storageLastWrite[file] ?? 0,
        });
    };

    push("settings.json", `v${input.settingsVersion}`);
    push("revlog.json", `${input.revlogCount} entries`);
    push("suspend-today.json", `${input.suspendTodayCount} cards`);
    push("exam-plans.json", `${input.examPlansCount} plans`);
    push("ai-batches.json", `${input.aiBatchesCount} batches`);
    push("ai-jobs.json", `${input.aiJobsCount} jobs (ADR-7)`);
    push("knowledge-objects.json", `${input.knowledgeObjectsCount} objects (BK-1)`);
    push("relations.json", `${input.relationsCount} relations (BK-2)`);
    push("error-tags.json", `${input.errorTagsCount} tags (BJ-4)`);
    push("inbox.json", `${input.inboxCount} items (BI-4)`);
    push("learning-goals.json", `${input.learningGoalsCount} goals (BI-1)`);
    push("entry-contexts.json", `${input.entryContextsCount} contexts (BI-3)`);
    push("content-lifecycles.json", `${input.contentLifecyclesCount} lifecycles (BI-5)`);
    push("ai-killswitch.json", `${input.killSwitchDisabledCount} targets / ${input.killSwitchQuarantinedCount} quarantined (BU-31)`);

    return rows;
}

/**
 * 执行 AnkiConnect 客户端联通性测试并返回格式化说明文案
 */
export async function probeAnkiConnection(
    url: string,
    key: string,
    i18n: { ankiTestOk?: string; ankiTestFail?: string },
    fetchVersion: typeof getAnkiConnectVersion = getAnkiConnectVersion,
): Promise<string> {
    try {
        const version = await fetchVersion(url, key);
        return `${i18n.ankiTestOk ?? "连接成功"} (v${version})`;
    } catch (e: any) {
        return `${i18n.ankiTestFail ?? "连接失败"}: ${e?.message ?? String(e)}`;
    }
}
