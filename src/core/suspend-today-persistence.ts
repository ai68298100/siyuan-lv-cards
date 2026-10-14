import { suspend, unsuspend, type SuspendTodayData } from "./suspend-today";

/** Persist first, then publish the new snapshot. Serializing mutations keeps concurrent callers from losing updates. */
export function createSuspendTodayMutations(
    getCurrent: () => SuspendTodayData,
    save: (next: SuspendTodayData) => Promise<void>,
    commit: (next: SuspendTodayData) => void,
) {
    let queue = Promise.resolve();

    function mutate(blockIDs: string[], action: "suspend" | "unsuspend"): Promise<void> {
        const operation = queue.then(async () => {
            const current = getCurrent();
            const next: SuspendTodayData = { date: current.date, cardIDs: [...current.cardIDs] };
            for (const blockID of blockIDs) {
                if (action === "suspend") suspend(next, blockID);
                else unsuspend(next, blockID);
            }
            await save(next);
            commit(next);
        });
        queue = operation.catch(() => undefined);
        return operation;
    }

    return {
        suspend: (blockIDs: string[]) => mutate(blockIDs, "suspend"),
        unsuspend: (blockIDs: string[]) => mutate(blockIDs, "unsuspend"),
    };
}
