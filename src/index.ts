import "./index.scss";

import { mount, unmount } from "svelte";
import { Plugin, Menu, getAllEditor, showMessage, openTab } from "siyuan";

import { svelteDialog, confirmDialogBool } from "./libs/dialog";
import { lvLog, lvLogDump } from "./libs/log";
import { loadStore, zipLoaded } from "./libs/store";
import { createPersist, type PersistQueue } from "./libs/persist";
import { normalizeAIBatches, emptyAIBatches, type AIBatchesData } from "./core/ai-batches";
import { defaultSettings, normalizeSettings, type LvCardsSettings } from "./core/settings";
import { PERSONA_PRESETS } from "./core/personas";
import { normalizeNativeCardAction, NativeEventDeduper } from "./core/native-events";
import { parseSrLine, parseSrMultiline, stripSrMarkers } from "./core/obsidian-sr";
import {
    normalizeAIJobs, emptyAIJobs, createJob, transitionJob, pruneJobs, firstPendingIndex,
    type AIJobsData, type AIJob,
} from "./core/ai-jobs";
import {
    appendRevlog, calcStreak, emptyRevlog, leechCards, localDate, normalizeRevlog, revlogToCsv, mergeRevlog, docCoverage,
    type RevlogData, type RevlogEntry,
} from "./core/revlog";
import { detectFlashcardV2, type MigrationStatus } from "./api/flashcardV2";
import { addRiffCards, createRiffDeck, getDueCount, getRiffCardsByBlockIDs, getRiffDecks, getRiffDueCards, removeRiffCards } from "./api/riff";
import { appendBlock, createDocWithMd, getNotebooks, getBlockDOM, getBlockDocMap, getDocTitles, exportMdContent, sqlQuery, kernelVersion } from "./api/siyuan";
import { aiChat, estimateTokens, parseCards, isAICanceled } from "./api/ai";
import { normalizeSuspendToday, rollDateIfNeeded, isSuspended, suspend, type SuspendTodayData } from "./core/suspend-today";
import { parseRevlogCsv } from "./core/revlog-csv";
import { normalizeSessionState, type SessionState } from "./core/session-state";
import { normalizeExamPlans, daysLeft, examReportStats, type ExamPlan, type ExamPlansData } from "./core/exam";
import Hub from "./ui/hub.svelte";
// 重组件对话框懒加载（AN 体积评审）：打开时才拉取对应 chunk
const lazyComp = (loader: () => Promise<{ default: any }>) => {
    let cached: any = null;
    return async () => {
        if (!cached) {
            cached = (await loader()).default;
        }
        return cached;
    };
};
// 复习面板同样走懒加载（体积评审：主包重回预算；tab 首开一次性 chunk 加载）
const loadReview = lazyComp(() => import("./ui/review.svelte"));
const loadAIWizard = lazyComp(() => import("./ui/ai-wizard.svelte"));
const loadOcclusionEditor = lazyComp(() => import("./ui/occlusion-editor.svelte"));
const loadOnboarding = lazyComp(() => import("./ui/onboarding.svelte"));
const loadChallengeMode = lazyComp(() => import("./ui/challenge-mode.svelte"));
const loadMarkerCards = lazyComp(() => import("./ui/marker-cards.svelte"));
const loadPairingGame = lazyComp(() => import("./ui/pairing-game.svelte"));
const loadSettingsPanel = lazyComp(() => import("./ui/settings.svelte"));
const loadDeckPicker = lazyComp(() => import("./ui/deck-picker.svelte"));
const loadQuickCard = lazyComp(() => import("./ui/quick-card.svelte"));

const TAB_DASHBOARD = "lv-cards-dashboard";
const TAB_REVIEW = "lv-cards-review";
const SETTINGS_DATA = "settings.json";
const REVLOG_DATA = "revlog.json";
const SUSPEND_TODAY_DATA = "suspend-today.json";
const EXAM_PLANS_DATA = "exam-plans.json";
const AI_BATCHES_DATA = "ai-batches.json";
const SESSION_STATE_DATA = "session-state.json";
const AI_JOBS_DATA = "ai-jobs.json";

export default class LvCardsPlugin extends Plugin {

    private settings: LvCardsSettings = defaultSettings();
    private revlog: RevlogData = emptyRevlog();
    private saveRevlogTimer: ReturnType<typeof setTimeout> | null = null;
    /** 内核闪卡 V2 状态（null = 当前内核 < 3.9.0，无 V2 API） */
    private flashcardV2: MigrationStatus | null = null;
    private topBarElement: HTMLElement | null = null;
    private badgeTimer: ReturnType<typeof setInterval> | null = null;
    private settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private suspendToday: SuspendTodayData = { date: "", cardIDs: [] };
    private examPlans: ExamPlansData = { version: 1, plans: [] };
    private aiBatches: AIBatchesData = { version: 1, batches: [] };
    /** AI 批次作业（ADR-7 第 2 步）：断点续传的状态载体 */
    private aiJobs: AIJobsData = emptyAIJobs();
    /** 统一持久化队列（AQ-4）：同 key 串行 + 有限重试 + 失败可观测 */
    private persist: PersistQueue = createPersist(
        (key, data) => this.saveData(key, data),
        {
            attempts: 2,
            retryDelayMs: 500,
            onOk: key => this.trackSave(key),
            onFail: (key, error) => {
                lvLog("error", `persist ${key} failed: ${error.message}`);
                this.notifyPersistFail();
            },
        },
    );
    private lastPersistToast = 0;
    /** 写入最终失败的用户提示（限流 30s 一次，避免刷屏） */
    private notifyPersistFail() {
        const now = Date.now();
        if (now - this.lastPersistToast < 30000) {
            return;
        }
        this.lastPersistToast = now;
        try {
            showMessage(this.i18n.storageWriteFail, 4000, "error");
        } catch { /* i18n 未就绪时仅留日志 */ }
    }
    private saveSettingsSoon() {
        if (this.settingsSaveTimer) clearTimeout(this.settingsSaveTimer);
        this.settingsSaveTimer = setTimeout(() => {
            this.settingsSaveTimer = null;
            this.saveSettingsNow();
        }, 1200);
    }

    private saveSettingsNow() {
        // 角标心跳间隔可能随设置变化（440）：即时重建定时器
        this.setupBadgeTimer();
        const done = this.persist.save(SETTINGS_DATA, this.settings);
        // AT-10：设置变更广播——复习面板据此重启超时计时（立即生效），其余项下一卡自然生效
        done.then(() => {
            try {
                (this.eventBus as any).emit("lv-cards:settings-changed", { plugin: "lv-cards", v: 1 });
            } catch { /* 事件旁路 */ }
        }).catch(() => { /* onFail 已记录 */ });
        return done;
    }

