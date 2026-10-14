import { describe, expect, it, vi } from "vitest";
import { createSuspendTodayMutations } from "../src/core/suspend-today-persistence";
import { emptySuspendToday, type SuspendTodayData } from "../src/core/suspend-today";

describe("suspend-today persistence", () => {
    it("keeps the old snapshot after a failed write and commits only after retry succeeds", async () => {
        let current = emptySuspendToday();
        const initial = current;
        const save = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValueOnce(undefined);
        const commit = vi.fn((next: SuspendTodayData) => { current = next; });
        const mutations = createSuspendTodayMutations(() => current, save, commit);

        await expect(mutations.suspend(["card-a", "card-b"])).rejects.toThrow("disk full");
        expect(current).toBe(initial);
        expect(current.cardIDs).toEqual([]);
        expect(commit).not.toHaveBeenCalled();

        await mutations.suspend(["card-a", "card-b"]);
        expect(current.cardIDs).toEqual(["card-a", "card-b"]);
        expect(commit).toHaveBeenCalledOnce();
        expect(save).toHaveBeenCalledTimes(2);
    });

    it("serializes concurrent mutations against the latest committed snapshot", async () => {
        let current = emptySuspendToday();
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const save = vi.fn(async () => {
            if (save.mock.calls.length === 1) await gate;
        });
        const commit = vi.fn((next: SuspendTodayData) => { current = next; });
        const mutations = createSuspendTodayMutations(() => current, save, commit);

        const first = mutations.suspend(["card-a"]);
        const second = mutations.suspend(["card-b"]);
        await Promise.resolve();
        expect(save).toHaveBeenCalledOnce();
        release();
        await Promise.all([first, second]);

        expect(current.cardIDs).toEqual(["card-a", "card-b"]);
        expect(save).toHaveBeenCalledTimes(2);
    });

    it("does not remove paused cards from memory when resume fails", async () => {
        let current = { ...emptySuspendToday(), cardIDs: ["card-a", "card-b"] };
        const initial = current;
        const save = vi.fn().mockRejectedValueOnce(new Error("disk full"));
        const mutations = createSuspendTodayMutations(() => current, save, next => { current = next; });

        await expect(mutations.unsuspend(["card-a"])).rejects.toThrow("disk full");
        expect(current).toBe(initial);
        expect(current.cardIDs).toEqual(["card-a", "card-b"]);
        expect(save).toHaveBeenCalledWith({ ...initial, cardIDs: ["card-b"] });
    });
});
