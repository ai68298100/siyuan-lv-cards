import { describe, expect, it } from "vitest";
import {
    DENY_SCOPES,
    emptyDenyList,
    normalizeDenyList,
    addDenyRule,
    removeDenyRule,
    isDenied,
    type DenyListData,
} from "../src/core/ai-source-deny";

// BW-9 来源级禁止外发：三级继承判定、规则只增显式删、移动/重登记不解锁
describe("ai-source-deny（BW-9）", () => {
    const list0 = emptyDenyList();

    it("登记与幂等：同 scope:target 不重复、不改原 addedAt", () => {
        const l1 = addDenyRule(list0, "doc", "20240101120000-abc", 1000, "含客户资料");
        const l2 = addDenyRule(l1, "doc", "20240101120000-abc", 2000);
        expect(l2.rules.length).toBe(1);
        expect(l2.rules[0].addedAt).toBe(1000); // 重登记不续命
        expect(l2.rules[0].note).toBe("含客户资料");
    });

    it("继承判定：notebook 覆盖 doc/block；最具体命中优先返回", () => {
        let l = addDenyRule(list0, "notebook", "nb-1", 1);
        expect(isDenied(l, { notebookId: "nb-1", docId: "doc-x", blockId: "blk-x" }).denied).toBe(true);
        expect(isDenied(l, { notebookId: "nb-1" }).rule?.scope).toBe("notebook");
        expect(isDenied(l, { notebookId: "nb-2" }).denied).toBe(false);
        l = addDenyRule(l, "doc", "doc-x", 2);
        const v = isDenied(l, { notebookId: "nb-1", docId: "doc-x", blockId: "blk-x" });
        expect(v.rule?.scope).toBe("doc"); // 块→文档→笔记本，最具体优先
        l = addDenyRule(l, "block", "blk-x", 3);
        expect(isDenied(l, { notebookId: "nb-1", docId: "doc-x", blockId: "blk-x" }).rule?.scope).toBe("block");
        // provenance 缺失层级自然跳过
        expect(isDenied(l, { docId: "doc-x" }).rule?.scope).toBe("doc");
    });

    it("无 provenance 的粘贴文本：只可能命中 notebook 级（无文档事实不误判）", () => {
        const l = addDenyRule(list0, "doc", "doc-9", 1);
        expect(isDenied(l, {}).denied).toBe(false);
        const nb = addDenyRule(list0, "notebook", "nb-9", 1);
        expect(isDenied(nb, {}).denied).toBe(false);
    });

    it("解除只有显式 remove 一条路；normalize 不自动失效任何规则", () => {
        let l = addDenyRule(list0, "doc", "doc-1", 1);
        l = normalizeDenyList(l); // 清洗后规则保留（移动/导入/重开不解除）
        expect(isDenied(l, { docId: "doc-1" }).denied).toBe(true);
        l = removeDenyRule(l, "doc", "doc-1");
        expect(isDenied(l, { docId: "doc-1" }).denied).toBe(false);
        expect(DENY_SCOPES).toContain("block");
    });

    it("清洗：坏 scope/空 target 剔除、坏 addedAt 归 0、note 截 200、限量", () => {
        const raw = {
            version: 1,
            rules: [
                { scope: "doc", target: "d1", addedAt: 5 },
                { scope: "galaxy", target: "d2", addedAt: 6 },
                { scope: "doc", target: "", addedAt: 7 },
                { scope: "block", target: "b1", addedAt: "bad" },
                { scope: "doc", target: "d1", addedAt: 9 }, // 重复：保留最早
                { scope: "doc", target: "d3", addedAt: 10, note: "n".repeat(500) },
            ],
        };
        const l = normalizeDenyList(raw);
        expect(l.rules.map(r => r.target)).toEqual(["d1", "b1", "d3"]);
        expect(l.rules.find(r => r.target === "b1")?.addedAt).toBe(0);
        expect(l.rules.find(r => r.target === "d1")?.addedAt).toBe(5);
        expect((l.rules.find(r => r.target === "d3")?.note ?? "").length).toBe(200);
        // 限量：超额截断不抛错
        const many: DenyListData = { version: 1, rules: Array.from({ length: 3000 }, (_, i) => ({ id: `x${i}`, scope: "doc" as const, target: `t${i}`, addedAt: i })) };
        expect(normalizeDenyList(many, 100).rules.length).toBe(100);
    });
});
