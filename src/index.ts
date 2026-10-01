import "./index.scss";

import { mount, unmount } from "svelte";
import { Plugin, Menu, getAllEditor, showMessage } from "siyuan";

import { svelteDialog } from "./libs/dialog";
import { defaultSettings, normalizeSettings, type LvCardsSettings } from "./core/settings";
import { PERSONA_PRESETS } from "./core/personas";
import {
    appendRevlog, calcStreak, emptyRevlog, leechCards, localDate, normalizeRevlog, recalcDays, revlogToCsv, mergeRevlog,
    type RevlogData, type RevlogEntry,
} from "./core/revlog";
import { detectFlashcardV2, type MigrationStatus } from "./api/flashcardV2";
import { addRiffCards, createRiffDeck, getDueCount, getRiffCardsByBlockIDs, removeRiffCards } from "./api/riff";
import { appendBlock, createDocWithMd, getNotebooks, exportMdContent, sqlQuery, kernelVersion } from "./api/siyuan";
import { aiChat, estimateTokens, parseCards } from "./api/ai";
import { normalizeSuspendToday, rollDateIfNeeded, isSuspended, suspend, type SuspendTodayData } from "./core/suspend-today";
import { normalizeSessionState, type SessionState } from "./core/session-state";
import { normalizeExamPlans, daysLeft, type ExamPlan, type ExamPlansData } from "./core/exam";
import Review from "./ui/review.svelte";
import Hub from "./ui/hub.svelte";
import SettingsPanel from "./ui/settings.svelte";
import DeckPicker from "./ui/deck-picker.svelte";
import QuickCard from "./ui/quick-card.svelte";
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
const loadAIWizard = lazyComp(() => import("./ui/ai-wizard.svelte"));
const loadOcclusionEditor = lazyComp(() => import("./ui/occlusion-editor.svelte"));
const loadOnboarding = lazyComp(() => import("./ui/onboarding.svelte"));

const TAB_DASHBOARD = "lv-cards-dashboard";
const TAB_REVIEW = "lv-cards-review";
const SETTINGS_DATA = "settings.json";
const REVLOG_DATA = "revlog.json";
const SUSPEND_TODAY_DATA = "suspend-today.json";
const EXAM_PLANS_DATA = "exam-plans.json";
const AI_BATCHES_DATA = "ai-batches.json";
const SESSION_STATE_DATA = "session-state.json";

export default class LvCardsPlugin extends Plugin {

