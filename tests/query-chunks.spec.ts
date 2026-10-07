import { describe, expect, it } from "vitest";
import { mapChunksOrdered } from "@/core/query-chunks";

describe("mapChunksOrdered", () => {
    it("limits concurrent queries while returning results in input order", async () => {
        let active = 0;
        let peak = 0;
        const seen: number[] = [];

        const result = await mapChunksOrdered([0, 1, 2, 3, 4], async (chunk) => {
            active += 1;
            peak = Math.max(peak, active);
            seen.push(chunk);
            await new Promise(resolve => setTimeout(resolve, chunk === 0 ? 15 : 1));
            active -= 1;
            return chunk * 10;
        }, 2);

        expect(result).toEqual([0, 10, 20, 30, 40]);
        expect(peak).toBe(2);
        expect(seen).toHaveLength(5);
    });

    it("returns an empty result without invoking the query", async () => {
        let calls = 0;
        await expect(mapChunksOrdered([], async () => {
            calls += 1;
            return "unexpected";
        })).resolves.toEqual([]);
        expect(calls).toBe(0);
    });

    it("preserves query failures", async () => {
        const error = new Error("query failed");
        await expect(mapChunksOrdered(["a", "b"], async chunk => {
            if (chunk === "b") throw error;
            return chunk;
        })).rejects.toBe(error);
    });
});
