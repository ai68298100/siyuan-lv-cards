/**
 * BU-10 Grounded 输出契约与断言引用绑定引擎（纯逻辑，Node 可单测）。
 * 
 * 核心设计原则：
 * 1. 真实溯源绑定：AI 生成的卡片、释义或诊断，必须拆分原子断言并严格绑定来源块 ID、锚点或原文摘录；
 * 2. 严禁事实伪装：无直接来源支撑的断言强制打上“AI 推断 (Speculation)”标签与警告，
 *    坚决杜绝把 AI 模型的臆测或泛化伪装成笔记原作者的既有事实；
 * 3. 契约合规校验：提供完整的合规审查函数，如果存在未支撑断言且未打上推断标签，直接判定违背 Grounded 契约。
 */

import { extractAssertions } from "./ai-quality-scorecard";

export type GroundedStatus =
    | "fully-grounded"       // 完备有据（原文完全包含或高重合）
    | "partially-grounded"   // 局部有据（包含部分关键词或概念）
    | "inferred-speculation" // AI 演绎/推测（缺乏原文直接锚点，必须明示）
    | "unsupported";         // 无来源支撑

export interface SourceDocumentBlock {
    blockId: string;
    content: string;
    anchorName?: string;
}

export interface GroundedAssertion {
    id: string;
    statement: string;
    status: GroundedStatus;
    /** 绑定的思源来源块 ID */
    sourceBlockId?: string;
    /** 块内锚点名称或小节 */
    sourceAnchor?: string;
    /** 原文精准匹配摘录 */
    matchedExcerpt?: string;
    /** 置信度 0 ~ 1 */
    confidence: number;
    /** 是否标记为 AI 推测标签（防伪装核心标识） */
    inferredTag: boolean;
}

export interface GroundedOutputBundle {
    outputType: "flashcard" | "explanation" | "diagnosis";
    rawContent: string;
    assertions: readonly GroundedAssertion[];
    /** 整体依据度评分 0 ~ 1 */
    overallGroundedScore: number;
    /** 是否包含 AI 推测或无依据断言 */
    hasSpeculativeClaims: boolean;
    /** 警示提示多语言键 */
    warningKey?: string;
    /** 契约合规性断言：AI 猜测绝未伪装成笔记事实 */
    neverMasqueradeAsFacts: true;
}

