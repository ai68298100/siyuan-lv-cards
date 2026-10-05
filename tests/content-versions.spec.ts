import { describe, expect, it } from "vitest";
import { appendVersion, emptyContentVersions, normalizeContentVersions, versionsOf } from "../src/core/content-versions";

describe("content-versions（T05）", () => {
    it("normalize：坏条目剔除、每块限量保留最新、块数限量保留最近写入", () => {
        const raw = {
            version: 1,
            blocks: [
                {
                    blockID: "a",
                    versions: [
                        { md: "v1", at: 1, via: "editor" },
                        { md: "", at: 2, via: "editor" }, // 坏：空内容
                        { md: "v2", at: 3, via: "weird" }, // via 归一为 editor
                        { at: 4 }, // 坏：缺 md
                    ],
                },
                { blockID: "", versions: [{ md: "x", at: 5, via: "editor" }] }, // 坏：缺块 ID
            ],
        };
        const data = normalizeContentVersions(raw);
        expect(data.blocks).toHaveLength(1);
        expect(data.blocks[0].versions.map((v) => v.md)).toEqual(["v1", "v2"]);
        expect(data.blocks[0].versions[1].via).toBe("editor");
    });

    it("append：连续相同内容跳过（无变化不造假版本）", () => {
        let data = emptyContentVersions();
        data = appendVersion(data, "b1", "hello", 1, "editor");
        data = appendVersion(data, "b1", "hello", 2, "editor");
        expect(versionsOf(data, "b1")).toHaveLength(1);
        data = appendVersion(data, "b1", "hello world", 3, "editor");
        expect(versionsOf(data, "b1").map((v) => v.md)).toEqual(["hello world", "hello"]);
    });

    it("append：每块上限 10、最旧被淘汰", () => {
        let data = emptyContentVersions();
        for (let i = 1; i <= 12; i++) {
            data = appendVersion(data, "b1", `v${i}`, i, "editor");
        }
        const vs = versionsOf(data, "b1");
        expect(vs).toHaveLength(10);
        expect(vs[0].md).toBe("v12"); // 最新在前
        expect(vs[9].md).toBe("v3"); // v1/v2 被淘汰
    });

    it("versionsOf：未知块返回空数组", () => {
        expect(versionsOf(emptyContentVersions(), "nope")).toEqual([]);
    });
});
