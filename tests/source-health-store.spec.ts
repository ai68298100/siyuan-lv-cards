import { describe, expect, it } from "vitest";
import {
    emptySourceHealth,
    acknowledgeSourceHealth,
    normalizeSourceHealth,
    reconcileSourceHealth,
    sourceHealthHistories,
    sourceHealthHistory,
    sourceHealthIssues,
    upsertSourceFingerprint,
} from "../src/core/source-health-store";

const fingerprint = { blockID: "b1", rootID: "r1", contentHash: "h1", mediaRefs: ["assets/a.png"] };

describe("source-health-store", () => {
    it("normalizes malformed entries and deduplicates media refs", () => {
        const data = normalizeSourceHealth({ entries: [
            { fingerprint: { ...fingerprint, mediaRefs: ["assets/a.png", "assets/a.png"] }, history: [] },
            { fingerprint: { blockID: "" }, history: [] },
        ] });
        expect(data.entries).toHaveLength(1);
        expect(data.entries[0].fingerprint.mediaRefs).toEqual(["assets/a.png"]);
    });

    it("keeps old history without resolvedAt and filters timestamps outside the Date range", () => {
        const legacy = { at: 100, kind: "moved", resolved: true, detail: "r1 → r2" };
        const resolved = { at: 200, kind: "changed", resolved: true, resolvedAt: 300, detail: "h1 → h2" };
        const data = normalizeSourceHealth({ entries: [{ fingerprint, history: [
            legacy, resolved,
            { ...legacy, at: NaN },
            { ...legacy, at: Infinity },
            { ...legacy, at: Number.MAX_VALUE },
            { ...legacy, at: -Number.MAX_VALUE },
            { ...legacy, at: "100" },
            { ...resolved, resolvedAt: NaN },
            { ...resolved, resolvedAt: Number.MAX_VALUE },
            { ...resolved, resolvedAt: "300" },
        ] }] });
        expect(sourceHealthHistory(data, "b1")).toEqual([legacy, resolved]);
    });

    it("keeps the baseline while recording and resolving current health issues", () => {
        let data = upsertSourceFingerprint(emptySourceHealth(), fingerprint);
        const changed = reconcileSourceHealth(data, "b1", {
            rootID: "r2", contentHash: "h2", mediaPresent: { "assets/a.png": false },
        }, 100);
        data = changed.data;
        expect(changed.issues.map(issue => issue.kind)).toEqual(["moved", "changed", "media-broken"]);
        expect(sourceHealthIssues(data, "b1").map(issue => issue.kind)).toEqual(["moved", "changed", "media-broken"]);
        const healthy = reconcileSourceHealth(data, "b1", {
            rootID: "r1", contentHash: "h1", mediaPresent: { "assets/a.png": true },
        }, 200);
        expect(sourceHealthIssues(healthy.data, "b1")).toEqual([]);
        expect(healthy.data.entries[0].fingerprint).toEqual(fingerprint);
        expect(healthy.data.entries[0].history).toHaveLength(3);
        expect(healthy.data.entries[0].history.every(item => item.resolved)).toBe(true);
        expect(healthy.data.entries[0].history.every(item => item.resolvedAt === 200)).toBe(true);
    });

    it("does not invent a baseline for an unknown legacy block", () => {
        const result = reconcileSourceHealth(emptySourceHealth(), "legacy", null, 100);
        expect(result.issues).toEqual([]);
        expect(result.data).toEqual(emptySourceHealth());
    });

    it("updates the baseline only after explicit acknowledgement and keeps history", () => {
        let data = upsertSourceFingerprint(emptySourceHealth(), fingerprint);
        data = reconcileSourceHealth(data, "b1", {
            rootID: "r2", contentHash: "h2", mediaPresent: { "assets/a.png": false },
        }, 100).data;
        const acknowledged = acknowledgeSourceHealth(data, {
            blockID: "b1", rootID: "r2", contentHash: "h2", mediaRefs: ["assets/a.png"],
        }, 200, { mediaPresent: { "assets/a.png": true } });
        expect(acknowledged.entries[0].fingerprint.rootID).toBe("r2");
        expect(sourceHealthIssues(acknowledged, "b1")).toEqual([]);
        expect(acknowledged.entries[0].history).toHaveLength(3);
        expect(acknowledged.entries[0].history.every(item => item.resolved)).toBe(true);
        expect(acknowledged.entries[0].history.every(item => item.resolvedAt === 200)).toBe(true);
    });

    it("acknowledges source edits while retaining a missing media issue without resolving and recreating it", () => {
        let data = upsertSourceFingerprint(emptySourceHealth(), fingerprint);
        const current = { rootID: "r2", contentHash: "h2", mediaPresent: { "assets/a.png": false } };
        data = reconcileSourceHealth(data, "b1", current, 100).data;
        const accepted = { ...fingerprint, rootID: "r2", contentHash: "h2" };
        data = acknowledgeSourceHealth(data, accepted, 200, current);
        data = reconcileSourceHealth(data, "b1", current, 300).data;
        expect(sourceHealthHistory(data, "b1")).toEqual([
            { at: 100, kind: "moved", resolved: true, resolvedAt: 200, detail: "r1 → r2" },
            { at: 100, kind: "changed", resolved: true, resolvedAt: 200, detail: "h1 → h2" },
            { at: 100, kind: "media-broken", resolved: false, detail: "assets/a.png" },
        ]);
        expect(sourceHealthIssues(data, "b1").map(item => item.kind)).toEqual(["media-broken"]);
    });

    it("keeps missing media open when acknowledgement or later scans have no conclusive media result", () => {
        let data = upsertSourceFingerprint(emptySourceHealth(), fingerprint);
        data = reconcileSourceHealth(data, "b1", {
            rootID: "r2", contentHash: "h2", mediaPresent: { "assets/a.png": false },
        }, 100).data;
        data = acknowledgeSourceHealth(data, { ...fingerprint, rootID: "r2", contentHash: "h2" }, 200);
        expect(sourceHealthIssues(data, "b1").map(item => item.kind)).toEqual(["media-broken"]);
        const unknown = reconcileSourceHealth(data, "b1", { rootID: "r2", contentHash: "h2", mediaPresent: {} }, 300);
        expect(unknown.issues.map(item => item.kind)).toEqual(["media-broken"]);
        expect(sourceHealthHistory(unknown.data, "b1").filter(item => item.kind === "media-broken"))
            .toEqual([{ at: 100, kind: "media-broken", resolved: false, detail: "assets/a.png" }]);
        const recovered = reconcileSourceHealth(unknown.data, "b1", {
            rootID: "r2", contentHash: "h2", mediaPresent: { "assets/a.png": true },
        }, 400);
        expect(recovered.issues).toEqual([]);
        expect(sourceHealthHistory(recovered.data, "b1").find(item => item.kind === "media-broken"))
            .toMatchObject({ at: 100, resolved: true, resolvedAt: 400 });
    });

    it("does not mark missing media recovered when its source is deleted", () => {
        let data = upsertSourceFingerprint(emptySourceHealth(), fingerprint);
        data = reconcileSourceHealth(data, "b1", {
            rootID: "r1", contentHash: "h1", mediaPresent: { "assets/a.png": false },
        }, 100).data;
        data = reconcileSourceHealth(data, "b1", null, 200).data;
        expect(sourceHealthIssues(data, "b1").map(item => item.kind)).toEqual(["media-broken", "deleted"]);
        expect(sourceHealthHistory(data, "b1").find(item => item.kind === "media-broken")?.resolvedAt).toBeUndefined();
    });

    it("preserves every existing issue while a deleted source prevents verification", () => {
        let data = upsertSourceFingerprint(emptySourceHealth(), { ...fingerprint, license: "CC-BY" });
        data = reconcileSourceHealth(data, "b1", {
            rootID: "r2", contentHash: "h2", mediaPresent: { "assets/a.png": false }, license: "CC0",
        }, 100).data;
        const deleted = reconcileSourceHealth(data, "b1", null, 200);
        const scannedAgain = reconcileSourceHealth(deleted.data, "b1", null, 300);
        expect(scannedAgain.issues.map(item => item.kind)).toEqual(["deleted", "moved", "changed", "media-broken", "license-changed"]);
        expect(sourceHealthHistory(scannedAgain.data, "b1")).toHaveLength(5);
        expect(sourceHealthHistory(scannedAgain.data, "b1").every(item => !item.resolved && item.resolvedAt === undefined)).toBe(true);
        expect(sourceHealthHistory(scannedAgain.data, "b1").slice(0, 4).every(item => item.at === 100)).toBe(true);
    });

    it("does not resolve a changed license without a current license fact", () => {
        let data = upsertSourceFingerprint(emptySourceHealth(), { ...fingerprint, license: "CC-BY" });
        data = reconcileSourceHealth(data, "b1", {
            rootID: "r1", contentHash: "h1", mediaPresent: {}, license: "CC0",
        }, 100).data;
        const unknown = reconcileSourceHealth(data, "b1", {
            rootID: "r1", contentHash: "h1", mediaPresent: {},
        }, 200);
        expect(unknown.issues).toEqual([
            { kind: "license-changed", detail: "CC-BY → CC0", impactKey: "sourceHealth.impact.license", affectsScheduling: false },
        ]);
        expect(sourceHealthIssues(unknown.data, "b1")[0]).toMatchObject({ at: 100, resolved: false });
    });

    it("closes a media issue when the acknowledged source removes all media references", () => {
        let data = upsertSourceFingerprint(emptySourceHealth(), fingerprint);
        data = reconcileSourceHealth(data, "b1", {
            rootID: "r1", contentHash: "h1", mediaPresent: { "assets/a.png": false },
        }, 100).data;
        data = acknowledgeSourceHealth(data, { ...fingerprint, mediaRefs: [] }, 200, { mediaPresent: {} });
        expect(sourceHealthIssues(data, "b1")).toEqual([]);
        expect(sourceHealthHistory(data, "b1")).toEqual([
            { at: 100, kind: "media-broken", resolved: true, resolvedAt: 200, detail: "assets/a.png" },
        ]);
    });

    it("records newly detected missing media during acknowledgement", () => {
        const data = acknowledgeSourceHealth(emptySourceHealth(), fingerprint, 100, {
            mediaPresent: { "assets/a.png": false },
        });
        expect(sourceHealthIssues(data, "b1")).toEqual([
            { at: 100, kind: "media-broken", resolved: false, detail: "assets/a.png" },
        ]);
    });

    it("resolves the latest occurrence when a health kind recurs", () => {
        let data = upsertSourceFingerprint(emptySourceHealth(), fingerprint);
        data = reconcileSourceHealth(data, "b1", { rootID: "r2", contentHash: "h2", mediaPresent: {} }, 100).data;
        data = reconcileSourceHealth(data, "b1", { rootID: "r1", contentHash: "h1", mediaPresent: { "assets/a.png": true } }, 200).data;
        data = reconcileSourceHealth(data, "b1", { rootID: "r3", contentHash: "h3", mediaPresent: {} }, 300).data;
        const history = data.entries[0].history.filter(item => item.kind === "moved");
        expect(history).toHaveLength(2);
        expect(history[0].resolved).toBe(true);
        expect(history[1].resolved).toBe(false);
        data = acknowledgeSourceHealth(data, {
            blockID: "b1", rootID: "r3", contentHash: "h3", mediaRefs: ["assets/a.png"],
        }, 400);
        expect(sourceHealthIssues(data, "b1")).toEqual([]);
    });

    it("returns all persisted histories as defensive copies without requiring card-group membership", () => {
        let data = upsertSourceFingerprint(emptySourceHealth(), fingerprint);
        data = upsertSourceFingerprint(data, { ...fingerprint, blockID: "no-history" });
        data = upsertSourceFingerprint(data, { ...fingerprint, blockID: "removed-card" });
        data = reconcileSourceHealth(data, "b1", null, 100).data;
        data = reconcileSourceHealth(data, "removed-card", null, 200).data;
        const result = sourceHealthHistories(data);
        expect(result.map(item => item.blockID)).toEqual(["b1", "removed-card"]);
        result[0].blockID = "mutated";
        result[0].records[0].detail = "mutated";
        result[1].records.length = 0;
        const single = sourceHealthHistory(data, "b1");
        single[0].resolved = true;
        const open = sourceHealthIssues(data, "b1");
        open[0].detail = "mutated";
        expect(sourceHealthHistories(data)).toEqual([
            { blockID: "b1", records: [{ at: 100, kind: "deleted", resolved: false, detail: "b1" }] },
            { blockID: "removed-card", records: [{ at: 200, kind: "deleted", resolved: false, detail: "removed-card" }] },
        ]);
    });
});
