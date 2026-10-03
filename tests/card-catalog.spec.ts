import { describe, expect, it } from "vitest";
import { CARD_CATALOG, degradationRoute, getCatalogEntry, shippedCardTypes } from "../src/core/card-catalog";
import { capabilityShare, capabilityStats, CAPABILITY_TYPES, normalizeCapability } from "../src/core/capability-types";

// BH-4 卡型目录：id 唯一/降级目标存在/降级链无环/已实现集合稳定
describe("card-catalog（BH-4）", () => {
    it("id 唯一且覆盖 14 卡型", () => {
        const ids = CARD_CATALOG.map(c => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toHaveLength(14);
    });

    it("降级目标必须存在于目录中", () => {
        for (const c of CARD_CATALOG) {
            if (c.degradeTo) {
                expect(getCatalogEntry(c.degradeTo), `${c.id} 降级目标 ${c.degradeTo} 不存在`).toBeDefined();
            }
        }
    });

    it("降级链无环且终点为无降级条目（audio 走 audio→dictation→typing 两级）", () => {
        for (const c of CARD_CATALOG) {
            const route = degradationRoute(c.id);
            expect(new Set(route).size).toBe(route.length); // 无重复=无环
            const last = route[route.length - 1];
            if (last) {
                expect(getCatalogEntry(last)?.degradeTo).toBeUndefined();
            }
        }
        expect(degradationRoute("audio")).toEqual(["dictation", "typing"]);
        expect(degradationRoute("qa")).toEqual([]);
    });

    it("已实现集合：七项 shipped（qa/cloze/occlusion/typing/choice/dictation/pairing）", () => {
        expect(shippedCardTypes().sort()).toEqual(
            ["choice", "cloze", "dictation", "occlusion", "pairing", "qa", "typing"].sort(),
        );
    });

    it("练习类卡型不得声明 native 调度（BH-5 口径：不当正式调度）", () => {
        for (const c of CARD_CATALOG) {
            if (c.id === "qa" || c.id === "cloze" || c.id === "occlusion") {
                expect(c.scheduler).toBe("native");
            }
            if (["typing", "choice", "dictation", "pairing"].includes(c.id)) {
                expect(c.scheduler, `${c.id} 应为 practice`).toBe("practice");
            }
        }
    });
});

// BJ-1 能力类型矩阵：宽容归一 + 分组统计不撒谎
describe("capability-types（BJ-1）", () => {
    it("归一：合法值透传，未知/非字符串返回 null", () => {
        expect(normalizeCapability("fact")).toBe("fact");
        expect(normalizeCapability(" FACT ")).toBeNull(); // 不做大小写/空白猜测：严格口径
        expect(normalizeCapability("nope")).toBeNull();
        expect(normalizeCapability(42)).toBeNull();
    });

    it("分组统计：未标注/非法归 unspecified，不丢弃", () => {
        const stats = capabilityStats([
            { capability: "fact" },
            { capability: "fact" },
            { capability: "distinction" },
            { capability: "bogus" },
            {},
        ]);
        expect(stats).toEqual({ fact: 2, distinction: 1, unspecified: 2 });
    });

    it("占比排序：降序且分母含 unspecified（口径透明）", () => {
        const shares = capabilityShare([
            { capability: "fact" },
            { capability: "fact" },
            { capability: "fact" },
            {},
        ]);
        expect(shares[0]).toEqual({ cap: "fact", count: 3, pct: 75 });
        expect(shares.find(s => s.cap === "unspecified")).toEqual({ cap: "unspecified", count: 1, pct: 25 });
        expect(shares.reduce((acc, s) => acc + s.pct, 0)).toBeLessThanOrEqual(100);
    });

    it("八类能力全量在册", () => {
        expect(CAPABILITY_TYPES).toHaveLength(8);
    });
});
