import { describe, expect, it } from "vitest";
import {
    evalSourceHealth, openIssues, recordIssues, resolveIssue, type SourceFingerprint,
} from "../src/core/source-health";

// BI-20 来源健康：五类影响分别标记；健康问题不冒充记忆失败；修复保留历史
const recorded: SourceFingerprint = {
    blockID: "b1",
    rootID: "root-1",
    contentHash: "hash-v1",
    mediaRefs: ["assets/a.png", "assets/b.png"],
    license: "CC-BY",
};

describe("source-health（BI-20）", () => {
    it("健康：无问题", () => {
        const r = evalSourceHealth(recorded, {
            rootID: "root-1", contentHash: "hash-v1",
            mediaPresent: { "assets/a.png": true, "assets/b.png": true }, license: "CC-BY",
        });
        expect(r.healthy).toBe(true);
        expect(r.issues).toEqual([]);
    });

    it("查无此块 → deleted（单问题，即使指纹也无从比较）", () => {
        const r = evalSourceHealth(recorded, null);
        expect(r.issues).toHaveLength(1);
        expect(r.issues[0]).toMatchObject({ kind: "deleted", affectsScheduling: false });
        expect(r.healthy).toBe(false);
    });

    it("移动/版本变化/媒体失效/许可变化分别独立标记，可并存", () => {
        const r = evalSourceHealth(recorded, {
            rootID: "root-2", contentHash: "hash-v2",
            mediaPresent: { "assets/a.png": false, "assets/b.png": true }, license: "CC-BY-SA",
        });
        expect(r.issues.map(i => i.kind)).toEqual(["moved", "changed", "media-broken", "license-changed"]);
        expect(r.issues.every(i => i.affectsScheduling === false)).toBe(true); // 不冒充记忆失败
        expect(r.issues.find(i => i.kind === "media-broken")!.detail).toContain("assets/a.png");
    });

    it("媒体部分失效只报失效项", () => {
        const r = evalSourceHealth(recorded, {
            rootID: "root-1", contentHash: "hash-v1",
            mediaPresent: { "assets/a.png": true, "assets/b.png": false }, license: "CC-BY",
        });
        expect(r.issues).toHaveLength(1);
        expect(r.issues[0].kind).toBe("media-broken");
        expect(r.issues[0].detail).toBe("assets/b.png");
    });

    it("记录与解决：解决只标记不删史（修复保留历史）；openIssues 只列未解决", () => {
        let history = recordIssues([], [
            { kind: "moved", detail: "r1→r2", impactKey: "k", affectsScheduling: false },
            { kind: "changed", detail: "h1→h2", impactKey: "k", affectsScheduling: false },
        ], 1000);
        history = recordIssues(history, [
            { kind: "moved", detail: "r1→r2", impactKey: "k", affectsScheduling: false },
        ], 2000); // 未解决的重复发现不重复记
        expect(history).toHaveLength(2);
        history = resolveIssue(history, "moved", 3000);
        const moved = history.filter(h => h.kind === "moved");
        // 原地标记：发现记录保留在史中（detail 不丢）并置 resolved——「修复保留历史」
        expect(moved).toHaveLength(1);
        expect(moved[0].resolved).toBe(true);
        expect(moved[0].detail).toBe("r1→r2");
        expect(openIssues(history).map(h => h.kind)).toEqual(["changed"]);
    });
});