    /** Onboarding 完成标记（M12·FR?） */
    private markOnboarded() {
        this.settings.onboarded = true;
        this.saveSettingsNow();
    }
    private sessionState: SessionState = { date: "", reviewedIDs: [], skippedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
    /** 最近一次到期数（角标点击行为统一用：>0 开复习，否则开中心） */
    private lastDue = 0;

    async onload() {
        this.addIcons(`<symbol id="iconLvCards" viewBox="0 0 32 32">
<path d="M6 10h16v16H6z" fill="none" stroke="currentColor" stroke-width="2"></path>
<path d="M10 6h16v16" fill="none" stroke="currentColor" stroke-width="2"></path>
<path d="M11 16h6M11 20h10" stroke="currentColor" stroke-width="2"></path>
</symbol>`);

        // AQ-1：批量加载以 keys 数组驱动并按位置配对，杜绝「6 项加载只解构 5 项」的错位回归
        const STORE_KEYS = [SETTINGS_DATA, REVLOG_DATA, SUSPEND_TODAY_DATA, EXAM_PLANS_DATA, AI_BATCHES_DATA, SESSION_STATE_DATA, AI_JOBS_DATA] as const;
        const loaded = zipLoaded(STORE_KEYS, await Promise.all(STORE_KEYS.map(key => this.loadData(key))));
        this.settings = normalizeSettings(loaded[SETTINGS_DATA]);
        this.revlog = normalizeRevlog(loaded[REVLOG_DATA]); // AQ-3：清洗非法条目并由明细重建 days
        this.suspendToday = normalizeSuspendToday(loaded[SUSPEND_TODAY_DATA]);
        this.examPlans = normalizeExamPlans(loaded[EXAM_PLANS_DATA]);
        this.sessionState = normalizeSessionState(loaded[SESSION_STATE_DATA], localDate(Date.now()));
        // AI 批次走 TypedStore 入口（322）：结构清洗 + 兜底，非法条目剔除（526）；复用批量加载结果不再二次读盘
        this.aiBatches = await loadStore(this, {
            key: AI_BATCHES_DATA,
            fallback: emptyAIBatches,
            normalize: normalizeAIBatches,
        }, loaded[AI_BATCHES_DATA]);
        // ADR-7 第 2 步：AI 批次作业存储接入（同一批量加载批次，normalize 兜底）
        this.aiJobs = await loadStore(this, {
            key: AI_JOBS_DATA,
            fallback: emptyAIJobs,
            normalize: normalizeAIJobs,
        }, loaded[AI_JOBS_DATA]);
        if (rollDateIfNeeded(this.suspendToday)) {
            await this.persist.save(SUSPEND_TODAY_DATA, this.suspendToday);
        }

        // 探测内核闪卡 V2（feature/flashcard 分支 / 3.9.0）：决定走 V2 还是 riff 兼容路径
        this.flashcardV2 = await detectFlashcardV2();
        // Gateway 探测结果落库（320）：设置页与诊断可直接读，无需重探
        if (this.flashcardV2 && this.settings.gatewayState !== this.flashcardV2.state) {
            this.settings.gatewayState = this.flashcardV2.state;
            this.saveSettingsSoon();
        }

        // 原生复习界面的评分事件 → 本地 revlog（宽容解析，事件结构变化不致崩）
        this.eventBus.on("click-flashcard-action", this.onNativeCardAction);
        // 块图标菜单 → 制卡入口（M2·FR1）
        this.eventBus.on("click-blockicon", this.onBlockIcon);

        const plugin = this;
        this.addTab({
            type: TAB_DASHBOARD,
            init() {
                const div = document.createElement("div");
                div.style.height = "100%";
                const app = mount(Hub, {
                    target: div,
                    props: {
                        i18n: plugin.i18n,
                        initialTab: (this.data?.tab as string) ?? plugin.settings.lastHubTab,
                        onTabChange: (id: string) => {
                            plugin.settings.lastHubTab = id;
                            plugin.saveSettingsSoon();
                        },
                        dashboardBase: {
                            i18n: plugin.i18n,
                            app: plugin.app,
                            getRevlog: () => plugin.revlog,
                            getV2Status: () => plugin.flashcardV2,
                            getDailyTargets: () => ({
                                new: plugin.settings.dailyNewTarget,
                                review: plugin.settings.dailyReviewTarget,
                            }),
                            openReview: () => plugin.openTabOf(TAB_REVIEW),
                            openOnboarding: () => plugin.openOnboarding(),
                            getAIBatches: () => plugin.aiBatches.batches,
                            getLeechCards: () => {
                                const items = leechCards(plugin.revlog, plugin.settings.leechThreshold);
                                return items.map(i => ({ blockID: i.blockID, lapses: i.lapses }));
                            },
                            rewriteWithAI: (blockID: string) => plugin.openAIWizard(blockID),
                            writeReportDoc: (md: string) => plugin.writeReportDoc(md),
                            getExamCountdown: () => {
                                const plan = plugin.examPlans.plans.find(p => p.enabled && p.examDate && !p.archived);
                                const left = plan ? daysLeft(plan.examDate) : null;
                                return plan && left !== null && left >= 0 ? { name: plan.name, days: left } : null;
                            },
                            getXpEnabled: () => plugin.settings.xpEnabled,
                            onSessionFinished: (cb: () => void) => {
                                const handler = () => cb();
                                (plugin.eventBus as any).on("lv-cards:session-finished", handler);
                                return () => (plugin.eventBus as any).off("lv-cards:session-finished", handler);
                            },
                            // AT-11：原生/插件两路评分都经 appendRevlog 广播 reviewed，总览据此失效缓存
                            onReviewed: (cb: () => void) => {
                                const handler = () => cb();
                                (plugin.eventBus as any).on("lv-cards:reviewed", handler);
                                return () => (plugin.eventBus as any).off("lv-cards:reviewed", handler);
                            },
                            // AQ-12 文档维度：块归属查内核（分块 IN），聚合后按 seen 降序；失败返回 null 由 UI 隐藏
                            getDocCoverage: async () => {
                                try {
                                    const blockIDs = [...new Set(plugin.revlog.entries.filter(e => e.rating > 0 && e.blockID).map(e => e.blockID))];
                                    if (blockIDs.length === 0) {
                                        return { docs: [], unattributed: 0 };
                                    }
                                    const docMap = await getBlockDocMap(blockIDs);
                                    const agg = docCoverage(plugin.revlog, blockID => docMap.get(blockID)?.rootID ?? null);
                                    const titles = await getDocTitles(agg.docs.map(d => d.docID));
                                    const docs = agg.docs
                                        .map(d => ({ docID: d.docID, title: titles.get(d.docID) || "", seen: d.seen }))
                                        .sort((a, b) => b.seen - a.seen);
                                    return { docs, unattributed: agg.unattributed };
                                } catch {
                                    return null;
                                }
                            },
                            getHeatmapWeeks: () => plugin.settings.heatmapWeeks,
                        },
                        managerCtx: {
                            i18n: plugin.i18n,
                            app: plugin.app,
                            savedFilters: () => plugin.settings.savedFilters,
                            saveFilter: (name: string, filter: string) => {
                                plugin.settings.savedFilters = [
                                    ...plugin.settings.savedFilters.filter(f => f.name !== name),
                                    { name, filter },
                                ];
                                plugin.persist.save(SETTINGS_DATA, plugin.settings).catch(() => { /* onFail 已记录 */ });
                            },
                            deleteFilter: (name: string) => {
                                plugin.settings.savedFilters = plugin.settings.savedFilters.filter(f => f.name !== name);
                                plugin.persist.save(SETTINGS_DATA, plugin.settings).catch(() => { /* onFail 已记录 */ });
                            },
                            getLeechCards: () => {
                                const items = leechCards(plugin.revlog, plugin.settings.leechThreshold);
                                return items.map(i => ({ blockID: i.blockID, lapses: i.lapses }));
                            },
                            // 状态过滤（M6·FR2）：新卡=本地 revlog 无记录；到期=内核到期清单交集
                            isNewBlock: (blockID: string) => !plugin.revlog.entries.some(e => e.blockID === blockID),
                            // 遗忘次数映射（272）：管理器 lapses 排序用
                            getLapsesMap: () => {
                                const map: Record<string, number> = {};
                                for (const e of plugin.revlog.entries) {
                                    if (e.rating === 1 && e.blockID) {
                                        map[e.blockID] = (map[e.blockID] ?? 0) + 1;
                                    }
                                }
                                return map;
                            },
                            getDueBlockIDs: async () => {
                                try {
                                    const due = await getRiffDueCards("");
                                    return (due.cards ?? []).map(c => c.blockID).filter(Boolean);
                                } catch {
                                    return [];
                                }
                            },
                        },
                        exam: plugin.settings.modules.exam ? {
                            plans: plugin.examPlans,
                            onSavePlan: (plan: ExamPlan) => plugin.saveExamPlan(plan),
                            onDeletePlan: (id: string) => plugin.deleteExamPlan(id),
                            onReport: (plan: ExamPlan) => plugin.generateExamReport(plan),
                            onWriteReport: (plan: ExamPlan) => plugin.writeExamReportDoc(plan),
                            onReviewScope: (kind: "all" | "deck" | "notebook", scopeId: string, cram: boolean) =>
                                plugin.openReviewScope(kind, scopeId, cram),
                            // AQ-8：动态建议只读输入（本地日志 + 每日上限）
                            getRevlog: () => plugin.revlog,
                            getDailyCap: () => plugin.settings.dailyReviewTarget,
                        } : null,
                    },
                });
                this.element.appendChild(div);
                this.destroy = () => unmount(app); // AJ7：Tab 销毁时卸载实例
            },
        });

        this.addTab({
            type: TAB_REVIEW,
            init() {
                const div = document.createElement("div");
                div.style.height = "100%";
                this.element.appendChild(div);
                // 懒加载 chunk 后异步挂载（v0.65 体积评审）；tab 已关则放弃挂载
                loadReview().then(Review => {
                    if (!div.isConnected) {
                        return;
                    }
                    const app = mount(Review, {
                        target: div,
                        props: {
                        initialScope: (this.data?.scope as string) ?? plugin.settings.lastReviewScope,
                        initialCram: this.data?.cram === true,
                        ctx: {
                        i18n: plugin.i18n,
                        app: plugin.app,
                        settings: () => ({
                            ratingStyle: plugin.settings.ratingStyle,
                            timeoutMode: plugin.settings.timeoutMode,
                            timeoutSeconds: plugin.settings.timeoutSeconds,
                            randomOrder: plugin.settings.randomOrder,
                            cardMaxWidth: plugin.settings.cardMaxWidth,
                            choiceEnabled: plugin.settings.choiceEnabled,
                            ttsEnabled: plugin.settings.ttsEnabled,
                            ttsRate: plugin.settings.ttsRate,
                            ttsVoice: plugin.settings.ttsVoice,
                            dictationEnabled: plugin.settings.dictationEnabled,
                            requeueAgain: plugin.settings.requeueAgain,
                            dailyReviewTarget: plugin.settings.dailyReviewTarget,
                            cardFontScale: plugin.settings.cardFontScale,
                            ratingDensity: plugin.settings.ratingDensity,
                            hideMetaUntilAnswer: plugin.settings.hideMetaUntilAnswer,
                            reverseOrder: plugin.settings.reverseOrder,
                            dailyTipEnabled: plugin.settings.dailyTipEnabled,
                            sfxEnabled: plugin.settings.sfxEnabled,
                            sfxStyle: plugin.settings.sfxStyle,
                            batchLimit: plugin.settings.batchLimit,
                            typingEnabled: plugin.settings.typingEnabled,
                            typingStrict: plugin.settings.typingStrict,
                            answerTimeCapSec: plugin.settings.answerTimeCapSec,
                        }),
                        appendRevlog: (e) => plugin.appendRevlog(e),
                        getRevlog: () => plugin.revlog,
                        isSuspendedToday: (cardID: string) => isSuspended(plugin.suspendToday, cardID),
                        suspendToday: (cardID: string) => {
                            suspend(plugin.suspendToday, cardID);
                            plugin.persist.save(SUSPEND_TODAY_DATA, plugin.suspendToday).catch(() => { /* onFail 已记录 */ });
                        },
                        openDashboard: () => plugin.openTabOf(TAB_DASHBOARD),
                        onScopePersist: (key: string) => {
                            plugin.settings.lastReviewScope = key;
                            plugin.persist.save(SETTINGS_DATA, plugin.settings).catch(() => { /* onFail 已记录 */ });
                        },
                        getSessionState: () => plugin.sessionState,
                        saveSessionState: (s: SessionState) => {
                            plugin.sessionState = s;
                            plugin.persist.save(SESSION_STATE_DATA, plugin.sessionState).catch(() => { /* onFail 已记录 */ });
                        },
                        clearSessionState: () => {
                            plugin.sessionState = { date: "", reviewedIDs: [], skippedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
                            plugin.persist.save(SESSION_STATE_DATA, plugin.sessionState).catch(() => { /* onFail 已记录 */ });
                        },
                        emitSessionFinished: (summary: { new: number; review: number; forget: number; skip: number }) => {
                            try {
                                (plugin.eventBus as any).emit("lv-cards:session-finished", { plugin: "lv-cards", v: 1, summary });
                            } catch { /* 事件旁路 */ }
                            // 会话结束即刷角标（549），不等 60s 心跳
                            plugin.refreshDueBadge();
                        },
                        // AT-10：设置保存广播 → 复习面板超时参数立即生效
                        onSettingsChanged: (cb: () => void) => {
                            const handler = () => cb();
                            (plugin.eventBus as any).on("lv-cards:settings-changed", handler);
                            return () => (plugin.eventBus as any).off("lv-cards:settings-changed", handler);
                        },
                        getContextBlocks: async (blockID: string) => {
                            const safe = blockID.replace(/'/g, "''");
                            const root = await sqlQuery(`SELECT root_id FROM blocks WHERE id='${safe}' LIMIT 1`);
                            if (!root.length) { return []; }
                            const rootId = String(root[0].root_id ?? "").replace(/'/g, "''");
                            // 同文档按 sort 顺序取前后各 2 块（排除自身与容器块）
                            const sibs = await sqlQuery(`SELECT id FROM blocks WHERE root_id='${rootId}' AND type IN ('p','t','h','c','ta','tb') ORDER BY sort, id`);
                            const idx = sibs.findIndex(b => String(b.id) === blockID);
                            if (idx < 0) { return []; }
                            const window = sibs.slice(Math.max(0, idx - 2), idx + 3).filter(b => String(b.id) !== blockID);
                            const out: { id: string; html: string }[] = [];
                            for (const b of window) {
                                try {
                                    // AQ-20：统一 getBlockDOM 封装（非 0 抛错），单块失败跳过
                                    const dom = await getBlockDOM(String(b.id));
                                    if (dom) {
                                        out.push({ id: String(b.id), html: dom });
                                    }
                                } catch { /* 单块失败跳过 */ }
                            }
                            return out;
                        },
                    } },
                    });
                    this.destroy = () => unmount(app);
                });
            },
        });

        // 管理器已并入闪卡中心（LvTabs「管理」子页），不再注册独立 Tab

        this.addCommand({
            langKey: "openDashboard",
            langText: this.i18n.cmdOpenDashboard,
            hotkey: "",
            callback: () => this.openTabOf(TAB_DASHBOARD),
        });
        this.addCommand({
            langKey: "startReview",
            langText: this.i18n.cmdStartReview,
            hotkey: "",
            callback: () => this.openTabOf(TAB_REVIEW),
        });
        this.addCommand({
            langKey: "quickCard",
            langText: this.i18n.cmdQuickCard,
            hotkey: "",
            callback: () => this.openQuickCard(),
        });
        this.addCommand({
            langKey: "openExam",
            langText: this.i18n.cmdOpenExam,
            hotkey: "",
            callback: () => this.openTabOf(TAB_DASHBOARD, { tab: "exam" }),
        });
        this.addCommand({
            langKey: "cramNew",
            langText: this.i18n.cmdCramNew,
            hotkey: "",
            callback: () => this.openTabOf(TAB_REVIEW, { scope: "new" }),
        });
        this.addCommand({
            langKey: "diagnostics",
            langText: this.i18n.cmdDiagnostics,
            hotkey: "",
            callback: () => this.copyDiagnostics(),
        });
        this.addCommand({
            langKey: "challenge",
            langText: this.i18n.cmdChallenge,
            hotkey: "",
            callback: async () => {
                const ChallengeMode = await loadChallengeMode();
                svelteDialog({
                    title: (this.i18n as any).challenge.title,
                    component: ChallengeMode,
                    width: "min(560px, 94vw)",
                    props: { i18n: this.i18n, onExit: () => { /* svelteDialog 自理销毁 */ } },
                });
            },
        });
        this.addCommand({
            langKey: "markerCards",
            langText: this.i18n.cmdMarkerCards,
            hotkey: "",
            callback: () => this.openMarkerCards(),
        });
        this.addCommand({
            langKey: "pairing",
            langText: this.i18n.cmdPairing,
            hotkey: "",
            callback: async () => {
                const PairingGame = await loadPairingGame();
                svelteDialog({
                    title: (this.i18n as any).pairing.title,
                    component: PairingGame,
                    width: "min(720px, 94vw)",
                    props: { i18n: this.i18n, onExit: () => { /* svelteDialog 自理销毁 */ } },
                });
            },
        });
        this.addCommand({
            langKey: "openHelp",
            langText: this.i18n.cmdOpenHelp,
            hotkey: "",
            callback: () => this.openHelpDoc(),
        });
        this.addCommand({
            langKey: "sampleWorkspace",
            langText: this.i18n.cmdSampleWorkspace,
            hotkey: "",
            callback: () => this.createSampleWorkspace(),
        });

        // 入口矩阵（docs/12 §1.1）：左键 = 有到期开复习、无到期开中心；右键 = 菜单
        this.topBarElement = this.addTopBar({
            icon: "iconLvCards",
            title: this.i18n.topbarTitle,
            position: "right",
            callback: () => {
                if (this.settings.modules.review && this.lastDue > 0) {
                    this.openTabOf(TAB_REVIEW);
                } else {
                    this.openTabOf(TAB_DASHBOARD);
                }
            },
        });
        this.topBarElement.style.position = "relative";
        this.topBarElement.addEventListener("contextmenu", (evt: MouseEvent) => {
            evt.preventDefault();
            this.showTopbarMenu(evt);
        });
        // 面包屑「复习本文档」按钮（M2·FR2，官方 API 3.8.2+；旧版静默跳过）
        if (typeof (this as any).addBreadcrumbButton === "function" && this.settings.modules.review) {
            (this as any).addBreadcrumbButton({
                id: "lv-cards-review-doc",
                icon: "iconLvCards",
                title: this.i18n.breadcrumbReview,
                callback: (_event: any, protyle: any) => {
                    const rootID: string = protyle?.block?.rootID ?? "";
                    if (rootID) {
                        this.openTabOf(TAB_REVIEW, { scope: `doc:${rootID}` });
                    }
                },
            });
        }
    }

    onLayoutReady() {
        this.refreshDueBadge();
        this.setupBadgeTimer();
        // Onboarding 首启自动弹出（M12：!onboarded 时延迟 2s 弹出，避免与布局渲染竞争）
        if (!this.settings.onboarded) {
            setTimeout(() => this.openOnboarding(), 2000);
        }
    }

    /** 角标心跳（440）：间隔可在设置调（30/60s 或关闭），保存设置后即时生效 */
    private setupBadgeTimer() {
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
            this.badgeTimer = null;
        }
        const sec = this.settings.badgeRefreshSec;
        if (!sec || sec < 5) {
            return; // 关闭心跳（0 或非法值）
        }
        this.badgeTimer = setInterval(() => {
            this.refreshDueBadge();
            this.checkDailyReminder();
            this.checkBacklogWarn();
            this.checkExamMilestones();
        }, sec * 1000);
    }

    /** 每日到期提醒：到设定时间且仍有到期卡时通知一次（X 组，基础版） */
    private reminderShownFor = "";
    private backlogWarnedFor = "";
    private examNotifiedFor = "";

    /** 免打扰时段（跨午夜支持）：quiet 时段内不弹积压/庆祝类提示 */
    private inQuietHours(): boolean {
        const toMin = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return Number.isFinite(h) ? h * 60 + (m || 0) : null;
        };
        const start = toMin(this.settings.quietStart);
        const end = toMin(this.settings.quietEnd);
        if (start === null || end === null || start === end) {
            return false;
        }
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
    }

    /** 积压预警（X 组）：连续 N 天未复习时提醒一次（N 固定 3，随提醒开关） */
    private checkBacklogWarn() {
        if (!this.settings.reminderEnabled || this.lastDue <= 0 || this.inQuietHours()) {
            return;
        }
        const today = localDate(Date.now());
        if (this.backlogWarnedFor === today) {
            return;
        }
        const last = this.revlog.entries[this.revlog.entries.length - 1];
        const lastTs = last?.ts ?? 0;
        const days = Math.floor((Date.now() - lastTs) / 86400000);
        if (days >= 3) {
            this.backlogWarnedFor = today;
            showMessage(this.i18n.backlogWarn.replace("${n}", String(days)), 4000, "info");
        }
    }
    /** 考试里程碑提醒（X·372/382）：30/7/1 天各提醒一次，同日同计划去重 */
    private checkExamMilestones() {
        if (!this.settings.examEnabled || !this.settings.reminderEnabled || this.inQuietHours()) {
            return;
        }
        const plan = this.examPlans.plans.find(p => p.enabled && p.examDate && !p.archived);
        if (!plan) {
            return;
        }
        const left = daysLeft(plan.examDate);
        if (left === null || ![30, 7, 1].includes(left)) {
            return;
        }
        const today = localDate(Date.now());
        const key = `${plan.id}:${left}:${today}`;
        if (this.examNotifiedFor === key) {
            return;
        }
        this.examNotifiedFor = key;
        try {
            const n = new Notification(this.i18n.examNotifTitle, {
                body: this.i18n.examNotifBody.replace("${name}", plan.name).replace("${n}", String(left)),
            });
            n.onclick = () => this.openTabOf(TAB_DASHBOARD);
        } catch { /* 通知不可用则静默跳过 */ }
    }

    private checkDailyReminder() {        if (!this.settings.reminderEnabled) {
            return;
        }
        const today = localDate(Date.now());
        if (this.reminderShownFor === today) {
            return;
        }
        const [h, m] = this.settings.reminderTime.split(":").map(Number);
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        if (!Number.isFinite(h) || nowMin < h * 60 + (m || 0)) {
            return;
        }
        getDueCount().then(count => {
            if (count <= 0) {
                this.reminderShownFor = today;
                return;
            }
            try {
                const n = new Notification(this.i18n.topbarTitle, {
                    body: this.i18n.badgeDue.replace("${n}", String(count)),
                });
                n.onclick = () => this.openTabOf(TAB_REVIEW);
            } catch { /* 通知不可用则静默跳过 */ }
            this.reminderShownFor = today;
        }).catch(() => { /* 旁路 */ });
    }

    onunload() {
        const unloadStart = Date.now();
        this.eventBus.off("click-flashcard-action", this.onNativeCardAction);
        this.eventBus.off("click-blockicon", this.onBlockIcon);
        // AT-2：防抖中的设置保存立即落盘，禁用/重载不丢最后一次改动
        if (this.settingsSaveTimer) {
            clearTimeout(this.settingsSaveTimer);
            this.settingsSaveTimer = null;
            this.saveSettingsNow();
        }
        this.flushRevlogSave();
        // AQ-4：卸载前尽力等在途写入落盘（Petal dispose 预算约 5s，上限 3s 不阻塞卸载）
        void this.persist.waitAll(3000).then(ok => {
            if (!ok) {
                lvLog("warn", "unload: pending writes did not settle in 3s");
            }
            lvLog("info", `unload cleanup done in ${Date.now() - unloadStart}ms`);
        });
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
            this.badgeTimer = null;
        }
    }

    private badgeSeq = 0;

    private refreshDueBadge() {
        if (!this.topBarElement || !this.settings.modules.review) {
            this.updateBadge(0);
            return;
        }
        // 请求序号（536）：慢响应不覆盖新数据
        const seq = ++this.badgeSeq;
        getDueCount().then(count => {
            if (seq !== this.badgeSeq) {
                return;
            }
            this.lastDue = count;
            // M7·FR5：活动考试计划存在时，角标优先显示考试倒计时天数
            const plan = this.examPlans.plans.find(p => p.enabled && p.examDate);
            const left = plan ? daysLeft(plan.examDate) : null;
            if (plan && left !== null && left >= 0) {
                this.updateExamBadge(left, plan);
            } else {
                this.updateBadge(count);
            }
        }).catch((e) => {
            lvLog("warn", "refreshDueBadge failed: " + (e instanceof Error ? e.message : e));
            /* 旁路，静默 */
        });
    }

    private milestonesSeen = new Set<string>();

    private updateExamBadge(left: number, plan: ExamPlan) {
        if (!this.topBarElement) {
            return;
        }
        let badge = this.topBarElement.querySelector<HTMLElement>(".lv-badge");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "lv-badge";
            this.topBarElement.appendChild(badge);
        }
        badge.textContent = left > 99 ? "99+" : String(left);
        badge.title = `${plan.name} · ${(this.i18n as any).exam.daysLeft.replace("${n}", String(left))}`;
        // 里程碑提醒（30/7/1 天，每天每档一次，内存态）
        for (const m of [30, 7, 1]) {
            if (left === m) {
                const key = `${plan.id}:${m}:${localDate(Date.now())}`;
                if (!this.milestonesSeen.has(key)) {
                    this.milestonesSeen.add(key);
                    showMessage(this.i18n.examMilestone.replace("${name}", plan.name).replace("${n}", String(m)), 4000, "info");
                }
            }
        }
    }

