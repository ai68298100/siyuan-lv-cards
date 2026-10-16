/**
 * 维护页批量修复的安全契约（纯逻辑 + 可注入存储适配器）。
 *
 * 批量修复必须经过「预览 → 明确确认 → 事务写入」三个阶段；预览失败或
 * 写入前发现来源已变化时，不得写入任何卡。每个已确认计划都携带修复前
 * 快照和字段级差异，宿主可以用同一个事务执行器回滚到该快照。
 *
 * 本模块不连接思源 API，也不负责 UI 确认弹窗。`applyBatchRepair` 与
 * `rollbackBatchRepair` 只接受调用方注入的读写适配器，便于先在 node 中
 * 单测并保证失败时沿用 data-transfer 的补偿回滚语义。
 */

import { applyRestoreTransaction } from "./data-transfer";
import { checksumOf } from "./backup";
import { validateCardEntry, type CardEntryCandidate } from "./card-entry-gate";

export const MAINTENANCE_REPAIR_SCHEMA = 1;

/** 扫描结果中可被批量修复的最小卡片形态。 */
export interface MaintenanceRepairCard extends CardEntryCandidate {
    /** 仅用于审计；修复事务只改 markdown，不改卡的其它属性。 */
    rootID?: string;
}

/** 一个候选修复，只允许替换整块 markdown；不支持批量删除或新建卡。 */
export interface BatchRepairProposal {
    blockID: string;
    afterMarkdown: string;
    /** 供维护页显示的人工/规则原因，不参与写入。 */
    reason?: string;
    /** 可选的生成时快照；存在时必须和预览输入一致。 */
    expectedMarkdown?: string;
}

export type BatchRepairDiffAction = "update" | "unchanged" | "rejected";

/** 预览中每个候选的可审计差异。 */
export interface BatchRepairDiff {
    blockID: string;
    action: BatchRepairDiffAction;
    beforeMarkdown?: string;
    afterMarkdown?: string;
    reason?: string;
    errors?: string[];
}

export interface BatchRepairSummary {
    update: number;
    unchanged: number;
    rejected: number;
}

export interface RepairSnapshotEntry {
    blockID: string;
    markdown: string;
    attrs?: Record<string, string>;
    exists?: boolean;
    occlusionValid?: boolean;
}

/** 修复前快照；只包含真正会被替换的卡。 */
export interface MaintenanceRepairSnapshot {
    schema: typeof MAINTENANCE_REPAIR_SCHEMA;
    snapshotID: string;
    createdAt: number;
    entries: RepairSnapshotEntry[];
}

export type BatchRepairRecordStatus = "planned" | "confirmed" | "applied" | "rolledBack" | "failed";

/** 可持久化的差异记录，不包含任何外部存储引用。 */
export interface BatchRepairDiffRecord {
    schema: typeof MAINTENANCE_REPAIR_SCHEMA;
    previewID: string;
    status: BatchRepairRecordStatus;
    createdAt: number;
    updatedAt: number;
    summary: BatchRepairSummary;
    diffs: BatchRepairDiff[];
    error?: string;
}

export interface BatchRepairPreview {
    schema: typeof MAINTENANCE_REPAIR_SCHEMA;
    previewID: string;
    createdAt: number;
    /** 输入卡集合指纹；实际写入前仍会逐卡比对，指纹用于审计。 */
    baseFingerprint: string;
    ok: boolean;
    errors: string[];
    diffs: BatchRepairDiff[];
    summary: BatchRepairSummary;
    snapshot: MaintenanceRepairSnapshot;
    diffRecord: BatchRepairDiffRecord;
}

export interface BatchRepairConfirmation {
    previewID: string;
    acknowledged: true;
}

export interface BatchRepairTransaction {
    schema: typeof MAINTENANCE_REPAIR_SCHEMA;
    previewID: string;
    confirmedAt: number;
    baseFingerprint: string;
    diffs: BatchRepairDiff[];
    snapshot: MaintenanceRepairSnapshot;
    diffRecord: BatchRepairDiffRecord;
}

/** 宿主适配器只需提供读卡和写 markdown；模块负责顺序与补偿回滚。 */
export interface BatchRepairStorage {
    readCard: (blockID: string) => Promise<{ blockID: string; markdown: string } | null>;
    writeMarkdown: (blockID: string, markdown: string) => Promise<void>;
    /** Restore a captured old value, which can itself be an invalid legacy card. */
    restoreMarkdown?: (blockID: string, markdown: string) => Promise<void>;
    logError?: (message: string) => void;
}

