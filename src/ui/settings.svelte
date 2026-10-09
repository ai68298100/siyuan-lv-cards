<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { MODULE_DEFS } from "@/core/modules";
    import { PERSONA_PRESETS, type PersonaPreset } from "@/core/personas";
    import { confirmDialog, confirmDialogBool } from "@/libs/dialog";
    import type { LvCardsSettings } from "@/core/settings";
    import LvSection from "./kit/LvSection.svelte";
    import LvRow from "./kit/LvRow.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvSegmented from "./kit/LvSegmented.svelte";
    import LvSlider from "./kit/LvSlider.svelte";
    import LvSwitch from "./kit/LvSwitch.svelte";
    import LvSelect from "./kit/LvSelect.svelte";
    import LvInput from "./kit/LvInput.svelte";
    import { PROMPT_TEMPLATES } from "@/core/prompt-templates";
    // BU-18 模型能力注册表：快选列表 + 登记状态提示
    import { lookupModel, selectableModelOptions, formatModelContext } from "@/core/ai-model-registry";
    // Anki M3：本地 .apkg 导入（docs/39 §3）——宿主适配 + 解析/预览/编排
    import { detectSqlite, openSqliteFile } from "@/api/anki-host";
    import { getNotebooks, createNotebook, createDocWithMd, sqlQuery } from "@/api/siyuan";
    import { createRiffDeck, addRiffCards, getRiffDecks } from "@/api/riff";
    import { parseAnkiPackage } from "@/core/anki-package";
    import { buildImportPreview } from "@/core/anki-preview";
    import { composeImportMarkdown, pairImportedBlocks, partitionNew, normalizeLedger, mergeLedger } from "@/core/anki-import";
    // Obsidian SR 导入（v0.202.0）：块级解析 → 计划（去重/剥 tag）→ 一卡一段落落库 → 按序对位
    import { planObsidianImport, composeObsidianImportMarkdown, deckNameFor, groupByDeckHint, partitionByLedger, normalizeObLedger, mergeObLedger, type ObLedgerEntry } from "@/core/obsidian-import";

    export interface SettingsCtx {
        i18n: any;
        settings: LvCardsSettings;
        save: (s: LvCardsSettings) => void | Promise<void>;
        close: () => void;
        exportRevlog: () => void;
        clearRevlog: () => void;
        /** 备份与恢复中心（可选——旧宿主不传则不显示） */
        backup?: {
            export: () => void;
            restore: (text: string) => Promise<void>;
        };
        /** BU-24/25：AI 用量账本（可选——旧宿主不传则不显示相关行） */
        costLedger?: {
            export: () => void;
            clear: () => void;
            monthUsed: () => number;
        };
        /** Anki M3：guid 导入台账（幂等重导）；可选——旧宿主不传则不持久化 */
        ankiLedger?: {
            load: () => Promise<unknown>;
            save: (entries: unknown) => Promise<void>;
        };
        /** Obsidian SR 导入弱台账（指纹幂等重导）；可选——旧宿主不传则不持久化 */
        obLedger?: {
            load: () => Promise<unknown>;
            save: (entries: unknown) => Promise<void>;
        };
        /** BU-31：紧急停用/撤销同意（可选——旧宿主不传则不显示该行） */
        killswitch?: {
            snapshot: () => any;
            stopCurrent: () => any;
            resumeAll: () => any;
            revoke: () => any;
            grant: () => any;
        };
        redetectV2: () => Promise<string>;
        getV2Status: () => string;
        getSuspendedCount: () => number;
        restoreAllSuspended: () => void;
        testAnkiClient: (url?: string, key?: string) => Promise<string>;
        storageStats: () => { file: string; size: string; lastWrite: number }[];
        exportSettings: () => void;
        /** 笔记本清单（605 落盘笔记本选择） */
        getNotebooks: () => Promise<{ id: string; name: string }[]>;
        exportRevlogCsv: () => void;
        importRevlogCsv: (fileText: string) => Promise<{ added: number; skipped: number }>;
        importRevlogMerge: (fileText: string, onFork?: "skip" | "preferImport") => Promise<{ added: number; skipped: number; forks: number }>;
    }

    let { ctx }: { ctx: SettingsCtx } = $props();
    const t = $derived(ctx.i18n);

    // BU-31：紧急停用/撤销同意（设置页本地镜像，操作后回读快照）
    // svelte-ignore state_referenced_locally -- 初值快照刻意的：操作经 applyKill 回读替换
    let ks = $state<any>(ctx.killswitch?.snapshot?.() ?? null);
    function applyKill(action: "stopCurrent" | "resumeAll" | "revoke" | "grant") {
        if (!ctx.killswitch) return;
        ks = ctx.killswitch[action]();
        showMessage(t.settings.aiKillApplied, 2000, "info");
    }
    const providerDisabled = $derived(ks?.disabledTargets?.some((x: string) => x.startsWith("provider:")) ?? false);
    function lastEventText(): string {
        const ev = ks?.events?.[ks.events.length - 1];
        if (!ev) return t.settings.aiKillNone;
        return `${ev.kind} · ${new Date(ev.at).toLocaleString()}`;
    }

    // 初值语义：draft 是打开设置时的快照，保存前不随源变化
    // svelte-ignore state_referenced_locally
    let draft: LvCardsSettings = $state(JSON.parse(JSON.stringify(ctx.settings)));

    // Anki M3：本地 .apkg 导入（docs/39 §3）——解析/预览/建文档/配对/制卡/台账，幂等重导
    let ankiBusy = $state(false);
    let ankiTestBusy = $state(false);
    const ankiHost = detectSqlite();
    let ankiStatus = $state<{ kind: "info" | "warn" | "error"; text: string } | null>(null);
    // Anki M3：损失明细（导入完成时可一键复制）
    let ankiLosses = $state<string[]>([]);
    /** Obsidian SR 导入（W2）：台账幂等分区 → 确认 → 建文档（一卡一段落）→ 按序对位 → deckHint 分卡组入组。
     * 数量不符即中止（防错位）；双向卡按正向导入（诚实计数）。 */
    let obBusy = $state(false);
    let obStatus = $state<{ kind: "info" | "warn"; text: string } | null>(null);
    async function importObsidian(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file || obBusy) { return; }
        obBusy = true;
        obStatus = null;
        try {
            const plan = planObsidianImport(await file.text());
            if (plan.cards.length === 0) {
                obStatus = { kind: "info", text: t.settings.obImportNone };
                return;
            }
            const rawLedger = ctx.obLedger ? await ctx.obLedger.load() : [];
            const ledger = normalizeObLedger(rawLedger);
            const { fresh, already } = partitionByLedger(plan.cards, ledger);
            if (fresh.length === 0) {
                obStatus = { kind: "info", text: (t.settings.obImportDone || "已导入 ${ok} 张（文件内去重 ${dup}）").replace("${ok}", "0").replace("${dup}", String(plan.duplicates)).replace("${skip}", String(already.length)) };
                return;
            }
            const base = file.name.replace(/\.(md|markdown)$/i, "");
            const summary = (t.settings.obImportConfirm || "")
                .replace("${n}", String(plan.cards.length))
                .replace("${qa}", String(fresh.filter(c => c.kind === "qa").length))
                .replace("${cloze}", String(fresh.filter(c => c.kind === "cloze").length))
                .replace("${rev}", String(plan.reversed))
                .replace("${dup}", String(plan.duplicates + already.length))
                .replace("${skip}", String(already.length))
                .replace("${deck}", deckNameFor(base, ""));
            const okGo = await confirmDialogBool({
                title: t.settings.obImportLabel,
                content: `<div class="b3-typography">${summary}</div>`,
            });
            if (!okGo) { return; }
            // 落点笔记本：存在同名即用，缺失创建（与 Anki 导入同模式）
            const nbName = t.settings.obImportNbName || "Obsidian SR Import";
            const boxes = await getNotebooks();
            let nbId = boxes.find((b) => b.name === nbName)?.id;
            if (!nbId) { nbId = (await createNotebook(nbName)) ?? ""; }
            const docID = await createDocWithMd(nbId, `Obsidian SR/${base} ${new Date().toISOString().slice(0, 10)}`, composeObsidianImportMarkdown(fresh));
            if (!docID) { throw new Error("createDocWithMd 返回空"); }
            // 一卡一段落对位：数量不符中止（防错位，诚实失败）
            const blockRows = await sqlQuery(`SELECT id FROM blocks WHERE root_id='${docID}' AND type IN ('p','h','u','o') ORDER BY sort`);
            if (blockRows.length !== fresh.length) {
                throw new Error((t.settings.obImportMismatch || "落块数 ${a} 与卡数 ${b} 不一致，已中止")
                    .replace("${a}", String(blockRows.length)).replace("${b}", String(fresh.length)));
            }
            const blockIDs = blockRows.map((r) => String(r.id));
            // deckHint 分卡组：同名牌组复用，缺失创建；blockID 按全局序归组
            const existingDecks = await getRiffDecks();
            const deckIdByName = new Map<string, string>();
            for (const d of existingDecks) {
                deckIdByName.set(d.name, d.id);
            }
            const now = Date.now();
            const ledgerAdditions: ObLedgerEntry[] = [];
            let cursor = 0;
            let added = 0;
            for (const group of groupByDeckHint(fresh)) {
                const name = deckNameFor(base, group.hint);
                let deckID = deckIdByName.get(name) ?? "";
                if (!deckID) {
                    const deck = await createRiffDeck(name) as any;
                    deckID = deck?.id ?? deck?.deck?.id ?? "";
                    deckIdByName.set(name, deckID);
                }
                const groupBlocks = blockIDs.slice(cursor, cursor + group.cards.length);
                cursor += group.cards.length;
                await addRiffCards(deckID, groupBlocks);
                added += groupBlocks.length;
                group.cards.forEach((c, i) => ledgerAdditions.push({ fingerprint: c.fingerprint, deckID, blockID: groupBlocks[i] ?? "", importedAt: now }));
            }
            if (ctx.obLedger) {
                await ctx.obLedger.save(mergeObLedger(normalizeObLedger(rawLedger), ledgerAdditions));
            }
            obStatus = { kind: "info", text: (t.settings.obImportDone || "已导入 ${ok} 张（文件内去重 ${dup}）").replace("${ok}", String(added)).replace("${dup}", String(plan.duplicates)).replace("${skip}", String(already.length)) };
        } catch (e: any) {
            obStatus = { kind: "warn", text: (t.settings.obImportFail || "导入失败：${m}").replace("${m}", e?.message ?? String(e)) };
        } finally {
            obBusy = false;
        }
    }

    async function importAnki(e: Event) {        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file || ankiBusy) return;
        const probe = detectSqlite();
        if (!probe.available) {
            ankiStatus = { kind: "error", text: (t.settings.ankiImportNoSqlite ?? "当前宿主不支持本地解析").replace("${r}", probe.reason ?? "") };
            return;
        }
        ankiBusy = true;
        ankiLosses = [];
        ankiStatus = { kind: "info", text: t.settings.ankiImportParsing };
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            // M1 解析器契约：传入"打开器"（由解析器自行打开字节），关闭句柄在此收口
            let closeDb: (() => void) | null = null;
            let pkg;
            try {
                pkg = parseAnkiPackage(bytes, (dbBytes) => {
                    const h = openSqliteFile(dbBytes);
                    closeDb = h.close;
                    return h.adapter;
                });
            } finally {
                closeDb?.();
            }
            const preview = buildImportPreview(pkg);
            const rawLedger = ctx.ankiLedger ? await ctx.ankiLedger.load() : [];
            const ledger = normalizeLedger(rawLedger);
            const { fresh, already } = partitionNew(preview.cards, ledger);
            if (fresh.length === 0) {
                ankiStatus = { kind: "info", text: t.settings.ankiImportDone.replace("${ok}", "0").replace("${skip}", String(already.length)).replace("${loss}", String(preview.losses.length)) };
                return;
            }
            // 落点笔记本：存在同名即用，缺失创建
            const nbName = t.settings.ankiNbName || "Anki Import";
            const boxes = await getNotebooks();
            let nbId = boxes.find((b) => b.name === nbName)?.id;
            if (!nbId) nbId = (await createNotebook(nbName)) ?? "";
            const base = file.name.replace(/\.(apkg|colpkg)$/i, "");
            const docID = await createDocWithMd(nbId, `Anki/${base} ${new Date().toISOString().slice(0, 10)}`, composeImportMarkdown(fresh));
            if (!docID) throw new Error("createDocWithMd 返回空");
            const blockRows = await sqlQuery(`SELECT id, content FROM blocks WHERE root_id='${docID}' AND type='p' ORDER BY sort`);
            const { byGuid } = pairImportedBlocks(
                blockRows.map((r) => ({ id: String(r.id), content: String(r.content ?? "") })),
                fresh,
                { orderFallback: true },
            );
            const blockIDs = fresh.map((c) => byGuid.get(c.guid)).filter((x): x is string => Boolean(x));
            const deck = await createRiffDeck(`Anki: ${base}`) as any;
            const deckID = deck?.id ?? deck?.deck?.id ?? "";
            await addRiffCards(deckID, blockIDs);
            const now = Date.now();
            if (ctx.ankiLedger) {
                await ctx.ankiLedger.save(mergeLedger(rawLedger, fresh.map((c) => ({ guid: c.guid, deckID, blockID: byGuid.get(c.guid) ?? "", importedAt: now }))));
            }
            ankiStatus = {
                kind: "warn",
                text: t.settings.ankiImportDone.replace("${ok}", String(blockIDs.length)).replace("${skip}", String(already.length)).replace("${loss}", String(preview.losses.length)),
            };
            if (preview.losses.length > 0) {
                ankiLosses = preview.losses.map((l) => `[${l.guid}] ${l.reason}`);
            }
        } catch (e) {
            ankiStatus = { kind: "error", text: (t.settings.ankiImportFail || "导入失败").replace("${m}", e instanceof Error ? e.message : String(e)) };
        } finally {
            ankiBusy = false;
        }
    }

    // T09 三件套（docs/40）：搜索定位——按分组标题+代表字段标签匹配（i18n 值，中英皆可搜）
    let searchQuery = $state("");
    const SECTION_KEYWORDS: Record<string, string[]> = {
        persona: ["personaSection", "personaManage", "personaActive"],
        modules: ["modules", "gateway", "review", "stats"],
        studyRhythm: ["studyRhythm", "dailyNewTarget", "dailyReviewTarget"],
        studyAnswer: ["studyAnswer", "ratingStyle", "timeoutMode", "timeoutForget", "typingEnabled", "dictationEnabled", "choiceEnabled"],
        studyVoice: ["studyVoice", "ttsEnabled", "ttsRate"],
        studyNotify: ["studyNotify", "notifyDue", "dailyTipEnabled"],
        aiSection: ["aiSection", "aiEndpoint", "aiModel", "aiPromptTemplate", "aiKillTitle"],
        exam: ["exam"],
        ankiSection: ["ankiSection", "ankiSectionHint"],
        appearance: ["appearance", "cardFontScale", "uiMode"],
        dataSection: ["dataSection"],
    };
    function sectionMatches(id: string): boolean {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        const dict = t.settings as Record<string, unknown>;
        const hay = (SECTION_KEYWORDS[id] ?? []).map((k) => String(dict[k] ?? "")).join(" ").toLowerCase();
        return hay.includes(q);
    }

    /** BU-18：模型登记状态提示（登记→窗口规模；失效→建议更换；未登记→保守默认口径） */
    function modelRegistryHint(): string {
        const id = (draft.aiModel ?? "").trim();
        if (!id) { return ""; }
        const m = lookupModel(id);
        const dict = t.settings as Record<string, string>;
        if (!m) { return dict.aiModelUnknown ?? ""; }
        if (m.status !== "active") { return dict.aiModelStale ?? ""; }
        return (dict.aiModelCtx ?? "").replace("{n}", formatModelContext(m.contextWindow));
    }
    // svelte-ignore state_referenced_locally
    let v2Label = $state(ctx.getV2Status());
    let voices = $state<{ name: string }[]>([]);
    /** 笔记本清单（605） */
    let notebooks = $state<{ id: string; name: string }[]>([]);

    onMount(() => {
        try {
            if ("speechSynthesis" in window) {
                const load = () => (voices = speechSynthesis.getVoices().map(v => ({ name: v.name })));
                load();
                speechSynthesis.onvoiceschanged = load;
            }
        } catch { /* 旁路 */ }
        ctx.getNotebooks().then(n => (notebooks = n)).catch(() => { /* 旁路 */ });
    });
    let ankiLabel = $state("");

    async function testAnki() {
        if (ankiTestBusy) return;
        ankiTestBusy = true;
        ankiLabel = "";
        try {
            ankiLabel = await ctx.testAnkiClient(draft.ankiClientUrl, draft.ankiClientKey);
        } catch (e: any) {
            ankiLabel = `${t.settings.ankiTestFail ?? "Connection failed"}: ${e?.message ?? String(e)}`;
        } finally {
            ankiTestBusy = false;
        }
    }

    let saveBusy = $state(false);
    let saveError = $state("");

    function toggleModule(id: string, ev: Event) {
        draft.modules[id] = (ev.target as HTMLInputElement).checked;
        draft.persona = "custom";
    }

    /** 画像应用 diff 预览（61·P0）：确认框逐项列出将改动的模块开关与参数 */
    const PERSONA_PARAM_LABELS: Record<string, string> = {
        ratingStyle: "ratingStyle",
        timeoutMode: "timeoutMode",
        timeoutSeconds: "timeoutSeconds",
        dailyNewTarget: "dailyNewTarget",
        dailyReviewTarget: "dailyReviewTarget",
    };

    function applyPersona(preset: PersonaPreset) {
        const moduleMap = new Map(MODULE_DEFS.map(m => [m.id, m.nameKey]));
        const modLines: string[] = [];
        for (const [id, v] of Object.entries(preset.modules)) {
            if (id in draft.modules && draft.modules[id] !== v) {
                const label = moduleMap.get(id) ? (t.modules as any)[moduleMap.get(id)!] ?? id : id;
                modLines.push(`<div>• ${label}：${draft.modules[id] ? "✓" : "✕"} → ${v ? "✓" : "✕"}</div>`);
            }
        }
        const paramLines: string[] = [];
        for (const [k, v] of Object.entries(preset.params)) {
            const cur = (draft as any)[k];
            if (cur !== undefined && cur !== v) {
                const label = (t.settings as any)[PERSONA_PARAM_LABELS[k] ?? k] ?? k;
                paramLines.push(`<div>• ${label}：${cur} → ${v}</div>`);
            }
        }
        const diffHtml = [...modLines, ...paramLines].join("");
        const diffBlock = diffHtml
            ? `<hr style="margin:8px 0"><div style="max-height:180px;overflow:auto;font-size:12px">${diffHtml}</div>`
            : `<hr style="margin:8px 0"><div style="font-size:12px">${t.settings.personaNoChange}</div>`;
        confirmDialog({
            title: t.personaApplyTitle,
            content: `<div class="b3-typography">${t[preset.nameKey]}：${t[preset.descKey]}<br><small>${t.personaApplyHint}</small></div>${diffBlock}`,
            confirm: () => {
                draft.persona = preset.id;
                draft.modules = { ...draft.modules, ...preset.modules };
                Object.assign(draft, preset.params);
            },
        });
    }

    /** 画像分享（M12·FR6）：导出/导入当前 模块开关+推荐参数 组合 */
    const PERSONA_PARAM_KEYS = ["ratingStyle", "timeoutMode", "timeoutSeconds", "dailyNewTarget", "dailyReviewTarget"] as const;

    function exportPersona() {
        const params: Record<string, unknown> = {};
        for (const k of PERSONA_PARAM_KEYS) {
            params[k] = (draft as any)[k];
        }
        const payload = { app: "lv-cards", type: "persona", v: 1, persona: draft.persona, modules: { ...draft.modules }, params };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "lv-cards-persona.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function importPersona(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        if (file.size > 256 * 1024) {
            showMessage(t.settings.importTooLarge, 3000, "error");
            input.value = "";
            return;
        }
        try {
            const obj = JSON.parse(await file.text());
            if (obj?.app !== "lv-cards" || obj?.type !== "persona") {
                throw new Error("not a persona file");
            }
            if (obj.modules && typeof obj.modules === "object") {
                for (const [k, v] of Object.entries(obj.modules)) {
                    if (typeof v === "boolean" && k in draft.modules) {
                        draft.modules[k] = v as boolean;
                    }
                }
            }
            if (obj.params && typeof obj.params === "object") {
                for (const k of PERSONA_PARAM_KEYS) {
                    if (obj.params[k] !== undefined) {
                        (draft as any)[k] = obj.params[k];
                    }
                }
            }
            draft.persona = "custom";
            showMessage(t.settings.personaImported, 2500, "info");
        } catch {
            showMessage(t.settings.personaImportBad, 3000, "error");
        } finally {
            input.value = "";
        }
    }

    async function redetectV2() {
        v2Label = await ctx.redetectV2();
        showMessage(t.settings.redetectOk, 1500, "info");
    }

    function importCsv(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showMessage(t.settings.importTooLarge, 3000, "error");
            input.value = "";
            return;
        }
        file.text().then(async (text) => {
            try {
                const r = await ctx.importRevlogCsv(text);
                showMessage(t.settings.importResult.replace("${a}", String(r.added)).replace("${s}", String(r.skipped)), 3000, "info");
            } catch (e: any) {
                showMessage(e?.message || t.settings.importInvalid, 3000, "error");
            }
            input.value = "";
        });
    }

    /** 备份与恢复中心：从 bundle 文件恢复（宿主内预览→确认→应用；失败 toast 可读原因） */
    let backupBusy = $state(false);
    async function restoreBackup(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file || !ctx.backup || backupBusy) {
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            showMessage(t.settings.importTooLarge, 3000, "error");
            return;
        }
        backupBusy = true;
        try {
            const text = await file.text();
            await ctx.backup.restore(text);
        } catch (e: any) {
            showMessage(e?.message ?? String(e), 4000, "error");
        } finally {
            backupBusy = false;
        }
    }

    function importMerge(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showMessage(t.settings.importTooLarge, 3000, "error");
            input.value = "";
            return;
        }
        file.text().then(async (text) => {
            try {
                const r = await ctx.importRevlogMerge(text);
                if (r.forks > 0) {
                    // 分叉预览（M10·FR3）：检测到多设备评分冲突，用户可选以导入为准重放合并（合并幂等，重复条目自动跳过）
                    confirmDialog({
                        title: t.settings.forkTitle,
                        content: `<div class="b3-typography">${t.settings.forkConfirm.replace("${n}", String(r.forks))}</div>`,
                        confirm: async () => {
                            const r2 = await ctx.importRevlogMerge(text, "preferImport");
                            showMessage(t.settings.importResult.replace("${a}", String(r2.added)).replace("${s}", String(r2.skipped)), 3000, "info");
                        },
                    });
                }
                showMessage(t.settings.importResult.replace("${a}", String(r.added)).replace("${s}", String(r.skipped)), 3000, "info");
            } catch (e: any) {
                showMessage(e?.message || t.settings.importInvalid, 3000, "error");
            }
            input.value = "";
        });
    }

    function requestClose() {
        if (saveBusy) return;
        if (JSON.stringify(draft) === JSON.stringify(ctx.settings)) {
            ctx.close();
            return;
        }
        confirmDialog({
            title: t.settings.unsavedTitle,
            content: `<div class="b3-typography">${t.settings.unsavedDesc}</div>`,
            confirm: () => ctx.close(),
        });
    }

    async function save() {
        if (saveBusy) return;
        draft.dailyNewTarget = Math.max(0, Number(draft.dailyNewTarget) || 0);
        draft.dailyReviewTarget = Math.max(0, Number(draft.dailyReviewTarget) || 0);
        draft.timeoutSeconds = Math.min(3600, Math.max(5, Number(draft.timeoutSeconds) || 60));
        draft.answerTimeCapSec = Math.min(3600, Math.max(5, Number(draft.answerTimeCapSec) || 60));
        draft.leechThreshold = Math.max(1, Number(draft.leechThreshold) || 8);
        saveBusy = true;
        saveError = "";
        try {
            await ctx.save(draft);
            ctx.close();
        } catch (e: any) {
            saveError = e?.message || t.settings.saveFail || t.storageWriteFail || "Save failed, try again";
        } finally {
            saveBusy = false;
        }
    }
