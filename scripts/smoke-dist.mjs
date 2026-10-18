// AT-17 发布包 smoke（v0.185.1 真机空白回归门禁）：在 build 链尾对 dist 产物做真实执行验证。
// 背景：v0.158.0~v0.185.0 三个 UI chunk 整表覆盖 window.__lvChunks 且 BASE 相对路径——
// 源码级单测（mock 注册表）与离线 e2e（dev 进程内导入）均无法暴露，首个真机安装才炸。
// 门禁内容：
//   1) shell 的 chunk BASE 必须根绝对（桌面端页面在 /stage/build/app/ 下，相对路径必 404）
//   2) happy-dom 全局中逐个执行 dist/chunks/*.js，断言 __lvChunks.<name> 注册形态正确且三 chunk 共存
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
let failed = 0;
const fail = (msg) => { console.error(`✗ ${msg}`); failed += 1; };
const ok = (msg) => console.log(`✓ ${msg}`);

// 1) shell BASE 根绝对（minify 后 BASE 常量独立存在，使用点做模板拼接）
const shell = readFileSync(resolve(dist, "index.js"), "utf8");
if (!shell.includes("`/plugins/siyuan-lv-cards`")) {
    fail("shell 中未找到根绝对 BASE 常量（`/plugins/siyuan-lv-cards`）");
} else {
    ok("shell chunk BASE 根绝对");
}

// 2) chunk 产物真实执行（注册阶段不触达 svelte 挂载，无需完整 DOM 事件）
const win = new Window({ url: "http://127.0.0.1:6806/stage/build/app/index.html" });
globalThis.window = win;
globalThis.document = win.document;
globalThis.__lvSiyuan = {}; // chunk IIFE 的 siyuan 形参，注册阶段仅透传
const checks = {
    hub: (reg) => typeof reg?.hub?.mount === "function"
        && ["previewBatchRepair", "confirmBatchRepair", "applyBatchRepair", "findApproximateDuplicateCandidates", "helpMarkdown",
            "renderExamReportMarkdown", "buildDiagnosticsText", "createMaintenanceRepairStorage"]
            .every(key => typeof reg?.hub?.services?.[key] === "function"),
    review: (reg) => typeof reg?.review?.mount === "function",
    dialogs: (reg) =>
        typeof reg?.dialogs?.mountDialogComponent === "function" &&
        typeof reg?.dialogs?.createPaletteView === "function" &&
        typeof reg?.dialogs?.components?.AIWizard === "function", // Svelte 5 组件=函数
};
for (const name of ["hub", "review", "dialogs"]) {
    const file = resolve(dist, "chunks", `${name}.js`);
    if (!existsSync(file)) { fail(`缺少 dist/chunks/${name}.js`); continue; }
    const hadRegistryBefore = !!win.__lvChunks?.[name];
    try {
        new Function(readFileSync(file, "utf8"))();
    } catch (e) {
        fail(`dist/chunks/${name}.js 顶层执行抛错：${e?.message ?? e}`);
        continue;
    }
    if (hadRegistryBefore) {
        fail(`dist/chunks/${name}.js 重复注册（构建串味？）`);
    } else if (checks[name](win.__lvChunks)) {
        ok(`dist/chunks/${name}.js → __lvChunks.${name} 形态正确`);
    } else {
        fail(`dist/chunks/${name}.js 未按 __lvChunks.${name} 契约注册（整表覆盖回归？）`);
    }
}
if (checks.hub(win.__lvChunks) && checks.review(win.__lvChunks) && checks.dialogs(win.__lvChunks)) {
    ok("三 chunk 注册共存（无整表覆盖）");
}