/** Only exact captured values may use the host's recovery channel. */
function writeRepairValue(
    transaction: BatchRepairTransaction,
    storage: BatchRepairStorage,
    blockID: string,
    markdown: string,
): Promise<void> {
    const original = transaction.snapshot.entries.find(entry => entry.blockID === blockID);
    if (storage.restoreMarkdown && original?.markdown === markdown) {
        return storage.restoreMarkdown(blockID, markdown);
    }
    return storage.writeMarkdown(blockID, markdown);
}

export interface BatchRepairApplyResult {
    blockIDs: string[];
    diffRecord: BatchRepairDiffRecord;
}

function cloneAttrs(attrs: Record<string, string> | undefined): Record<string, string> | undefined {
    return attrs ? { ...attrs } : undefined;
}

function cloneCard(card: MaintenanceRepairCard): MaintenanceRepairCard {
    const copy: MaintenanceRepairCard = { ...card };
    const attrs = cloneAttrs(card.attrs);
    if (attrs) copy.attrs = attrs;
    return copy;
}

function cloneDiff(diff: BatchRepairDiff): BatchRepairDiff {
    return { ...diff, errors: diff.errors ? [...diff.errors] : undefined };
}

function cloneSnapshot(snapshot: MaintenanceRepairSnapshot): MaintenanceRepairSnapshot {
    return {
        ...snapshot,
        entries: snapshot.entries.map(entry => ({ ...entry, attrs: cloneAttrs(entry.attrs) })),
    };
}

function cloneSummary(summary: BatchRepairSummary): BatchRepairSummary {
    return { ...summary };
}

function cardsFingerprint(cards: readonly MaintenanceRepairCard[]): string {
    return checksumOf(cards.map((card, index) => ({
        index,
        blockID: String(card.blockID ?? ""),
        markdown: String(card.markdown ?? ""),
        attrs: card.attrs ?? null,
        exists: card.exists,
        occlusionValid: card.occlusionValid,
    })).sort((a, b) => a.blockID.localeCompare(b.blockID) || a.index - b.index));
}

function createDiffRecord(
    previewID: string,
    createdAt: number,
    summary: BatchRepairSummary,
    diffs: readonly BatchRepairDiff[],
    status: BatchRepairRecordStatus = "planned",
): BatchRepairDiffRecord {
    return {
        schema: MAINTENANCE_REPAIR_SCHEMA,
        previewID,
        status,
        createdAt,
        updatedAt: createdAt,
        summary: cloneSummary(summary),
        diffs: diffs.map(cloneDiff),
    };
}

/**
 * 生成批量修复预览。任何候选失败都会令整个预览 `ok=false`，调用方不可
 * 仅应用通过的子集，从而保证「批量」语义是 all-or-nothing。
 */
