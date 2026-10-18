import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    fetchSyncPost: vi.fn(),
}));

vi.mock("siyuan", () => ({
    fetchSyncPost: mocks.fetchSyncPost,
}));

import {
    getBlockDocMap,
    getDocTitles,
    probeAssetRefs,
    kernelVersion,
    SQL_QUERY_CHUNK_SIZE,
    SQL_QUERY_CONCURRENCY,
} from "../src/api/siyuan";

describe("siyuan.ts: 通用思源 API 契约与大库韧性测试", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("probeAssetRefs: 本地媒体资源三态探测 (BI-20 来源健康)", () => {
        it("returns empty sorted lists when input is empty or blank", async () => {
            const res = await probeAssetRefs(["", "   ", null as unknown as string]);
            expect(res).toEqual({ present: [], missing: [], unknown: [] });
            expect(mocks.fetchSyncPost).not.toHaveBeenCalled();
        });

        it("classifies non-assets path directly as unknown without calling host", async () => {
            const res = await probeAssetRefs([
                "https://example.com/image.png",
                "http://localhost:6806/assets/test.png",
                "../relative/path.jpg",
                "docs/pic.png",
            ]);

            expect(res.unknown).toHaveLength(4);
            expect(res.present).toHaveLength(0);
            expect(res.missing).toHaveLength(0);
            expect(mocks.fetchSyncPost).not.toHaveBeenCalled();
        });

        it("correctly identifies present, missing, and unknown asset states", async () => {
            mocks.fetchSyncPost.mockImplementation(async (url: string, payload: { path: string }) => {
                if (url === "/api/asset/statAsset") {
                    if (payload.path === "assets/exist1.png" || payload.path === "assets/exist2.png") {
                        return { code: 0, msg: "", data: {} };
                    }
                    if (payload.path === "assets/lost.png") {
                        // statAsset 显式使用 code=1 表示文件不存在
                        return { code: 1, msg: "file not found", data: null };
                    }
                    if (payload.path === "assets/forbidden.png") {
                        return { code: 403, msg: "permission denied", data: null };
                    }
                }
                throw new Error("transport error");
            });

            const res = await probeAssetRefs([
                "assets/lost.png",
                "assets/exist2.png",
                "assets/forbidden.png",
                "assets/exist1.png",
                "assets/network-error.png",
                "assets/exist1.png", // 重复项去重
            ]);

            expect(res.present).toEqual(["assets/exist1.png", "assets/exist2.png"]);
            expect(res.missing).toEqual(["assets/lost.png"]);
            expect(res.unknown).toEqual(["assets/forbidden.png", "assets/network-error.png"]);
        });

        it("respects concurrency limits while processing assets", async () => {
            let active = 0;
            let peak = 0;

            mocks.fetchSyncPost.mockImplementation(async () => {
                active++;
                peak = Math.max(peak, active);
                await new Promise(resolve => setTimeout(resolve, 10));
                active--;
                return { code: 0, data: {} };
            });

            const refs = Array.from({ length: 8 }, (_, i) => `assets/img-${i}.png`);
            await probeAssetRefs(refs, 3);

            expect(peak).toBeLessThanOrEqual(3);
        });
    });

    describe("getBlockDocMap: 块到文档映射 (大库分块与防注入)", () => {
        it("returns empty map directly when blockIDs is empty", async () => {
            const map = await getBlockDocMap([]);
            expect(map.size).toBe(0);
            expect(mocks.fetchSyncPost).not.toHaveBeenCalled();
        });

        it("chunks queries by 400 and preserves concurrency cap for large libraries", async () => {
            const totalIDs = 850;
            const ids = Array.from({ length: totalIDs }, (_, i) => `block-${i + 1}`);

            let sqlCalls: string[] = [];
            mocks.fetchSyncPost.mockImplementation(async (url: string, payload: { stmt: string }) => {
                if (url === "/api/query/sql") {
                    sqlCalls.push(payload.stmt);
                    // 模拟返回当前 chunk 里的部分数据
                    const matched = payload.stmt.match(/IN \(([^)]+)\)/);
                    if (matched) {
                        const inIds = matched[1].split(",").map(s => s.replace(/'/g, ""));
                        return {
                            code: 0,
                            data: inIds.map(id => ({ id, root_id: `doc-of-${id}`, box: "notebook-1" })),
                        };
                    }
                    return { code: 0, data: [] };
                }
                throw new Error("unexpected call");
            });

            const map = await getBlockDocMap(ids);

            // 850 个 ID 应切分为 400 + 400 + 50 共 3 批
            expect(sqlCalls).toHaveLength(3);
            expect(map.size).toBe(850);
            expect(map.get("block-1")).toEqual({ rootID: "doc-of-block-1", notebookID: "notebook-1" });
            expect(map.get("block-850")).toEqual({ rootID: "doc-of-block-850", notebookID: "notebook-1" });
        });

        it("escapes single quotes in block IDs preventing SQL injection / syntax errors", async () => {
            const trickyId = "block'with''quotes";
            mocks.fetchSyncPost.mockImplementation(async (_url: string, payload: { stmt: string }) => {
                expect(payload.stmt).toContain("''");
                expect(payload.stmt).toContain(`'block''with''''quotes'`);
                return {
                    code: 0,
                    data: [{ id: trickyId, root_id: "doc-root", box: "nb-1" }],
                };
            });

            const map = await getBlockDocMap([trickyId]);
            expect(map.get(trickyId)).toEqual({ rootID: "doc-root", notebookID: "nb-1" });
        });

        it("gracefully omits missing blocks from the returned Map", async () => {
            mocks.fetchSyncPost.mockResolvedValue({
                code: 0,
                data: [{ id: "b1", root_id: "d1", box: "nb1" }], // 查不到 b2
            });

            const map = await getBlockDocMap(["b1", "b2"]);
            expect(map.has("b1")).toBe(true);
            expect(map.has("b2")).toBe(false);
            expect(map.get("b1")).toEqual({ rootID: "d1", notebookID: "nb1" });
        });

        it("propagates SQL query rejection honestly", async () => {
            mocks.fetchSyncPost.mockResolvedValue({
                code: 500,
                msg: "database locked",
                data: null,
            });

            await expect(getBlockDocMap(["b1"])).rejects.toThrow("database locked");
        });
    });

    describe("getDocTitles: 文档根块首行标题提取", () => {
        it("returns empty map directly for empty doc IDs", async () => {
            const map = await getDocTitles([]);
            expect(map.size).toBe(0);
            expect(mocks.fetchSyncPost).not.toHaveBeenCalled();
        });

        it("extracts and trims only the first line of content as document title", async () => {
            mocks.fetchSyncPost.mockResolvedValue({
                code: 0,
                data: [
                    { id: "d1", content: "   计算机网络体系结构   \n\n这是正文第一段..." },
                    { id: "d2", content: "单行标题" },
                    { id: "d3", content: "" },
                ],
            });

            const map = await getDocTitles(["d1", "d2", "d3"]);
            expect(map.get("d1")).toBe("计算机网络体系结构");
            expect(map.get("d2")).toBe("单行标题");
            expect(map.get("d3")).toBe("");
        });
    });

    describe("kernelVersion: 系统版本提取与容错", () => {
        it("returns version string when kernel responds", async () => {
            mocks.fetchSyncPost.mockResolvedValue({
                code: 0,
                data: "3.8.6",
            });

            const v = await kernelVersion();
            expect(v).toBe("3.8.6");
        });

        it("falls back to '?' when kernel request fails or returns null", async () => {
            mocks.fetchSyncPost.mockResolvedValue({
                code: 0,
                data: null,
            });

            const v = await kernelVersion();
            expect(v).toBe("?");
        });
    });
});
