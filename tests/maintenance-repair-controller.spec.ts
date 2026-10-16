import { describe, expect, it, vi } from "vitest";
import { createMaintenanceRepairController } from "../src/core/maintenance-repair-controller";
import { createEmptyRepairJournal, previewBatchRepair, type MaintenanceRepairJournal } from "../src/core/maintenance-repair";

function setup() {
    const current = { a: "==旧坏卡==" };
    const preview = previewBatchRepair([{ blockID: "a", markdown: current.a }], [
        { blockID: "a", afterMarkdown: "修复后的问题 ==答案==" },
    ]);
    expect(preview.ok).toBe(true);
    const previews = new Map([[preview.previewID, preview]]);
    let journal = createEmptyRepairJournal();
    let disk = journal;
    const saveJournal = vi.fn(async (next: MaintenanceRepairJournal) => { disk = structuredClone(next); });
    const saveMarkdown = vi.fn(async (_id: string, markdown: string) => { current.a = markdown; return true; });
    const logError = vi.fn();
    const controller = createMaintenanceRepairController({
        previews,
        getJournal: () => journal,
        setJournal: next => { journal = next; },
        saveJournal,
        querySources: async () => [{ id: "a", markdown: current.a, root_id: "doc" }],
        hasValidOcclusion: async () => false,
        saveMarkdown,
        logError,
    });
    return { current, preview, previews, controller, saveJournal, saveMarkdown, logError, journal: () => journal, disk: () => disk };
}

describe("durable maintenance repair controller", () => {
    it("re-reads the current source when previewing and rejects later edits", async () => {
        const host = setup();
        const preview = await host.controller.preview([{ blockID: "a", afterMarkdown: "新问题 ==新答案==" }]);
        expect(preview.ok).toBe(true);
        expect(preview.snapshot.entries[0].markdown).toBe(host.current.a);
        expect(host.previews.get(preview.previewID)).toBe(preview);
        host.current.a = "用户后来编辑的问题 ==答案==";
        await expect(host.controller.apply(preview.previewID)).rejects.toThrow("snapshot mismatch");
        expect(host.current.a).toBe("用户后来编辑的问题 ==答案==");
    });
    it("waits for the journal before reporting success, then persists undo", async () => {
        const host = setup();
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        host.saveJournal.mockImplementationOnce(async () => gate);
        let settled = false;
        const applying = host.controller.apply(host.preview.previewID).then(() => { settled = true; });
        await vi.waitFor(() => expect(host.saveJournal).toHaveBeenCalledOnce());
        expect(settled).toBe(false);
        release();
        await applying;
        expect(host.journal().entries[0].diffRecord.status).toBe("applied");
        await host.controller.rollback();
        expect(host.current.a).toBe("==旧坏卡==");
        expect(host.disk().entries[0].diffRecord.status).toBe("rolledBack");
    });

    it("compensates card writes if saving the journal fails after writing", async () => {
        const host = setup();
        const write = host.saveJournal.getMockImplementation()!;
        host.saveJournal.mockImplementationOnce(async next => { await write(next); throw new Error("disk full after write"); });
        await expect(host.controller.apply(host.preview.previewID)).rejects.toThrow("card changes restored");
        expect(host.current.a).toBe("==旧坏卡==");
        expect(host.disk().entries).toEqual([]);
        expect(host.journal().entries).toEqual([]);
        expect(host.previews.has(host.preview.previewID)).toBe(false);
    });

    it("reports incomplete compensation and keeps the in-memory recovery record", async () => {
        const host = setup();
        host.saveJournal.mockRejectedValueOnce(new Error("journal write failed"));
        const write = host.saveMarkdown.getMockImplementation()!;
        host.saveMarkdown.mockImplementation(async (id, markdown) => {
            if (markdown === "==旧坏卡==") throw new Error("kernel unavailable during recovery");
            return write(id, markdown);
        });
        await expect(host.controller.apply(host.preview.previewID)).rejects.toThrow("recovery incomplete");
        expect(host.logError).toHaveBeenCalled();
        expect(host.journal().entries[0].diffRecord.status).toBe("applied");
        expect(host.current.a).toBe("修复后的问题 ==答案==");
    });

    it("reports journal recovery failure even when original cards were restored", async () => {
        const host = setup();
        host.saveJournal.mockRejectedValue(new Error("disk unavailable"));
        await expect(host.controller.apply(host.preview.previewID)).rejects.toThrow("card changes restored");
        expect(host.current.a).toBe("==旧坏卡==");
        expect(host.logError).toHaveBeenCalledWith(expect.stringContaining("journal recovery save failed"));
    });

    it("restores the applied state when saving undo fails, and permits a safe retry", async () => {
        const host = setup();
        await host.controller.apply(host.preview.previewID);
        host.saveJournal.mockRejectedValueOnce(new Error("disk full"));
        await expect(host.controller.rollback()).rejects.toThrow("card changes restored");
        expect(host.current.a).toBe("修复后的问题 ==答案==");
        expect(host.disk().entries[0].diffRecord.status).toBe("applied");
        await host.controller.rollback();
        expect(host.current.a).toBe("==旧坏卡==");
        expect(host.disk().entries[0].diffRecord.status).toBe("rolledBack");
    });

    it("consumes a preview once and serializes apply with undo from another tab", async () => {
        const host = setup();
        const first = host.controller.apply(host.preview.previewID);
        const duplicate = host.controller.apply(host.preview.previewID);
        const undo = host.controller.rollback();
        await first;
        await expect(duplicate).rejects.toThrow("expired");
        await undo;
        expect(host.current.a).toBe("==旧坏卡==");
        expect(host.saveMarkdown).toHaveBeenCalledTimes(2);
    });

    it("rejects undo after a user edit without overwriting it", async () => {
        const host = setup();
        await host.controller.apply(host.preview.previewID);
        host.current.a = "用户刚改的问题 ==新答案==";
        await expect(host.controller.rollback()).rejects.toThrow("snapshot mismatch");
        expect(host.current.a).toBe("用户刚改的问题 ==新答案==");
        expect(host.journal().entries[0].diffRecord.status).toBe("applied");
    });
});
