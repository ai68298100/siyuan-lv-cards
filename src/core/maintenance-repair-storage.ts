import type { BatchRepairStorage, MaintenanceRepairSnapshot } from "./maintenance-repair";

/** A single exact original value captured by the active repair transaction. */
export interface RepairSnapshotWrite {
    readonly blockID: string;
    readonly markdown: string;
}

export interface MaintenanceRepairHost {
    readCard: BatchRepairStorage["readCard"];
    saveMarkdown: (blockID: string, markdown: string, recovery?: RepairSnapshotWrite) => Promise<boolean | string>;
    logError?: BatchRepairStorage["logError"];
}

/**
 * Keep ordinary writes behind the editor gate while allowing compensation of
 * invalid legacy sources. The captured values are copied and never exposed;
 * a caller cannot turn restoreMarkdown into an arbitrary validation bypass.
 */
export function createMaintenanceRepairStorage(
    snapshot: MaintenanceRepairSnapshot,
    host: MaintenanceRepairHost,
): BatchRepairStorage {
    const originals = new Map(snapshot.entries.map(entry => [entry.blockID,
        Object.freeze({ blockID: entry.blockID, markdown: entry.markdown }),
    ] as const));
    const save = async (blockID: string, markdown: string, recovery?: RepairSnapshotWrite) => {
        const saved = await host.saveMarkdown(blockID, markdown, recovery);
        if (saved !== true) throw new Error(typeof saved === "string" ? saved : "repair write failed");
    };
    return {
        readCard: host.readCard,
        writeMarkdown: (blockID, markdown) => save(blockID, markdown),
        restoreMarkdown: (blockID, markdown) => {
            const original = originals.get(blockID);
            if (!original || original.markdown !== markdown) {
                return Promise.reject(new Error(`repair recovery snapshot mismatch: ${blockID}`));
            }
            return save(blockID, markdown, original);
        },
        logError: host.logError,
    };
}
