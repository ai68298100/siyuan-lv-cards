import { describe, expect, it, vi } from "vitest";
import {
    applyBatchRepair,
    confirmBatchRepair,
    previewBatchRepair,
    rollbackBatchRepair,
    transitionBatchRepairRecord,
    type MaintenanceRepairCard,
} from "../src/core/maintenance-repair";

const card = (blockID: string, markdown: string): MaintenanceRepairCard => ({ blockID, markdown });

describe("maintenance-repair 批量修复契约", () => {
    it("预览返回稳定差异和修复前快照，并且不改变输入", () => {
        const cards = [card("b", "题目 B ==答案 B=="), card("a", "题目 A ==答案 A==")];
        const before = JSON.parse(JSON.stringify(cards));
        const preview = previewBatchRepair(cards, [
            { blockID: "a", afterMarkdown: "题目 A（修订） ==答案 A==", reason: "纠正题面" },
        ], 100);

        expect(preview.ok).toBe(true);
        expect(preview.summary).toEqual({ update: 1, unchanged: 0, rejected: 0 });
        expect(preview.diffs).toEqual([{
            blockID: "a",
            action: "update",
            beforeMarkdown: "题目 A ==答案 A==",
            afterMarkdown: "题目 A（修订） ==答案 A==",
            reason: "纠正题面",
        }]);
        expect(preview.snapshot.entries).toEqual([{ blockID: "a", markdown: "题目 A ==答案 A==", attrs: undefined, exists: undefined, occlusionValid: undefined }]);
        expect(cards).toEqual(before);
        expect(preview.diffRecord.status).toBe("planned");
    });

    it("任一候选无效时整批拒绝，不能只写入通过的子集", () => {
        const preview = previewBatchRepair(
            [card("good", "题面 ==答案=="), card("bad", "题面 ==答案==")],
            [
                { blockID: "good", afterMarkdown: "修订题面 ==修订答案==" },
                { blockID: "bad", afterMarkdown: "只有题面" },
            ],
            101,
        );
        expect(preview.ok).toBe(false);
        expect(preview.summary).toEqual({ update: 1, unchanged: 0, rejected: 1 });
        expect(preview.errors).toContain("invalid target: bad:missing-answer");
        expect(preview.snapshot.entries).toEqual([]);
        expect(() => confirmBatchRepair(preview, { previewID: preview.previewID, acknowledged: true }, 102)).toThrow("preview rejected");
    });

    it("确认必须匹配预览 token，确认后只携带 update 差异", () => {
        const preview = previewBatchRepair([card("a", "题面 ==答案==")], [
            { blockID: "a", afterMarkdown: "题面 ==答案==" },
        ], 110);
        expect(preview.ok).toBe(false);
        expect(preview.errors).toContain("no changes");

        const changed = previewBatchRepair([card("a", "题面 ==答案==")], [
            { blockID: "a", afterMarkdown: "新题面 ==新答案==" },
        ], 111);
        expect(() => confirmBatchRepair(changed, { previewID: "wrong", acknowledged: true })).toThrow("confirmation mismatch");
        expect(() => confirmBatchRepair(changed, { previewID: changed.previewID, acknowledged: false as true })).toThrow("confirmation mismatch");

        const valid = previewBatchRepair([card("a", "题面 ==答案==")], [
            { blockID: "a", afterMarkdown: "新题面 ==新答案==" },
        ], 112);
        const tx = confirmBatchRepair(valid, { previewID: valid.previewID, acknowledged: true }, 113);
        expect(tx.diffs).toHaveLength(1);
        expect(tx.diffRecord.status).toBe("confirmed");
        expect(tx.snapshot.entries[0].markdown).toBe("题面 ==答案==");
    });

    it("应用前检测并发修改；成功应用后可按快照恢复", async () => {
        const preview = previewBatchRepair([card("a", "旧题面 ==旧答案==")], [
            { blockID: "a", afterMarkdown: "新题面 ==新答案==" },
        ], 120);
        const tx = confirmBatchRepair(preview, { previewID: preview.previewID, acknowledged: true }, 121);
        let current = "旧题面 ==旧答案==";
        const storage = {
            readCard: vi.fn(async (blockID: string) => ({ blockID, markdown: current })),
            writeMarkdown: vi.fn(async (_blockID: string, markdown: string) => { current = markdown; }),
        };

        const applied = await applyBatchRepair(tx, storage, 122);
        expect(applied.blockIDs).toEqual(["a"]);
        expect(applied.diffRecord.status).toBe("applied");
        expect(current).toBe("新题面 ==新答案==");

        const rolledBack = await rollbackBatchRepair(tx, storage, 123);
        expect(rolledBack.blockIDs).toEqual(["a"]);
        expect(rolledBack.diffRecord.status).toBe("rolledBack");
        expect(current).toBe("旧题面 ==旧答案==");
    });

    it("应用前发现来源已变更时不写入", async () => {
        const preview = previewBatchRepair([card("a", "旧题面 ==旧答案==")], [
            { blockID: "a", afterMarkdown: "新题面 ==新答案==" },
        ], 130);
        const tx = confirmBatchRepair(preview, { previewID: preview.previewID, acknowledged: true }, 131);
        const writeMarkdown = vi.fn(async () => undefined);
        const storage = {
            readCard: vi.fn(async (blockID: string) => ({ blockID, markdown: "用户刚改过 ==答案==" })),
            writeMarkdown,
        };
        await expect(applyBatchRepair(tx, storage)).rejects.toThrow("snapshot mismatch");
        expect(writeMarkdown).not.toHaveBeenCalled();
    });

    it("恢复前发现用户新编辑时拒绝覆盖，保留现有内容", async () => {
        const preview = previewBatchRepair([card("a", "旧题面 ==旧答案==")], [
            { blockID: "a", afterMarkdown: "批量修复题面 ==批量修复答案==" },
        ], 135);
        const tx = confirmBatchRepair(preview, { previewID: preview.previewID, acknowledged: true }, 136);
        let current = "批量修复题面 ==批量修复答案==";
        const writeMarkdown = vi.fn(async (_blockID: string, markdown: string) => { current = markdown; });
        const storage = {
            readCard: vi.fn(async (blockID: string) => ({ blockID, markdown: current })),
            writeMarkdown,
        };
        current = "用户后续编辑 ==用户答案==";
        await expect(rollbackBatchRepair(tx, storage)).rejects.toThrow("snapshot mismatch");
        expect(current).toBe("用户后续编辑 ==用户答案==");
        expect(writeMarkdown).not.toHaveBeenCalled();
    });

    it("写入中途失败时复用补偿回滚；差异记录状态可单调转移", async () => {
        const preview = previewBatchRepair([
            card("a", "旧 A ==答案 A=="),
            card("b", "旧 B ==答案 B=="),
        ], [
            { blockID: "a", afterMarkdown: "新 A ==答案 A==" },
            { blockID: "b", afterMarkdown: "新 B ==答案 B==" },
        ], 140);
        const tx = confirmBatchRepair(preview, { previewID: preview.previewID, acknowledged: true }, 141);
        const current: Record<string, string> = { a: "旧 A ==答案 A==", b: "旧 B ==答案 B==" };
        const history: Array<[string, string]> = [];
        const storage = {
            readCard: vi.fn(async (blockID: string) => ({ blockID, markdown: current[blockID] })),
            writeMarkdown: vi.fn(async (blockID: string, markdown: string) => {
                history.push([blockID, markdown]);
                current[blockID] = markdown;
                // 模拟宿主已写入后才报告失败：失败 key 本身也必须被补偿。
                if (blockID === "b" && markdown.startsWith("新")) throw new Error("disk full");
            }),
        };
        await expect(applyBatchRepair(tx, storage)).rejects.toThrow("disk full");
        expect(current).toEqual({ a: "旧 A ==答案 A==", b: "旧 B ==答案 B==" });
        expect(history).toEqual([
            ["a", "新 A ==答案 A=="],
            ["b", "新 B ==答案 B=="],
            ["b", "旧 B ==答案 B=="],
            ["a", "旧 A ==答案 A=="],
        ]);

        const failed = transitionBatchRepairRecord(tx.diffRecord, "failed", 142, "disk full");
        expect(failed.status).toBe("failed");
        expect(failed.error).toBe("disk full");
        expect(() => transitionBatchRepairRecord(failed, "applied")).toThrow("invalid repair record transition");
        await expect(rollbackBatchRepair({ ...tx, diffRecord: failed }, storage)).rejects.toThrow("cannot rollback from status");
    });
});
