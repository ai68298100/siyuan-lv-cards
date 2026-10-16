import { describe, expect, it } from "vitest";
import { extractMediaRefs, normalizeMediaRef, parseMediaRefs } from "../src/core/media-refs";

describe("media-refs", () => {
    it("解析 Markdown 图片、HTML img/audio 和 Anki 音频", () => {
        const r = parseMediaRefs([
            '![流程图](./assets/flow.png "流程")',
            '<img alt="同一张图" src="assets/flow.png?rev=2">',
            "<audio controls src='audio/read.mp3'></audio>",
            "[sound:audio/read.mp3]",
        ].join("\n"));

        expect(r.mediaRefs).toEqual(["assets/flow.png", "audio/read.mp3"]);
        expect(r.refs).toMatchObject([
            { kind: "image", syntax: "markdown", raw: "./assets/flow.png", normalized: "assets/flow.png" },
            { kind: "audio", syntax: "html", raw: "audio/read.mp3", normalized: "audio/read.mp3" },
        ]);
    });

    it("支持 Markdown 尖括号 URL、HTML 无引号 src 和实体", () => {
        const refs = extractMediaRefs('![x](<media/my image.png>) <img src=media/icon&amp;.svg>');
        expect(refs.map(ref => ref.normalized)).toEqual(["media/my image.png", "media/icon&.svg"]);
    });

    it("去重并忽略 data/http/blob/file 等外链", () => {
        const r = parseMediaRefs([
            "![a](https://cdn.example/a.png)",
            "![b](data:image/png;base64,abc)",
            '<img src="//cdn.example/b.png">',
            '<audio src="blob:https://example.test/id"></audio>',
            '<img src="assets/a.png">',
            '[sound:assets/a.png]',
            '<img src="file:///tmp/x.png">',
        ].join("\n"));

        expect(r.mediaRefs).toEqual(["assets/a.png"]);
        expect(r.ignored.map(item => item.reason)).toEqual(["external", "external", "external", "external", "external"]);
    });

    it("空引用不进入结果，并保留诊断", () => {
        const r = parseMediaRefs('![empty](<>) <img src=""> [sound: ]');
        expect(r.refs).toEqual([]);
        expect(r.ignored).toHaveLength(3);
        expect(r.ignored.every(item => item.reason === "empty")).toBe(true);
    });

    it("normalizeMediaRef 只做稳定键清理，不把相对路径误判为外链", () => {
        expect(normalizeMediaRef(" ./foo\\bar.png?x=1#top ")).toBe("foo/bar.png");
        expect(normalizeMediaRef("assets/locked.png?box=20260101000000-a1b2c3d&x=1")).toBe("assets/locked.png?box=20260101000000-a1b2c3d");
        expect(normalizeMediaRef("https://example.com/a.png")).toBeNull();
        expect(normalizeMediaRef("data:image/png;base64,x")).toBeNull();
    });
});
