import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchSyncPost } = vi.hoisted(() => ({ fetchSyncPost: vi.fn() }));
vi.mock("siyuan", () => ({ fetchSyncPost }));

import { probeAssetRefs } from "../src/api/siyuan";

describe("probeAssetRefs", () => {
    beforeEach(() => fetchSyncPost.mockReset());

    it("distinguishes present, missing and unknown responses without treating unknown as broken", async () => {
        fetchSyncPost
            .mockResolvedValueOnce({ code: 0, data: { size: 1 } })
            .mockResolvedValueOnce({ code: 1, data: null })
            .mockResolvedValueOnce({ code: 403, data: null });

        const result = await probeAssetRefs(["assets/ok.png", "assets/missing.png", "assets/locked.png"], 1);

        expect(result).toEqual({
            present: ["assets/ok.png"],
            missing: ["assets/missing.png"],
            unknown: ["assets/locked.png"],
        });
    });

    it("deduplicates and isolates transport failures as unknown", async () => {
        fetchSyncPost
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce({ code: 0, data: { size: 1 } });

        const result = await probeAssetRefs(["assets/a.png", "assets/a.png", "assets/b.png"], 1);

        expect(fetchSyncPost).toHaveBeenCalledTimes(2);
        expect(result).toEqual({
            present: ["assets/b.png"],
            missing: [],
            unknown: ["assets/a.png"],
        });
    });

    it("does not treat document-relative paths as missing assets", async () => {
        const result = await probeAssetRefs(["audio/read.mp3", "images/diagram.png"]);
        expect(fetchSyncPost).not.toHaveBeenCalled();
        expect(result).toEqual({
            present: [],
            missing: [],
            unknown: ["audio/read.mp3", "images/diagram.png"],
        });
    });

    it("passes the encrypted-notebook box query through to statAsset", async () => {
        fetchSyncPost.mockResolvedValueOnce({ code: 0, data: { size: 1 } });

        const result = await probeAssetRefs(["assets/locked.png?box=20260101000000-a1b2c3d"]);

        expect(fetchSyncPost).toHaveBeenCalledWith("/api/asset/statAsset", {
            path: "assets/locked.png?box=20260101000000-a1b2c3d",
        });
        expect(result).toEqual({
            present: ["assets/locked.png?box=20260101000000-a1b2c3d"],
            missing: [],
            unknown: [],
        });
    });
});
