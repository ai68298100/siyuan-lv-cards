import { describe, expect, it, vi } from "vitest";
import { createSnapshotMutationQueue } from "../src/core/snapshot-mutation-queue";

interface Snapshot {
    version: 1;
    entries: string[];
}

const cloneSnapshot = (current: Snapshot): Snapshot => ({ version: 1, entries: [...current.entries] });

describe("snapshot mutation queue", () => {
    it("keeps the published snapshot after a rejected write and continues with the next operation", async () => {
        let current: Snapshot = { version: 1, entries: ["existing"] };
        const initial = current;
        const save = vi.fn()
            .mockRejectedValueOnce(new Error("disk full"))
            .mockResolvedValueOnce(undefined);
        const commit = vi.fn((next: Snapshot) => { current = next; });
        const mutate = createSnapshotMutationQueue(() => current, cloneSnapshot, save, commit);

        await expect(mutate(next => next.entries.push("rejected"))).rejects.toThrow("disk full");
        expect(current).toBe(initial);
        expect(current.entries).toEqual(["existing"]);
        expect(commit).not.toHaveBeenCalled();

        const result = await mutate(next => next.entries.push("accepted"));
        expect(result.entries).toEqual(["existing", "accepted"]);
        expect(current).toBe(result);
        expect(current.entries).toEqual(["existing", "accepted"]);
        expect(save).toHaveBeenCalledTimes(2);
        expect(commit).toHaveBeenCalledOnce();
    });

    it("serializes concurrent writes and builds each snapshot from the latest committed value", async () => {
        let current: Snapshot = { version: 1, entries: [] };
        let releaseFirst!: () => void;
        const firstWriteGate = new Promise<void>(resolve => { releaseFirst = resolve; });
        let activeWrites = 0;
        let maxActiveWrites = 0;
        const saved: string[][] = [];
        const save = vi.fn(async (next: Snapshot) => {
            activeWrites++;
            maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
            saved.push([...next.entries]);
            if (saved.length === 1) await firstWriteGate;
            activeWrites--;
        });
        const mutate = createSnapshotMutationQueue(
            () => current,
            cloneSnapshot,
            save,
            next => { current = next; },
        );

        const first = mutate(next => next.entries.push("first"));
        const second = mutate(next => next.entries.push("second"));
        await Promise.resolve();

        expect(save).toHaveBeenCalledOnce();
        expect(current.entries).toEqual([]);
        expect(saved).toEqual([["first"]]);

        releaseFirst();
        await Promise.all([first, second]);

        expect(maxActiveWrites).toBe(1);
        expect(saved).toEqual([["first"], ["first", "second"]]);
        expect(current.entries).toEqual(["first", "second"]);
    });
});
