import { describe, expect, it } from "vitest";
import {
    fnv1a,
    appendVersion,
    latestUserVersion,
    userVersions,
    purgeAIOnly,
    normalizeProvenance,
    type CardProvenance,
    type ProvenanceVersion,
} from "../src/core/ai-provenance";

// BU-15 双轨 provenance：生成/编辑分轨留痕；删除 AI 记录不误删用户内容；key 永不入快照
const gen = (hash = "abc12345") => ({ mode: "custom" as const, modelId: "gpt-4o-mini", templateHash: hash });
const aiV = (at: number, q: string, a: string, hash?: string): ProvenanceVersion => ({ at, via: "ai", q, a, gen: gen(hash) });
const userV = (at: number, q: string, a: string): ProvenanceVersion => ({ at, via: "user", q, a });

describe("ai-provenance（BU-15）", () => {
    it("fnv1a：稳定、区分文本、8 位十六进制", () => {
        expect(fnv1a("模板A")).toBe(fnv1a("模板A"));
        expect(fnv1a("模板A")).not.toBe(fnv1a("模板B"));
        expect(fnv1a("x")).toMatch(/^[0-9a-f]{8}$/);
    });

    it("追加：ai 版必须带生成快照（缺失整条剔除）；user 版无需快照；最新在后截 20", () => {
        let card: CardProvenance = { index: 0, versions: [] };
        card = appendVersion(card, { at: 1, via: "ai", q: "q1", a: "a1" }); // 无 gen → 剔除
        expect(card.versions.length).toBe(0);
        card = appendVersion(card, aiV(1, "q1", "a1"));
        card = appendVersion(card, userV(2, "q1改", "a1改"));
        card = appendVersion(card, aiV(3, "q1重生", "a1重生"));
        expect(card.versions.map(v => v.via)).toEqual(["ai", "user", "ai"]);
        expect(card.versions[2].gen?.modelId).toBe("gpt-4o-mini");
        for (let i = 0; i < 25; i++) {
            card = appendVersion(card, userV(10 + i, `q${i}`, "a"));
        }
        expect(card.versions.length).toBe(20);
        expect(card.versions[0].q).toBe("q5"); // 截断保留最新
    });

    it("回到任意人工版本：latestUserVersion / userVersions（最新在前）", () => {
        let card: CardProvenance = { index: 0, versions: [] };
        card = appendVersion(card, aiV(1, "q", "a"));
        card = appendVersion(card, userV(2, "v1", "a"));
        card = appendVersion(card, userV(3, "v2", "a"));
        expect(latestUserVersion(card)?.q).toBe("v2");
        expect(userVersions(card).map(v => v.q)).toEqual(["v2", "v1"]);
        // 从未被编辑：无 user 版本
        const pure: CardProvenance = { index: 1, versions: [aiV(1, "x", "y")] };
        expect(latestUserVersion(pure)).toBeNull();
        expect(userVersions(pure)).toEqual([]);
    });

    it("验收核心：删除 AI 记录不误删用户内容——纯 ai 卡整卡清、有 user 版的卡保留", () => {
        const cards: CardProvenance[] = [
            { index: 0, versions: [aiV(1, "纯AI", "内容")] },               // 整卡清除
            { index: 1, versions: [aiV(1, "原", "文"), userV(2, "用户改", "文")] }, // 保留
            { index: 2, versions: [userV(1, "手写", "卡")] },               // 保留
        ];
        const r = purgeAIOnly(cards);
        expect(r.purgedCount).toBe(1);
        expect(r.kept.map(c => c.index)).toEqual([1, 2]);
        // 用户文本仍在
        expect(r.kept[0].versions.some(v => v.q === "用户改")).toBe(true);
        expect(r.kept[1].versions.some(v => v.q === "手写")).toBe(true);
    });

    it("清洗：坏条目剔除、index 去重保留版本多者、无 gen 的 ai 版剔除、限量", () => {
        const raw = [
            { index: 0, versions: [aiV(1, "a", "b")] },
            { index: 0, versions: [aiV(1, "a", "b"), userV(2, "c", "d")] }, // 版本多 → 保留
            { index: 1, versions: [{ at: 1, via: "ai", q: "x", a: "y" }] },  // ai 无 gen → 清后空 → 剔除
            { index: "bad", versions: [] },
            { index: 2, versions: [userV(1, "ok", "ok")] },
        ];
        const out = normalizeProvenance(raw);
        expect(out.map(c => c.index)).toEqual([0, 2]);
        expect(out[0].versions.length).toBe(2);
        const many = Array.from({ length: 600 }, (_, i) => ({ index: i, versions: [userV(i, "q", "a")] }));
        expect(normalizeProvenance(many).length).toBe(500);
    });

    it("配置快照不含密钥：gen 结构只有 mode/modelId/templateHash（类型层面无 key 字段）", () => {
        const card = appendVersion({ index: 0, versions: [] }, aiV(1, "q", "a"));
        const g = card.versions[0].gen as Record<string, unknown>;
        expect(Object.keys(g).sort()).toEqual(["mode", "modelId", "templateHash"]);
    });
});
