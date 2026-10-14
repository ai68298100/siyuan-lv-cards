/** Serialize snapshot mutations and publish each snapshot only after persistence succeeds. */
export function createSnapshotMutationQueue<T>(
    getCurrent: () => T,
    clone: (current: T) => T,
    save: (next: T) => Promise<void>,
    commit: (next: T) => void,
): (mutate: (next: T) => void) => Promise<T> {
    let queue: Promise<void> = Promise.resolve();

    return mutate => {
        const operation = queue.then(async () => {
            const next = clone(getCurrent());
            mutate(next);
            await save(next);
            commit(next);
            return next;
        });
        queue = operation.then(() => undefined, () => undefined);
        return operation;
    };
}
