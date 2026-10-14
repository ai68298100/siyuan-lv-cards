import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import i18n from "../public/i18n/zh-CN.json";
import GoalsPage from "../src/ui/goals-page.svelte";
import { confirmDialog } from "../src/libs/dialog";
import { emptyGoals, type LearningGoal } from "../src/core/learning-goal";

vi.mock("../src/libs/dialog", () => ({ confirmDialog: vi.fn() }));

const fixtureGoal: LearningGoal = {
    id: "goal-1", purpose: "review", deadline: null, materialBlockIDs: [], minutesPerDay: 15,
    level: "beginner", createdAt: 1, updatedAt: 1,
};

function base(extra: Record<string, unknown> = {}) {
    return {
        i18n,
        goals: { get: () => ({ version: 1 as const, goals: [] }), save: vi.fn(async () => emptyGoals()), remove: vi.fn(async () => emptyGoals()) },
        ...extra,
    };
}

describe("learning goal persistence feedback", () => {
    beforeEach(() => {
        vi.mocked(confirmDialog).mockReset();
        Object.defineProperty(window, "siyuan", { configurable: true, value: { languages: { cancel: "取消", confirm: "确定" } } });
    });
    afterEach(cleanup);

    it("keeps the draft after a failed save and locks duplicate retry", async () => {
        let resolve!: (value: ReturnType<typeof emptyGoals>) => void;
        const pending = new Promise<ReturnType<typeof emptyGoals>>(r => { resolve = r; });
        const save = vi.fn().mockRejectedValueOnce(new Error("磁盘不可用")).mockReturnValueOnce(pending);
        render(GoalsPage, base({ goals: { get: () => emptyGoals(), save, remove: vi.fn() } }));
        await fireEvent.click(screen.getAllByRole("button", { name: "新建目标" })[0]);
        await fireEvent.click(screen.getByRole("button", { name: "保存目标" }));
        expect(await screen.findByText("磁盘不可用")).toBeTruthy();
        expect(screen.getByRole("button", { name: "保存目标" })).toBeTruthy();

        const retry = screen.getByRole("button", { name: "保存目标" }) as HTMLButtonElement;
        await fireEvent.click(retry);
        await fireEvent.click(retry);
        expect(retry.disabled).toBe(true);
        expect(save).toHaveBeenCalledTimes(2);
        resolve(emptyGoals());
        await waitFor(() => expect(screen.queryByRole("button", { name: "保存目标" })).toBeNull());
    });

    it("keeps the saved goal visible when confirmed deletion fails", async () => {
        const remove = vi.fn().mockRejectedValueOnce(new Error("写入失败"));
        render(GoalsPage, base({ goals: { get: () => ({ version: 1 as const, goals: [fixtureGoal] }), save: vi.fn(), remove } }));
        await fireEvent.click(screen.getByRole("button", { name: "删除目标" }));
        const confirm = vi.mocked(confirmDialog).mock.calls[0]?.[0].confirm;
        expect(confirm).toBeTypeOf("function");
        confirm?.();
        expect(await screen.findByText("写入失败")).toBeTruthy();
        expect(screen.getByText("复习到期")).toBeTruthy();
    });

    it("does not show a new priority until its save succeeds", async () => {
        const save = vi.fn().mockRejectedValueOnce(new Error("保存失败"));
        render(GoalsPage, base({ goals: { get: () => ({ version: 1 as const, goals: [fixtureGoal] }), save, remove: vi.fn() } }));
        const priority = screen.getByRole("button", { name: "维持" });
        await fireEvent.click(priority);
        expect(await screen.findByText("保存失败")).toBeTruthy();
        expect(screen.getByRole("button", { name: "维持" })).toBeTruthy();
        expect(save).toHaveBeenCalledTimes(1);
    });
});
