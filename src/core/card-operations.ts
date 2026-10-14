/**
 * 卡片入组、查重、移除与标记制卡核心业务引擎（Card Operations Engine）
 * 统筹与 Riff 内核卡片生命周期的读写交互、知识对象自动派生与卡片关系图端点清理。
 */

import { addRiffCards, invalidateDueCache } from "../api/due-shared";
import { getRiffCardsByBlockIDs, removeRiffCards } from "../api/riff";
import { appendBlock, createDocWithMd } from "../api/siyuan";
import { detachCard, type CardRelationsData } from "./card-relations";
import { deriveInstance, registerObject, type KnowledgeObjectsData } from "./knowledge-objects";
import { parseSrLine, parseSrMultiline, stripSrMarkers } from "./obsidian-sr";

/**
 * 校验给定块是否已经在 Riff 闪卡中，返回重复卡片数量
 */
export async function checkDuplicateCards(blockIDs: string[]): Promise<number> {
    try {
        const { blocks } = await getRiffCardsByBlockIDs(blockIDs);
        return (blocks ?? []).filter(b => !!b.id).length;
    } catch {
        return 0;
    }
}

export interface RemoveCardsResult {
    removedCount: number;
    cardIDs: string[];
    hadCards: boolean;
}

/**
 * 从卡组中批量移除卡片，并自动清理关联的知识对象关系图端点
 */
export async function removeCardsFromDeckFlow(
    blockIDs: string[],
    cardRelations: CardRelationsData,
    mutateRelations: (mutator: (next: CardRelationsData) => void) => Promise<unknown>,
): Promise<RemoveCardsResult> {
    const { blocks } = await getRiffCardsByBlockIDs(blockIDs);
    const ids = (blocks ?? []).map(b => b.id).filter(Boolean);
    if (ids.length === 0) {
        return { removedCount: 0, cardIDs: [], hadCards: false };
    }
    // 跨集批量移除
    await removeRiffCards("", ids);
    invalidateDueCache();

    // BK-2：内核卡已删，关系图端点同步清理
    if (ids.some(id => cardRelations.relations.some(r => r.from === id || r.to === id))) {
        await mutateRelations(next => {
            for (const id of ids) {
                detachCard(next, id);
            }
        });
    }
    return { removedCount: ids.length, cardIDs: ids, hadCards: true };
}

export interface QuickCardFlowInput {
    nbId: string;
    markdown: string;
    deckID: string;
    q?: string;
    a?: string;
    mutateKnowledgeObjects?: (mutator: (next: KnowledgeObjectsData) => void) => Promise<unknown>;
}

/**
 * 执行快速问答/挖空制卡流程（写块 -> 入组 -> 派生知识对象实例）
 */
export async function executeQuickCardCreation(
    input: QuickCardFlowInput,
): Promise<{ docID: string; blockID: string }> {
    const docID = await createDocWithMd(input.nbId, "小驴闪卡/快速制卡", "");
    if (!docID) {
        throw new Error("quickCardFail");
    }
    const ids = await appendBlock("markdown", input.markdown, docID);
    if (!ids || ids.length === 0) {
        throw new Error("quickCardFail");
    }
    const blockID = ids[0];
    await addRiffCards(input.deckID, [blockID]);

    if (input.q && input.mutateKnowledgeObjects) {
        try {
            const { blocks } = await getRiffCardsByBlockIDs([blockID]);
            const cardID = blocks?.[0]?.id;
            await input.mutateKnowledgeObjects(next => {
                const obj = registerObject(next, input.q!, blockID);
                if (cardID) {
                    deriveInstance(obj, {
                        cardID,
                        cardType: "cloze",
                        capability: input.a && input.q!.includes(input.a) ? "fact" : "definition",
                    });
                }
            });
        } catch {
            // 知识对象注册为旁路增强：失败不影响制卡主流程
        }
    }
    return { docID, blockID };
}

export interface MarkerCardItem {
    blockID: string;
    kind: "qa" | "whole";
    front: string;
    back: string;
}

/**
 * 扫描 Markdown 内容提取标记符制卡项（支持单行 ::、多行 ?/?? 问答与 ？ 结尾块）
 */
export function extractMarkerCardItems(rows: Array<{ id?: string; markdown?: string }>): {
    items: MarkerCardItem[];
    wholeIds: string[];
} {
    const items: MarkerCardItem[] = [];
    const wholeIds: string[] = [];

    for (const r of rows) {
        const md = String(r.markdown ?? "").trim();
        if (!md || !r.id) {
            continue;
        }
        const blockID = String(r.id);

        // AQ-11：Obsidian SR 语法识别——单行 `::`/`:::`
        if (!md.includes("\n")) {
            const sr = parseSrLine(md);
            if (sr) {
                const front = stripSrMarkers(sr.front.replace(/#flashcards\S*/g, ""));
                const back = stripSrMarkers(sr.back.replace(/#flashcards\S*/g, ""));
                if (front && back) {
                    items.push({ blockID, kind: "qa", front, back });
                    continue;
                }
            }
        } else {
            // 多行 `?` / `??` 问答块
            const multi = parseSrMultiline(md.split(/\r?\n/));
            if (multi) {
                const front = stripSrMarkers(multi.front.replace(/#flashcards\S*/g, ""));
                const back = stripSrMarkers(multi.back.replace(/#flashcards\S*/g, ""));
                if (front && back) {
                    items.push({ blockID, kind: "qa", front, back });
                    continue;
                }
            }
        }

        // 以「？」结尾的块：整块直接入组
        if (md.endsWith("？")) {
            items.push({ blockID, kind: "whole", front: md.replace(/[*`#]/g, ""), back: "" });
            wholeIds.push(blockID);
        }
    }

    return { items, wholeIds };
}
