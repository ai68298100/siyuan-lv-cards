import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyBatchRepair, confirmBatchRepair, previewBatchRepair } from "../src/core/maintenance-repair";
import { createMaintenanceRepairStorage } from "../src/core/maintenance-repair-storage";
import { emptyContentVersions, versionsOf } from "../src/core/content-versions";

const { updateBlock, getRiffCardsByBlockIDs } = vi.hoisted(() => ({
    updateBlock: vi.fn(),
    getRiffCardsByBlockIDs: vi.fn(),
}));
vi.mock("../src/api/siyuan", async importOriginal => ({
    ...await importOriginal<typeof import("../src/api/siyuan")>(),
    updateBlock,
}));
vi.mock("../src/api/riff", async importOriginal => ({
    ...await importOriginal<typeof import("../src/api/riff")>(),
    getRiffCardsByBlockIDs,
}));

import LvCardsPlugin from "../src/index";

/** Use the actual shell save method: only kernel I/O and plugin persistence are fakes. */
function createHost(initial: Record<string, string>) {
    const current = { ...initial };
    const plugin = {
        contentVersionQueue: Promise.resolve(),
        contentVersions: emptyContentVersions(),
        persist: { save: vi.fn(async () => undefined) },
        i18n: { editor: { qualityMissingAnswer: "missing answer", qualityMissingQuestion: "missing question", qualityInvalidMarkup: "invalid markup" } },
        hasValidOcclusionCard: vi.fn(async () => false),
    };
    const saveMarkdown = (LvCardsPlugin.prototype as any).saveBlockContentVersion.bind(plugin);
    getRiffCardsByBlockIDs.mockImplementation(async (ids: string[]) => ({ blocks: ids.map(id => ({ id })) }));
    updateBlock.mockImplementation(async (_type: string, markdown: string, blockID: string) => {
        current[blockID] = markdown;
    });
    return {
        current,
        plugin,
        saveMarkdown,
        readCard: async (blockID: string) => blockID in current ? { blockID, markdown: current[blockID] } : null,
    };
}

function repair(initial: Record<string, string>) {
    const preview = previewBatchRepair(Object.entries(initial).map(([blockID, markdown]) => ({ blockID, markdown })),
        Object.keys(initial).map(blockID => ({ blockID, afterMarkdown: `题面 ${blockID} ==修正答案==` })), 100);
    expect(preview.ok).toBe(true);
    return confirmBatchRepair(preview, { previewID: preview.previewID, acknowledged: true }, 101);
}

describe("maintenance repair uses the shell quality gate and snapshot recovery", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("restores invalid legacy cards when the second kernel write fails after applying", async () => {
        const initial = { a: "==旧答案 A==", b: "没有答案标记 B" };
        const host = createHost(initial);
        const transaction = repair(initial);
        const storage = createMaintenanceRepairStorage(transaction.snapshot, host);
        updateBlock.mockImplementation(async (_type: string, markdown: string, blockID: string) => {
            host.current[blockID] = markdown;
            if (blockID === "b" && markdown === transaction.diffs[1].afterMarkdown) throw new Error("kernel write failed after applying");
        });

        await expect(storage.writeMarkdown("a", initial.a)).rejects.toThrow("missing question");
        expect(updateBlock).not.toHaveBeenCalled();
        await expect(applyBatchRepair(transaction, storage)).rejects.toThrow("kernel write failed after applying");
        expect(host.current).toEqual(initial);
        expect(updateBlock.mock.calls.map(([, markdown, blockID]) => [blockID, markdown])).toEqual([
            ["a", transaction.diffs[0].afterMarkdown], ["b", transaction.diffs[1].afterMarkdown],
            ["b", initial.b], ["a", initial.a],
        ]);
        expect(versionsOf(host.plugin.contentVersions, "a")[0].md).toBe(initial.a);
        expect(versionsOf(host.plugin.contentVersions, "b")[0].md).toBe(initial.b);
        await host.plugin.contentVersionQueue;

        // Recovery has not disabled the normal editor gate for subsequent saves.
        await expect(host.saveMarkdown("a", "仍然没有答案")).resolves.toBe("missing answer");
        expect(host.current).toEqual(initial);
        await expect(host.saveMarkdown("a", "新的题面 ==新的答案==")).resolves.toBe(true);
    });

    it("restores the source when content-version persistence fails after the kernel update", async () => {
        const initial = { a: "==旧答案==" };
        const host = createHost(initial);
        const transaction = repair(initial);
        host.plugin.persist.save.mockRejectedValueOnce(new Error("version persistence failed"));

        await expect(applyBatchRepair(transaction, createMaintenanceRepairStorage(transaction.snapshot, host)))
            .rejects.toThrow("version persistence failed");
        expect(host.current).toEqual(initial);
        expect(versionsOf(host.plugin.contentVersions, "a").map(version => version.md)).toEqual([initial.a]);
        expect(host.plugin.persist.save).toHaveBeenCalledTimes(2);
        await host.plugin.contentVersionQueue;
        await expect(host.saveMarkdown("a", "重试题面 ==重试答案==")).resolves.toBe(true);
    });

    it("copies captured values and rejects arbitrary recovery writes before touching the host", async () => {
        const initial = { a: "==精确旧答案==" };
        const host = createHost(initial);
        const transaction = repair(initial);
        const storage = createMaintenanceRepairStorage(transaction.snapshot, host);
        transaction.snapshot.entries[0].markdown = "任意伪造内容";

        await expect(storage.restoreMarkdown!("a", "任意伪造内容")).rejects.toThrow("recovery snapshot mismatch");
        await expect(storage.restoreMarkdown!("other", initial.a)).rejects.toThrow("recovery snapshot mismatch");
        expect(updateBlock).not.toHaveBeenCalled();
        expect(host.plugin.persist.save).not.toHaveBeenCalled();
        await expect(storage.restoreMarkdown!("a", initial.a)).resolves.toBeUndefined();
        expect(host.current).toEqual(initial);
        await expect(storage.writeMarkdown("a", "==任意新答案==")).rejects.toThrow("missing question");
        expect(host.current).toEqual(initial);
    });
});
