/**
 * BU-11 统一 AI 调用流水线运行时（纯逻辑，Node 可单测）。
 * 
 * 核心架构目标：
 * 贯穿 TaskRegistry → ContextPack → TokenCostCheck → ProviderRouter → SchemaValidator → AuditSink。
 * 
 * 核心治理契约：
 * 1. 统一管理任务超时（Timeout 控制，超时自动熔断并清理定时器）；
 * 2. 统一支持调用方主动取消（AbortSignal，取消即时解脱，不触发自动回退）；
 * 3. 统一分层降级回退（结合 BU-28 降级阶梯与 BU-12 成本硬上限）；
 * 4. 统一映射加载阶段（idle -> validating-eligibility -> checking-ceilings -> assembling-prompts -> dispatching -> validating-schema -> completed/aborted）；
 * 5. 全链路脱敏审计与零违规篡改调度（neverModifiesKernelSchedule: true）。
 */

import type { AiTask } from "./ai-pipeline";
import { assembleGeneratePrompt, type AssembleResult } from "./ai-pipeline";
import { checkHardCeilings, estimatePreFlightCost, type AiHardCeilings, type PreFlightCeilingCheck } from "./ai-token-cost";
import { classifyAiFailure, nextLadderStep, type LadderPolicy, type LadderStep } from "./ai-degradation";
import { sanitizeSensitiveText } from "./audit-log";

export type PipelineStage =
    | "idle"
    | "validating-eligibility"
    | "checking-ceilings"
    | "assembling-prompts"
    | "dispatching"
    | "validating-schema"
    | "completed"
    | "aborted";

export interface PipelineExecutionOptions {
    task: AiTask;
    sourceText: string;
    cfg: { count: number; language: string; type: string };
    modelId?: string;
    customTemplate?: string;
    defaultSystem: string;
    userTemplate: string;
    typeClozeHint: string;
    typeQaHint: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    ceilings?: AiHardCeilings;
    dailyAccumulated?: { tokens: number; costUsd: number };
    ladderPolicy?: LadderPolicy;
    onStageChange?: (stage: PipelineStage) => void;
    fallbackDispatcher?: (prompts: { system: string; user: string }, signal?: AbortSignal) => Promise<string>;
    sleepFn?: (ms: number) => Promise<void>;
}

export interface PipelineAuditRecord {
    task: AiTask;
    modelId: string;
    elapsedMs: number;
    tokensEstimated: number;
    stageReached: PipelineStage;
    success: boolean;
    errorSummary?: string;
    degradationStep?: LadderStep;
}

export interface PipelineExecutionResult<TOutput> {
    success: boolean;
    stage: PipelineStage;
    data?: TOutput;
    errorKey?: string;
    errorMessage?: string;
    fallbackAltKey?: string;
    assembleResult?: AssembleResult;
    ceilingCheck?: PreFlightCeilingCheck;
    audit: PipelineAuditRecord;
    neverModifiesKernelSchedule: true;
}

/**
 * 统一执行 AI 流水线任务（带超时、取消与硬上限门禁）
 */
