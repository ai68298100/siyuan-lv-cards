import { validateCardEntry, type CardEntryIssue } from "./card-entry-gate";

export interface ReviewQualityCard {
    blockID: string;
    cardID?: string;
}

export interface ReviewQualityRow {
    id: string;
    markdown: string;
}

export interface ReviewQualityResult<T extends ReviewQualityCard> {
    valid: T[];
    invalid: Array<{ blockID: string; cardID: string; issue: CardEntryIssue }>;
}

/**
 * 保留内核队列顺序，隔离结构无效或无法映射到来源块的存量卡。
 * 这是本场呈现过滤，不会评分、跳过或改动内核 due。
 */
export function partitionReviewCardsByQuality<T extends ReviewQualityCard>(
    cards: T[],
    rows: ReviewQualityRow[],
    validOcclusionBlockIDs: ReadonlySet<string> = new Set(),
): ReviewQualityResult<T> {
    const markdownByID = new Map(rows.map(row => [String(row.id), String(row.markdown ?? "")]));
    const valid: T[] = [];
    const invalid: Array<{ blockID: string; cardID: string; issue: CardEntryIssue }> = [];
    for (const card of cards) {
        const blockID = String(card.blockID ?? "");
        const exists = markdownByID.has(blockID);
        const decision = validateCardEntry({
            blockID,
            markdown: markdownByID.get(blockID) ?? "",
            occlusionValid: validOcclusionBlockIDs.has(blockID),
            exists,
        });
        if (decision.ok) valid.push(card);
        else invalid.push({ blockID, cardID: String(card.cardID ?? ""), issue: decision.issue ?? "missing-block" });
    }
    return { valid, invalid };
}