export function previewBatchRepair(
    cards: readonly MaintenanceRepairCard[],
    proposals: readonly BatchRepairProposal[],
    now: number = Date.now(),
): BatchRepairPreview {
    const errors: string[] = [];
    const byID = new Map<string, MaintenanceRepairCard>();
    const duplicateCards = new Set<string>();
    cards.forEach((card, index) => {
        const blockID = String(card.blockID ?? "");
        if (!blockID) {
            errors.push(`card[${index}]: missing blockID`);
            return;
        }
        if (byID.has(blockID)) duplicateCards.add(blockID);
        else byID.set(blockID, cloneCard(card));
    });
    for (const blockID of [...duplicateCards].sort()) errors.push(`duplicate card: ${blockID}`);

    const seenProposals = new Set<string>();
    const diffs: BatchRepairDiff[] = [];
    const snapshotEntries: RepairSnapshotEntry[] = [];
    let update = 0;
    let unchanged = 0;
    let rejected = 0;

    proposals.forEach((proposal, index) => {
        const blockID = String(proposal?.blockID ?? "");
        const proposalErrors: string[] = [];
        if (!blockID) proposalErrors.push(`proposal[${index}]: missing blockID`);
        else if (seenProposals.has(blockID)) proposalErrors.push(`duplicate proposal: ${blockID}`);
        else seenProposals.add(blockID);

        const card = blockID ? byID.get(blockID) : undefined;
        if (blockID && duplicateCards.has(blockID)) proposalErrors.push(`duplicate card: ${blockID}`);
        if (blockID && !card) proposalErrors.push(`missing card: ${blockID}`);

        const before = card?.markdown;
        const after = typeof proposal?.afterMarkdown === "string" ? proposal.afterMarkdown : "";
        if (card && proposal.expectedMarkdown !== undefined && proposal.expectedMarkdown !== before) {
            proposalErrors.push(`stale source: ${blockID}`);
        }

        if (card && before === after && proposalErrors.length === 0) {
            unchanged += 1;
            diffs.push({ blockID, action: "unchanged", beforeMarkdown: before, afterMarkdown: after, reason: proposal.reason });
            return;
        }

        if (card && before !== after && proposalErrors.length === 0) {
            const decision = validateCardEntry({ ...card, markdown: after });
            if (!decision.ok) proposalErrors.push(`invalid target: ${blockID}:${decision.issue ?? "unknown"}`);
        }

        if (proposalErrors.length > 0) {
            rejected += 1;
            errors.push(...proposalErrors);
            diffs.push({
                blockID,
                action: "rejected",
                beforeMarkdown: before,
                afterMarkdown: typeof proposal?.afterMarkdown === "string" ? proposal.afterMarkdown : undefined,
                reason: proposal.reason,
                errors: proposalErrors,
            });
            return;
        }

        update += 1;
        diffs.push({ blockID, action: "update", beforeMarkdown: before, afterMarkdown: after, reason: proposal.reason });
        snapshotEntries.push({
            blockID,
            markdown: before ?? "",
            attrs: cloneAttrs(card?.attrs),
            exists: card?.exists,
            occlusionValid: card?.occlusionValid,
        });
    });

    if (proposals.length === 0) errors.push("no proposals");
    if (proposals.length > 0 && update === 0 && rejected === 0) errors.push("no changes");

    const summary = { update, unchanged, rejected };
    const baseFingerprint = cardsFingerprint(cards);
    const previewID = checksumOf({ schema: MAINTENANCE_REPAIR_SCHEMA, createdAt: now, baseFingerprint, diffs });
    const snapshotEntriesFinal = errors.length === 0 ? snapshotEntries : [];
    const snapshot: MaintenanceRepairSnapshot = {
        schema: MAINTENANCE_REPAIR_SCHEMA,
        snapshotID: checksumOf({ schema: MAINTENANCE_REPAIR_SCHEMA, previewID, entries: snapshotEntriesFinal }),
        createdAt: now,
        entries: snapshotEntriesFinal,
    };
    const diffRecord = createDiffRecord(previewID, now, summary, diffs);
    return {
        schema: MAINTENANCE_REPAIR_SCHEMA,
        previewID,
        createdAt: now,
        baseFingerprint,
        ok: errors.length === 0,
        errors,
        diffs,
        summary,
        snapshot,
        diffRecord,
    };
}

/** 由 UI 在用户明确确认后调用；错误预览或错误 token 均拒绝生成可写事务。 */
export function confirmBatchRepair(
    preview: BatchRepairPreview,
    confirmation: BatchRepairConfirmation,
    now: number = Date.now(),
): BatchRepairTransaction {
    if (!preview.ok) throw new Error(`repair preview rejected: ${preview.errors.join("; ")}`);
    if (preview.previewID !== confirmation?.previewID || confirmation?.acknowledged !== true) {
        throw new Error("repair confirmation mismatch");
    }
    const record = transitionBatchRepairRecord(preview.diffRecord, "confirmed", now);
    return {
        schema: MAINTENANCE_REPAIR_SCHEMA,
        previewID: preview.previewID,
        confirmedAt: now,
        baseFingerprint: preview.baseFingerprint,
        diffs: preview.diffs.filter(diff => diff.action === "update").map(cloneDiff),
        snapshot: cloneSnapshot(preview.snapshot),
        diffRecord: record,
    };
}

const ALLOWED_RECORD_TRANSITIONS: Record<BatchRepairRecordStatus, readonly BatchRepairRecordStatus[]> = {
    planned: ["confirmed", "failed"],
    // The transaction object is immutable and remains `confirmed` after the
    // host applies it; rollback therefore legitimately starts from this record
    // as well as from a separately persisted `applied` record.
    confirmed: ["applied", "rolledBack", "failed"],
    applied: ["rolledBack", "failed"],
    rolledBack: [],
    failed: [],
};

/** 差异记录的不可变状态转移，供宿主持久化审计结果。 */
export function transitionBatchRepairRecord(
    record: BatchRepairDiffRecord,
    nextStatus: BatchRepairRecordStatus,
    now: number = Date.now(),
    error?: string,
): BatchRepairDiffRecord {
    if (!ALLOWED_RECORD_TRANSITIONS[record.status].includes(nextStatus)) {
        throw new Error(`invalid repair record transition: ${record.status} -> ${nextStatus}`);
    }
    return {
        ...record,
        status: nextStatus,
        updatedAt: now,
        diffs: record.diffs.map(cloneDiff),
        summary: cloneSummary(record.summary),
        ...(error ? { error } : {}),
    };
}