export async function executeAiPipelineTask<TOutput>(
    options: PipelineExecutionOptions,
    dispatcher: (prompts: { system: string; user: string }, signal?: AbortSignal) => Promise<string>,
    parser: (rawResponse: string) => TOutput,
): Promise<PipelineExecutionResult<TOutput>> {
    const startTime = Date.now();
    const modelId = options.modelId || "deepseek-chat";
    const notifyStage = (stage: PipelineStage) => {
        options.onStageChange?.(stage);
    };

    notifyStage("validating-eligibility");

    // 0. 检查调用方主动取消
    if (options.signal?.aborted) {
        notifyStage("aborted");
        return {
            success: false,
            stage: "aborted",
            errorKey: "aiPipeline.error.canceled",
            errorMessage: "Task was canceled by caller before execution.",
            fallbackAltKey: "aiEquiv.alt.cards-generate.1",
            audit: {
                task: options.task,
                modelId,
                elapsedMs: Date.now() - startTime,
                tokensEstimated: 0,
                stageReached: "aborted",
                success: false,
                errorSummary: "canceled",
            },
            neverModifiesKernelSchedule: true,
        };
    }

    // 1. 发送前预估与硬上限门禁 (BU-12)
    notifyStage("checking-ceilings");
    const estimate = estimatePreFlightCost({
        modelId,
        promptText: options.sourceText,
        taskType: options.task,
        cardCount: options.cfg.count,
    });

    const ceilingCheck = checkHardCeilings(
        estimate,
        options.ceilings,
        options.dailyAccumulated,
    );

    if (!ceilingCheck.allowed) {
        notifyStage("aborted");
        return {
            success: false,
            stage: "checking-ceilings",
            errorKey: ceilingCheck.reasonKey,
            errorMessage: "Hard cost ceiling was triggered.",
            fallbackAltKey: ceilingCheck.fallbackAltKey,
            ceilingCheck,
            audit: {
                task: options.task,
                modelId,
                elapsedMs: Date.now() - startTime,
                tokensEstimated: estimate.totalEstimatedTokens,
                stageReached: "checking-ceilings",
                success: false,
                errorSummary: ceilingCheck.violation,
            },
            neverModifiesKernelSchedule: true,
        };
    }

    if (options.signal?.aborted) {
        notifyStage("aborted");
        return {
            success: false,
            stage: "aborted",
            errorKey: "aiPipeline.error.canceled",
            errorMessage: "Task was canceled by caller.",
            fallbackAltKey: "aiEquiv.alt.cards-generate.1",
            audit: {
                task: options.task,
                modelId,
                elapsedMs: Date.now() - startTime,
                tokensEstimated: estimate.totalEstimatedTokens,
                stageReached: "aborted",
                success: false,
                errorSummary: "canceled",
            },
            neverModifiesKernelSchedule: true,
        };
    }

    // 2. 提示词组合与上下文预算器编排 (BU-6 / BU-35)
    notifyStage("assembling-prompts");
    let assembleResult: AssembleResult;
    try {
        assembleResult = assembleGeneratePrompt({
            task: options.task,
            customTemplate: options.customTemplate,
            defaultSystem: options.defaultSystem,
            userTemplate: options.userTemplate,
            source: options.sourceText,
            cfg: options.cfg,
            typeClozeHint: options.typeClozeHint,
            typeQaHint: options.typeQaHint,
            modelId,
        });
    } catch (err) {
        notifyStage("aborted");
        return {
            success: false,
            stage: "assembling-prompts",
            errorKey: "aiPipeline.error.assemblyFailed",
            errorMessage: sanitizeSensitiveText(err instanceof Error ? err.message : String(err), 100),
            fallbackAltKey: "aiEquiv.alt.cards-generate.1",
            audit: {
                task: options.task,
                modelId,
                elapsedMs: Date.now() - startTime,
                tokensEstimated: estimate.totalEstimatedTokens,
                stageReached: "assembling-prompts",
                success: false,
                errorSummary: "prompt-assembly-error",
            },
            neverModifiesKernelSchedule: true,
        };
    }

    if (options.signal?.aborted) {
        notifyStage("aborted");
        return {
            success: false,
            stage: "aborted",
            errorKey: "aiPipeline.error.canceled",
            errorMessage: "Task was canceled by caller.",
            fallbackAltKey: "aiEquiv.alt.cards-generate.1",
            audit: {
                task: options.task,
                modelId,
                elapsedMs: Date.now() - startTime,
                tokensEstimated: estimate.totalEstimatedTokens,
                stageReached: "aborted",
                success: false,
                errorSummary: "canceled",
            },
            neverModifiesKernelSchedule: true,
        };
    }

    // 3. 网络分发与超时控制 (Stage: dispatching)
    notifyStage("dispatching");
    const timeoutMs = options.timeoutMs ?? 30000;
    const policy: LadderPolicy = options.ladderPolicy ?? {
        maxPrimaryAttempts: 1,
        hasFallback: Boolean(options.fallbackDispatcher),
    };

    const runWithTimeout = async (
        targetDispatcher: (prompts: { system: string; user: string }, signal?: AbortSignal) => Promise<string>,
    ): Promise<string> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const timeoutPromise = new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    reject(new Error(`AI pipeline request timeout after ${timeoutMs}ms`));
                }, timeoutMs);
                options.signal?.addEventListener("abort", () => {
                    if (timer) clearTimeout(timer);
                    reject(new Error("AICanceledError"));
                }, { once: true });
            });

            return await Promise.race([
                targetDispatcher({ system: assembleResult.system, user: assembleResult.user }, options.signal),
                timeoutPromise,
            ]);
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    };

    let rawResponse = "";
    let attemptsUsed = 0;
    let lastLadder: LadderStep | undefined;

    while (true) {
        if (options.signal?.aborted) {
            notifyStage("aborted");
            return {
                success: false,
                stage: "aborted",
                errorKey: "aiPipeline.error.canceled",
                errorMessage: "Task was canceled by caller.",
                fallbackAltKey: "aiEquiv.alt.cards-generate.1",
                assembleResult,
                ceilingCheck,
                audit: {
                    task: options.task,
                    modelId,
                    elapsedMs: Date.now() - startTime,
                    tokensEstimated: estimate.totalEstimatedTokens,
                    stageReached: "aborted",
                    success: false,
                    errorSummary: "canceled",
                },
                neverModifiesKernelSchedule: true,
            };
        }

        attemptsUsed++;
        try {
            rawResponse = await runWithTimeout(dispatcher);
            break; // 主端点调用成功
        } catch (err) {
            if (options.signal?.aborted) {
                notifyStage("aborted");
                return {
                    success: false,
                    stage: "aborted",
                    errorKey: "aiPipeline.error.canceled",
                    errorMessage: "Task was canceled by caller.",
                    fallbackAltKey: "aiEquiv.alt.cards-generate.1",
                    assembleResult,
                    ceilingCheck,
                    audit: {
                        task: options.task,
                        modelId,
                        elapsedMs: Date.now() - startTime,
                        tokensEstimated: estimate.totalEstimatedTokens,
                        stageReached: "aborted",
                        success: false,
                        errorSummary: "canceled",
                    },
                    neverModifiesKernelSchedule: true,
                };
            }

            const failure = classifyAiFailure(err);
            const ladder = nextLadderStep(failure, policy, attemptsUsed);
            lastLadder = ladder;

            if (ladder.action === "retry-primary") {
                const sleepMs = ladder.retryAfterMs ?? 100;
                if (options.sleepFn) {
                    await options.sleepFn(sleepMs);
                } else if (sleepMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, sleepMs));
                }
                continue;
            }

            if (ladder.action === "try-fallback" && options.fallbackDispatcher) {
                try {
                    rawResponse = await runWithTimeout(options.fallbackDispatcher);
                    break; // 备用端点调用成功
                } catch (fallbackErr) {
                    const fallbackFailure = classifyAiFailure(fallbackErr);
                    const finalLadder = nextLadderStep(fallbackFailure, { ...policy, hasFallback: false }, attemptsUsed + 1);
                    lastLadder = finalLadder;
                    notifyStage("aborted");
                    return {
                        success: false,
                        stage: "dispatching",
                        errorKey: finalLadder.reasonKey,
                        errorMessage: sanitizeSensitiveText(fallbackFailure.detail, 100),
                        fallbackAltKey: "aiEquiv.alt.cards-generate.1",
                        assembleResult,
                        ceilingCheck,
                        audit: {
                            task: options.task,
                            modelId,
                            elapsedMs: Date.now() - startTime,
                            tokensEstimated: estimate.totalEstimatedTokens,
                            stageReached: "dispatching",
                            success: false,
                            errorSummary: fallbackFailure.cls,
                            degradationStep: finalLadder,
                        },
                        neverModifiesKernelSchedule: true,
                    };
                }
            }

            // 中止逻辑
            notifyStage("aborted");
            return {
                success: false,
                stage: "dispatching",
                errorKey: ladder.reasonKey,
                errorMessage: sanitizeSensitiveText(failure.detail, 100),
                fallbackAltKey: "aiEquiv.alt.cards-generate.1",
                assembleResult,
                ceilingCheck,
                audit: {
                    task: options.task,
                    modelId,
                    elapsedMs: Date.now() - startTime,
                    tokensEstimated: estimate.totalEstimatedTokens,
                    stageReached: "dispatching",
                    success: false,
                    errorSummary: failure.cls,
                    degradationStep: ladder,
                },
                neverModifiesKernelSchedule: true,
            };
        }
    }

    // 4. Schema 校验与反序列化 (Stage: validating-schema)
    notifyStage("validating-schema");
    try {
        const parsed = parser(rawResponse);
        notifyStage("completed");

        return {
            success: true,
            stage: "completed",
            data: parsed,
            assembleResult,
            ceilingCheck,
            audit: {
                task: options.task,
                modelId,
                elapsedMs: Date.now() - startTime,
                tokensEstimated: estimate.totalEstimatedTokens,
                stageReached: "completed",
                success: true,
                degradationStep: lastLadder,
            },
            neverModifiesKernelSchedule: true,
        };
    } catch (err) {
        notifyStage("aborted");
        return {
            success: false,
            stage: "validating-schema",
            errorKey: "aiPipeline.error.parseFailed",
            errorMessage: sanitizeSensitiveText(err instanceof Error ? err.message : String(err), 100),
            fallbackAltKey: "aiEquiv.alt.cards-generate.1",
            assembleResult,
            ceilingCheck,
            audit: {
                task: options.task,
                modelId,
                elapsedMs: Date.now() - startTime,
                tokensEstimated: estimate.totalEstimatedTokens,
                stageReached: "validating-schema",
                success: false,
                errorSummary: "schema-parse-failure",
                degradationStep: lastLadder,
            },
            neverModifiesKernelSchedule: true,
        };
    }
}
