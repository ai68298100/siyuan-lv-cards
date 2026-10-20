/**
 * BX-12 分享包导入差异比对引擎（纯逻辑，Node 可单测）。
 * 
 * 核心目标与安全规范：
 * 1. 深度内容与元数据比对：当导入与本地同名/同 ID 卡片冲突时，逐卡比对 Markdown 正文、助记便签（memo）与标签（tags）；
 * 2. 字段级 LCS 行内差异：复用 charDiff 输出直观的增删查改行内高亮片段；
 * 3. 细粒度冲突决策：支持 keep-local（保留本地）、overwrite（覆盖更新）、fork-new（分叉新建）与 merge-memo（合并便签）；
 * 4. 本地数据优先保护：严禁静默覆盖用户的私有便签与手写修改（retainedMemoCount 保留统计）。
 */

import { charDiff, type DiffSegment } from "./field-diff";
import type { LvPackageCard } from "./lvcards-package";
import { normalizeCardFingerprint } from "./lvcards-package";

export type ImportConflictStatus =
    | "new"
    | "identical"
    | "modified-content"
    | "modified-metadata";

export type ImportResolveAction =
    | "keep-local"
    | "overwrite"
    | "fork-new"
    | "merge-memo";

export interface CardDiffReport {
    cardId: string;
    status: ImportConflictStatus;
    localCard?: {
        markdown: string;
        memo?: string;
        tags?: string[];
    };
    packageCard: LvPackageCard;
    /** Markdown 正文行内差异片段 */
    markdownSegments: DiffSegment[];
    /** 助记便签差异 */
    memoDiff: {
        localMemo?: string;
        packageMemo?: string;
        changed: boolean;
    };
    /** 标签差异 */
    tagsDiff: {
        added: string[];
        removed: string[];
    };
}

export interface DeckImportDiffSummary {
    deckName: string;
    totalPackageCards: number;
    newCount: number;
    identicalCount: number;
    modifiedContentCount: number;
    modifiedMetadataCount: number;
    reports: readonly CardDiffReport[];
}

export interface ResolvePlanInput {
    reports: readonly CardDiffReport[];
    defaultAction?: ImportResolveAction;
    perCardActions?: Record<string, ImportResolveAction>;
}

export interface ImportExecutionPlan {
    /** 待新增创建的卡片清单（含全新卡及 fork-new 分叉卡） */
    toCreate: LvPackageCard[];
    /** 待更新修改的本地块列表 */
    toUpdate: Array<{
        blockId: string;
        markdown: string;
        memo?: string;
        tags?: string[];
    }>;
    /** 忽略/跳过的卡片 ID 清单 */
    toSkip: string[];
    /** 成功保留的用户本地便签总数 */
    retainedLocalMemoCount: number;
}

/**
 * 深入比对本地现有卡片与分享包卡片列表（纯函数）
 */
