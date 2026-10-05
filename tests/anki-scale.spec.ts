import { describe, expect, it } from "vitest";
import { parseAnkiPackage } from "../src/core/anki-package";
import { buildImportPreview } from "../src/core/anki-preview";
import { composeImportMarkdown, partitionNew } from "../src/core/anki-import";
import { normalizeLedger } from "../src/core/anki-import";
import { buildAnki2DbBytes, buildApkg, nodeSqliteAdapter } from "./helpers/anki-fixture";

// Anki 导入大库基准（离线子集，模式同 big-library.spec）：1000 笔记量级的
// 解析 → 预览 → 编排全链耗时预算。预算宽松（CI 波动安全），超限即意味着
// O(n²) 类回归（配对/查重/清洗任一环节的复杂度退化都会在这里爆）。

const N = 1000;

function buildBigPkg(): Uint8Array {
    const notes = [];
    for (let i = 0; i < N; i++) {
        notes.push({
            guid: `guid-${i}`,
            tags: i % 10 === 0 ? "重点" : "",
            flds: `问题 ${i}：概念 ${i} 的定义是什么？\x1f概念 ${i} 的定义与必要条件。`,
        });
    }
    const cards = notes.map((_, i) => ({ nid: 1700000000000 + i }));
    const media: Record<string, string> = {};
    for (let i = 0; i < 50; i++) media[String(i)] = `img/pic-${i}.png`;
    return buildApkg(buildAnki2DbBytes(notes, cards), media, Object.keys(media).map((k) => ({ name: k, data: new Uint8Array([1]) })));
}

function budget(label: string, fn: () => void, ms: number): void {
    const t0 = performance.now();
    fn();
    const elapsed = performance.now() - t0;
    expect(elapsed, `${label} took ${elapsed.toFixed(0)}ms (budget ${ms}ms)`).toBeLessThan(ms);
}

describe("Anki 导入大库基准（1000 笔记）", () => {
    const pkgBytes = buildBigPkg();

    it("解析：zip + sqlite 全链 1000 笔记", () => {
        let pkg: ReturnType<typeof parseAnkiPackage> | null = null;
        budget("parseAnkiPackage@1000", () => {
            pkg = parseAnkiPackage(pkgBytes, nodeSqliteAdapter);
        }, 8000);
        expect(pkg!.notes).toHaveLength(N);
        expect(pkg!.cards).toHaveLength(N);
        expect(pkg!.issues).toEqual([]);
    });

    it("预览：映射/清洗/查重 1000 卡", () => {
        const pkg = parseAnkiPackage(pkgBytes, nodeSqliteAdapter);
        let preview: ReturnType<typeof buildImportPreview> | null = null;
        budget("buildImportPreview@1000", () => {
            preview = buildImportPreview(pkg);
        }, 4000);
        expect(preview!.cards).toHaveLength(N);
        // 指纹唯一：fixture 问题互不相同 → 无重复组
        expect(preview!.duplicates).toHaveLength(0);
        expect(preview!.stats.importable).toBe(N);
    });

    it("编排：markdown 组装 + 台账分区 1000 卡", () => {
        const pkg = parseAnkiPackage(pkgBytes, nodeSqliteAdapter);
        const preview = buildImportPreview(pkg);
        budget("composeImportMarkdown@1000", () => {
            const md = composeImportMarkdown(preview.cards);
            expect(md.split("\n\n")).toHaveLength(N);
        }, 1000);
        const ledger = normalizeLedger(preview.cards.slice(0, 500).map((c, i) => ({ guid: c.guid, deckID: "d", blockID: `b${i}`, importedAt: i })));
        budget("partitionNew@1000+500ledger", () => {
            const { fresh, already } = partitionNew(preview.cards, ledger);
            expect(fresh).toHaveLength(500);
            expect(already).toHaveLength(500);
        }, 1000);
    });
});
