import { describe, expect, it } from "vitest";
import {
    BUILTIN_SCOPE_PRESETS,
    composeEffectiveScope,
    filterCardsByScope,
    hasActiveFilter,
    sanitizeFilterRule,
} from "../src/core/scope-preset";
import type {
    ScopeFilterRule,
    ScopeCompositionInput,
    CardFilterCandidate,
} from "../src/core/scope-preset";

describe("scope-preset (BX-3 范围预设三层合成与复习进度保护引擎)", () => {
    it("内置预设包含全库、快速问答、图片遮挡与考试重点", () => {
        expect(BUILTIN_SCOPE_PRESETS.map(p => p.id)).toEqual([
            "preset-all",
            "preset-quick-due",
            "preset-occlusion-focus",
            "preset-exam-core",
        ]);
        expect(BUILTIN_SCOPE_PRESETS.every(p => p.isBuiltin)).toBe(true);
    });

    describe("三层合成优先级 (composeEffectiveScope)", () => {
        const baseRule: ScopeFilterRule = { deckIds: ["deck-default"] };
        const contextRule: ScopeFilterRule = { notebookId: "nb-math" };
        const sessionRule: ScopeFilterRule = { cardTypes: ["cloze"] };

        it("仅提供 baseRule 时，生效 base 层", () => {
            const input: ScopeCompositionInput = { baseRule };
            const effective = composeEffectiveScope(input);
            expect(effective.activeLayer).toBe("base");
            expect(effective.effectiveRule.deckIds).toEqual(["deck-default"]);
            expect(effective.isFallback).toBe(false);
        });

        it("提供 baseRule 与 contextRule 时，contextRule 覆盖 baseRule", () => {
            const input: ScopeCompositionInput = { baseRule, contextRule };
            const effective = composeEffectiveScope(input);
            expect(effective.activeLayer).toBe("context");
            expect(effective.effectiveRule.notebookId).toBe("nb-math");
        });

        it("提供全部三层时，sessionOverrideRule 拥有最高优先级", () => {
            const input: ScopeCompositionInput = {
                baseRule,
                contextRule,
                sessionOverrideRule: sessionRule,
            };
            const effective = composeEffectiveScope(input);
            expect(effective.activeLayer).toBe("session");
            expect(effective.effectiveRule.cardTypes).toEqual(["cloze"]);
        });

        it("当上层规则为空过滤时，自动向下层穿透回退", () => {
            const input: ScopeCompositionInput = {
                baseRule,
                contextRule: {}, // 空规则
                sessionOverrideRule: { deckIds: [] }, // 空数组
            };
            const effective = composeEffectiveScope(input);
            expect(effective.activeLayer).toBe("base");
            expect(effective.effectiveRule.deckIds).toEqual(["deck-default"]);
        });
    });

    describe("规则校验与清洗 (hasActiveFilter & sanitizeFilterRule)", () => {
        it("空规则判定 hasActiveFilter 为 false", () => {
            expect(hasActiveFilter({})).toBe(false);
            expect(hasActiveFilter({ deckIds: [] })).toBe(false);
            expect(hasActiveFilter({ includeTags: [""] })).toBe(true);
        });

        it("sanitizeFilterRule 过滤空字符串并去重数组", () => {
            const dirty: ScopeFilterRule = {
                deckIds: ["d1", "d2", "d1", ""],
                includeTags: ["tag1", "tag2", "tag1"],
                notebookId: "  nb-trimmed  ",
            };
            const clean = sanitizeFilterRule(dirty);
            expect(clean.deckIds).toEqual(["d1", "d2"]);
            expect(clean.includeTags).toEqual(["tag1", "tag2"]);
            expect(clean.notebookId).toBe("nb-trimmed");
        });
    });

    describe("卡片范围筛选与进度无损保护 (filterCardsByScope)", () => {
        const sampleCards: CardFilterCandidate[] = [
            { cardId: "c1", deckId: "d-math", cardType: "qa", tags: ["重要", "公式"], notebookId: "nb-1", docId: "doc-1" },
            { cardId: "c2", deckId: "d-math", cardType: "cloze", tags: ["重要"], notebookId: "nb-1", docId: "doc-1" },
            { cardId: "c3", deckId: "d-english", cardType: "qa", tags: ["词汇"], notebookId: "nb-2", docId: "doc-2" },
            { cardId: "c4", deckId: "d-english", cardType: "image-occlusion", tags: ["图谱"], notebookId: "nb-2", docId: "doc-3" },
        ];

        it("按卡组、卡型与标签多条件精确命中", () => {
            const scope = composeEffectiveScope({
                baseRule: { deckIds: ["d-math"], cardTypes: ["cloze"] },
            });
            const res = filterCardsByScope(sampleCards, scope);
            expect(res.matchedCards.map(c => c.cardId)).toEqual(["c2"]);
            expect(res.isDegradedFallback).toBe(false);
        });

        it("排除标签生效", () => {
            const scope = composeEffectiveScope({
                baseRule: { excludeTags: ["公式"] },
            });
            const res = filterCardsByScope(sampleCards, scope);
            expect(res.matchedCards.map(c => c.cardId)).toEqual(["c2", "c3", "c4"]);
        });

        it("核心铁律：已在已评分集合（alreadyReviewedIds）中的卡片坚决不重新出现（无损保留进度）", () => {
            const reviewed = new Set(["c1", "c2"]);
            const scope = composeEffectiveScope({
                baseRule: { deckIds: ["d-math"] },
            });
            const res = filterCardsByScope(sampleCards, scope, reviewed);
            // 尽管 c1 和 c2 属于 d-math，但由于已经评分，必须排除
            expect(res.matchedCards.map(c => c.cardId)).toEqual([]);
        });

        it("空集安全平滑降级：临时筛选条件导致匹配结果为 0 时，自动降级回退并带说明", () => {
            const scope = composeEffectiveScope({
                baseRule: {},
                sessionOverrideRule: { includeTags: ["一个绝对不存在的标签"] },
            });
            const res = filterCardsByScope(sampleCards, scope);
            expect(res.isDegradedFallback).toBe(true);
            expect(res.effectiveScope.isFallback).toBe(true);
            expect(res.effectiveScope.fallbackReasonKey).toBe("scopePreset.fallback.emptyFiltered");
            // 降级回退后，展示基础可用卡片，防止界面白屏或空死锁
            expect(res.matchedCards.length).toBe(sampleCards.length);
        });
    });
});
