import { describe, expect, it, vi } from "vitest";
import { scanAllMaintenanceCardIds } from "../src/core/maintenance-scan";

describe("maintenance scan pagination", () => {
    it("scans every reported page beyond the former 500-card limit", async () => {
        const fetchPage = vi.fn(async (page: number, pageSize: number) => {
            const start = (page - 1) * pageSize;
            const count = Math.min(pageSize, 501 - start);
            return {
                total: 501,
                pageCount: 6,
                blocks: Array.from({ length: count }, (_, index) => ({ id: `card-${start + index + 1}` })),
            };
        });

        const result = await scanAllMaintenanceCardIds(fetchPage);

        expect(result.error).toBeUndefined();
        expect(result.ids).toHaveLength(501);
        expect(result.ids.at(-1)).toBe("card-501");
        expect(fetchPage).toHaveBeenCalledTimes(6);
        expect(fetchPage).toHaveBeenLastCalledWith(6, 100);
    });

    it("continues by short-page detection when the API omits pagination metadata", async () => {
        const fetchPage = vi.fn(async (page: number, pageSize: number) => ({
            blocks: Array.from({ length: page === 1 ? pageSize : 3 }, (_, index) => ({ id: `card-${page}-${index}` })),
        }));

        const result = await scanAllMaintenanceCardIds(fetchPage);

        expect(result).toEqual({ ids: expect.arrayContaining(["card-1-0", "card-2-2"]) });
        expect(result.ids).toHaveLength(103);
        expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it("preserves earlier pages and reports an interrupted scan", async () => {
        const fetchPage = vi.fn(async (page: number) => {
            if (page === 2) throw new Error("内核暂不可用");
            return {
                total: 150,
                pageCount: 2,
                blocks: Array.from({ length: 100 }, (_, index) => ({ id: `card-${index}` })),
            };
        });

        const result = await scanAllMaintenanceCardIds(fetchPage);

        expect(result.ids).toHaveLength(100);
        expect(result.error).toBe("内核暂不可用");
    });

    it("does not silently claim completion when the server reports a missing page", async () => {
        const result = await scanAllMaintenanceCardIds(async page => ({
            total: 250,
            pageCount: 3,
            blocks: page === 1 ? [{ id: "card-a" }] : [],
        }));

        expect(result.ids).toEqual(["card-a"]);
        expect(result.issue).toEqual({ kind: "empty-page", page: 2 });
    });

    it("stops repeated full pages without silently presenting them as a full scan", async () => {
        const page = Array.from({ length: 2 }, (_, index) => ({ id: `card-${index}` }));
        const fetchPage = vi.fn(async () => ({ blocks: page }));

        const result = await scanAllMaintenanceCardIds(fetchPage, 2);

        expect(result.ids).toEqual(["card-0", "card-1"]);
        expect(result.issue).toEqual({ kind: "repeated-page", page: 2 });
        expect(fetchPage).toHaveBeenCalledTimes(2);
    });
});
