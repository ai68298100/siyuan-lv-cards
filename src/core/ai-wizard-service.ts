/**
 * AI 制卡向导与提示流水线装配引擎（AI Wizard Service · M2/BU-35/BU-36）
 * 集中管理上下文预算预览、笔记本大纲材料聚合并排、断点续传标记生成与幂等落块组装。
 */

import { assembleGeneratePrompt } from "./ai-pipeline";
import { serializeQaCard } from "./flashcard-quality";

export interface BudgetPreviewResult {
    budgetTokens: number;
    budgetSource: string;
    modelId: string | null;
    totalTokens: number;
    sourceTokens: number;
    needsBatching: boolean;
    layers: Array<{
        key: string;
        tokens: number;
        originalTokens: number;
        truncated: boolean;
        dropped: boolean;
    }>;
}

/**
 * 组装上下文预算预览报告（BU-36：纯函数零网络，供向导外发前展示分层预算）
 */
export function buildBudgetPreview(params: {
    source: string;
    cfg: { count: number; language: string; type: "qa" | "cloze" };
    promptTemplate: string;
    aiMode: string;
    aiModel: string;
    i18n: Record<string, any>;
}): BudgetPreviewResult | null {
    const { source, cfg, promptTemplate, aiMode, aiModel, i18n } = params;
    try {
        const assembled = assembleGeneratePrompt({
            task: "cards-generate",
            customTemplate: promptTemplate,
            defaultSystem: i18n.aiSystemPrompt,
            userTemplate: i18n.aiUserPrompt,
            source,
            cfg,
            typeClozeHint: i18n.aiTypeClozeHint,
            typeQaHint: i18n.aiTypeQaHint,
            guardClause: i18n.aiInjectionGuard,
            untrustedLabel: i18n.aiUntrustedLabel,
            modelId: aiMode === "custom" ? aiModel : "",
        });
        return {
            budgetTokens: assembled.audit.budgetTokens,
            budgetSource: assembled.audit.budgetSource,
            modelId: assembled.audit.modelId,
            totalTokens: assembled.audit.totalTokens,
            sourceTokens: assembled.audit.sourceTokens,
            needsBatching: assembled.needsBatching,
            layers: assembled.budget.reports.map(r => ({
                key: r.key,
                tokens: r.keptTokens,
                originalTokens: r.originalTokens,
                truncated: r.truncated,
                dropped: r.dropped,
            })),
        };
    } catch {
        return null;
    }
}

/**
 * 聚合笔记本最近材料文本（最近 200 个文本块）
 */
export async function queryNotebookMaterialText(
    nbId: string,
    sqlExecutor: (sql: string) => Promise<Array<{ markdown?: string }>>,
): Promise<string> {
    const safe = nbId.replace(/'/g, "''");
    const rows = await sqlExecutor(
        `SELECT markdown FROM blocks WHERE root_id IN (SELECT id FROM blocks WHERE box='${safe}' AND type IN ('d','p','h','c','t')) AND markdown != '' ORDER BY created DESC LIMIT 200`,
    );
    return rows.map(r => String(r.markdown ?? "")).filter(Boolean).join("\n\n");
}

/**
 * 生成断点续传防重复标记（HTML 注释格式，不影响卡面正文）
 */
export function buildAiCardMarker(jobId?: string, origIndex?: number): string {
    if (!jobId || origIndex === undefined || origIndex < 0) {
        return "";
    }
    return `<!-- lv-ai:${jobId}:${origIndex} -->`;
}

/**
 * 组装单张 AI 卡片块的 Markdown 内容
 */
export function buildAiCardBlockMarkdown(q: string, a: string, marker = ""): string {
    const prefix = marker ? `${marker}\n` : "";
    return `${prefix}${serializeQaCard(q, a)}`;
}