    private updateBadge(count: number) {
        if (!this.topBarElement) {
            return;
        }
        let badge = this.topBarElement.querySelector<HTMLElement>(".lv-badge");
        if (!count || count <= 0) {
            badge?.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "lv-badge";
            this.topBarElement.appendChild(badge);
        }
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.title = this.i18n.badgeDue.replace("${n}", String(count));
        // 颜色语义（313）：今日目标达成→绿；默认主色
        const today = this.revlog.days[localDate(Date.now())];
        const doneToday = today?.review ?? 0;
        badge.classList.toggle("lv-badge--done", this.settings.dailyReviewTarget > 0 && doneToday >= this.settings.dailyReviewTarget);
    }

    /** 块图标菜单：制卡入口（M2·FR1）。菜单构建必须同步，耗时操作放 click 回调 */
    private onBlockIcon = ({ detail }: any) => {
        try {
            const els: HTMLElement[] = detail?.blockElements ?? [];
            const blockIDs: string[] = els
                .map((el: HTMLElement) => el.getAttribute("data-node-id") || el.dataset?.nodeId || "")
                .filter(Boolean);
            if (blockIDs.length === 0 || !detail?.menu) {
                return;
            }
            detail.menu.addItem({
                icon: "iconLvCards",
                label: this.i18n.menuAddToDeck + (blockIDs.length > 1 ? ` ×${blockIDs.length}` : ""),
                click: () => this.openDeckPicker(blockIDs),
            });
            if (blockIDs.length === 1) {
                // 挖空可视化（M2）：捕获编辑器当前选区（菜单弹出会抢焦点，须在构建期捕获）
                const clozeRange = document.getSelection()?.rangeCount
                    ? document.getSelection()!.getRangeAt(0).cloneRange()
                    : null;
                const clozeText = clozeRange?.toString().trim() ?? "";
                detail.menu.addItem({
                    icon: "iconLvCards",
                    label: this.i18n.menuMakeCloze,
                    click: () => this.makeClozeCard(blockIDs[0], clozeRange, clozeText),
                });
                detail.menu.addItem({
                    icon: "iconLvCards",
                    label: this.i18n.menuMakeOcclusion,
                    click: () => this.openDeckPicker([blockIDs[0]], {
                        skipAdd: true,
                        onPicked: (deckID: string) => this.openOcclusionEditor(blockIDs[0], deckID),
                    }),
                });
            }
            detail.menu.addItem({
                icon: "iconLvCards",
                label: this.i18n.menuRemoveFromDeck,
                click: () => this.removeCardsFromDeck(blockIDs),
            });
        } catch {
            // 菜单旁路，绝不影响编辑器
        }
    };