</script>

<div class="lv-settings b3-typography">

    <!-- T09 三件套（docs/40）：搜索定位 + 本地样例预览（虚构内容，不触真实卡片） -->
    <div class="lv-searchbar">
        <input class="b3-text-field" style="width: 100%" placeholder={t.settings.searchPlaceholder} bind:value={searchQuery} />
    </div>
    {#if sectionMatches("appearance")}
    <div class="lv-notice" style="display: flex; gap: var(--lv-sp-4); align-items: center; flex-wrap: wrap">
        <div style="flex: 1; min-width: 240px">
            <div class="lv-eyebrow">{t.settings.previewTitle}</div>
            <div class="ft__smaller ft__on-surface" style="margin-top: 4px">{t.settings.previewSub}</div>
        </div>
        <div class="lv-card2" style="max-width: 320px; font-size: ${draft.cardFontScale || 1}em; flex: 1">
            <div style="padding: 12px 16px">
                <strong>{t.settings.previewQ}</strong>
                <div class="ft__smaller ft__on-surface" style="margin-top: 4px">{t.settings.previewA}</div>
            </div>
        </div>
    </div>
    {/if}
    {#if sectionMatches("persona")}
    <LvSection title={t.settings.personaSection}>
        <div class="fn__flex fn__flex-wrap lv-personas">
            {#each PERSONA_PRESETS as p (p.id)}
                <button
                    class="lv-persona"
                    class:lv-persona-active={draft.persona === p.id}
                    onclick={() => applyPersona(p)}
                >
                    <div class="lv-persona-name">{t[p.nameKey]}</div>
                    <div class="ft__smaller ft__on-surface">{t[p.descKey]}</div>
                </button>
            {/each}
            <div class="lv-persona" class:lv-persona-active={draft.persona === "custom"}>
                <div class="lv-persona-name">{t.personaCustom}</div>
                <div class="ft__smaller ft__on-surface">{t.personaCustom_desc}</div>
            </div>
        </div>
        <div class="fn__flex" style="gap: var(--lv-sp-2); margin-top: var(--lv-sp-2)">
            <button class="b3-button b3-button--outline b3-button--small" onclick={exportPersona}>{t.settings.personaExport}</button>
            <label class="b3-button b3-button--outline b3-button--small" style="cursor:pointer">
                {t.settings.personaImport}
                <input type="file" accept="application/json,.json" style="display:none" onchange={importPersona} />
            </label>
        </div>
    </LvSection>
    {/if}

    {#if sectionMatches("modules")}
    <LvSection title={t.settings.modules}>
        <!-- BI-14：界面模式（simple=隐藏考试/维护等高级入口；纯显示控制，不删配置） -->
        <LvRow label={t.settings.uiModeLabel} hint={t.settings.uiModeHint}>
            {#snippet children()}
                <LvSelect
                    bind:value={draft.uiMode}
                    options={[
                        { value: "simple", label: t.settings.uiModeSimple },
                        { value: "advanced", label: t.settings.uiModeAdvanced },
                    ]}
                />
            {/snippet}
        </LvRow>
        {#each MODULE_DEFS as m (m.id)}
            <LvRow label={t.modules[m.nameKey]} hint={m.locked ? t.settings.lockedModule : t.modules[m.descKey]}>
                {#snippet children()}
                    <LvChip tone={m.phase === "v0.1" ? "primary" : m.phase === "v0.9" ? "warn" : "default"}>{m.phase}</LvChip>
                    {#if m.locked}
                        <input class="b3-switch" type="checkbox" checked disabled />
                    {:else}
                        <input class="b3-switch" type="checkbox" checked={draft.modules[m.id]} onchange={(e) => toggleModule(m.id, e)} />
                    {/if}
                {/snippet}
            </LvRow>
        {/each}
    </LvSection>
    {/if}

    <!-- 学习偏好四区（13-W10）：节奏与目标 / 评分与作答 / 朗读与音效 / 提醒与免打扰 -->
    {#if sectionMatches("studyRhythm")}
    <LvSection title={t.settings.studyRhythm}>
        <LvRow label={t.settings.dailyNewTarget}>
            <input class="b3-text-field fn__size-60" type="number" min="0" bind:value={draft.dailyNewTarget} />
        </LvRow>
        <LvRow label={t.settings.dailyReviewTarget}>
            <input class="b3-text-field fn__size-60" type="number" min="0" bind:value={draft.dailyReviewTarget} />
        </LvRow>
        <LvRow label={t.settings.batchLimit} hint={t.settings.batchLimitHint}>
            <input class="b3-text-field fn__size-60" type="number" min="0" bind:value={draft.batchLimit} />
        </LvRow>
        <LvRow label={t.settings.randomOrder}>
            <LvSwitch bind:checked={draft.randomOrder} />
        </LvRow>
        <LvRow label={t.settings.reverseOrder} hint={t.settings.reverseOrderHint}>
            <LvSwitch bind:checked={draft.reverseOrder} />
        </LvRow>
        <LvRow label={t.settings.hideMetaUntilAnswer} hint={t.settings.hideMetaHint}>
            <LvSwitch bind:checked={draft.hideMetaUntilAnswer} />
        </LvRow>
        <LvRow label={t.settings.requeueAgain} hint={t.settings.requeueAgainHint}>
            <LvSwitch bind:checked={draft.requeueAgain} />
        </LvRow>
        <LvRow label={t.settings.xpEnabled} hint={t.settings.xpEnabledHint}>
            <LvSwitch bind:checked={draft.xpEnabled} />
        </LvRow>
        <LvRow label={t.settings.dailyTipEnabled} hint={t.settings.dailyTipHint}>
            <LvSwitch bind:checked={draft.dailyTipEnabled} />
        </LvRow>
        <LvRow label={t.settings.leechThreshold}>
            <input class="b3-text-field fn__size-60" type="number" min="1" bind:value={draft.leechThreshold} />
        </LvRow>
    </LvSection>
    {/if}

    {#if sectionMatches("studyAnswer")}
    <LvSection title={t.settings.studyAnswer}>
        <LvRow label={t.settings.ratingStyle}>
            <LvSegmented
                options={[
                    { value: "four", label: t.settings.ratingFour },
                    { value: "three", label: t.settings.ratingThree },
                ]}
                value={draft.ratingStyle}
                onchange={(v) => (draft.ratingStyle = v as "four" | "three")}
            />
        </LvRow>

        <!-- T09：生效来源显示（docs/40）——全局默认 + 本场覆盖口径 -->
        <div class="lv-notice">{t.settings.effectiveSource.replace("${v}", draft.ratingStyle === "four" ? t.settings.ratingFour : t.settings.ratingThree)}</div>
        <LvRow label={t.settings.timeoutMode}>
        <LvSelect
            bind:value={draft.timeoutMode}
            options={[
                { value: "off", label: t.settings.timeoutOff },
                { value: "reveal", label: t.settings.timeoutReveal },
                { value: "forget", label: t.settings.timeoutForget },
            ]}
        />
        </LvRow>
        {#if draft.timeoutMode !== "off"}
            <LvRow label={t.settings.timeoutSeconds}>
                <LvSlider value={draft.timeoutSeconds} min={5} max={600} step={5} suffix="s" onchange={(v) => (draft.timeoutSeconds = v)} />
            </LvRow>
        {/if}
        <!-- AQ-13：单卡作答耗时封顶（只影响本地统计，不改评分与到期） -->
        <LvRow label={t.settings.answerTimeCap} hint={t.settings.answerTimeCapHint}>
            <LvSlider value={draft.answerTimeCapSec} min={5} max={600} step={5} suffix="s" onchange={(v) => (draft.answerTimeCapSec = v)} />
        </LvRow>
        <LvRow label={t.settings.typingEnabled}>
            <LvSwitch bind:checked={draft.typingEnabled} />
        </LvRow>
        {#if draft.typingEnabled}
            <LvRow label={t.settings.typingStrict}>
                <LvSwitch bind:checked={draft.typingStrict} />
            </LvRow>
            <LvRow label={t.settings.dictationEnabled}>
                <LvSwitch bind:checked={draft.dictationEnabled} />
            </LvRow>
        {/if}
        <LvRow label={t.settings.choiceEnabled}>
            <LvSwitch bind:checked={draft.choiceEnabled} />
        </LvRow>
        <LvRow label={t.settings.mixedRotationLabel} hint={t.settings.mixedRotationHint}>
            <LvSwitch bind:checked={draft.mixedRotation} />
        </LvRow>
    </LvSection>
    {/if}

    {#if sectionMatches("studyVoice")}
    <LvSection title={t.settings.studyVoice}>
        <LvRow label={t.settings.ttsEnabled}>
            <LvSwitch bind:checked={draft.ttsEnabled} />
        </LvRow>
        {#if draft.ttsEnabled}
            <LvRow label={t.settings.ttsRate}>
                <input class="b3-text-field fn__size-60" type="number" min="0.5" max="2" step="0.1" bind:value={draft.ttsRate} />
            </LvRow>
            <LvRow label={t.settings.ttsVoice} hint={t.settings.ttsVoiceHint}>
                {#snippet children()}
                    <select class="b3-select fn__size-200" bind:value={draft.ttsVoice}>
                        <option value="">{t.settings.ttsVoiceDefault}</option>
                        {#each voices as v (v.name)}<option value={v.name}>{v.name}</option>{/each}
                    </select>
                {/snippet}
            </LvRow>
        {/if}
        <LvRow label={t.settings.sfxEnabled} hint={t.settings.sfxHint}>
            <LvSwitch bind:checked={draft.sfxEnabled} />
        </LvRow>
        {#if draft.sfxEnabled}
            <LvRow label={t.settings.sfxStyle}>
                <LvSegmented
                    options={[
                        { value: "chime", label: t.settings.sfxChime },
                        { value: "wood", label: t.settings.sfxWood },
                        { value: "bell", label: t.settings.sfxBell },
                    ]}
                    value={draft.sfxStyle}
                    onchange={(v) => (draft.sfxStyle = v as "chime" | "wood" | "bell")}
                />
            </LvRow>
        {/if}
    </LvSection>
    {/if}

    {#if sectionMatches("studyNotify")}
    <LvSection title={t.settings.studyNotify}>
        <LvRow label={t.settings.quietStart} hint={t.settings.quietHint}>
            <input class="b3-text-field fn__size-60" type="time" bind:value={draft.quietStart} />
        </LvRow>
        <LvRow label={t.settings.quietEnd}>
            <input class="b3-text-field fn__size-60" type="time" bind:value={draft.quietEnd} />
        </LvRow>
        <LvRow label={t.settings.reminderEnabled}>
            <LvSwitch bind:checked={draft.reminderEnabled} />
        </LvRow>
        {#if draft.weeklyReportEnabled}
            <p class="hint" style="margin: 0 0 8px">{t.settings.weeklyReportHint}</p>
        {/if}
        <LvRow label={t.settings.weeklyReportEnabled}>
            <LvSwitch bind:checked={draft.weeklyReportEnabled} />
        </LvRow>
        {#if draft.reminderEnabled}
            <LvRow label={t.settings.reminderTime}>
                <input class="b3-text-field fn__size-60" type="time" bind:value={draft.reminderTime} />
            </LvRow>
            <LvRow label={t.settings.backlogDays}>
                <input class="b3-text-field fn__size-60" type="number" min="1" bind:value={draft.backlogDays} />
            </LvRow>
        {/if}
    </LvSection>
    {/if}

    {#if sectionMatches("aiSection")}
    <LvSection title={t.settings.aiSection} sub={t.settings.aiSectionHint}>
        <LvRow label={t.settings.targetNotebook} hint={t.settings.targetNotebookHint}>
            <LvSelect
                bind:value={draft.targetNotebookId}
                options={[{ value: "", label: t.settings.targetNotebookFirst }, ...notebooks.map(n => ({ value: n.id, label: n.name }))]}
            />
        </LvRow>
        <LvRow label={t.settings.markerEnabled} hint={t.settings.markerEnabledHint}>
            <LvSwitch bind:checked={draft.markerEnabled} />
        </LvRow>
        <LvRow label={t.settings.aiMode}>
            {#snippet children()}
                <LvSelect
                    bind:value={draft.aiMode}
                    options={[
                        { value: "siyuan", label: t.settings.aiModeSiyuan },
                        { value: "custom", label: t.settings.aiModeCustom },
                    ]}
                />
            {/snippet}
        </LvRow>
            {#if draft.aiMode === "custom"}
                <LvRow label={t.settings.aiEndpoint}>
                <LvInput bind:value={draft.aiEndpoint} placeholder="https://api.example.com/v1" width="200px" />
                </LvRow>
            <LvRow label={t.settings.aiModel} hint={modelRegistryHint()}>
                {#snippet children()}
                    <div class="fn__flex" style="gap: 6px; align-items: center; flex-wrap: wrap">
                        <LvInput bind:value={draft.aiModel} placeholder="gpt-4o-mini" width="160px" />
                        <!-- BU-18 模型能力注册表：快选只列 active 在册模型（失效模型不出现） -->
                        <select
                            class="b3-select b3-button--small"
                            aria-label={t.settings.aiModelPreset}
                            onchange={(e: Event) => {
                                const id = (e.target as HTMLSelectElement).value;
                                if (id) { draft.aiModel = id; }
                                (e.target as HTMLSelectElement).value = "";
                            }}
                        >
                            <option value="">{t.settings.aiModelPreset}</option>
                            {#each selectableModelOptions() as o (o.value)}
                                <option value={o.value}>{o.label}</option>
                            {/each}
                        </select>
                    </div>
                {/snippet}
            </LvRow>
            <LvRow label={t.settings.aiKey} hint={t.settings.aiKeyHint}>
                <LvInput bind:value={draft.aiKey} type="password" width="200px" />
            </LvRow>
            <LvRow label={t.settings.aiFallbackEndpoint} hint={t.settings.aiFallbackHint}>
                <LvInput bind:value={draft.aiFallbackEndpoint} placeholder="https://backup.example.com/v1" width="200px" />
            </LvRow>
            {#if draft.aiFallbackEndpoint}
                <LvRow label={t.settings.aiFallbackModel}>
                    <LvInput bind:value={draft.aiFallbackModel} placeholder="gpt-4o-mini" width="200px" />
                </LvRow>
                <LvRow label={t.settings.aiFallbackKey}>
                    <LvInput bind:value={draft.aiFallbackKey} type="password" width="200px" />
                </LvRow>
            {/if}
            <LvRow label={t.settings.aiPromptTemplate} hint={t.settings.aiPromptTemplateHint}>
                {#snippet children()}
                    <!-- BU-5 收口（v0.163.0）：预置模板单一事实源=注册表（10 模板），不再散落 i18n 字符串 -->
                    <div class="fn__flex fn__flex-wrap" style="gap: 6px; margin-bottom: 6px">
                        <select
                            class="b3-select b3-button--small"
                            aria-label={t.settings.aiPromptTemplate}
                            onchange={(e: Event) => {
                                const id = (e.target as HTMLSelectElement).value;
                                const tpl = PROMPT_TEMPLATES.find(x => x.id === id);
                                if (tpl) { draft.aiPromptTemplate = tpl.systemPrompt; }
                            }}
                        >
                            <option value="">{t.settings.aiPromptPick}</option>
                            {#each PROMPT_TEMPLATES as tpl (tpl.id)}
                                <option value={tpl.id}>{(t as any)[tpl.nameKey] ?? tpl.nameKey}</option>
                            {/each}
                        </select>
                        <button class="b3-button b3-button--small" onclick={() => (draft.aiPromptTemplate = "")}>{t.settings.aiPromptReset}</button>
                    </div>
                    <textarea class="b3-text-field fn__size-200" rows="4" style="width: 100%; resize: vertical" bind:value={draft.aiPromptTemplate}></textarea>
                {/snippet}
            </LvRow>
            {/if}
            {#if ctx.killswitch}
                <!-- BU-31：紧急停用/撤销同意（停用即清理待发队列；卡片与正式复习不受影响）。
                     安全阀对思源内置 AI 同样有意义，不能随 custom 模式条件块隐藏（审计 F-2 修复） -->
                <LvRow label={t.settings.aiKillTitle} hint={t.settings.aiKillHint}>
                    {#snippet children()}
                        <div class="fn__flex fn__flex-wrap" style="gap: 6px; align-items: center">
                            {#if ks.revoked}
                                <button class="b3-button b3-button--small" onclick={() => applyKill("grant")}>{t.settings.aiKillGrant}</button>
                                <LvChip tone="error">{t.settings.aiKillRevokedChip}</LvChip>
                            {:else}
                                <button class="b3-button b3-button--small" onclick={() => applyKill("revoke")}>{t.settings.aiKillRevoke}</button>
                            {/if}
                            {#if providerDisabled}
                                <button class="b3-button b3-button--small" onclick={() => applyKill("resumeAll")}>{t.settings.aiKillResume}</button>
                                <LvChip tone="warn">{t.settings.aiKillStoppedChip}</LvChip>
                            {:else}
                                <button class="b3-button b3-button--small" onclick={() => applyKill("stopCurrent")}>{t.settings.aiKillStop}</button>
                            {/if}
                        </div>
                        <div class="ft__smaller ft__on-surface" style="margin-top: 4px">
                            {t.settings.aiKillLast}{lastEventText()}
                        </div>
                    {/snippet}
                </LvRow>
            {/if}
            <!-- BU-8：自定义敏感词（发送前扫描提示脱敏，仅本地；思源内置 AI 与自定义端点都生效） -->
            <LvRow label={t.settings.aiSensitiveTerms} hint={t.settings.aiSensitiveTermsHint}>
                <LvInput bind:value={draft.aiSensitiveTerms} placeholder="projectblue, 项目代号" width="200px" />
            </LvRow>
            {#if ctx.costLedger}
                <!-- BU-24：月度 token 预算（超限阻断出卡；手工路径不受限；账本只记 token/模型，不含内容） -->
                <LvRow label={t.settings.aiCostBudget} hint={t.settings.aiCostBudgetHint}>
                    {#snippet children()}
                        <div class="fn__flex" style="gap: 8px; align-items: center; flex-wrap: wrap">
                            <LvSwitch bind:checked={draft.aiCostBudgetEnabled} />
                            <span class="ft__smaller ft__on-surface">{t.settings.aiCostMonthlyCap}</span>
                            <input class="b3-text-field fn__size-60" type="number" min="0" bind:value={draft.aiCostMonthlyCap} />
                            <span class="ft__smaller ft__on-surface">{t.settings.aiCostUsed.replace("${n}", String(ctx.costLedger.monthUsed()))}</span>
                        </div>
                    {/snippet}
                </LvRow>
            {/if}
    </LvSection>
    {/if}

    {#if sectionMatches("exam")}
    <LvSection title={t.settings.exam}>
        <LvRow label={t.settings.examEnabled}>
            <LvSwitch bind:checked={draft.examEnabled} />
        </LvRow>
        <LvRow label={t.settings.examDate}>
            <input class="b3-text-field fn__size-200" type="date" bind:value={draft.examDate} disabled={!draft.examEnabled} />
        </LvRow>
        <div class="ft__smaller ft__on-surface">{t.settings.examHint}</div>
    </LvSection>
    {/if}

    {#if sectionMatches("ankiSection")}
    <LvSection title={t.settings.ankiSection} sub={t.settings.ankiSectionHint}>
        <LvRow label={t.settings.ankiUrl}>
            <input class="b3-text-field fn__size-200" bind:value={draft.ankiClientUrl} />
        </LvRow>
        <LvRow label={t.settings.ankiKey}>
            <input class="b3-text-field fn__size-200" type="password" bind:value={draft.ankiClientKey} />
        </LvRow>
        <LvRow label={t.settings.ankiTest}>
            {#snippet children()}
                {#if ankiLabel}<span class="ft__smaller ft__on-surface">{ankiLabel}</span>{/if}
                <button class="b3-button b3-button--outline" disabled={ankiTestBusy} onclick={testAnki}>{ankiTestBusy ? "…" : t.settings.ankiTest}</button>
            {/snippet}
        </LvRow>
        <!-- Anki M3：本地 .apkg 导入（docs/39 §3）——解析/预览/建文档/制卡/台账，幂等重导 -->
        <LvRow label={t.settings.ankiImport} hint={t.settings.ankiImportHint}>
            {#snippet children()}
                {#if ankiBusy}<span class="ft__smaller ft__on-surface">{t.settings.ankiImportParsing}</span>{/if}
                {#if ankiHost.available}
                    <label class="b3-button b3-button--outline" style="cursor: pointer;{ankiBusy ? ' pointer-events: none; opacity: .6;' : ''}">
                        <input type="file" accept=".apkg,.colpkg" style="display: none" disabled={ankiBusy} onchange={importAnki} />
                        {t.settings.ankiImportPick}
                    </label>
                {:else}
                    <span class="lv-notice lv-notice--warn" role="status">
                        {(t.settings.ankiImportNoSqlite ?? "当前宿主不支持本地解析：${r}").replace("${r}", ankiHost.reason ?? "")}
                    </span>
                {/if}
            {/snippet}
        </LvRow>
        {#if ankiStatus}
            <div class="lv-notice {ankiStatus.kind === 'info' ? '' : 'lv-notice--warn'}" style="max-height: 180px; overflow: auto">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
                    <span style="flex: 1; min-width: 200px">{ankiStatus.text}</span>
                    {#if ankiStatus.kind === "warn" && ankiLosses.length > 0}
                        <!-- Anki M3：损失明细一键复制（诊断对账用） -->
                        <button
                            class="b3-button b3-button--small"
                            onclick={() => {
                                navigator.clipboard.writeText(ankiLosses.join("\n")).then(
                                    () => showMessage(t.settings.ankiLossCopied, 1500, "info"),
                                    () => { /* 剪贴板不可用静默 */ },
                                );
                            }}
                        >{t.settings.ankiLossCopy}</button>
                    {/if}
                </div>
            </div>
        {/if}
        <!-- Obsidian SR 导入（v0.202.0）：#flashcards/::/:::/==挖空== md → 一卡一段落落库 → 按序对位入新卡组 -->
        <LvRow label={t.settings.obImportLabel} hint={t.settings.obImportHint}>
            {#snippet children()}
                {#if obBusy}<span class="ft__smaller ft__on-surface">{t.settings.ankiImportParsing}</span>{/if}
                <label class="b3-button b3-button--outline" style="cursor: pointer;{obBusy ? ' pointer-events: none; opacity: .6;' : ''}">
                    <input type="file" accept=".md,.markdown,text/markdown" style="display: none" disabled={obBusy} onchange={importObsidian} />
                    {t.settings.obImportPick}
                </label>
            {/snippet}
        </LvRow>
        {#if obStatus}
            <div class="lv-notice {obStatus.kind === 'info' ? '' : 'lv-notice--warn'}">
                <span>{obStatus.text}</span>
            </div>
        {/if}
    </LvSection>
    {/if}

    {#if sectionMatches("appearance")}
    <LvSection title={t.settings.appearance}>
        <LvRow label={t.settings.cardFontScale}>
            <LvSlider value={draft.cardFontScale} min={0.85} max={1.25} step={0.05} suffix="×" onchange={(v) => (draft.cardFontScale = v)} />
        </LvRow>
        <LvRow label={t.settings.ratingDensity}>
            <LvSegmented
                options={[
                    { value: "cozy", label: t.settings.densityCozy },
                    { value: "compact", label: t.settings.densityCompact },
                ]}
                value={draft.ratingDensity}
                onchange={(v) => (draft.ratingDensity = v as "cozy" | "compact")}
            />
        </LvRow>
        <LvRow label={t.settings.heatmapWeeks}>
            <select class="b3-select fn__size-200" bind:value={draft.heatmapWeeks}>
                <option value={17}>17 {t.settings.weeks}</option>
                <option value={26}>26 {t.settings.weeks}</option>
                <option value={52}>52 {t.settings.weeks}</option>
            </select>
        </LvRow>
        <LvRow label={t.settings.badgeRefreshSec} hint={t.settings.badgeRefreshSecHint}>
            <select class="b3-select fn__size-200" bind:value={draft.badgeRefreshSec}>
                <option value={0}>{t.settings.badgeOff}</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
            </select>
        </LvRow>
    </LvSection>
    {/if}

    {#if sectionMatches("dataSection")}
    <LvSection title={t.settings.dataSection}>
        <LvRow label="Flashcard V2" hint={t.dashboard.v2Active}>
            {#snippet children()}
                <LvChip tone={v2Label.startsWith("Active") ? "primary" : v2Label === "N/A (<3.9.0)" ? "default" : "warn"}>{v2Label}</LvChip>
                <button class="b3-button b3-button--outline" onclick={redetectV2}>{t.settings.redetectV2}</button>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.suspendedManage} hint={t.settings.suspendedHint.replace("${n}", String(ctx.getSuspendedCount()))}>
            {#snippet children()}
                <button class="b3-button b3-button--outline" disabled={ctx.getSuspendedCount() === 0} onclick={ctx.restoreAllSuspended}>
                    {t.settings.suspendedRestore}
                </button>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.exportRevlog} hint={t.settings.storageNote}>
            {#snippet children()}
                <button class="b3-button b3-button--outline" onclick={ctx.exportRevlog}>JSON</button>
                <button class="b3-button b3-button--outline" onclick={ctx.exportRevlogCsv}>CSV</button>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.exportSettings}>
            {#snippet children()}
                <button class="b3-button b3-button--outline" onclick={ctx.exportSettings}>{t.settings.exportSettings}</button>
            {/snippet}
        </LvRow>
        <LvRow label={t.settings.importMerge} hint={t.settings.importMergeHint}>
            {#snippet children()}
                <input class="b3-button b3-button--outline" type="file" accept=".json,application/json" onchange={importMerge} />
                <input class="b3-button b3-button--outline" type="file" accept=".csv,text/csv" onchange={importCsv} />
            {/snippet}
        </LvRow>
        {#if ctx.backup}
            <!-- 备份与恢复中心（docs/38 P2）：导出 bundle 快照 / 从文件恢复（预览→确认→应用） -->
            <LvRow label={t.settings.backupExport} hint={t.settings.backupHint}>
                {#snippet children()}
                    <button class="b3-button b3-button--outline" onclick={ctx.backup.export}>JSON</button>
                    <input class="b3-button b3-button--outline" type="file" accept=".json,application/json" disabled={backupBusy} onchange={restoreBackup} />
                    <span class="ft__smaller ft__on-surface">{backupBusy ? "…" : ""}</span>
                {/snippet}
            </LvRow>
        {/if}
        <div class="lv-storage">
            <div class="fn__flex lv-st-head ft__smaller ft__on-surface">
                <span>file</span><div class="fn__flex-1"></div><span>{t.settings.storageLastWrite}</span>
            </div>
            {#each ctx.storageStats() as row (row.file)}
                <div class="fn__flex lv-st-row">
                    <span>{row.file}</span>
                    <div class="fn__flex-1"></div>
                    <span class="ft__smaller ft__on-surface">{row.size}</span>
                    <span class="ft__smaller ft__on-surface lv-lw">{row.lastWrite ? new Date(row.lastWrite).toLocaleString() : "—"}</span>
                </div>
            {/each}
        </div>
        <LvRow label={t.settings.clearRevlog}>
            {#snippet children()}
                <button
                    class="b3-button b3-button--outline"
                    onclick={() => confirmDialog({
                        title: t.settings.clearRevlog,
                        content: `<div class="b3-typography">${t.settings.clearRevlogConfirm}</div>`,
                        confirm: () => {
                            ctx.exportRevlog(); // 清空前自动备份（AK）
                            ctx.clearRevlog();
                        },
                    })}
                >{t.settings.clearRevlog}</button>
            {/snippet}
        </LvRow>
        {#if ctx.costLedger}
            <!-- BU-25：账本可导出（聚合+明细）与删除 -->
            <LvRow label={t.settings.exportCostLedger}>
                {#snippet children()}
                    <button class="b3-button b3-button--outline" onclick={ctx.costLedger.export}>JSON</button>
                    <button
                        class="b3-button b3-button--outline"
                        onclick={() => confirmDialog({
                            title: t.settings.clearCostLedger,
                            content: `<div class="b3-typography">${t.settings.clearCostLedgerConfirm}</div>`,
                            confirm: () => ctx.costLedger!.clear(),
                        })}
                    >{t.settings.clearCostLedger}</button>
                {/snippet}
            </LvRow>
        {/if}
    </LvSection>
    {/if}

    {#if saveError}
        <div class="lv-notice lv-notice--warn" role="alert" style="margin-bottom: var(--lv-sp-2)">{saveError}</div>
    {/if}
    <div class="b3-dialog__action">
        <button class="b3-button b3-button--cancel" disabled={saveBusy} onclick={requestClose}>{window.siyuan.languages.cancel}</button>
        <div class="fn__space"></div>
        <button class="b3-button b3-button--text" disabled={saveBusy} onclick={save}>{saveBusy ? "…" : window.siyuan.languages.confirm}</button>
    </div>
</div>

<style lang="scss">
    .lv-settings {
        padding: var(--lv-sp-4);
        height: 100%;
        overflow: auto;
        box-sizing: border-box;
        max-width: 720px;
        margin: 0 auto;

        .b3-dialog__action { justify-content: flex-end; }

        .lv-storage {
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-s);
            padding: var(--lv-sp-2) var(--lv-sp-3);
            .lv-st-head, .lv-st-row { gap: var(--lv-sp-3); align-items: center; padding: 2px 0; }
            .lv-st-head { border-bottom: 1px solid var(--lv-border); padding-bottom: var(--lv-sp-1); }
            .lv-lw { margin-left: var(--lv-sp-3); font-variant-numeric: tabular-nums; }
        }

        .lv-personas { gap: var(--lv-sp-2); }
        .lv-persona {
            flex: 1 1 130px;
            padding: var(--lv-sp-3);
            cursor: pointer;
            border: 1px solid var(--lv-border);
            background: var(--b3-theme-background);
            text-align: left;
            border-radius: var(--lv-r-m);
            transition: border-color var(--lv-dur-2) var(--lv-ease),
                transform var(--lv-dur-2) var(--lv-ease),
                box-shadow var(--lv-dur-2) var(--lv-ease);

            &:hover {
                transform: translateY(-2px);
                box-shadow: var(--lv-shadow-2);
                border-color: var(--lv-border-strong);
            }
        }
        .lv-persona-active {
            border-color: var(--lv-primary-border);
            background: var(--lv-primary-softer);
            box-shadow: var(--lv-focus-ring);
        }
        .lv-persona-name { font-weight: 600; margin-bottom: 2px; }
    }
</style>
