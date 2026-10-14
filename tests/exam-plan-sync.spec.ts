import { describe, expect, it, vi } from "vitest";
import {
    createExamPlansChangedNotice,
    isExamPlansChangedNotice,
    isKernelPluginRunning,
    persistThenNotify,
    shouldReloadExamPlans,
} from "../src/core/exam-plan-sync";

describe("exam plan sync protocol", () => {
    it("validates versioned invalidation notices and ignores its own broadcast", () => {
        const notice = createExamPlansChangedNotice("client-a", 3, 1_800_000_000_000);

        expect(isExamPlansChangedNotice(notice)).toBe(true);
        expect(shouldReloadExamPlans(notice, "client-a")).toBe(false);
        expect(shouldReloadExamPlans(notice, "client-b")).toBe(true);
        expect(isExamPlansChangedNotice({ ...notice, sequence: 0 })).toBe(false);
        expect(isExamPlansChangedNotice({ ...notice, sourceID: "" })).toBe(false);
        expect(isExamPlansChangedNotice({ ...notice, schema: 2 })).toBe(false);
    });

    it("treats only the running Kernel state as callable", () => {
        expect(isKernelPluginRunning(2)).toBe(true);
        for (const state of [-1, 0, 1, 3, 4, 5]) {
            expect(isKernelPluginRunning(state)).toBe(false);
        }
    });

    it("does not notify when persistence fails", async () => {
        const notify = vi.fn(async () => undefined);
        const onNotifyError = vi.fn();

        await expect(persistThenNotify(
            async () => { throw new Error("storage unavailable"); },
            notify,
            onNotifyError,
        )).rejects.toThrow("storage unavailable");

        expect(notify).not.toHaveBeenCalled();
        expect(onNotifyError).not.toHaveBeenCalled();
    });

    it("returns the persisted result without waiting for notification delivery", async () => {
        let rejectNotification!: (error: Error) => void;
        const notify = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectNotification = reject; }));
        const onNotifyError = vi.fn();
        const operation = persistThenNotify(async () => ({ version: 1 }), notify, onNotifyError);

        await expect(operation).resolves.toEqual({ version: 1 });
        expect(notify).toHaveBeenCalledOnce();

        rejectNotification(new Error("kernel unavailable"));
        await vi.waitFor(() => expect(onNotifyError).toHaveBeenCalledWith(expect.any(Error)));
    });
});