// Exercise the production service boundary, which dev-mode component tests do not load.
if (checks.dialogs(win.__lvChunks)) {
    try {
        const dialogs = win.__lvChunks.dialogs;
        const run = () => {};
        const close = () => {};
        const view = dialogs.createPaletteView({
            modules: { inbox: true, exam: true }, uiMode: "advanced",
            i18n: { cmdPalette: "Palette smoke", paletteEmpty: "Empty smoke" },
        }, run, close);
        assert.equal(view.component, dialogs.components.LvPalette);
        assert.equal(view.title, "Palette smoke");
        assert.equal(view.panel, true);
        assert.equal(view.props.commands.length, 15);
        assert.equal(view.props.commands.some(command => command.id === "imports"), true);
        assert.equal(view.props.commands.at(-1).id, "maintenance");
        assert.equal(view.props.labels.empty, "Empty smoke");
        assert.equal(view.props.onrun, run);
        assert.equal(view.props.onClose, close);
        const simple = dialogs.createPaletteView({ modules: {}, uiMode: "simple", i18n: {} }, run, close);
        assert.equal(simple.props.commands.length, 11);
        assert.equal(simple.props.commands.some(command => ["inbox", "exam", "cram", "maintenance"].includes(command.id)), false);
        ok("dialogs 命令面板按需装配：组件身份、完整命令、模式门禁与回调通过");
    } catch (e) {
        fail(`dialogs 命令面板装配失败：${e?.message ?? e}`);
    }
}
if (checks.hub(win.__lvChunks)) {
    try {
        const services = win.__lvChunks.hub.services;
        let markdown = "旧题面 ==旧答案==";
        const preview = services.previewBatchRepair([{ blockID: "a", markdown, exists: true }], [
            { blockID: "a", afterMarkdown: "新题面 ==新答案==" },
        ]);
        assert.equal(preview.ok, true);
        const transaction = services.confirmBatchRepair(preview, { previewID: preview.previewID, acknowledged: true });
        const applied = await services.applyBatchRepair(transaction, {
            readCard: async blockID => ({ blockID, markdown }),
            writeMarkdown: async (_blockID, content) => { markdown = content; },
        });
        assert.deepEqual(applied.blockIDs, ["a"]);
        assert.equal(markdown, "新题面 ==新答案==");
        const originals = { a: "==旧答案 A==", b: "没有答案标记 B" };
        const current = { ...originals };
        const recoveryPreview = services.previewBatchRepair(
            Object.entries(originals).map(([blockID, content]) => ({ blockID, markdown: content })),
            Object.keys(originals).map(blockID => ({ blockID, afterMarkdown: `题面 ${blockID} ==新答案==` })),
        );
        assert.equal(recoveryPreview.ok, true);
        const recoveryTransaction = services.confirmBatchRepair(recoveryPreview,
            { previewID: recoveryPreview.previewID, acknowledged: true });
        const storage = services.createMaintenanceRepairStorage(recoveryTransaction.snapshot, {
            readCard: async blockID => ({ blockID, markdown: current[blockID] }),
            saveMarkdown: async (blockID, content, recovery) => {
                if (recovery) {
                    assert.equal(recovery.blockID, blockID);
                    assert.equal(recovery.markdown, originals[blockID]);
                    assert.equal(content, originals[blockID]);
                } else if (!content.startsWith("题面 ")) return "missing question";
                current[blockID] = content;
                if (!recovery && blockID === "b") throw new Error("write failed after applying");
                return true;
            },
        });
        await assert.rejects(services.applyBatchRepair(recoveryTransaction, storage), /write failed after applying/);
        assert.deepEqual(current, originals);
        await assert.rejects(storage.restoreMarkdown("a", "任意内容"), /snapshot mismatch/);
        assert.equal(services.findApproximateDuplicateCandidates([
            { blockID: "a", md: "如何使用间隔重复算法？ ==按遗忘曲线安排复习==" },
            { blockID: "b", md: "如何使用间隔重复？ ==按间隔复习记忆==" },
        ]).length, 1);
        assert.match(services.helpMarkdown("zh_CN"), /使用帮助/);
        assert.match(services.helpMarkdown("en_US"), /Quick start/);
        const report = services.renderExamReportMarkdown({
            plan: { id: "p", name: "Smoke", examDate: "2026-11-15", scopeKind: "deck", scopeId: "d",
                cramDays: 7, enabled: true, archived: false, createdAt: 1 },
            entries: [{ cardID: "c", blockID: "a", deckID: "d", rating: 3, ts: 2 }],
            inScopeFilter: entry => entry.deckID === "d",
            now: new Date(3),
        });
        assert.match(report, /考试复盘：Smoke/);
        assert.match(report, /窗口内复习：1 次/);
        assert.match(services.buildDiagnosticsText({
            pluginVersion: "smoke", kernelVersion: "smoke", modules: {}, revlogCount: 0,
            streak: 0, dueToday: 0, plansCount: 0, persistStats: [], hasPersistFailures: false, dueCacheStats: {},
        }), /plugin version: smoke/);
        ok("hub 按需服务：修复事务及坏卡补偿、近似重复、双语帮助、复盘报告与诊断通过");
    } catch (e) {
        fail(`hub 按需服务执行失败：${e?.message ?? e}`);
    }
}

if (failed) {
    console.error(`\nsmoke-dist：${failed} 项失败`);
    process.exit(1);
}
console.log("smoke-dist：发布包 chunk 契约全部通过");
