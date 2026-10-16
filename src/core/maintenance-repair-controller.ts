import {
    appendRepairJournalEntry, applyBatchRepair, confirmBatchRepair, rollbackBatchRepair,
    updateRepairJournalEntryStatus, previewBatchRepair,
    type BatchRepairPreview, type BatchRepairProposal, type BatchRepairTransaction, type MaintenanceRepairJournal,
} from "./maintenance-repair";
import { createMaintenanceRepairStorage, type MaintenanceRepairHost } from "./maintenance-repair-storage";

interface RepairControllerHost extends Omit<MaintenanceRepairHost, "readCard"> {
    previews: Map<string, BatchRepairPreview>;
    getJournal(): MaintenanceRepairJournal;
    setJournal(journal: MaintenanceRepairJournal): void;
    saveJournal(journal: MaintenanceRepairJournal): Promise<void>;
    querySources(query: string): Promise<Array<Record<string, unknown>>>;
    hasValidOcclusion(blockID: string, markdown: string): Promise<boolean>;
}

/** One operation at a time across all tabs; journal writes are part of the transaction. */
export function createMaintenanceRepairController(host: RepairControllerHost) {
    const readSources = (ids: string[]) => host.querySources(
        `SELECT id, markdown, root_id FROM blocks WHERE id IN (${ids.map(id => `'${id.replace(/'/g, "''")}'`).join(",")})`,
    );
    const storageHost: MaintenanceRepairHost = {
        saveMarkdown: host.saveMarkdown,
        logError: host.logError,
        readCard: async blockID => {
            const row = (await readSources([blockID])).find(item => String(item.id) === blockID);
            return row ? { blockID, markdown: String(row.markdown ?? "") } : null;
        },
    };
    let queue: Promise<unknown> = Promise.resolve();
    function exclusive<T>(run: () => Promise<T>): Promise<T> {
        const operation = queue.then(run, run);
        queue = operation.catch(() => undefined);
        return operation;
    }

    async function commit(
        previous: MaintenanceRepairJournal,
        next: MaintenanceRepairJournal,
        compensate: () => Promise<unknown>,
    ): Promise<void> {
        host.setJournal(next);
        try {
            await host.saveJournal(next);
        } catch (error) {
            // A failed save may already have written. Restore both card contents
            // and the old journal; never report a durable success before saving.
            try {
                await compensate();
            } catch (recoveryError) {
                host.logError?.(`repair journal and compensation failed: ${String(recoveryError)}`);
                throw new Error(`repair journal save failed; recovery incomplete: ${String(error)}; ${String(recoveryError)}`);
            }
            host.setJournal(previous);
            try { await host.saveJournal(previous); }
            catch (recoveryError) { host.logError?.(`repair journal recovery save failed: ${String(recoveryError)}`); }
            throw new Error(`repair journal save failed; card changes restored: ${String(error)}`);
        }
    }

    return {
        preview: async (proposals: BatchRepairProposal[]) => {
            const ids = [...new Set(proposals.map(proposal => String(proposal.blockID ?? "")).filter(Boolean))];
            const rows = ids.length ? await readSources(ids) : [];
            const sources = new Map(rows.map(row => [String(row.id), row]));
            const cards = await Promise.all(ids.map(async blockID => {
                const source = sources.get(blockID);
                const markdown = String(source?.markdown ?? "");
                return {
                    blockID, markdown, rootID: String(source?.root_id ?? ""), exists: Boolean(source),
                    occlusionValid: source ? await host.hasValidOcclusion(blockID, markdown) : false,
                };
            }));
            const preview = previewBatchRepair(cards, proposals);
            if (preview.ok) {
                if (host.previews.size >= 20) {
                    const oldest = host.previews.keys().next().value;
                    if (oldest) host.previews.delete(oldest);
                }
                host.previews.set(preview.previewID, preview);
            }
            return preview;
        },
        apply: (previewID: string) => exclusive(async () => {
            const preview = host.previews.get(previewID);
            if (!preview) throw new Error("repair preview expired or not found");
            const transaction = confirmBatchRepair(preview, { previewID, acknowledged: true });
            // Consume before any I/O, including failed writes and stale snapshots.
            host.previews.delete(previewID);
            const storage = createMaintenanceRepairStorage(transaction.snapshot, storageHost);
            const result = await applyBatchRepair(transaction, storage);
            const previous = host.getJournal();
            const next = appendRepairJournalEntry(previous, {
                schema: 1, previewID, appliedAt: Date.now(), summary: preview.summary,
                diffs: transaction.diffs, snapshot: transaction.snapshot, diffRecord: result.diffRecord,
            });
            await commit(previous, next, () => rollbackBatchRepair(transaction, storage));
            return { blockIDs: result.blockIDs };
        }),
        rollback: () => exclusive(async () => {
            const previous = host.getJournal();
            const entry = previous.entries.find(item => item.diffRecord.status === "applied");
            if (!entry) throw new Error("no applied repair record");
            const transaction: BatchRepairTransaction = {
                schema: 1, previewID: entry.previewID, confirmedAt: entry.appliedAt, baseFingerprint: "",
                diffs: entry.diffs, snapshot: entry.snapshot, diffRecord: entry.diffRecord,
            };
            const storage = createMaintenanceRepairStorage(transaction.snapshot, storageHost);
            const result = await rollbackBatchRepair(transaction, storage);
            const next = updateRepairJournalEntryStatus(previous, entry.previewID, "rolledBack");
            await commit(previous, next, () => applyBatchRepair({
                ...transaction, diffRecord: { ...transaction.diffRecord, status: "confirmed" },
            }, storage));
            return { blockIDs: result.blockIDs, previewID: entry.previewID };
        }),
    };
}