    private async openDeckPicker(blockIDs: string[], opts: { skipAdd?: boolean; onPicked?: (deckID: string) => void } = {}) {
        const DeckPicker = await loadDeckPicker();
        svelteDialog({
            title: this.i18n.deckPickerTitle,
            component: DeckPicker,
            width: "min(420px, 92vw)",
            props: {
                newNamePlaceholder: this.i18n.deckNewName,
                confirmLabel: this.i18n.deckConfirm,
                onConfirm: async (deckID: string) => {
                    if (!opts.skipAdd) {
                        // 重复提示（M2）：目标块已在复习集时 warning，用户可选仍要添加
                        try {
                            const { blocks } = await getRiffCardsByBlockIDs(blockIDs);
                            const dupes = (blocks ?? []).filter(b => !!b.id).length;
                            if (dupes > 0) {
                                const ok = await confirmDialogBool({
                                    title: this.i18n.dupTitle,
                                    content: `<div class="b3-typography">${this.i18n.dupConfirm.replace("${n}", String(dupes))}</div>`,
                                });
                                if (!ok) {
                                    return;
                                }
                            }
                        } catch { /* 查询失败不阻塞制卡 */ }
                        await addRiffCards(deckID, blockIDs);
                        showMessage(this.i18n.deckAdded.replace("${n}", String(blockIDs.length)), 2000, "info");
                    }
                    opts.onPicked?.(deckID);
                },
                onClose: () => { /* svelteDialog 自理销毁 */ },
            },
        });
    }

    /** 挖空并制卡（M2·FR5）：选中文本一键包 ==...== 后走常规入组流程 */
    private makeClozeCard(blockID: string, range: Range | null, text: string) {
        if (!range || !text) {
            showMessage(this.i18n.clozeNeedSelection, 2500, "error");
            return;
        }
        const sel = document.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        let ok = false;
        try {
            ok = document.execCommand("insertText", false, `==${text}==`);
        } catch {
            ok = false;
        }
        if (!ok) {
            showMessage(this.i18n.clozeFail, 2500, "error");
            return;
        }
        this.openDeckPicker([blockID]);
    }

    /** 图片遮挡编辑器（M4·FR4 riff 先行）：保存块属性后入卡组 */
    private async openOcclusionEditor(blockID: string, deckID: string) {
        const OcclusionEditor = await loadOcclusionEditor();
        svelteDialog({
            title: (this.i18n as any).occlusion.title,
            component: OcclusionEditor,
            width: "min(760px, 94vw)",
            props: {
                i18n: this.i18n,
                blockID,
                onSave: async () => {
                    await addRiffCards(deckID, [blockID]);
                    showMessage((this.i18n as any).occlusion.occlusionSaved, 2000, "info");
                },
                onClose: () => { /* svelteDialog 自理销毁 */ },
            },
        });
    }

    private async removeCardsFromDeck(blockIDs: string[]) {
        try {
            const { blocks } = await getRiffCardsByBlockIDs(blockIDs);
            const ids = (blocks ?? []).map(b => b.id).filter(Boolean);
            if (ids.length === 0) {
                showMessage(this.i18n.deckNotCard, 2000, "info");
                return;
            }
            // 🧪 deckID 传空的跨集删除语义待 docs/18 实测确认
            await removeRiffCards("", ids);
            showMessage(this.i18n.deckRemoved.replace("${n}", String(ids.length)), 2000, "info");
        } catch (e: any) {
            showMessage(e?.message ?? String(e), 3000, "error");
        }
    }

