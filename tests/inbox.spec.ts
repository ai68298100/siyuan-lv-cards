import { describe, expect, it } from "vitest";
import {
    addInboxItem, bulkSetStatus, emptyInbox, getByStatus,
    normalizeInbox, removeInboxItem, setInboxStatus, undoSelection,
} from "../src/core/inbox";

// BI-4 材料筛选收件箱：状态流转/批量操作/撤销/清洗
describe("inbox（BI-4）", () => {
    it("addInboxItem：新建/去重", () => {
        const d = emptyInbox();
        expect(addInboxItem(d, "b1")).toBe(true);
        expect(addInboxItem(d, "b1")).toBe(false);
        expect(d.items).toHaveLength(1);
        expect(d.items[0].status).toBe("inbox");
    });

    it("setInboxStatus：状态流转 inbox→staged→selected", () => {
        const d = emptyInbox();
        addInboxItem(d, "b1");
        expect(setInboxStatus(d, "b1", "staged")).toBe(true);
        expect(setInboxStatus(d, "b1", "selected")).toBe(true);
        expect(d.items[0].status).toBe("selected");
    });

    it("setInboxStatus：同状态不触发变更", () => {
        const d = emptyInbox();
        addInboxItem(d, "b1");
        expect(setInboxStatus(d, "b1", "inbox")).toBe(false);
    });

    it("bulkSetStatus：批量变更返回变更数", () => {
        const d = emptyInbox();
        addInboxItem(d, "a");
        addInboxItem(d, "b");
        addInboxItem(d, "c");
        expect(bulkSetStatus(d, ["a", "b"], "staged")).toBe(2);
        expect(bulkSetStatus(d, ["a", "b"], "staged")).toBe(0); // 已是 staged
        expect(getByStatus(d, "staged")).toHaveLength(2);
    });

    it("getByStatus：按状态过滤并按 addedAt 排序", () => {
        const d = emptyInbox();
        addInboxItem(d, "z", 3000);
        addInboxItem(d, "a", 1000);
        expect(getByStatus(d, "inbox").map(i => i.blockID)).toEqual(["a", "z"]);
    });

    it("undoSelection：selected 打回 staged", () => {
        const d = emptyInbox();
        addInboxItem(d, "a");
        addInboxItem(d, "b");
        bulkSetStatus(d, ["a", "b"], "selected");
        expect(undoSelection(d, ["a", "b"])).toBe(2);
        expect(getByStatus(d, "staged")).toHaveLength(2);
    });

    it("removeInboxItem：完全删除", () => {
        const d = emptyInbox();
        addInboxItem(d, "a");
        expect(removeInboxItem(d, "a")).toBe(true);
        expect(removeInboxItem(d, "a")).toBe(false);
        expect(d.items).toHaveLength(0);
    });

    it("normalizeInbox：白名单清洗 + 去重", () => {
        const r = normalizeInbox({
            items: [
                { blockID: "a", status: "inbox", addedAt: 1 },
                { blockID: "a", status: "staged" },               // 重复 blockID 去重
                { status: "staged" },                              // 缺 blockID 剔除
                { blockID: "b", status: "bogus" },                 // 非法 status 回 inbox
            ],
        });
        expect(r.items).toHaveLength(2);
        expect(r.items[1].status).toBe("inbox"); // 非法 status 回默认
    });
});