function norm(s: string): string {
    return String(s ?? "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * BU-10 核心：将 AI 输出文本拆分为原子断言并与来源文档块集进行溯源绑定
 */
export function bindAssertionsToSourceBlocks(params: {
    content: string;
    outputType: "flashcard" | "explanation" | "diagnosis";
    sourceBlocks: readonly SourceDocumentBlock[];
    minGroundedConfidence?: number;
}): GroundedOutputBundle {
    const minConf = params.minGroundedConfidence ?? 0.6;
    const statements = extractAssertions(params.content);

    if (statements.length === 0) {
        return {
            outputType: params.outputType,
            rawContent: params.content,
            assertions: [],
            overallGroundedScore: 1,
            hasSpeculativeClaims: false,
            neverMasqueradeAsFacts: true,
        };
    }

    const assertions: GroundedAssertion[] = [];
    let groundedScoreSum = 0;
    let speculativeCount = 0;

    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const cleanStmt = norm(stmt).replace(/[^\p{L}\p{N}]/gu, "");
        const assertionId = `ast-${i + 1}`;

        if (!cleanStmt || params.sourceBlocks.length === 0) {
            // 无来源或空白断言 -> 判定为 AI 推断
            assertions.push({
                id: assertionId,
                statement: stmt,
                status: "inferred-speculation",
                confidence: 0,
                inferredTag: true,
            });
            speculativeCount++;
            continue;
        }

        let bestMatchBlock: SourceDocumentBlock | null = null;
        let bestConfidence = 0;
        let matchedExcerpt: string | undefined;

        for (const block of params.sourceBlocks) {
            const rawText = block.content;
            const cleanText = norm(rawText).replace(/[^\p{L}\p{N}]/gu, "");
            if (!cleanText) continue;

            // 1. 完全包含检查
            if (cleanText.includes(cleanStmt)) {
                bestMatchBlock = block;
                bestConfidence = 1.0;
                const idx = rawText.indexOf(stmt);
                matchedExcerpt = rawText.slice(
                    Math.max(0, idx - 20),
                    Math.min(rawText.length, idx + stmt.length + 20),
                );
                break;
            }

            // 2. 2-gram 字符片段重叠度匹配
            const n = 2;
            const totalGrams = Math.max(1, cleanStmt.length - n + 1);
            let matchedGrams = 0;
            for (let g = 0; g < totalGrams; g++) {
                if (cleanText.includes(cleanStmt.slice(g, g + n))) {
                    matchedGrams++;
                }
            }
            const ratio = matchedGrams / totalGrams;
            if (ratio > bestConfidence) {
                bestConfidence = ratio;
                bestMatchBlock = block;
                matchedExcerpt = rawText.slice(0, Math.min(rawText.length, 120));
            }
        }

        if (bestConfidence >= 0.85) {
            assertions.push({
                id: assertionId,
                statement: stmt,
                status: "fully-grounded",
                sourceBlockId: bestMatchBlock?.blockId,
                sourceAnchor: bestMatchBlock?.anchorName,
                matchedExcerpt,
                confidence: bestConfidence,
                inferredTag: false,
            });
            groundedScoreSum += 1.0;
        } else if (bestConfidence >= minConf) {
            assertions.push({
                id: assertionId,
                statement: stmt,
                status: "partially-grounded",
                sourceBlockId: bestMatchBlock?.blockId,
                sourceAnchor: bestMatchBlock?.anchorName,
                matchedExcerpt,
                confidence: bestConfidence,
                inferredTag: false,
            });
            groundedScoreSum += bestConfidence;
        } else {
            // 低于阈值，强制打上 AI 推断标签
            assertions.push({
                id: assertionId,
                statement: stmt,
                status: "inferred-speculation",
                sourceBlockId: bestMatchBlock?.blockId,
                confidence: bestConfidence,
                inferredTag: true,
            });
            groundedScoreSum += bestConfidence * 0.5;
            speculativeCount++;
        }
    }

    const overallGroundedScore = Number((groundedScoreSum / statements.length).toFixed(3));
    const hasSpeculativeClaims = speculativeCount > 0;

    return {
        outputType: params.outputType,
        rawContent: params.content,
        assertions,
        overallGroundedScore,
        hasSpeculativeClaims,
        warningKey: hasSpeculativeClaims
            ? "aiGrounded.warning.containsSpeculativeClaims"
            : undefined,
        neverMasqueradeAsFacts: true,
    };
}

export interface GroundedContractAudit {
    compliant: boolean;
    violations: string[];
    speculativeCount: number;
    fullyGroundedCount: number;
}

/**
 * 审查 Grounded 契约履行情况（防伪装核心验收门禁）
 */
export function auditGroundedContract(bundle: GroundedOutputBundle): GroundedContractAudit {
    const violations: string[] = [];
    let speculativeCount = 0;
    let fullyGroundedCount = 0;

    for (const a of bundle.assertions) {
        if (a.status === "fully-grounded") {
            fullyGroundedCount++;
            if (!a.sourceBlockId) {
                violations.push(`Assertion '${a.id}' marked fully-grounded but lacks sourceBlockId`);
            }
        } else if (a.status === "inferred-speculation" || a.status === "unsupported") {
            speculativeCount++;
            // 契约关键硬核断言：无依据或推测必须被打上 inferredTag！
            if (!a.inferredTag) {
                violations.push(
                    `Assertion '${a.id}' lacks source grounding but wasn't tagged as inferred speculation!`,
                );
            }
        }
    }

    return {
        compliant: violations.length === 0,
        violations,
        speculativeCount,
        fullyGroundedCount,
    };
}