export function inspectLvCardsImportDiff(params: {
    deckName: string;
    packageCards: readonly LvPackageCard[];
    existingCards: readonly { id: string; markdown: string; memo?: string; tags?: string[] }[];
}): DeckImportDiffSummary {
    const existingMap = new Map<string, { id: string; markdown: string; memo?: string; tags?: string[] }>();
    for (const card of params.existingCards) {
        if (card.id) existingMap.set(card.id, card);
    }

    const reports: CardDiffReport[] = [];
    let newCount = 0;
    let identicalCount = 0;
    let modifiedContentCount = 0;
    let modifiedMetadataCount = 0;

    for (const pkgCard of params.packageCards) {
        const local = existingMap.get(pkgCard.id);

        if (!local) {
            // 全新卡片
            newCount++;
            reports.push({
                cardId: pkgCard.id,
                status: "new",
                packageCard: pkgCard,
                markdownSegments: [{ text: pkgCard.markdown, kind: "add" }],
                memoDiff: {
                    packageMemo: pkgCard.memo,
                    changed: Boolean(pkgCard.memo),
                },
                tagsDiff: {
                    added: pkgCard.tags ? [...pkgCard.tags] : [],
                    removed: [],
                },
            });
            continue;
        }

        // 本地存在同 ID 卡片，对比内容与元数据
        const localFp = normalizeCardFingerprint(local.markdown);
        const pkgFp = normalizeCardFingerprint(pkgCard.markdown);
        const contentChanged = localFp !== pkgFp;

        const localMemo = local.memo?.trim() ?? "";
        const pkgMemo = pkgCard.memo?.trim() ?? "";
        const memoChanged = localMemo !== pkgMemo;

        const localTags = new Set(local.tags ?? []);
        const pkgTags = new Set(pkgCard.tags ?? []);
        const addedTags = [...pkgTags].filter(t => !localTags.has(t));
        const removedTags = [...localTags].filter(t => !pkgTags.has(t));
        const tagsChanged = addedTags.length > 0 || removedTags.length > 0;

        if (!contentChanged && !memoChanged && !tagsChanged) {
            // 完全相同，无修改
            identicalCount++;
            reports.push({
                cardId: pkgCard.id,
                status: "identical",
                localCard: local,
                packageCard: pkgCard,
                markdownSegments: [{ text: local.markdown, kind: "same" }],
                memoDiff: { localMemo, packageMemo: pkgMemo, changed: false },
                tagsDiff: { added: [], removed: [] },
            });
            continue;
        }

        const segments = contentChanged
            ? charDiff(local.markdown, pkgCard.markdown)
            : [{ text: local.markdown, kind: "same" as const }];

        const status: ImportConflictStatus = contentChanged
            ? "modified-content"
            : "modified-metadata";

        if (contentChanged) {
            modifiedContentCount++;
        } else {
            modifiedMetadataCount++;
        }

        reports.push({
            cardId: pkgCard.id,
            status,
            localCard: local,
            packageCard: pkgCard,
            markdownSegments: segments,
            memoDiff: {
                localMemo,
                packageMemo: pkgMemo,
                changed: memoChanged,
            },
            tagsDiff: {
                added: addedTags,
                removed: removedTags,
            },
        });
    }

    return {
        deckName: params.deckName,
        totalPackageCards: params.packageCards.length,
        newCount,
        identicalCount,
        modifiedContentCount,
        modifiedMetadataCount,
        reports,
    };
}

/**
 * 根据用户的冲突解决决策生成落盘执行计划（纯函数）
 */
export function buildImportExecutionPlan(input: ResolvePlanInput): ImportExecutionPlan {
    const toCreate: LvPackageCard[] = [];
    const toUpdate: ImportExecutionPlan["toUpdate"] = [];
    const toSkip: string[] = [];
    let retainedLocalMemoCount = 0;

    const defaultAction: ImportResolveAction = input.defaultAction ?? "keep-local";
    const perCard = input.perCardActions ?? {};

    for (const report of input.reports) {
        if (report.status === "new") {
            toCreate.push(report.packageCard);
            continue;
        }

        if (report.status === "identical") {
            toSkip.push(report.cardId);
            continue;
        }

        // 处理冲突卡片决策
        const action = perCard[report.cardId] ?? defaultAction;

        switch (action) {
            case "keep-local":
                toSkip.push(report.cardId);
                if (report.localCard?.memo) {
                    retainedLocalMemoCount++;
                }
                break;

            case "overwrite":
                toUpdate.push({
                    blockId: report.cardId,
                    markdown: report.packageCard.markdown,
                    memo: report.packageCard.memo,
                    tags: report.packageCard.tags,
                });
                break;

            case "fork-new":
                // 保持本地原卡，并将包内卡片分叉生成一个新 ID
                toCreate.push({
                    ...report.packageCard,
                    id: `fork-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                });
                if (report.localCard?.memo) {
                    retainedLocalMemoCount++;
                }
                break;

            case "merge-memo": {
                // 保持本地正文，但合并双方便签与标签
                const mergedMemo = [report.localCard?.memo, report.packageCard.memo]
                    .map(m => m?.trim())
                    .filter(Boolean)
                    .join(" \n---\n ");

                const mergedTags = Array.from(new Set([
                    ...(report.localCard?.tags ?? []),
                    ...(report.packageCard.tags ?? []),
                ]));

                toUpdate.push({
                    blockId: report.cardId,
                    markdown: report.localCard?.markdown ?? report.packageCard.markdown,
                    memo: mergedMemo || undefined,
                    tags: mergedTags.length > 0 ? mergedTags : undefined,
                });
                retainedLocalMemoCount++;
                break;
            }
        }
    }

    return {
        toCreate,
        toUpdate,
        toSkip,
        retainedLocalMemoCount,
    };
}