    /** 自诊断（AD）：脱敏环境信息复制到剪贴板，供 issue 附带 */
    private async copyDiagnostics() {
        let kv = "?";
        try {
            kv = await kernelVersion();
        } catch { /* 旁路 */ }
        const text = [
            "Lv Cards diagnostics",
            "plugin version: " + ((this as any).manifest?.version ?? "unknown"),
            "siyuan/kernel: " + kv,
            "V2 state: " + (this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)"),
            "modules on: " + Object.entries(this.settings.modules).filter(([, v]) => v).map(([k]) => k).join(", "),
            "revlog entries: " + this.revlog.entries.length,
            "streak: " + calcStreak(this.revlog),
            "due today (badge): " + this.lastDue,
            "plans: " + this.examPlans.plans.length,
            "",
            "--- persist (AQ-4) ---",
            ...this.persist.stats().map(s =>
                `${s.key}: ok=${s.ok} fail=${s.fail}${s.lastOkTs ? ` lastOk=${new Date(s.lastOkTs).toISOString()}` : ""}${s.lastError ? ` lastError=${s.lastError}` : ""}`),
            ...(this.persist.hasFailures() ? [] : ["all writes ok"]),
            "",
            "--- recent log (324) ---",
            lvLogDump() || "(empty)",
        ].join("\n");
        navigator.clipboard.writeText(text).then(
            () => showMessage(this.i18n.diagCopied, 2000, "info"),
            () => showMessage(this.i18n.diagFail, 3000, "error"),
        );
    }

