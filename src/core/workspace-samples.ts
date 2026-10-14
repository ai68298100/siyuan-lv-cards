/**
 * 示例卡与示例工作区生成引擎（AR-4）
 * 包含新手引导示例卡（Onboarding Samples）与独立示例工作区（Sample Workspace）的创建、
 * 断点标记恢复、防重复建卡、以及卡组按名复用逻辑。
 */

import { createRiffDeck, getRiffCards, getRiffDecks } from "../api/riff";
import { addRiffCards } from "../api/due-shared";
import { appendBlock, createDocWithMd, sqlQuery } from "../api/siyuan";
import { sampleCards } from "../help";

export interface SampleDocResult {
    docID: string;
    createdCount: number;
    alreadyExisted: boolean;
}

/**
 * 按名称查找或创建 Riff 卡组（重试不重复建组）
 */
export async function findOrCreateRiffDeck(deckName: string): Promise<{ id: string; name: string }> {
    const decks = await getRiffDecks();
    const existing = decks.find(d => d.name === deckName);
    if (existing) {
        return { id: String(existing.id), name: existing.name };
    }
    const created = await createRiffDeck(deckName);
    const newId = (created as any)?.id ?? created;
    return { id: String(newId), name: deckName };
}

/**
 * 创建新手引导示例卡（5 张核心题型：qa/cloze/cloze-2/formula/list）
 * 具备标记断点恢复：半途失败时只补缺失块，且幂等入组。
 */
export async function createOnboardingSampleCards(
    nbId: string,
    i18n: Record<string, any>,
): Promise<string> {
    const deckName = String(i18n.onboardingDeckName ?? "示例卡组");
    const deck = await findOrCreateRiffDeck(deckName);

    const docID = await createDocWithMd(nbId, "小驴闪卡/示例卡", "");
    if (!docID) {
        throw new Error(i18n.quickCardFail ?? "创建示例卡文档失败");
    }

    const escapedDoc = docID.replace(/'/g, "''");
    const existing = await sqlQuery(
        `SELECT id, markdown FROM blocks WHERE root_id='${escapedDoc}' AND markdown LIKE '%lv-cards-sample:%'`,
    );

    const samples = [
        ["qa", i18n.onboardingSample1],
        ["cloze", i18n.onboardingSample2],
        ["cloze-2", i18n.onboardingSample3],
        ["formula", i18n.onboardingSample4],
        ["list", i18n.onboardingSample5],
    ] as const;

    const ids: string[] = [];
    for (const [kind, content] of samples) {
        const marker = `lv-cards-sample:${kind}`;
        const found = existing.find(row => String(row.markdown ?? "").includes(marker));
        if (found?.id) {
            ids.push(String(found.id));
            continue;
        }
        const created = await appendBlock("markdown", `<!-- ${marker} -->${content}`, docID);
        if (created?.[0]) {
            ids.push(created[0]);
        }
    }

    if (ids.length !== samples.length) {
        throw new Error(i18n.quickCardFail ?? "创建示例卡块失败");
    }

    const deckCards = await getRiffCards(deck.id, 1, 100);
    const inDeck = new Set(deckCards.blocks.map(block => block.id));
    const missingFromDeck = ids.filter(id => !inDeck.has(id));
    if (missingFromDeck.length > 0) {
        await addRiffCards(deck.id, missingFromDeck);
    }

    return docID;
}

/**
 * 生成全套示例工作区文档（命令面板调用）
 */
export async function createFullSampleWorkspace(
    nbId: string,
    i18n: Record<string, any>,
): Promise<SampleDocResult> {
    const deck = await findOrCreateRiffDeck("示例卡组");

    const docID = await createDocWithMd(nbId, "小驴闪卡/示例卡片", "");
    if (!docID) {
        throw new Error(i18n.quickCardFail ?? "创建示例卡片文档失败");
    }

    const escapedDoc = docID.replace(/'/g, "''");
    const existing = await sqlQuery(
        `SELECT id FROM blocks WHERE root_id='${escapedDoc}' AND content LIKE '示例 %'`,
    );
    if (existing.length > 0) {
        return { docID, createdCount: 0, alreadyExisted: true };
    }

    const samples = sampleCards();
    const ids: string[] = [];
    for (const md of samples) {
        const r = await appendBlock("markdown", md, docID);
        if (r?.length) {
            ids.push(r[0]);
        }
    }

    if (ids.length > 0) {
        await addRiffCards(deck.id, ids);
    }

    return { docID, createdCount: ids.length, alreadyExisted: false };
}
