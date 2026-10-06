import { describe, expect, it } from "vitest";
import { stableStringify, checksumOf, buildBackupBundle, previewRestore, BACKUP_APP, BACKUP_SCHEMA } from "../src/core/backup";

// 备份与恢复中心：打包 manifest/校验和可复现、预览不改状态、未知 key 与坏 checksum 拒绝
describe("backup（备份与恢复中心）", () => {
    const files = {
        "revlog.json": { version: 1, entries: [{ at: 1 }, { at: 2 }] },
        "settings.json": { aiMode: "custom", onboarded: true },
    };

    it("stableStringify：键排序可复现（与插入序无关），数组保序", () => {
        expect(stableStringify({ b: 1, a: [2, 1] })).toBe(stableStringify({ a: [2, 1], b: 1 }));
        expect(stableStringify({ a: [2, 1] })).not.toBe(stableStringify({ a: [1, 2] }));
        expect(stableStringify(null)).toBe("null");
        expect(stableStringify(undefined)).toBe("null");
    });

    it("checksumOf：同数据同指纹、异数据异指纹", () => {
        expect(checksumOf(files["settings.json"])).toBe(checksumOf({ onboarded: true, aiMode: "custom" }));
        expect(checksumOf(files["settings.json"])).not.toBe(checksumOf(files["revlog.json"]));
    });

    it("打包：manifest 逐文件 bytes/checksum/entries 齐备，键有序", () => {
        const bundle = buildBackupBundle(files, 1234567);
        expect(bundle.lvBackup).toBe(true);
        expect(bundle.manifest.app).toBe(BACKUP_APP);
        expect(bundle.manifest.schema).toBe(BACKUP_SCHEMA);
        expect(Object.keys(bundle.manifest.files)).toEqual(["revlog.json", "settings.json"]);
        expect(bundle.manifest.files["revlog.json"].entries).toBe(2);
        expect(bundle.manifest.files["revlog.json"].checksum).toBe(checksumOf(files["revlog.json"]));
        expect(bundle.manifest.files["settings.json"].entries).toBe(2);
        expect(bundle.manifest.createdAt).toBe(1234567);
    });

    it("恢复预览：replace/add/unchanged 三态与条目数对比；不改输入（演练口径）", () => {
        const bundle = buildBackupBundle(files);
        const current = {
            "revlog.json": { version: 1, entries: [{ at: 9 }] },       // replace
            "settings.json": files["settings.json"],                    // unchanged
        };
        const before = JSON.stringify(current);
        const preview = previewRestore(bundle, current, ["revlog.json", "settings.json"]);
        expect(preview.ok).toBe(true);
        expect(preview.errors).toEqual([]);
        const byKey = Object.fromEntries(preview.perKey.map(k => [k.key, k]));
        expect(byKey["revlog.json"].action).toBe("replace");
        expect(byKey["revlog.json"].entriesBefore).toBe(2); // 顶层键数（version+entries）
        expect(byKey["revlog.json"].entriesAfter).toBe(2);
        expect(byKey["settings.json"].action).toBe("unchanged");
        expect(preview.summary).toEqual({ replace: 1, add: 0, unchanged: 1 });
        expect(JSON.stringify(current)).toBe(before); // 输入未动
    });

    it("恢复预览：新 key 记 add；不在允许清单的 key 拒绝并计错", () => {
        const bundle = buildBackupBundle({ "revlog.json": { x: 1 }, "evil.json": { y: 2 } });
        const preview = previewRestore(bundle, {}, ["revlog.json"]);
        expect(preview.ok).toBe(false);
        expect(preview.errors.some(e => e.includes("evil.json"))).toBe(true);
        expect(preview.perKey.map(k => k.key)).toEqual(["revlog.json"]);
        expect(preview.perKey[0].action).toBe("add");
        expect(preview.files["evil.json"]).toBeUndefined();
    });

    it("恢复预览：checksum 篡改与包裹缺失拒绝；空可恢复集拒绝", () => {
        const bundle = buildBackupBundle(files) as any;
        bundle.files["revlog.json"].entries.push({ at: 3 }); // 篡改数据
        let preview = previewRestore(bundle, {}, ["revlog.json", "settings.json"]);
        expect(preview.ok).toBe(false);
        expect(preview.errors.some(e => e.includes("checksum mismatch: revlog.json"))).toBe(true);
        preview = previewRestore({ foo: 1 }, {}, ["revlog.json"]);
        expect(preview.errors[0]).toContain("envelope");
        preview = previewRestore(buildBackupBundle({}), {}, ["revlog.json"]);
        expect(preview.errors).toContain("no restorable files");
    });
});