    /** AnkiConnect 客户端连接测试（M9·FR1） */
    private async testAnkiClient(): Promise<string> {
        try {
            const resp = await fetch(this.settings.ankiClientUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "version",
                    version: 6,
                    ...(this.settings.ankiClientKey ? { key: this.settings.ankiClientKey } : {}),
                }),
            });
            const j: any = await resp.json();
            if (j?.error) {
                return `${this.i18n.ankiTestFail}: ${j.error}`;
            }
            return `${this.i18n.ankiTestOk} (v${j?.result ?? "?"})`;
        } catch (e: any) {
            return `${this.i18n.ankiTestFail}: ${e?.message ?? e}`;
        }
    }

    private storageLastWrite: Record<string, number> = {};

    private trackSave(file: string) {
        this.storageLastWrite[file] = Date.now();
    }

    private storageStats() {
        const rows: { file: string; size: string; lastWrite: number }[] = [];
        const push = (file: string, desc: string) => rows.push({
            file,
            size: desc,
            lastWrite: this.storageLastWrite[file] ?? 0,
        });
        push("settings.json", `v${this.settings.version}`);
        push("revlog.json", `${this.revlog.entries.length} entries`);
        push("suspend-today.json", `${this.suspendToday.cardIDs.length} cards`);
        push("exam-plans.json", `${this.examPlans.plans.length} plans`);
        push("ai-batches.json", `${this.aiBatches.batches.length} batches`);
        return rows;
    }

    /** 考后复盘报告（M7·FR6）：计划窗口内的复习统计 Markdown，复制到剪贴板 */
    /** 复盘报告写入复盘文档（M7·FR6 深化）：除剪贴板外可一键写入「小驴闪卡/考试复盘」文档 */
    private async writeExamReportDoc(plan: ExamPlan): Promise<void> {
        const nb = await this.targetNotebook();
        if (!nb) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        const md = await this.buildExamReportMd(plan);
        const docID = await createDocWithMd(nb.id, `小驴闪卡/考试复盘/${plan.name}`, md);
        if (!docID) {
            throw new Error(this.i18n.quickCardFail);
        }
        showMessage(this.i18n.examReportWritten, 2000, "info");
    }

    /** 笔记本归属集合（AR-11）：按 revlog 中出现的 blockID 分批查内核，落在该笔记本的才算命中范围 */
    private async notebookBlockIDs(nbId: string, blockIDs: string[]): Promise<Set<string>> {
        const safe = nbId.replace(/'/g, "''");
        const out = new Set<string>();
        for (let i = 0; i < blockIDs.length; i += 400) {
            const chunk = blockIDs.slice(i, i + 400).map(id => `'${id.replace(/'/g, "''")}'`).join(",");
            const rows = await sqlQuery(`SELECT id FROM blocks WHERE box='${safe}' AND id IN (${chunk})`);
            for (const r of rows) {
                out.add(String(r.id));
            }
        }
        return out;
    }

    private async buildExamReportMd(plan: ExamPlan): Promise<string> {
        // AR-11：时间窗固定为「计划创建以来」，范围按计划过滤；无法归属的记录单独列示
        let inScope: ((e: { deckID?: string; blockID?: string }) => boolean) | undefined;
        if (plan.scopeKind === "deck") {
            inScope = e => e.deckID === plan.scopeId;
        } else if (plan.scopeKind === "notebook" && plan.scopeId) {
            const window = this.revlog.entries.filter(e => e.rating > 0);
            const ids = await this.notebookBlockIDs(plan.scopeId, [...new Set(window.map(e => e.blockID).filter(Boolean))]);
            inScope = e => ids.has(e.blockID ?? "");
        }
        const s = examReportStats(plan, this.revlog.entries, { inScope });
        const left = daysLeft(plan.examDate);
        const scopeLine = plan.scopeName || plan.scopeKind;
        const lines = [
            `# 考试复盘：${plan.name}`,
            `- 考试日期：${plan.examDate}（${left !== null && left < 0 ? "已结束" : `剩 ${left} 天`}）`,
            `- 范围：${scopeLine}`,
            `- 统计窗口：${new Date(s.windowFrom).toLocaleDateString()} 起（计划创建以来）`,
            `- 窗口内复习：${s.reviews} 次 / 遗忘：${s.forgets} 次 / 保持率：${s.reviews ? Math.round((1 - s.forgets / s.reviews) * 100) : "—"}%`,
            `- 活跃天数：${s.activeDays}`,
            `- 计划 cram 设置：考前 ${plan.cramDays} 天`,
        ];
        if (!s.hasData) {
            lines.push(`- ⚠️ 窗口内没有可核算的本地复习记录（本地日志起点晚于窗口或尚未复习），不将缺失计为 0`);
        }
        if (s.unattributed > 0) {
            lines.push(`- ⚠️ 另有 ${s.unattributed} 条窗口内记录缺卡组信息（原生复习界面），未计入上方统计`);
        }
        if (plan.scopeKind === "notebook") {
            lines.push(`- 口径：笔记本范围按来源块归属计算；已删除/移动的来源块无法归属，不计入`);
        }
        lines.push("", `> 由小驴闪卡生成 · ${new Date().toLocaleString()}`);
        return lines.join("\n");
    }

    private async generateExamReport(plan: ExamPlan) {
        const md = await this.buildExamReportMd(plan);
        await navigator.clipboard.writeText(md);
        showMessage(this.i18n.examReportCopied, 2500, "info");
    }

    /** 落盘笔记本（605）：设置指定优先，否则第一个打开的笔记本 */
    private async targetNotebook(): Promise<{ id: string; name: string } | null> {
        const notebooks = await getNotebooks();
        if (notebooks.length === 0) {
            return null;
        }
        return notebooks.find(n => n.id === this.settings.targetNotebookId) ?? notebooks[0];
    }

    /** 内置帮助文档（485）：同路径复用「小驴闪卡/使用帮助」文档，内容随插件更新；
     * 帮助文案经动态 import 走独立 chunk（不占主包体积预算） */
    private async openHelpDoc() {
        const nb = await this.targetNotebook();
        if (!nb) {
            showMessage(this.i18n.onboardingNoNotebook, 2500, "error");
            return;
        }
        const { helpMarkdown } = await import("./help");
        const lang = (window.siyuan as any)?.languages?.lang ?? "zh_CN";
        const docID = await createDocWithMd(nb.id, "小驴闪卡/使用帮助", helpMarkdown(lang));
        if (!docID) {
            showMessage(this.i18n.quickCardFail, 2500, "error");
            return;
        }
        openTab({ app: this.app, doc: { id: docID } });
    }

    /** 示例工作区（476）：创建 5 张不同形态的示例卡（普通/公式/挖空/列表/问答）并入「示例卡组」 */
    private async createSampleWorkspace() {
        try {
            const nb = await this.targetNotebook();
            if (!nb) {
                showMessage(this.i18n.onboardingNoNotebook, 2500, "error");
                return;
            }
            const decks = await getRiffDecks();
            let deck = decks.find(d => d.name === "示例卡组");
            if (!deck) {
                const created = await createRiffDeck("示例卡组");
                const newId = (created as any)?.id ?? (created as any);
                deck = { id: String(newId), name: "示例卡组", size: 0, updated: "" } as any;
            }
            const docID = await createDocWithMd(nb.id, "小驴闪卡/示例卡片", "");
            if (!docID) {
                throw new Error(this.i18n.quickCardFail);
            }
            const samples = (await import("./help")).sampleCards();
            const ids: string[] = [];
            for (const md of samples) {
                const r = await appendBlock("markdown", md, docID);
                if (r?.length) {
                    ids.push(r[0]);
                }
            }
            if (ids.length > 0) {
                await addRiffCards(deck.id, ids);
            }
            showMessage(this.i18n.sampleDone.replace("${n}", String(ids.length)), 3000, "info");
            openTab({ app: this.app, doc: { id: docID } });
        } catch (e: any) {
            showMessage(e?.message ?? String(e), 3000, "error");
        }
    }

    private async openQuickCard() {
        const QuickCard = await loadQuickCard();
        svelteDialog({
            title: this.i18n.quickCardTitle,
            component: QuickCard,
            width: "min(520px, 94vw)",
            props: {
                i18n: this.i18n,
                onCreate: async (markdown: string, deckID: string) => {
                    const nb = await this.targetNotebook();
                    if (!nb) {
                        throw new Error(this.i18n.onboardingNoNotebook);
                    }
                    // 同路径重复创建复用既有文档（内核语义），返回其文档 ID
                    const docID = await createDocWithMd(nb.id, "小驴闪卡/快速制卡", "");
                    if (!docID) {
                        throw new Error(this.i18n.quickCardFail);
                    }
                    const ids = await appendBlock("markdown", markdown, docID);
                    if (ids.length === 0) {
                        throw new Error(this.i18n.quickCardFail);
                    }
                    await addRiffCards(deckID, ids.slice(0, 1));
                    showMessage(this.i18n.quickCardDone, 2000, "info");
                },
                onClose: () => { /* svelteDialog 自理销毁 */ },
            },
        });
    }

    /** 当前打开的文档（M2·FR6 输入源扩展，🧪 getAllEditor 行为真机验证） */
    private async loadCurrentDoc(): Promise<{ name: string; content: string } | null> {
        // name 字段由 hPath 提供
        const editors: any[] = (getAllEditor() as any) ?? [];
        if (editors.length === 0) {
            return null;
        }
        const active =
            editors.find(e => e?.headElement?.classList?.contains("item--focus")) ??
            editors[editors.length - 1];
        const rootID: string = active?.protyle?.block?.rootID ?? "";
        if (!rootID) {
            return null;
        }
        const md = await exportMdContent(rootID);
        return { name: md.hPath, content: md.content };
    }

    /** 标记符制卡（M2·FR4）：活动文档 → 选卡组 → 扫描 `术语:: 定义` 与「？」结尾块 → 勾选入组 */
    private openMarkerCards() {
        if (!this.settings.markerEnabled) {
            showMessage(this.i18n.markerDisabled, 2500, "info");
            return;
        }
        const editors: any[] = (getAllEditor() as any) ?? [];
        const active =
            editors.find(e => e?.headElement?.classList?.contains("item--focus")) ??
            editors[editors.length - 1];
        const rootID: string = active?.protyle?.block?.rootID ?? "";
        if (!rootID) {
            showMessage(this.i18n.markerNoDoc, 2500, "error");
            return;
        }
        this.openDeckPicker([], {
            skipAdd: true,
            onPicked: (deckID: string) => this.scanMarkerCards(rootID, deckID),
        });
    }

    private async scanMarkerCards(rootID: string, deckID: string) {
        const safe = rootID.replace(/'/g, "''");
        const rows = await sqlQuery(`SELECT id, markdown FROM blocks WHERE root_id='${safe}' AND type IN ('p','h') ORDER BY sort, id`);
        type MarkerItem = { blockID: string; kind: "qa" | "whole"; front: string; back: string };
        const items: MarkerItem[] = [];
        const wholeIds: string[] = [];
        for (const r of rows) {
            const md = String(r.markdown ?? "").trim();
            if (!md) {
                continue;
            }
            // AQ-11：Obsidian SR 语法识别——单行 `::`/`:::`（双向语法按正向制卡，边界见模块注释）
            if (!md.includes("\n")) {
                const sr = parseSrLine(md);
                if (sr) {
                    // deck tag 提示不进入卡面（卡组由选卡组弹窗决定）
                    const front = stripSrMarkers(sr.front.replace(/#flashcards\S*/g, ""));
                    const back = stripSrMarkers(sr.back.replace(/#flashcards\S*/g, ""));
                    if (front && back) {
                        items.push({ blockID: String(r.id), kind: "qa", front, back });
                        continue;
                    }
                }
            } else {
                // 多行 `?` / `??` 问答块：拆问/答后按问答对落块制卡
                const multi = parseSrMultiline(md.split(/\r?\n/));
                if (multi) {
                    const front = stripSrMarkers(multi.front.replace(/#flashcards\S*/g, ""));
                    const back = stripSrMarkers(multi.back.replace(/#flashcards\S*/g, ""));
                    if (front && back) {
                        items.push({ blockID: String(r.id), kind: "qa", front, back });
                        continue;
                    }
                }
            }
            // 以「？」结尾的块：整块直接入组
            if (md.endsWith("？")) {
                items.push({ blockID: String(r.id), kind: "whole", front: md.replace(/[*`#]/g, ""), back: "" });
                wholeIds.push(String(r.id));
            }
        }
        if (items.length === 0) {
            showMessage(this.i18n.markerNone, 2500, "info");
            return;
        }
        const MarkerCards = await loadMarkerCards();
        svelteDialog({
            title: this.i18n.markerTitle,
            component: MarkerCards,
            width: "min(640px, 94vw)",
            props: {
                i18n: this.i18n,
                items,
                onCreate: async (picked: MarkerItem[]) => {
                    const nb = await this.targetNotebook();
                    if (!nb) {
                        throw new Error(this.i18n.onboardingNoNotebook);
                    }
                    // 问答块统一落在「小驴闪卡/标记制卡/<日期>」文档（同路径复用既有文档）
                    const today = localDate(Date.now());
                    const docID = await createDocWithMd(nb.id, `小驴闪卡/标记制卡/${today}`, "");
                    if (!docID) {
                        throw new Error(this.i18n.quickCardFail);
                    }
                    const qaIds: string[] = [];
                    for (const it of picked.filter(p => p.kind === "qa")) {
                        // 单块问答：软换行分隔问/答（与快速制卡同构）
                        const ids = await appendBlock("markdown", `${it.front}\n${it.back}`, docID);
                        if (ids?.length) {
                            qaIds.push(ids[0]);
                        }
                    }
                    const wholePicked = picked.filter(p => p.kind === "whole").map(p => p.blockID);
                    const all = [...qaIds, ...wholePicked];
                    if (all.length > 0) {
                        await addRiffCards(deckID, all);
                    }
                    showMessage(this.i18n.markerCreated.replace("${n}", String(all.length)), 2500, "info");
                },
                onClose: () => { /* svelteDialog 自理销毁 */ },
            },
        });
    }

    /** 笔记本范围材料（M2·FR6 扩展，AI 向导用）：聚合最近 200 个文本块 */
    private async loadNotebookMaterial(nbId: string): Promise<string> {
        const safe = nbId.replace(/'/g, "''");
        const rows = await sqlQuery(
            "SELECT markdown FROM blocks WHERE root_id IN (SELECT id FROM blocks WHERE box='" + safe + "' AND type IN ('p','h','c','t')) AND markdown != '' ORDER BY created DESC LIMIT 200"
        );
        return rows.map(r => String(r.markdown ?? "")).filter(Boolean).join("\n\n");
    }

    private async openOnboarding() {
        const Onboarding = await loadOnboarding();
        svelteDialog({
            title: this.i18n.onboardingTitle,
            component: Onboarding,
            width: "min(560px, 94vw)",
            props: {
                i18n: this.i18n,
                applyPersona: (id: "exam" | "notes" | "language") => {
                    const preset = PERSONA_PRESETS.find(p => p.id === id);
                    if (!preset) {
                        return;
                    }
                    this.settings = {
                        ...this.settings,
                        modules: { ...this.settings.modules, ...preset.modules },
                        ...preset.params,
                        persona: id,
                    };
                    this.persist.save(SETTINGS_DATA, this.settings).catch(() => { /* onFail 已记录 */ });
                },
                createSampleCards: (nbId: string) => this.createSampleCards(nbId),
                openReview: () => this.openTabOf(TAB_REVIEW),
                onClose: () => this.markOnboarded(),
            },
        });
    }

    private sampleBusy = false;
    private async createSampleCards(nbId: string) {
        if (this.sampleBusy) {
            return;
        }
        this.sampleBusy = true;
        try {
            const deck = await createRiffDeck(this.i18n.onboardingDeckName);
            const docID = await createDocWithMd(nbId, "小驴闪卡/示例卡", "");
            if (!docID) {
                throw new Error(this.i18n.quickCardFail);
            }
            const ids1 = await appendBlock("markdown", this.i18n.onboardingSample1, docID);
            const ids2 = await appendBlock("markdown", this.i18n.onboardingSample2, docID);
            const ids = [...ids1, ...ids2].slice(0, 2);
            if (ids.length === 0) {
                throw new Error(this.i18n.quickCardFail);
            }
            await addRiffCards(deck.id, ids);
        } finally {
            this.sampleBusy = false;
        }
    }

    private saveExamPlan(plan: ExamPlan): ExamPlansData {
        const i = this.examPlans.plans.findIndex(x => x.id === plan.id);
        if (i >= 0) {
            this.examPlans.plans[i] = plan;
        } else {
            this.examPlans.plans.push(plan);
        }
        this.persist.save(EXAM_PLANS_DATA, this.examPlans).catch(() => { /* onFail 已记录 */ });
        return this.examPlans;
    }

    private deleteExamPlan(id: string): ExamPlansData {
        this.examPlans.plans = this.examPlans.plans.filter(p => p.id !== id);
        this.persist.save(EXAM_PLANS_DATA, this.examPlans).catch(() => { /* onFail 已记录 */ });
        return this.examPlans;
    }

    private openReviewScope(scopeKind: "all" | "deck" | "notebook", scopeId: string, cram: boolean) {
        const scope = scopeKind === "all" ? "all" : scopeKind + ":" + scopeId;
        this.openTabOf(TAB_REVIEW, { scope, cram });
    }

    /** AI 制卡向导（M2·FR6-10）：生成回调 + 批次记录落库；initialSource 用于 leech 改写预填 */
    private async openAIWizard(initialSource = "") {
        const AIWizard = await loadAIWizard();
        svelteDialog({
            title: this.i18n.aiWizardTitle,
            component: AIWizard,
            width: "min(680px, 94vw)",
            props: {
                i18n: this.i18n,
                initialSource,
                loadCurrentDoc: () => this.loadCurrentDoc(),
                loadNotebookMaterial: (nbId: string) => this.loadNotebookMaterial(nbId),
                // AQ-14：signal 随调用传入——向导关闭/换源/重生取消后，晚到响应不写回、不触发 fallback
                // ADR-7 第 3 步：生成阶段入账作业生命周期（drafting→generating→reviewing / failed/canceled）
                generate: async (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }, opts?: { signal?: AbortSignal }) => {
                    // Prompt 模板库（294）：用户自定义模板优先，占位符同内置
                    const tpl = this.settings.aiPromptTemplate.trim();
                    const system = tpl
                        ? tpl.replace("${count}", String(cfg.count)).replace("${language}", cfg.language).replace("${type}", cfg.type)
                        : this.i18n.aiSystemPrompt;
                    const user = this.i18n.aiUserPrompt
                        .replace("${source}", source)
                        .replace("${count}", String(cfg.count))
                        .replace("${language}", cfg.language)
                        .replace("${type}", cfg.type === "cloze" ? this.i18n.aiTypeClozeHint : this.i18n.aiTypeQaHint);
                    if (estimateTokens(source) > 24000) {
                        throw new Error(this.i18n.aiTooLong);
                    }
                    const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
                    let job = createJob(jobId, { type: this.settings.aiMode, label: source.slice(0, 50), excerpt: source.slice(0, 200) }, cfg);
                    job = transitionJob(job, { type: "GENERATE_START" }).job;
                    this.aiJobs.jobs = pruneJobs([...this.aiJobs.jobs, job]);
                    await this.persist.save(AI_JOBS_DATA, this.aiJobs).catch(() => { /* onFail 已记录 */ });
                    let fallbackNotified = false;
                    try {
                        const raw = await aiChat(
                            {
                                mode: this.settings.aiMode,
                                endpoint: this.settings.aiEndpoint,
                                apiKey: this.settings.aiKey,
                                model: this.settings.aiModel,
                                fallbackEndpoint: this.settings.aiFallbackEndpoint || undefined,
                                fallbackApiKey: this.settings.aiFallbackKey || undefined,
                                fallbackModel: this.settings.aiFallbackModel || undefined,
                            },
                            system, user,
                            {
                                signal: opts?.signal,
                                onProvider: p => {
                                    if (p === "fallback" && !fallbackNotified) {
                                        fallbackNotified = true;
                                        showMessage(this.i18n.aiFallbackUsed, 2500, "info");
                                    }
                                },
                            },
                        );
                        const parsed = parseCards(raw).slice(0, cfg.count);
                        if (parsed.length === 0) {
                            throw new Error((this.i18n as any).aiWizard?.emptyResult ?? "AI returned no cards");
                        }
                        job = transitionJob(job, {
                            type: "GENERATE_OK",
                            candidates: parsed.map(c => ({ q: c.q, a: c.a, d: c.d, keep: true, status: "pending" as const })),
                        }).job;
                        this.aiJobs.jobs = pruneJobs([...this.aiJobs.jobs, job]);
                        await this.persist.save(AI_JOBS_DATA, this.aiJobs).catch(() => { /* onFail 已记录 */ });
                        // 批次元数据（质量反哺数据源，P2 消费）；tokens 供消耗历史（299）
                        this.aiBatches.batches.push({
                            id: `ai-${Date.now().toString(36)}`,
                            date: localDate(Date.now()),
                            deckID: "",
                            blockIDs: [],
                            tokens: estimateTokens(system) + estimateTokens(user) + estimateTokens(raw),
                        });
                        if (this.aiBatches.batches.length > 200) {
                            this.aiBatches.batches = this.aiBatches.batches.slice(-200);
                        }
                        this.persist.save(AI_BATCHES_DATA, this.aiBatches).catch(() => { /* onFail 已记录 */ });
                        return { cards: parsed, jobId };
                    } catch (e) {
                        // 取消与失败都落账：取消记 CANCEL，失败记 GENERATE_FAIL——重开向导可续传
                        job = transitionJob(job, isAICanceled(e)
                            ? { type: "CANCEL" }
                            : { type: "GENERATE_FAIL", error: e instanceof Error ? e.message : String(e) }).job;
                        this.aiJobs.jobs = pruneJobs([...this.aiJobs.jobs, job]);
                        await this.persist.save(AI_JOBS_DATA, this.aiJobs).catch(() => { /* onFail 已记录 */ });
                        throw e;
                    }
                },
                onCreate: (cards: { q: string; a: string }[], indexes: number[], deckID: string, deckName: string, jobId: string) =>
                    this.createAICards(cards, indexes, deckID, deckName, jobId),
                // ADR-7 恢复入口：上次导入中断的续传/放弃
                getUnfinishedJob: () => this.getUnfinishedAIJob(),
                onResumeAIJob: (id: string) => this.resumeAIJobCommit(id),
                onAbandonAIJob: (id: string) => this.abandonAIJob(id),
                onClose: () => { /* svelteDialog 自理销毁 */ },
            },
        });
    }

    /** ADR-7 第 3 步：逐卡提交 + 断点记录——每卡 appendBlock+入组成功即持久化，中断续传只处理 pending */
    private async createAICards(cards: { q: string; a: string }[], indexes: number[], deckID: string, _deckName: string, jobId: string) {
        const nb = await this.targetNotebook();
        if (!nb) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        const date = localDate(Date.now());
        const docID = await createDocWithMd(nb.id, `小驴闪卡/AI 制卡/${date}`, "");
        if (!docID) {
            throw new Error(this.i18n.quickCardFail);
        }
        let job: AIJob | undefined = jobId ? this.aiJobs.jobs.find(j => j.id === jobId) : undefined;
        if (job) {
            job = transitionJob(job, { type: "COMMIT_START", deckID }).job;
            this.aiJobs.jobs = pruneJobs([...this.aiJobs.jobs, job]);
            await this.persist.save(AI_JOBS_DATA, this.aiJobs).catch(() => { /* onFail 已记录 */ });
        }
        const blockIDs: string[] = [];
        for (let i = 0; i < cards.length; i++) {
            const ids = await appendBlock("markdown", `${cards[i].q} ==${cards[i].a}==`, docID);
            const blockID = ids[0];
            blockIDs.push(blockID);
            // ADR-7：逐卡入组成功即记账（单卡批），中断后 pending 续传
            await addRiffCards(deckID, [blockID]);
            if (job) {
                const r = transitionJob(job, { type: "CARD_CREATED", index: indexes[i] ?? i, blockID });
                if (r.ok) {
                    job = r.job;
                    this.aiJobs.jobs = pruneJobs([...this.aiJobs.jobs, job]);
                    await this.persist.save(AI_JOBS_DATA, this.aiJobs).catch(() => { /* onFail 已记录 */ });
                }
            }
        }
        if (job) {
            const r = transitionJob(job, { type: "COMMIT_DONE" });
            if (r.ok) {
                job = r.job;
                this.aiJobs.jobs = pruneJobs([...this.aiJobs.jobs, job]);
                await this.persist.save(AI_JOBS_DATA, this.aiJobs).catch(() => { /* onFail 已记录 */ });
            }
        }
        showMessage(this.i18n.deckAdded.replace("${n}", String(blockIDs.length)), 2000, "info");
    }

    /** ADR-7：恢复未完成的 AI 导入（向导「继续」入口）——从首个 pending 候选续传 */
    private async resumeAIJobCommit(jobId: string) {
        let job = this.aiJobs.jobs.find(j => j.id === jobId);
        if (!job || !job.deckID) {
            return;
        }
        const r = transitionJob(job, { type: "RESUME" });
        if (!r.ok) {
            return;
        }
        job = r.job;
        const nb = await this.targetNotebook();
        if (!nb) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        const date = localDate(job.createdAt);
        const docID = await createDocWithMd(nb.id, `小驴闪卡/AI 制卡/${date}`, "");
        if (!docID) {
            throw new Error(this.i18n.quickCardFail);
        }
        let created = 0;
        let idx = firstPendingIndex(job);
        while (idx >= 0) {
            const c = job.candidates[idx];
            try {
                const ids = await appendBlock("markdown", `${c.q} ==${c.a}==`, docID);
                await addRiffCards(job.deckID, [ids[0]]);
                const rr = transitionJob(job, { type: "CARD_CREATED", index: idx, blockID: ids[0] });
                if (rr.ok) { job = rr.job; created += 1; }
            } catch (e) {
                const rr = transitionJob(job, { type: "CARD_FAILED", index: idx, error: e instanceof Error ? e.message : String(e) });
                if (rr.ok) { job = rr.job; }
                // 单卡失败继续下一张（失败明细在 job 中可查）
            }
            this.aiJobs.jobs = pruneJobs([...this.aiJobs.jobs.filter(j => j.id !== job!.id), job]);
            await this.persist.save(AI_JOBS_DATA, this.aiJobs).catch(() => { /* onFail 已记录 */ });
            idx = firstPendingIndex(job);
        }
        const done = transitionJob(job, { type: "COMMIT_DONE" });
        if (done.ok) {
            job = done.job;
            this.aiJobs.jobs = pruneJobs([...this.aiJobs.jobs.filter(j => j.id !== job!.id), job]);
            await this.persist.save(AI_JOBS_DATA, this.aiJobs).catch(() => { /* onFail 已记录 */ });
        }
        showMessage(this.i18n.deckAdded.replace("${n}", String(created)), 2000, "info");
    }

    /** ADR-7：向导「未完成导入」横幅数据（committing/failed/canceled 且仍有 pending） */
    private getUnfinishedAIJob(): { id: string; done: number; total: number } | null {
        const j = this.aiJobs.jobs.find(j =>
            (j.status === "committing" || j.status === "failed" || j.status === "canceled")
            && j.candidates.some(c => c.status === "pending"));
        if (!j) {
            return null;
        }
        return {
            id: j.id,
            done: j.candidates.filter(c => c.status === "created").length,
            total: j.candidates.length,
        };
    }

    /** ADR-7：放弃未完成导入（删除该 job 记录；已创建的卡保留不动） */
    private abandonAIJob(jobId: string) {
        this.aiJobs.jobs = this.aiJobs.jobs.filter(j => j.id !== jobId);
        this.persist.save(AI_JOBS_DATA, this.aiJobs).catch(() => { /* onFail 已记录 */ });
    }

    /** 原生事件幂等去重（AQ-5）：eventId / cardID+1s 时间窗 */
    private nativeDeduper = new NativeEventDeduper();

    private onNativeCardAction = (event: CustomEvent) => {
        try {
            const normalized = normalizeNativeCardAction(event?.detail, Date.now());
            // 非法评分（5、-1、2.5）或缺卡 ID：丢弃并进诊断，不产生脏 revlog
            if (!normalized) {
                lvLog("warn", "native rating dropped: invalid event shape");
                return;
            }
            if (this.nativeDeduper.seen((event?.detail as any)?.eid, normalized.cardID, normalized.ts)) {
                lvLog("info", "native rating deduped: " + normalized.cardID);
                return;
            }
            if (normalized.timeEstimated) {
                lvLog("info", "native rating time estimated (kernel did not provide ts)");
            }
            this.appendRevlog({
                ts: normalized.ts,
                cardID: normalized.cardID,
                deckID: normalized.deckID,
                blockID: normalized.blockID,
                rating: normalized.rating,
                source: "native",
            });
        } catch {
            // 统计属于旁路功能，绝不影响主流程
        }
    };

    private appendRevlog(entry: Omit<RevlogEntry, "ts"> & { ts?: number }) {
        const today = localDate(Date.now());
        const prevCount = this.revlog.days[today]?.review ?? 0;
        const streakBefore = calcStreak(this.revlog);
        appendRevlog(this.revlog, { ts: entry.ts ?? Date.now(), ...entry } as RevlogEntry);
        const streakAfter = calcStreak(this.revlog);
        this.scheduleRevlogSave();
        this.refreshDueBadge();
        // M8·FR1：目标跨越庆祝；M11·FR1：生态事件广播
        const target = this.settings.dailyReviewTarget;
        const nowCount = this.revlog.days[today]?.review ?? 0;
        if (target > 0 && prevCount < target && nowCount >= target && !this.inQuietHours()) {
            showMessage(this.i18n.dailyTargetReached, 3000, "info");
        }
        try {
            (this.eventBus as any).emit("lv-cards:reviewed", {
                plugin: "lv-cards", v: 1,
                cardID: entry.cardID, deckID: entry.deckID, blockID: entry.blockID,
                rating: entry.rating, source: entry.source,
            });
            if (streakAfter !== streakBefore) {
                (this.eventBus as any).emit("lv-cards:streak-changed", { plugin: "lv-cards", v: 1, streak: streakAfter });
            }
        } catch { /* 事件旁路 */ }
    }

    private scheduleRevlogSave() {
        if (this.saveRevlogTimer) {
            clearTimeout(this.saveRevlogTimer);
        }
        this.saveRevlogTimer = setTimeout(() => this.flushRevlogSave(), 2000);
    }

    private flushRevlogSave() {
        if (this.saveRevlogTimer) {
            clearTimeout(this.saveRevlogTimer);
            this.saveRevlogTimer = null;
        }
        // AQ-4：重试与失败记录统一由 persist 队列承担，成功回调解构 trackSave
        this.persist.save(REVLOG_DATA, this.revlog).catch(() => { /* onFail 已记录，等下次修改触发 */ });
    }

    private openTabOf(type: string, data?: Record<string, unknown>) {
        const anySelf = this as any;
        anySelf.openTab({ app: this.app, type, customData: data });
    }

    private showTopbarMenu(evt: MouseEvent) {
        const menu = new Menu("lvCardsMenu");
        if (this.flashcardV2) {
            // 内核 V2 状态徽章（迁移状态机 Legacy/Preparing/Active/LegacyDiverged）
            menu.addItem({
                icon: "iconLvCards",
                label: `Flashcard V2 · ${this.flashcardV2.state}`,
                type: "readonly",
            });
        }
        if (this.settings.modules.stats) {
            menu.addItem({ icon: "iconLvCards", label: this.i18n.menuDashboard, click: () => this.openTabOf(TAB_DASHBOARD) });
        }
        if (this.settings.modules.review) {
            menu.addItem({ icon: "iconLvCards", label: this.i18n.menuReview, click: () => this.openTabOf(TAB_REVIEW) });
        }
        if (this.settings.modules.manager) {
            menu.addItem({ icon: "iconLvCards", label: this.i18n.menuManager, click: () => this.openTabOf(TAB_DASHBOARD, { tab: "manage" }) });
        }
        menu.addSeparator();
        menu.addItem({
            icon: "iconLvCards",
            label: this.i18n.menuQuickCard,
            click: () => this.openQuickCard(),
        });
        if (this.settings.modules.create) {
            menu.addItem({
                icon: "iconLvCards",
                label: this.i18n.menuAICard,
                click: () => this.openAIWizard(),
            });
        }
        menu.addItem({
            label: this.i18n.menuSettings,
            icon: "iconSettings",
            click: () => this.openSettingsDialog(),
        });
        const x = evt.clientX || window.innerWidth - 60;
        const y = evt.clientY || 48;
        menu.open({ x, y });
        const today = localDate(Date.now());
        const stat = this.revlog.days[today];
        if (stat && this.settings.dailyReviewTarget > 0 && stat.review >= this.settings.dailyReviewTarget) {
            showMessage(this.i18n.dailyTargetReached, 3000, "info");
        }
    }

    private async openSettingsDialog() {
        const SettingsPanel = await loadSettingsPanel();
        const { close } = svelteDialog({
            title: this.i18n.settingsTitle,
            component: SettingsPanel,
            width: "min(620px, 94vw)",
            props: {
                ctx: {
                    i18n: this.i18n,
                    settings: this.settings,
                    close: () => close(),
                    save: async (s: LvCardsSettings) => {
                        this.settings = s;
                        await this.saveData(SETTINGS_DATA, s);
                        showMessage(this.i18n.settingsSaved, 2000, "info");
                    },
                    exportRevlog: () => this.exportRevlog(),
                    clearRevlog: () => this.clearRevlog(),
                    redetectV2: async () => {
                        this.flashcardV2 = await detectFlashcardV2();
                        const state = this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)";
                        this.settings.gatewayState = state;
                        this.saveSettingsSoon();
                        // gateway-changed（M11 事件契约）：网关状态变化广播
                        try {
                            (this.eventBus as any).emit("lv-cards:gateway-changed", { plugin: "lv-cards", v: 1, state });
                        } catch { /* 事件旁路 */ }
                        return state;
                    },
                    getV2Status: () => this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)",
                    getSuspendedCount: () => this.suspendToday.cardIDs.length,
                    restoreAllSuspended: () => {
                        this.suspendToday.cardIDs = [];
                        this.persist.save(SUSPEND_TODAY_DATA, this.suspendToday).catch(() => { /* onFail 已记录 */ });
                        showMessage(this.i18n.settingsSaved, 2000, "info");
                    },
                    testAnkiClient: () => this.testAnkiClient(),
                    storageStats: () => this.storageStats(),
                    generateExamReport: (plan: ExamPlan) => this.generateExamReport(plan),
                    exportSettings: () => this.exportSettings(),
                    getNotebooks: async () => {
                        try {
                            return await getNotebooks();
                        } catch {
                            return [];
                        }
                    },
                    importSettings: async (fileText: string) => {
                        this.settings = normalizeSettings(JSON.parse(fileText));
                        await this.saveSettingsNow();
                    },
                    exportRevlogCsv: () => this.exportRevlogCsv(),
                    importRevlogCsv: async (fileText: string) => {
                        const imported = parseRevlogCsv(fileText);
                        const result = mergeRevlog(this.revlog, imported);
                        await this.persist.save(REVLOG_DATA, this.revlog);
                        this.refreshDueBadge();
                        return result;
                    },
                    importRevlogMerge: async (fileText: string, onFork?: "skip" | "preferImport") => {
                        const imported = JSON.parse(fileText);
                        const result = mergeRevlog(this.revlog, imported, { onFork });
                        await this.persist.save(REVLOG_DATA, this.revlog);
                        this.refreshDueBadge();
                        return result;
                    },
                },
            },
        });
    }

    /** 导出本地复习日志（M10·FR1） */
    private exportRevlog() {
        const stamp = localDate(Date.now());
        const blob = new Blob([JSON.stringify(this.revlog, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lv-cards-revlog-${stamp}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** 导出设置为 JSON 文件 */
    private exportSettings() {
        const blob = new Blob([JSON.stringify(this.settings, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lv-cards-settings-${localDate(Date.now())}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** 导出 CSV（带 BOM，Excel 友好） */
    private exportRevlogCsv() {
        const stamp = localDate(Date.now());
        const blob = new Blob(["\ufeff" + revlogToCsv(this.revlog)], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lv-cards-revlog-${stamp}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** 清空本地复习日志（热力图与连击归零；不影响内核调度） */
    private clearRevlog() {
        this.revlog = emptyRevlog();
        this.persist.save(REVLOG_DATA, this.revlog).catch(() => { /* onFail 已记录 */ });
        this.refreshDueBadge();
        showMessage(this.i18n.settingsSaved, 2000, "info");
    }

    /** 学习报告写入思源文档（M5·FR6 深化） */
    private async writeReportDoc(md: string) {
        const nb = await this.targetNotebook();
        if (!nb) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        const docID = await createDocWithMd(nb.id, `小驴闪卡/学习报告/${localDate(Date.now())}`, md);
        if (!docID) {
            throw new Error(this.i18n.quickCardFail);
        }
    }
}