async function assertStorageMatches(
    transaction: BatchRepairTransaction,
    storage: BatchRepairStorage,
    phase: "before" | "after",
): Promise<void> {
    const expected = phase === "before"
        ? new Map(transaction.snapshot.entries.map(entry => [entry.blockID, entry.markdown]))
        : new Map(transaction.diffs.map(diff => [diff.blockID, diff.afterMarkdown ?? ""]));
    const mismatches: string[] = [];
    for (const blockID of expected.keys()) {
        const actual = await storage.readCard(blockID);
        if (!actual) {
            mismatches.push(`${blockID}:missing`);
        } else if (actual.blockID !== blockID || actual.markdown !== expected.get(blockID)) {
            mismatches.push(`${blockID}:changed`);
        }
    }
    if (mismatches.length > 0) throw new Error(`repair ${phase} snapshot mismatch: ${mismatches.join(", ")}`);
}

/**
 * 应用已确认事务。写入前逐卡检查修复前快照，之后复用 data-transfer 的
 * applyRestoreTransaction 做逆序补偿；任一写入失败都会抛错且尝试恢复原值，
 * 包括“宿主已经写入失败 key 后才抛错”的适配器。
 */
export async function applyBatchRepair(
    transaction: BatchRepairTransaction,
    storage: BatchRepairStorage,
    now: number = Date.now(),
): Promise<BatchRepairApplyResult> {
    if (transaction.diffRecord.status !== "confirmed") {
        throw new Error(`repair transaction is not confirmed: ${transaction.diffRecord.status}`);
    }
    await assertStorageMatches(transaction, storage, "before");
    const restoreFiles: Record<string, unknown> = {};
    const currentFiles: Record<string, unknown> = {};
    for (const diff of transaction.diffs) {
        restoreFiles[diff.blockID] = diff.afterMarkdown ?? "";
        currentFiles[diff.blockID] = diff.beforeMarkdown ?? "";
    }
    const blockIDs = await applyRestoreTransaction({
        restoreFiles,
        currentFiles,
        saveFile: (blockID, markdown) => writeRepairValue(transaction, storage, blockID, String(markdown ?? "")),
        rollbackFailedKey: true,
        logError: storage.logError,
    });
    return {
        blockIDs,
        diffRecord: transitionBatchRepairRecord(transaction.diffRecord, "applied", now),
    };
}

/**
 * 按快照恢复已应用的批量修复。恢复前要求每张卡仍保持修复后的内容，
 * 防止把用户在修复后做的新编辑静默覆盖；失败时同样走补偿回滚。
 */
export async function rollbackBatchRepair(
    transaction: BatchRepairTransaction,
    storage: BatchRepairStorage,
    now: number = Date.now(),
): Promise<BatchRepairApplyResult> {
    if (transaction.diffRecord.status !== "confirmed" && transaction.diffRecord.status !== "applied") {
        throw new Error(`repair transaction cannot rollback from status: ${transaction.diffRecord.status}`);
    }
    await assertStorageMatches(transaction, storage, "after");
    const restoreFiles: Record<string, unknown> = {};
    const currentFiles: Record<string, unknown> = {};
    for (const entry of transaction.snapshot.entries) {
        restoreFiles[entry.blockID] = entry.markdown;
        const diff = transaction.diffs.find(item => item.blockID === entry.blockID);
        currentFiles[entry.blockID] = diff?.afterMarkdown ?? "";
    }
    const blockIDs = await applyRestoreTransaction({
        restoreFiles,
        currentFiles,
        saveFile: (blockID, markdown) => writeRepairValue(transaction, storage, blockID, String(markdown ?? "")),
        rollbackFailedKey: true,
        logError: storage.logError,
    });
    return {
        blockIDs,
        diffRecord: transitionBatchRepairRecord(transaction.diffRecord, "rolledBack", now),
    };
}

/** 预览空变更时也可生成审计记录，但不能拿它生成可写事务。 */
export function createBatchRepairDiffRecordForPreview(preview: BatchRepairPreview): BatchRepairDiffRecord {
    return {
        ...preview.diffRecord,
        summary: cloneSummary(preview.diffRecord.summary),
        diffs: preview.diffRecord.diffs.map(cloneDiff),
    };
}