    private settings: LvCardsSettings = defaultSettings();
    private revlog: RevlogData = emptyRevlog();
    private saveRevlogTimer: ReturnType<typeof setTimeout> | null = null;
    /** 内核闪卡 V2 状态（null = 当前内核 < 3.9.0，无 V2 API） */
    private flashcardV2: MigrationStatus | null = null;
    private topBarElement: HTMLElement | null = null;
    private badgeTimer: ReturnType<typeof setInterval> | null = null;
    private suspendToday: SuspendTodayData = { date: "", cardIDs: [] };
    private examPlans: ExamPlansData = { version: 1, plans: [] };
    private aiBatches: { version: 1; batches: { id: string; date: string; deckID: string; blockIDs: string[] }[] } = { version: 1, batches: [] };
    private sessionState: SessionState = { date: "", reviewedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
    /** 最近一次到期数（角标点击行为统一用：>0 开复习，否则开中心） */
    private lastDue = 0;

    async onload() {
        this.addIcons(`<symbol id="iconLvCards" viewBox="0 0 32 32">
<path d="M6 10h16v16H6z" fill="none" stroke="currentColor" stroke-width="2"></path>
<path d="M10 6h16v16" fill="none" stroke="currentColor" stroke-width="2"></path>
<path d="M11 16h6M11 20h10" stroke="currentColor" stroke-width="2"></path>
</symbol>`);

        const [loadedSettings, loadedRevlog, loadedSuspend, loadedExam, loadedSession] = await Promise.all([
            this.loadData(SETTINGS_DATA),
            this.loadData(REVLOG_DATA),
            this.loadData(SUSPEND_TODAY_DATA),
            this.loadData(EXAM_PLANS_DATA),
            this.loadData(AI_BATCHES_DATA),
            this.loadData(SESSION_STATE_DATA),
        ]);
        this.settings = normalizeSettings(loadedSettings);
        this.revlog = normalizeRevlog(loadedRevlog);
        recalcDays(this.revlog); // AJ1 迁移：由明细重建每日聚合（幂等）
        this.suspendToday = normalizeSuspendToday(loadedSuspend);
        this.examPlans = normalizeExamPlans(loadedExam);
        this.sessionState = normalizeSessionState(loadedSession, localDate(Date.now()));
        this.sessionState = normalizeSessionState(loadedSession, localDate(Date.now()));
        const loadedBatches = await this.loadData(AI_BATCHES_DATA);
        if (loadedBatches && typeof loadedBatches === "object" && Array.isArray((loadedBatches as any).batches)) {
            this.aiBatches = loadedBatches;
        }
        if (rollDateIfNeeded(this.suspendToday)) {
            await this.saveData(SUSPEND_TODAY_DATA, this.suspendToday);
        }

        // 探测内核闪卡 V2（feature/flashcard 分支 / 3.9.0）：决定走 V2 还是 riff 兼容路径
        this.flashcardV2 = await detectFlashcardV2();

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
                            plugin.saveData(SETTINGS_DATA, plugin.settings).catch(() => { /* 旁路 */ });
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
                            getExamCountdown: () => {
                                const plan = plugin.examPlans.plans.find(p => p.enabled && p.examDate && !p.archived);
                                const left = plan ? daysLeft(plan.examDate) : null;
                                return plan && left !== null && left >= 0 ? { name: plan.name, days: left } : null;
                            },
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
                                plugin.saveData(SETTINGS_DATA, plugin.settings).catch(() => { /* 旁路 */ });
                            },
                            deleteFilter: (name: string) => {
                                plugin.settings.savedFilters = plugin.settings.savedFilters.filter(f => f.name !== name);
                                plugin.saveData(SETTINGS_DATA, plugin.settings).catch(() => { /* 旁路 */ });
                            },
                        },
                        exam: plugin.settings.modules.exam ? {
                            plans: plugin.examPlans,
                            onSavePlan: (plan: ExamPlan) => plugin.saveExamPlan(plan),
                            onDeletePlan: (id: string) => plugin.deleteExamPlan(id),
                            onReport: (plan: ExamPlan) => plugin.generateExamReport(plan),
                            onReviewScope: (kind: "all" | "deck" | "notebook", scopeId: string, cram: boolean) =>
                                plugin.openReviewScope(kind, scopeId, cram),
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
                            typingEnabled: plugin.settings.typingEnabled,
                            typingStrict: plugin.settings.typingStrict,
                        }),
                        appendRevlog: (e) => plugin.appendRevlog(e),
                        getRevlog: () => plugin.revlog,
                        isSuspendedToday: (cardID: string) => isSuspended(plugin.suspendToday, cardID),
                        suspendToday: (cardID: string) => {
                            suspend(plugin.suspendToday, cardID);
                            plugin.saveData(SUSPEND_TODAY_DATA, plugin.suspendToday).catch(() => { /* 旁路 */ });
                        },
                        openDashboard: () => plugin.openTabOf(TAB_DASHBOARD),
                        onScopePersist: (key: string) => {
                            plugin.settings.lastReviewScope = key;
                            plugin.saveData(SETTINGS_DATA, plugin.settings).catch(() => { /* 旁路 */ });
                        },
                        getSessionState: () => plugin.sessionState,
                        saveSessionState: (s: SessionState) => {
                            plugin.sessionState = s;
                            plugin.saveData(SESSION_STATE_DATA, plugin.sessionState).catch(() => { /* 旁路 */ });
                        },
                        clearSessionState: () => {
                            plugin.sessionState = { date: "", reviewedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
                            plugin.saveData(SESSION_STATE_DATA, plugin.sessionState).catch(() => { /* 旁路 */ });
                        },
                        emitSessionFinished: (summary: { new: number; review: number; forget: number; skip: number }) => {
                            try {
                                (plugin.eventBus as any).emit("lv-cards:session-finished", { plugin: "lv-cards", v: 1, summary });
                            } catch { /* 事件旁路 */ }
                        },
                    } },
                });
                this.element.appendChild(div);
                this.destroy = () => unmount(app);
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
            langKey: "diagnostics",
            langText: this.i18n.cmdDiagnostics,
            hotkey: "",
            callback: () => this.copyDiagnostics(),
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
        // 到期数心跳（60s）；顺带执行每日到期提醒与积压预警（X 组）
        this.badgeTimer = setInterval(() => {
            this.refreshDueBadge();
            this.checkDailyReminder();
            this.checkBacklogWarn();
        }, 60_000);
        this.checkDailyReminder();
        this.checkBacklogWarn();
    }

    /** 每日到期提醒：到设定时间且仍有到期卡时通知一次（X 组，基础版） */
    private reminderShownFor = "";
    private backlogWarnedFor = "";

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
    private checkDailyReminder() {
        if (!this.settings.reminderEnabled) {
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
        this.eventBus.off("click-flashcard-action", this.onNativeCardAction);
        this.eventBus.off("click-blockicon", this.onBlockIcon);
        this.flushRevlogSave();
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
            this.badgeTimer = null;
        }
    }

    private refreshDueBadge() {
        if (!this.topBarElement || !this.settings.modules.review) {
            this.updateBadge(0);
            return;
        }
        getDueCount().then(count => {
            this.lastDue = count;
            // M7·FR5：活动考试计划存在时，角标优先显示考试倒计时天数
            const plan = this.examPlans.plans.find(p => p.enabled && p.examDate);
            const left = plan ? daysLeft(plan.examDate) : null;
            if (plan && left !== null && left >= 0) {
                this.updateExamBadge(left, plan);
            } else {
                this.updateBadge(count);
            }
        }).catch(() => { /* 旁路，静默 */ });
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

    private openDeckPicker(blockIDs: string[], opts: { skipAdd?: boolean; onPicked?: (deckID: string) => void } = {}) {
        svelteDialog({
            title: this.i18n.deckPickerTitle,
            component: DeckPicker,
            width: "min(420px, 92vw)",
            props: {
                newNamePlaceholder: this.i18n.deckNewName,
                confirmLabel: this.i18n.deckConfirm,
                onConfirm: async (deckID: string) => {
                    if (!opts.skipAdd) {
                        await addRiffCards(deckID, blockIDs);
                        showMessage(this.i18n.deckAdded.replace("${n}", String(blockIDs.length)), 2000, "info");
                    }
                    opts.onPicked?.(deckID);
                },
                onClose: () => { /* svelteDialog 自理销毁 */ },
            },
        });
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
            "plugin version: 0.26.0",
            "siyuan/kernel: " + kv,
            "V2 state: " + (this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)"),
            "modules on: " + Object.entries(this.settings.modules).filter(([, v]) => v).map(([k]) => k).join(", "),
            "revlog entries: " + this.revlog.entries.length,
            "streak: " + calcStreak(this.revlog),
            "due today (badge): " + this.lastDue,
            "plans: " + this.examPlans.plans.length,
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
    private async generateExamReport(plan: ExamPlan) {
        const left = daysLeft(plan.examDate);
        const examTs = new Date(plan.examDate + "T23:59:59").getTime();
        const from = Math.min(plan.createdAt, examTs - 90 * 86400000);
        const to = Date.now() < examTs ? Date.now() : examTs;
        const entries = this.revlog.entries.filter(e => e.ts >= from && e.ts <= to);
        const reviews = entries.filter(e => e.rating > 0).length;
        const forgets = entries.filter(e => e.rating === 1).length;
        const activeDays = new Set(entries.filter(e => e.rating > 0).map(e => localDate(e.ts))).size;
        const md = [
            `# 考试复盘：${plan.name}`,
            `- 考试日期：${plan.examDate}（${left !== null && left < 0 ? "已结束" : `剩 ${left} 天`}）`,
            `- 范围：${plan.scopeName}`,
            `- 窗口内复习：${reviews} 次 / 遗忘：${forgets} 次 / 保持率：${reviews ? Math.round((1 - forgets / reviews) * 100) : "—"}%`,
            `- 活跃天数：${activeDays}`,
            `- 计划 cram 设置：考前 ${plan.cramDays} 天`,
            "",
            `> 由小驴闪卡生成 · ${new Date().toLocaleString()}`,
        ].join("\n");
        await navigator.clipboard.writeText(md);
        showMessage(this.i18n.examReportCopied, 2500, "info");
    }

    private openQuickCard() {
        svelteDialog({
            title: this.i18n.quickCardTitle,
            component: QuickCard,
            width: "min(520px, 94vw)",
            props: {
                i18n: this.i18n,
                onCreate: async (markdown: string, deckID: string) => {
                    const notebooks = await getNotebooks();
                    if (notebooks.length === 0) {
                        throw new Error(this.i18n.onboardingNoNotebook);
                    }
                    // 同路径重复创建复用既有文档（内核语义），返回其文档 ID
                    const docID = await createDocWithMd(notebooks[0].id, "小驴闪卡/快速制卡", "");
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
                    this.saveData(SETTINGS_DATA, this.settings).catch(() => { /* 旁路 */ });
                },
                createSampleCards: (nbId: string) => this.createSampleCards(nbId),
                openReview: () => this.openTabOf(TAB_REVIEW),
                onClose: () => { /* svelteDialog 自理销毁 */ },
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
        this.saveData(EXAM_PLANS_DATA, this.examPlans).catch(() => { /* 旁路 */ });
        return this.examPlans;
    }

    private deleteExamPlan(id: string): ExamPlansData {
        this.examPlans.plans = this.examPlans.plans.filter(p => p.id !== id);
        this.saveData(EXAM_PLANS_DATA, this.examPlans).catch(() => { /* 旁路 */ });
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
                generate: async (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }) => {
                    const system = this.i18n.aiSystemPrompt;
                    const user = this.i18n.aiUserPrompt
                        .replace("${source}", source)
                        .replace("${count}", String(cfg.count))
                        .replace("${language}", cfg.language)
                        .replace("${type}", cfg.type === "cloze" ? this.i18n.aiTypeClozeHint : this.i18n.aiTypeQaHint);
                    if (estimateTokens(source) > 24000) {
                        throw new Error(this.i18n.aiTooLong);
                    }
                    const raw = await aiChat(
                        { mode: this.settings.aiMode, endpoint: this.settings.aiEndpoint, apiKey: this.settings.aiKey, model: this.settings.aiModel },
                        system, user,
                    );
                    const cards = parseCards(raw).slice(0, cfg.count);
                    // 批次元数据（质量反哺数据源，P2 消费）
                    this.aiBatches.batches.push({
                        id: `ai-${Date.now().toString(36)}`,
                        date: localDate(Date.now()),
                        deckID: "",
                        blockIDs: [],
                    });
                    if (this.aiBatches.batches.length > 200) {
                        this.aiBatches.batches = this.aiBatches.batches.slice(-200);
                    }
                    this.saveData(AI_BATCHES_DATA, this.aiBatches).catch(() => { /* 旁路 */ });
                    return cards;
                },
                onCreate: (cards: { q: string; a: string }[], deckID: string, deckName: string) =>
                    this.createAICards(cards, deckID, deckName),
                onClose: () => { /* svelteDialog 自理销毁 */ },
            },
        });
    }

    /** AI 卡落库：挖空式单块写入「小驴闪卡/AI 制卡」文档 → addRiffCards（M2·FR9，riff 路径） */
    private async createAICards(cards: { q: string; a: string }[], deckID: string, _deckName: string) {
        const notebooks = await getNotebooks();
        if (notebooks.length === 0) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        const date = localDate(Date.now());
        const docID = await createDocWithMd(notebooks[0].id, `小驴闪卡/AI 制卡/${date}`, "");
        if (!docID) {
            throw new Error(this.i18n.quickCardFail);
        }
        const blockIDs: string[] = [];
        for (const c of cards) {
            const ids = await appendBlock("markdown", `${c.q} ==${c.a}==`, docID);
            blockIDs.push(...ids.slice(0, 1));
        }
        if (blockIDs.length === 0) {
            throw new Error(this.i18n.quickCardFail);
        }
        await addRiffCards(deckID, blockIDs);
        const batch = this.aiBatches.batches[this.aiBatches.batches.length - 1];
        if (batch && batch.blockIDs.length === 0) {
            batch.deckID = deckID;
            batch.blockIDs = blockIDs;
            this.saveData(AI_BATCHES_DATA, this.aiBatches).catch(() => { /* 旁路 */ });
        }
        showMessage(this.i18n.deckAdded.replace("${n}", String(blockIDs.length)), 2000, "info");
    }

    private onNativeCardAction = (event: CustomEvent) => {        try {
            const detail: any = event?.detail ?? {};
            const cardID: string = detail?.cardID ?? detail?.id ?? "";
            if (!cardID) {
                return;
            }
            const rating = Number(detail?.rating ?? detail?.level ?? 0);
            const entry: RevlogEntry = {
                ts: Date.now(),
                cardID,
                deckID: detail?.deckID ?? "",
                blockID: detail?.blockID ?? "",
                rating: Number.isFinite(rating) ? rating : 0,
                source: "native",
            };
            this.appendRevlog(entry);
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
        // AK：失败单次重试（1.5s 后），仍失败等下次修改触发
        this.saveData(REVLOG_DATA, this.revlog)
            .then(() => this.trackSave(REVLOG_DATA))
            .catch(() => {
                setTimeout(() => {
                    this.saveData(REVLOG_DATA, this.revlog).then(() => this.trackSave(REVLOG_DATA)).catch(() => { /* 放弃本次，等下次修改 */ });
                }, 1500);
            });
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

    private openSettingsDialog() {
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
                        return this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)";
                    },
                    getV2Status: () => this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)",
                    getSuspendedCount: () => this.suspendToday.cardIDs.length,
                    restoreAllSuspended: () => {
                        this.suspendToday.cardIDs = [];
                        this.saveData(SUSPEND_TODAY_DATA, this.suspendToday).catch(() => { /* 旁路 */ });
                        showMessage(this.i18n.settingsSaved, 2000, "info");
                    },
                    testAnkiClient: () => this.testAnkiClient(),
                    storageStats: () => this.storageStats(),
                    generateExamReport: (plan: ExamPlan) => this.generateExamReport(plan),
                    exportRevlogCsv: () => this.exportRevlogCsv(),
                    importRevlogMerge: async (fileText: string) => {
                        const imported = JSON.parse(fileText);
                        const result = mergeRevlog(this.revlog, imported);
                        await this.saveData(REVLOG_DATA, this.revlog);
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
        this.saveData(REVLOG_DATA, this.revlog).catch(() => { /* 忽略 */ });
        this.refreshDueBadge();
        showMessage(this.i18n.settingsSaved, 2000, "info");
    }
}
