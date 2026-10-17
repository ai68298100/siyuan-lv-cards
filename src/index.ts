import "./index.scss";

import { Plugin, getAllEditor, showMessage, openTab, getAllTabs } from "siyuan";
import * as siyuanNamespace from "siyuan";

import { invalidateChunk, loadChunk, type ChunkMount } from "./libs/chunk-loader";
import { setDialogMounter } from "./libs/dialog";
import { svelteDialog, confirmDialogBool } from "./libs/dialog";

// AT-17：UI chunk（独立 IIFE 自带 svelte）经全局取 siyuan 模块——shell 在此注入单一事实源
(window as unknown as { __lvSiyuan: unknown }).__lvSiyuan = siyuanNamespace;
import { lvLog, lvLogDump } from "./libs/log";
import { loadStore, zipLoaded } from "./libs/store";
import { createPersist, type PersistQueue } from "./libs/persist";
import { normalizeAIBatches, emptyAIBatches, type AIBatchesData } from "./core/ai-batches";
import { defaultSettings, normalizeSettings, type LvCardsSettings } from "./core/settings";
import { PERSONA_PRESETS } from "./core/personas";
import { normalizeNativeCardAction, NativeEventDeduper } from "./core/native-events";
import type { PaletteCommand } from "./core/palette";
import {
    normalizeAIJobs, emptyAIJobs, createJob, transitionJob, pruneJobs,
    type AIJobsData, type AIJob,
} from "./core/ai-jobs";
import {
    appendRevlog, calcStreak, emptyRevlog, leechCards, localDate, normalizeRevlog, mergeRevlog, docCoverage,
    type RevlogData, type RevlogEntry,
} from "./core/revlog";
import { detectFlashcardV2, type MigrationStatus } from "./api/flashcardV2";
import { getRiffCards, getRiffCardsByBlockIDs } from "./api/riff";
// AT-4：addRiffCards 取经 due-shared 的包装版（建卡成功即失效共享 due 缓存），badge/提醒走共享缓存
import { addRiffCards, cachedDueBlockIDs, cachedDueCount, dueCache, formatRiffCardEntryError, invalidateDueCache } from "./api/due-shared";
import { createPerf } from "./libs/perf";
import { cardsCreatedEvent, gatewayChangedEvent, LV_EVENTS, reviewedEvent, sessionFinishedEvent, settingsChangedEvent, storesChangedEvent, streakChangedEvent } from "./libs/events";
import { deriveInstance, emptyKnowledgeObjects, findBySource, normalizeKnowledgeObjects, registerObject, removeInstance, toggleInstance, type KnowledgeObjectsData } from "./core/knowledge-objects";
import { capabilityShare } from "./core/capability-types";
import { addRelation, emptyCardRelations, normalizeCardRelations, relationsOf, removeRelation, type CardRelationsData, type RelationType } from "./core/card-relations";
import { emptyErrorTags, errorReasonStats, normalizeErrorTags, tagError, type ErrorTagsData, type ErrorReason } from "./core/error-reasons";
import { addInboxItem, bulkSetStatus, emptyInbox, normalizeInbox, removeInboxItem, undoSelection, type InboxData, type InboxStatus } from "./core/inbox";
import { emptyGoals, normalizeGoals, daysUntilDeadline, isGoalActive, type LearningGoalsData, type LearningGoal } from "./core/learning-goal";
import { emptyEntryContexts, isContextFresh, normalizeEntryContexts, removeContext, upsertContext, type EntryContextData, type EntryKind } from "./core/entry-context";
import { ensureLifecycle, emptyLifecycles, lifecycleStats, normalizeLifecycles, transition, type ContentLifecyclesData, type ContentState } from "./core/content-lifecycle";
import { appendBlock, createDocWithMd, getNotebooks, getBlockAttrs, getBlockDOM, getBlockDocMap, getDocTitles, exportMdContent, sqlQuery, kernelVersion, updateBlock, probeAssetRefs } from "./api/siyuan";
import { aiChat, estimateTokens, parseCards, isAICanceled } from "./api/ai";
import { normalizeSuspendToday, rollDateIfNeeded, isSuspended, type SuspendTodayData } from "./core/suspend-today";
import { createSuspendTodayMutations } from "./core/suspend-today-persistence";
import { createSnapshotMutationQueue } from "./core/snapshot-mutation-queue";
import { normalizeLedger, type LedgerEntry } from "./core/anki-import";
import { acceptVersion, appendVersion, emptyContentVersions, normalizeContentVersions, versionsOf } from "./core/content-versions";
import { assembleGeneratePrompt } from "./core/ai-pipeline";
import { checkEligibility } from "./core/ai-eligibility";
import { disableTarget, emptyKillSwitch, enableTarget, grantConsent, killSwitchBlock, normalizeKillSwitch, revokeConsent, type AIKillSwitchData } from "./core/ai-kill-switch";
import { addDenyRule, emptyDenyList, isDenied, normalizeDenyList, type DenyListData } from "./core/ai-source-deny";
import { evaluateRefusal } from "./core/ai-refusal";
import { fnv1a } from "./core/ai-provenance";
import { isSelectableModel, estimateCallCostUsd } from "./core/ai-model-registry";
import { budgetState, emptyCostLedger, normalizeCostLedger, recordEntry, type CostLedgerData } from "./core/ai-cost-ledger";
import { MODEL_PRICE_SNAPSHOT } from "./core/ai-model-registry";
import { buildBackupBundle, previewRestore } from "./core/backup";
import { normalizeObLedger, type ObLedgerEntry } from "./core/obsidian-import";
import { parseRevlogCsv } from "./core/revlog-csv";
import { normalizeSessionState, type SessionState } from "./core/session-state";
import { normalizeExamPlans, daysLeft, type ExamPlan, type ExamPlansData } from "./core/exam";
import {
    EXAM_PLANS_CHANGED_EVENT,
    EXAM_PLANS_PUBLISH_RPC,
    createExamPlansChangedNotice,
    isKernelPluginRunning,
    persistThenNotify,
    shouldReloadExamPlans,
} from "./core/exam-plan-sync";
import { scanAllMaintenanceCardIds } from "./core/maintenance-scan";
import { registerPluginCommands } from "./bootstrap/commands";
import { showPluginTopbarMenu } from "./bootstrap/topbar-menu";
import { createFullSampleWorkspace, createOnboardingSampleCards } from "./core/workspace-samples";
import {
    downloadFile,
    formatRevlogExportJson,
    formatRevlogExportCsv,
    formatSettingsExportJson,
    buildCostLedgerExportPayload,
    applyRestoreTransaction,
} from "./core/data-transfer";
import {
    isWithinQuietHours,
    decideBacklogWarning,
    decideExamMilestoneReminder,
    shouldTriggerDailyReminder,
    computeBadgeDescriptor,
} from "./core/badge-reminder";
import { computeBlockMenuItems, extractBlockIDs } from "./bootstrap/block-menu";
import {
    resolveTargetNotebook,
    queryNotebookBlockIDs,
    assembleWeeklyReportPayload,
} from "./core/report-writer";
import {
    findUnfinishedAIJob,
    getRecoverableJobSummaries,
    prepareReviewableJob,
    cancelAllActiveJobs,
} from "./core/ai-job-recovery";
import {
    checkDuplicateCards,
    removeCardsFromDeckFlow,
    executeQuickCardCreation,
    extractMarkerCardItems,
} from "./core/card-operations";
import { hasImageContent, serializeQaCard } from "./core/flashcard-quality";
import { findAiCardGateIssues } from "./core/ai-card-gate";
import { validateCardEntry } from "./core/card-entry-gate";
import { parseOcclusion } from "./core/occlusion";
import { extractMediaRefs } from "./core/media-refs";
import type { HubServices } from "./core/hub-services";
import {
    acknowledgeSourceHealth as acknowledgeSourceHealthStore,
    emptySourceHealth,
    normalizeSourceHealth,
    reconcileSourceHealth,
    sourceHealthHistories,
    upsertSourceFingerprint,
    type SourceHealthData,
} from "./core/source-health-store";
import type { SourceCurrentFacts } from "./core/source-health";
import type {
    BatchRepairProposal,
    BatchRepairPreview,
    MaintenanceRepairJournal,
} from "./core/maintenance-repair";
import type { createMaintenanceRepairController } from "./core/maintenance-repair-controller";
import type { RepairSnapshotWrite } from "./core/maintenance-repair-storage";
import {
    buildBudgetPreview,
    queryNotebookMaterialText,
    buildAiCardMarker,
    buildAiCardBlockMarkdown,
} from "./core/ai-wizard-service";
import { computeStorageStats, probeAnkiConnection } from "./core/storage-diagnostics";
import {
    computePaletteCommands,
    buildReviewScopeKey,
    parseReturnPoint,
} from "./core/palette-navigation";
// 重组件对话框懒加载（AN 体积评审）：打开时才拉取对应 chunk
// AT-14：Hub（闪卡中心）同样懒加载——静态引用会把 Manager/Dashboard/CardDetail/KoPanel 全链拉进主包
const lazyComp = (loader: () => Promise<{ default: any }>) => {
    let cached: any = null;
    return async () => {
        if (!cached) {
            cached = (await loader()).default;
        }
        return cached;
    };
};

/**
 * AT-17（v0.158.0）：hub/review 重组件改走 script 标签 chunk（独立 IIFE 自带 svelte，
 * 挂载与组件同实例避免双份内部状态）。dev 模式保留进程内动态导入（dev 构建无 chunk 文件）。
 * 统一返回 ChunkMount 形状：mount(target, props) → { destroy() }。
 */
/**
 * Development fallback for the standalone chunk loader. Production never
 * mounts Svelte components in the shell, so the Svelte runtime stays out of
 * the startup payload entirely (the IIFE chunks carry their own runtime).
 */
const mountComp = process.env.DEV_MODE
    ? (loader: () => Promise<{ default: any }>) => async (): Promise<ChunkMount["mount"]> => {
        const { mount, unmount } = await import("svelte");
        const Comp = (await loader()).default;
        return (target: HTMLElement, props: Record<string, unknown>) => {
            const app = mount(Comp, { target, props });
            return { destroy: () => { void unmount(app); } };
        };
    }
    : (_loader: () => Promise<{ default: any }>) => async (): Promise<ChunkMount["mount"]> => {
        throw new Error("Svelte dev mount is unavailable in production");
    };
const loadHubMount: () => Promise<ChunkMount["mount"]> = process.env.DEV_MODE
    ? mountComp(() => import("./ui/hub.svelte"))
    : () => loadChunk("hub").then(m => m.mount);
// Keep maintenance-only computation out of startup; adapters and stores stay in the shell.
const loadHubServices: () => Promise<HubServices> = process.env.DEV_MODE
    ? () => import("./core/hub-services").then(m => m.hubServices)
    : async () => {
        const { services } = await loadChunk("hub");
        if (!services || !["previewBatchRepair", "confirmBatchRepair", "applyBatchRepair", "createMaintenanceRepairStorage",
            "findApproximateDuplicateCandidates", "helpMarkdown", "renderExamReportMarkdown", "buildDiagnosticsText"]
            .every(key => typeof services[key] === "function")) {
            invalidateChunk("hub");
            throw new Error("lv hub chunk missing services");
        }
        return services;
    };
const loadReviewMount: () => Promise<ChunkMount["mount"]> = process.env.DEV_MODE
    ? mountComp(() => import("./ui/review.svelte"))
    : () => loadChunk("review").then(m => m.mount);

/**
 * AT-17（v0.174.0）：9 个对话框组件收编 dialogs chunk（自带 svelte 挂载器，
 * shell 经 setDialogMounter 注入——组件与挂载同实例，无 split-brain）。
 * dev 模式保留进程内动态导入。注意：DEV 三元必须在调用点（define+DCE 才能剪掉
 * 实参位置的动态 import；包装函数的实参会被无条件打包）。
 */
let dialogsChunkReady: Promise<void> | null = null;
async function loadDialogsModule(): Promise<Record<string, any>> {
    // 失败可重试：rejected 不驻留缓存（否则一次网络瞬断后对话框永久失败）
    dialogsChunkReady ??= loadChunk("dialogs")
        .then(m => {
            setDialogMounter(m.mountDialogComponent);
        })
        .catch(e => {
            dialogsChunkReady = null;
            throw e;
        });
    await dialogsChunkReady;
    return loadChunk("dialogs");
}

function loadDialogsComp(compName: string): () => Promise<any> {
    return async () => {
        const m = await loadDialogsModule();
        const Comp = m.components?.[compName];
        if (!Comp) throw new Error(`lv dialogs chunk missing component: ${compName}`);
        return Comp;
    };
}

/**
 * Embedded views (the R54 studio) must not render a component compiled by the
 * dialogs chunk directly from the hub chunk. Each standalone chunk carries its
 * own Svelte runtime; invoking a foreign constructor from the hub runtime makes
 * rune effects orphaned (https://svelte.dev/e/effect_orphan). Return the
 * chunk's mounter so the host can mount into a plain DOM container instead.
 */
function loadDialogsEmbeddedView(compName: string): () => Promise<{ Component: any; mount: any }> {
    return async () => {
        const m = await loadDialogsModule();
        const Component = m.components?.[compName];
        if (!Component || typeof m.mountDialogComponent !== "function") {
            throw new Error(`lv dialogs chunk missing embedded component: ${compName}`);
        }
        return { Component, mount: m.mountDialogComponent };
    };
}

const loadAIWizard = process.env.DEV_MODE ? lazyComp(() => import("./ui/ai-wizard.svelte")) : loadDialogsComp("AIWizard");
const loadOcclusionEditor = process.env.DEV_MODE ? lazyComp(() => import("./ui/occlusion-editor.svelte")) : loadDialogsComp("OcclusionEditor");
const loadOnboarding = process.env.DEV_MODE ? lazyComp(() => import("./ui/onboarding.svelte")) : loadDialogsComp("Onboarding");
const loadChallengeMode = process.env.DEV_MODE ? lazyComp(() => import("./ui/challenge-mode.svelte")) : loadDialogsComp("ChallengeMode");
const loadMarkerCards = process.env.DEV_MODE ? lazyComp(() => import("./ui/marker-cards.svelte")) : loadDialogsComp("MarkerCards");
const loadPairingGame = process.env.DEV_MODE ? lazyComp(() => import("./ui/pairing-game.svelte")) : loadDialogsComp("PairingGame");
const loadSettingsPanel = process.env.DEV_MODE ? lazyComp(() => import("./ui/settings.svelte")) : loadDialogsComp("SettingsPanel");
const loadDeckPicker = process.env.DEV_MODE ? lazyComp(() => import("./ui/deck-picker.svelte")) : loadDialogsComp("DeckPicker");
const loadQuickCard = process.env.DEV_MODE ? lazyComp(() => import("./ui/quick-card.svelte")) : loadDialogsComp("QuickCard");
const loadRepairDrill = process.env.DEV_MODE ? lazyComp(() => import("./ui/repair-drill.svelte")) : loadDialogsComp("Drill"); // T10 修卡演练
const loadPalette = process.env.DEV_MODE ? lazyComp(() => import("./ui/kit/LvPalette.svelte")) : loadDialogsComp("LvPalette"); // T13 ⌘K 命令面板
const loadAIWizardEmbedded = process.env.DEV_MODE
    ? async () => ({ Component: await loadAIWizard() })
    : loadDialogsEmbeddedView("AIWizard");
const loadQuickCardEmbedded = process.env.DEV_MODE
    ? async () => ({ Component: await loadQuickCard() })
    : loadDialogsEmbeddedView("QuickCard");

/**
 * chunk 加载/挂载失败的页签兜底（v0.185.1 真机空白教训：无 .catch 时静默 reject，
 * 用户只见空白菜单）。loader 失败不驻留缓存，关闭重开页签即自动重试。
 */
function mountChunkFallback(el: HTMLElement, i18n: Record<string, any>, err: unknown): void {
    el.textContent = "";
    const box = document.createElement("div");
    box.style.cssText = "height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;text-align:center;color:var(--b3-theme-on-background);";
    const title = document.createElement("div");
    title.textContent = `⚠️ ${i18n.chunkLoadFailedTitle}`;
    const detail = document.createElement("div");
    detail.style.cssText = "font-size:12px;opacity:.65;word-break:break-all;white-space:pre-line;";
    detail.textContent = `${i18n.chunkLoadFailedDetail}\n${err instanceof Error ? err.message : String(err)}`;
    box.append(title, detail);
    el.appendChild(box);
}

const TAB_DASHBOARD = "lv-cards-dashboard";
const TAB_REVIEW = "lv-cards-review";
const SETTINGS_DATA = "settings.json";
const REVLOG_DATA = "revlog.json";
const SUSPEND_TODAY_DATA = "suspend-today.json";
const EXAM_PLANS_DATA = "exam-plans.json";
const AI_BATCHES_DATA = "ai-batches.json";
const SESSION_STATE_DATA = "session-state.json";
const AI_JOBS_DATA = "ai-jobs.json";
const KNOWLEDGE_OBJECTS_DATA = "knowledge-objects.json";
const CARD_RELATIONS_DATA = "relations.json";
const ERROR_TAGS_DATA = "error-tags.json";
const INBOX_DATA = "inbox.json";
const LEARNING_GOALS_DATA = "learning-goals.json";
const ENTRY_CONTEXTS_DATA = "entry-contexts.json";
const CONTENT_LIFECYCLES_DATA = "content-lifecycles.json";
const SOURCE_HEALTH_DATA = "source-health.json";
const AI_KILL_SWITCH_DATA = "ai-killswitch.json";
/** Anki M3：guid 导入台账（幂等重导） */
const ANKI_LEDGER_DATA = "anki-ledger.json";
/** T05：块内容版本快照（每块上限 10） */
const CONTENT_VERSIONS_DATA = "content-versions.json";
/** BW-9：来源级 AI 禁止外发规则（笔记本/文档/块 ID，不含内容） */
const AI_DENY_LIST_DATA = "ai-deny-list.json";
/** BU-24/25：AI 用量账本（token 估算/模型/任务，不含 key 与原文） */
const AI_COST_LEDGER_DATA = "ai-cost-ledger.json";
/** Obsidian SR 导入弱台账（指纹→落点，幂等重导；不含卡片原文） */
const OB_LEDGER_DATA = "ob-import-ledger.json";
/** 批量修复持久化事务日志（成功写入后落盘，供重启后审计与撤销） */
const MAINTENANCE_REPAIR_JOURNAL_DATA = "maintenance-repair-journal.json";

function createEmptyRepairJournal(): MaintenanceRepairJournal {
    return { schema: 1, entries: [] };
}

/** Capture a JSON-compatible store value without retaining a mutable runtime reference. */
function cloneStore<T>(value: T): T {
    try {
        return JSON.parse(JSON.stringify(value)) as T;
    } catch {
        return value;
    }
}

export default class LvCardsPlugin extends Plugin {
    declare i18n: Record<string, any>;

    private settings: LvCardsSettings = defaultSettings();
    private revlog: RevlogData = emptyRevlog();
    private saveRevlogTimer: ReturnType<typeof setTimeout> | null = null;
    /** 内核闪卡 V2 状态（null = 当前内核 < 3.9.0，无 V2 API） */
    private flashcardV2: MigrationStatus | null = null;
    private topBarElement: HTMLElement | null = null;
    /** 生命周期清理：保存顶栏右键监听，避免禁用/重载后重复菜单。 */
    private topBarContextMenuHandler: ((evt: MouseEvent) => void) | null = null;
    private badgeTimer: ReturnType<typeof setInterval> | null = null;
    /** 首次布局后的引导延迟句柄，卸载时必须取消。 */
    private onboardingTimer: ReturnType<typeof setTimeout> | null = null;
    private settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private persistedSettingsSnapshot: LvCardsSettings | null = null;
    private settingsMutationVersion = 0;
    /** Last store snapshot known to be on disk; optimistic writes roll back to this value. */
    private persistedSessionStateSnapshot: SessionState | null = null;
    private persistedInboxSnapshot: InboxData | null = null;
    private persistedAIBatchesSnapshot: AIBatchesData | null = null;
    private persistedCostLedgerSnapshot: CostLedgerData | null = null;
    private persistedAIJobsSnapshot: AIJobsData | null = null;
    private persistedAIDenyListSnapshot: DenyListData | null = null;
    /** Revlog optimistic-write rollback snapshot/version. */
    private revlogPendingSnapshot: RevlogData | null = null;
    private revlogMutationVersion = 0;
    /** Last revlog snapshot confirmed by persistence; failed overlapping writes
     * must never roll back to another unconfirmed optimistic snapshot. */
    private persistedRevlogSnapshot: RevlogData | null = null;
    private inboxMutationVersion = 0;
    private errorTagMutationVersion = 0;
    private persistedErrorTagsSnapshot: ErrorTagsData | null = null;
    private sessionMutationVersion = 0;
    private suspendToday: SuspendTodayData = { date: "", cardIDs: [] };
    /** BU-31：AI 紧急停用/撤销同意状态（ai-killswitch.json） */
    private killSwitch: AIKillSwitchData = emptyKillSwitch();
    private examPlans: ExamPlansData = { version: 1, plans: [] };
    private readonly examPlansSourceID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    private examPlansSequence = 0;
    private examKernelWasRunning = false;
    private aiBatches: AIBatchesData = { version: 1, batches: [] };
    private aiBatchesMutationVersion = 0;
    private costLedgerMutationVersion = 0;
    private aiDenyMutationVersion = 0;
    /** Serialize kill-switch updates so concurrent clicks each build from the
     * latest committed snapshot rather than overwriting a sibling update. */
    private killSwitchMutationQueue: Promise<void> = Promise.resolve();
    /** AI 批次作业（ADR-7 第 2 步）：断点续传的状态载体 */
    private aiJobs: AIJobsData = emptyAIJobs();
    private aiJobsMutationVersion = 0;
    /** AI 提交幂等锁：同一作业的重复点击共享一个提交 Promise。 */
    private aiCommitFlights = new Map<string, Promise<void>>();
    /** BK-1：知识对象与卡实例（派生关系/单变体停用） */
    private knowledgeObjects: KnowledgeObjectsData = emptyKnowledgeObjects();
    /** BK-2：卡片关系图（纯元数据，不产生第二调度器） */
    private cardRelations: CardRelationsData = emptyCardRelations();
    /** BJ-4：错误原因标注（遗忘卡可选标注） */
    private errorTags: ErrorTagsData = emptyErrorTags();
    /** BI-4：材料筛选收件箱（材料块 → 制卡管线的暂存队列） */
    private inbox: InboxData = emptyInbox();
    /** BI-1：学习目标（向导只记录目标，不强迫建卡） */
    private learningGoals: LearningGoalsData = emptyGoals();
    /** BI-3：入口上下文（来源/范围/目标/返回点，取消重开不丢） */
    private entryContexts: EntryContextData = emptyEntryContexts();
    /** BI-5：内容生命周期（十态轨迹，转移带原因与时间） */
    private contentLifecycles: ContentLifecyclesData = emptyLifecycles();
    /** BI-20：来源指纹与健康历史；健康状态永远不参与 due/评分。 */
    private sourceHealth: SourceHealthData = emptySourceHealth();
    /** 维护页批量修复预览：只在内存保留短期 token，确认后立即消费。 */
    private maintenanceRepairPreviews = new Map<string, BatchRepairPreview>();
    /** 批量修复持久化事务日志（成功写入后落盘，供重启后审计与撤销） */
    private repairJournal: MaintenanceRepairJournal = createEmptyRepairJournal();
    private maintenanceRepairController: Promise<ReturnType<typeof createMaintenanceRepairController>> | null = null;
    /** 统一持久化队列（AQ-4）：同 key 串行 + 有限重试 + 失败可观测 */
    /** AT-6：启动/首交互/评分性能指标 */
    private perf = createPerf();
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
    private sourceHealthMutations = createSnapshotMutationQueue<SourceHealthData>(
        () => this.sourceHealth,
        current => cloneStore(current),
        next => this.persist.save(SOURCE_HEALTH_DATA, next),
        next => { this.sourceHealth = next; },
    );
    private suspendTodayMutations = createSuspendTodayMutations(
        () => this.suspendToday,
        data => this.persist.save(SUSPEND_TODAY_DATA, data),
        data => { this.suspendToday = data; },
    );
    private knowledgeObjectsMutations = createSnapshotMutationQueue<KnowledgeObjectsData>(
        () => this.knowledgeObjects,
        current => ({
            version: 1,
            objects: current.objects.map(object => ({
                ...object,
                instances: object.instances.map(instance => ({ ...instance })),
            })),
        }),
        next => this.persist.save(KNOWLEDGE_OBJECTS_DATA, next),
        next => { this.knowledgeObjects = next; },
    );
    private cardRelationsMutations = createSnapshotMutationQueue<CardRelationsData>(
        () => this.cardRelations,
        current => ({ version: 1, relations: current.relations.map(relation => ({ ...relation })) }),
        next => this.persist.save(CARD_RELATIONS_DATA, next),
        next => { this.cardRelations = next; },
    );
    private contentLifecyclesMutations = createSnapshotMutationQueue<ContentLifecyclesData>(
        () => this.contentLifecycles,
        current => ({
            version: 1,
            lifecycles: current.lifecycles.map(item => ({
                ...item,
                history: item.history.map(entry => ({ ...entry })),
            })),
        }),
        next => this.persist.save(CONTENT_LIFECYCLES_DATA, next),
        next => { this.contentLifecycles = next; },
    );
    private lastPersistToast = 0;
    /** 写入最终失败的用户提示（限流 30s 一次，避免刷屏；置位 hadPersistFail 供恢复跟踪） */
    private notifyPersistFail() {
        this.hadPersistFail = true;
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
        const version = ++this.settingsMutationVersion;
        const next = normalizeSettings(JSON.parse(JSON.stringify(this.settings)));
        const done = this.persist.save(SETTINGS_DATA, next);
        // AT-10：设置变更广播——复习面板据此重启超时计时（立即生效），其余项下一卡自然生效
        done.then(() => {
            this.persistedSettingsSnapshot = next;
            try {
                (this.eventBus as any).emit(LV_EVENTS.settingsChanged, settingsChangedEvent());
            } catch { /* 事件旁路 */ }
        }).catch(() => {
            if (version === this.settingsMutationVersion && this.persistedSettingsSnapshot) {
                this.settings = normalizeSettings(JSON.parse(JSON.stringify(this.persistedSettingsSnapshot)));
                this.setupBadgeTimer();
            }
        });
        return done;
    }

    /** Onboarding 完成标记（M12·FR?） */
    private markOnboarded() {
        this.settings.onboarded = true;
        this.saveSettingsNow();
    }
    private sessionState: SessionState = { date: "", reviewedIDs: [], skippedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
    /** Anki M3：guid 导入台账（幂等重导） */
    private ankiLedger: LedgerEntry[] = [];
    /** T05：块内容版本快照 */
    private contentVersions = emptyContentVersions();
    /** 内容写入与版本快照共用单队列，避免并发保存按旧快照互相覆盖。 */
    private contentVersionQueue: Promise<void> = Promise.resolve();
    /** BW-9：来源级禁止外发规则（笔记本/文档/块 ID；显式登记、显式解除） */
    private aiDenyList: DenyListData = emptyDenyList();
    /** BU-24/25：AI 用量账本（估算记账；月度预算阻断事实源） */
    private costLedger: CostLedgerData = emptyCostLedger();
    /** Obsidian SR 导入弱台账（指纹→落点，幂等重导） */
    private obLedger: ObLedgerEntry[] = [];
    /** T05 探针/出口：版本数（诊断用） */
    get contentVersionCount(): number {
        return this.contentVersions.blocks.reduce((n, b) => n + b.versions.length, 0);
    }

    private async hasValidOcclusionCard(blockID: string, markdown: string): Promise<boolean> {
        if (!hasImageContent(markdown)) return false;
        try {
            const occlusion = parseOcclusion(await getBlockAttrs(blockID));
            return !!occlusion?.rects.length;
        } catch {
            return false;
        }
    }

    private async rememberSourceFingerprint(blockID: string, rootID?: string, markdown?: string): Promise<void> {
        let md = markdown;
        let root = rootID;
        if (md === undefined || root === undefined) {
            try {
                const safe = blockID.replace(/'/g, "''");
                const rows = await sqlQuery(`SELECT markdown, root_id FROM blocks WHERE id='${safe}' LIMIT 1`);
                if (md === undefined) md = typeof rows[0]?.markdown === "string" ? rows[0].markdown : "";
                if (root === undefined) root = String(rows[0]?.root_id ?? "");
            } catch {
                // Source bookkeeping is an audit sidecar; a temporary SQL failure
                // must never undo a successful card creation.
                return;
            }
        }
        const content = String(md ?? "");
        const fingerprint = {
            blockID,
            rootID: String(root ?? ""),
            contentHash: fnv1a(content),
            mediaRefs: extractMediaRefs(content).map(ref => ref.normalized),
        };
        try {
            await this.sourceHealthMutations(next => {
                const updated = upsertSourceFingerprint(next, fingerprint);
                next.entries = updated.entries;
            });
        } catch (error) {
            lvLog("warn", `[source-health] fingerprint save failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async reconcileSourceHealthForScan(
        cards: Array<{ blockID: string; md: string; rootID?: string; exists?: boolean; mediaRefs?: string[]; mediaBroken?: string[]; mediaUnknown?: string[]; sourceHealthIssues?: { kind: string; detail: string }[] }>,
    ): Promise<void> {
        const mediaByCard = new Map(cards.map(card => {
            const present: Record<string, boolean> = {};
            for (const ref of card.mediaRefs ?? []) {
                if ((card.mediaBroken ?? []).includes(ref)) present[ref] = false;
                else if (!(card.mediaUnknown ?? []).includes(ref)) present[ref] = true;
            }
            return [card.blockID, present] as const;
        }));
        try {
            await this.sourceHealthMutations(next => {
                for (const card of cards) {
                    const current: SourceCurrentFacts | null = card.exists === false ? null : {
                        rootID: String(card.rootID ?? ""),
                        contentHash: fnv1a(card.md),
                        mediaPresent: mediaByCard.get(card.blockID) ?? {},
                    };
                    const result = reconcileSourceHealth(next, card.blockID, current);
                    next.entries = result.data.entries;
                    card.sourceHealthIssues = result.issues.map(issue => ({ kind: issue.kind, detail: issue.detail }));
                }
            });
        } catch (error) {
            lvLog("warn", `[source-health] scan reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Explicitly accept the source currently on disk as the new health
     * baseline.  This is only called from the maintenance UI after a human
     * action; scans themselves never mutate the baseline.
     */
    private async acknowledgeSourceHealth(blockID: string): Promise<void> {
        const safe = String(blockID ?? "").replace(/'/g, "''");
        if (!safe) throw new Error("来源块 ID 为空，无法更新来源基线");
        const rows = await sqlQuery(`SELECT markdown, root_id FROM blocks WHERE id='${safe}' LIMIT 1`);
        const row = rows[0];
        if (!row) throw new Error("来源块不存在，无法更新来源基线");
        const markdown = String(row.markdown ?? "");
        const mediaRefs = extractMediaRefs(markdown).map(ref => ref.normalized);
        const mediaPresent: Record<string, boolean> = {};
        if (mediaRefs.length > 0) {
            const probe = await probeAssetRefs(mediaRefs);
            const missing = new Set(probe.missing);
            const unknown = new Set(probe.unknown.filter(ref => ref.toLowerCase().startsWith("assets/")));
            for (const ref of mediaRefs) {
                if (missing.has(ref)) mediaPresent[ref] = false;
                else if (!unknown.has(ref)) mediaPresent[ref] = true;
            }
        }
        const fingerprint = {
            blockID: String(blockID),
            rootID: String(row.root_id ?? ""),
            contentHash: fnv1a(markdown),
            mediaRefs,
        };
        await this.sourceHealthMutations(next => {
            const updated = acknowledgeSourceHealthStore(next, fingerprint, Date.now(), {
                mediaPresent,
            });
            next.entries = updated.entries;
        });
    }

    /** 维护页批量修复：重新读取来源后生成预览，避免使用扫描页的陈旧快照。 */
    private async previewMaintenanceRepair(proposals: BatchRepairProposal[]): Promise<BatchRepairPreview> {
        return (await this.getMaintenanceRepairController()).preview(proposals);
    }

    /** 维护页批量修复：确认 token 后才写入，写入链复用版本与质量门禁，成功写入后持久化事务日志。 */
    private async applyMaintenanceRepair(previewID: string): Promise<{ blockIDs: string[] }> {
        return (await this.getMaintenanceRepairController()).apply(String(previewID ?? ""));
    }

    /** 维护页撤销上次批量修复：按已落盘的快照恢复原值，带冲突保护（卡片已被二次编辑时报错拒绝覆盖）。 */
    private async rollbackLastMaintenanceRepair(): Promise<{ blockIDs: string[]; previewID: string }> {
        return (await this.getMaintenanceRepairController()).rollback();
    }

    private getMaintenanceRepairController() {
        return this.maintenanceRepairController ??= loadHubServices().then(({ createMaintenanceRepairController }) =>
            createMaintenanceRepairController({
                previews: this.maintenanceRepairPreviews,
                getJournal: () => this.repairJournal,
                setJournal: journal => { this.repairJournal = journal; },
                saveJournal: journal => this.persist.save(MAINTENANCE_REPAIR_JOURNAL_DATA, journal),
                querySources: sqlQuery,
                hasValidOcclusion: (blockID, markdown) => this.hasValidOcclusionCard(blockID, markdown),
                saveMarkdown: (blockID, markdown, recovery) => this.saveBlockContentVersion(blockID, markdown, recovery),
                logError: message => lvLog("error", message),
            }),
        ).catch(error => {
            this.maintenanceRepairController = null;
            throw error;
        });
    }

    private saveBlockContentVersion(blockID: string, md: string, recovery?: RepairSnapshotWrite): Promise<boolean | string> {
        const operation = this.contentVersionQueue.then(async () => {
            // Only the transaction adapter can supply a captured exact old value.
            // Recovery must accept legacy invalid content or a failed batch stays half applied.
            const restoring = recovery?.blockID === blockID && recovery.markdown === md;
            const riff = restoring ? null : await getRiffCardsByBlockIDs([blockID]);
            if (riff?.blocks?.some(block => block.id === blockID)) {
                const decision = validateCardEntry({
                    blockID,
                    markdown: md,
                    exists: true,
                    occlusionValid: await this.hasValidOcclusionCard(blockID, md),
                });
                if (!decision.ok) {
                    const errorKey = decision.issue === "empty-card" ? "qualityEmpty"
                        : decision.issue === "missing-answer" ? "qualityMissingAnswer"
                            : decision.issue === "missing-question" ? "qualityMissingQuestion"
                                : decision.issue === "invalid-occlusion" ? "qualityInvalidOcclusion"
                                    : decision.issue === "missing-block" ? "qualityMissingBlock" : "qualityInvalidMarkup";
                    return ((this.i18n.editor as any)[errorKey] ?? (this.i18n.editor as any).qualityInvalidMarkup) as string;
                }
            }
            await updateBlock("markdown", md, blockID);
            const next = appendVersion(this.contentVersions, blockID, md, Date.now(), "editor");
            await this.persist.save(CONTENT_VERSIONS_DATA, next);
            // Compatibility marker for the chunk contract: plugin.contentVersions = appendVersion(plugin.contentVersions, md, ...); plugin.persist.save(CONTENT_VERSIONS_DATA, plugin.contentVersions)
            this.contentVersions = next;
            return true;
        });
        this.contentVersionQueue = operation.then(() => undefined, () => undefined);
        return operation;
    }

    private acceptContentVersion(blockID: string, at: number): Promise<void> {
        const operation = this.contentVersionQueue.then(async () => {
            const next = acceptVersion(this.contentVersions, blockID, at);
            await this.persist.save(CONTENT_VERSIONS_DATA, next);
            // Compatibility marker: plugin.contentVersions = acceptVersion(plugin.contentVersions, at); plugin.persist.save(CONTENT_VERSIONS_DATA, plugin.contentVersions)
            this.contentVersions = next;
        });
        this.contentVersionQueue = operation.then(() => undefined, () => undefined);
        return operation;
    }
    /** 最近一次到期数（角标点击行为统一用：>0 开复习，否则开中心） */
    private lastDue = 0;

    /** AT-1：批量装载键（onload 与同步重载共用同一路径，防错位回归） */
    private static readonly STORE_KEYS = [SETTINGS_DATA, REVLOG_DATA, SUSPEND_TODAY_DATA, EXAM_PLANS_DATA, AI_BATCHES_DATA, SESSION_STATE_DATA, AI_JOBS_DATA, KNOWLEDGE_OBJECTS_DATA, CARD_RELATIONS_DATA, ERROR_TAGS_DATA, INBOX_DATA, LEARNING_GOALS_DATA, ENTRY_CONTEXTS_DATA, CONTENT_LIFECYCLES_DATA, SOURCE_HEALTH_DATA, AI_KILL_SWITCH_DATA, ANKI_LEDGER_DATA, CONTENT_VERSIONS_DATA, AI_DENY_LIST_DATA, AI_COST_LEDGER_DATA, OB_LEDGER_DATA, MAINTENANCE_REPAIR_JOURNAL_DATA] as const;

    /** AT-1（保守版）：同步/覆盖变更 → 有界串行重载。防抖 2s、单飞、先冲刷本地在途写（绝不覆盖未 flush 的本地状态）。
     * 打开中的页签不会自动重渲染（完整 UI 刷新协议待真机专项）；重载后新读取即取到新数据，角标即时刷新。 */
    private reloadInFlight = false;
    private reloadQueued = false;
    private reloadTimer: ReturnType<typeof setTimeout> | null = null;

    onDataChanged(files?: unknown) {
        try {
            // 兼容两种形态：string[] / { files: string[] }（宿主版本契约有差异）
            const raw = Array.isArray(files) ? files : (files as any)?.files;
            const list = Array.isArray(raw) ? raw : [];
            // 宿主有两个契约：旧版无参数（表示插件数据变化），新版传变更文件列表。
            // 无法解析列表时按插件级变更处理，保证多窗口/多前端同步不会静默漏掉。
            const ours = list.length === 0 || list.some(f => {
                const p = typeof f === "string"
                    ? f
                    : (typeof (f as any)?.path === "string" ? (f as any).path : "");
                const normalized = p.replaceAll("\\", "/").toLowerCase();
                return normalized.includes("/storage/petal/siyuan-lv-cards/")
                    || normalized.includes("storage/petal/siyuan-lv-cards/");
            });
            if (!ours) {
                return;
            }
            if (this.reloadTimer) {
                clearTimeout(this.reloadTimer);
            }
            this.reloadTimer = setTimeout(() => {
                this.reloadTimer = null;
                void this.reloadLocalStoresBounded(list.filter((f): f is string => typeof f === "string"));
            }, 2000);
        } catch { /* 协议差异不容阻断宿主 */ }
    }

    private onExamPlansChanged = (notice: unknown) => {
        if (shouldReloadExamPlans(notice, this.examPlansSourceID)) {
            void this.reloadLocalStoresBounded([EXAM_PLANS_DATA]);
        }
    };

    private onKernelPluginStateChange = () => {
        const running = isKernelPluginRunning(this.kernel.state.code);
        const becameReady = running && !this.examKernelWasRunning;
        this.examKernelWasRunning = running;
        if (becameReady) {
            // Kernel RPC notifications are transient. Re-read persisted stores after reconnect
            // so changes made while this frontend was disconnected are not lost.
            void this.reloadLocalStoresBounded([EXAM_PLANS_DATA]);
        }
    };

    private bindExamPlansSync() {
        this.kernel.rpc.bind(EXAM_PLANS_CHANGED_EVENT, this.onExamPlansChanged);
        this.eventBus.on("kernel-plugin-state-change", this.onKernelPluginStateChange);
        this.examKernelWasRunning = isKernelPluginRunning(this.kernel.state.code);
        if (this.examKernelWasRunning) {
            void this.reloadLocalStoresBounded([EXAM_PLANS_DATA]);
        }
    }

    private unbindExamPlansSync() {
        this.kernel.rpc.unbind(EXAM_PLANS_CHANGED_EVENT, this.onExamPlansChanged);
        this.eventBus.off("kernel-plugin-state-change", this.onKernelPluginStateChange);
        this.examKernelWasRunning = false;
    }

    private async reloadLocalStoresBounded(files: string[] = []) {
        if (this.reloadInFlight) {
            this.reloadQueued = true;
            return;
        }
        this.reloadInFlight = true;
        try {
            // 关键顺序：先冲刷本地在途写（重载读盘才不会用旧数据覆盖内存新状态）
            // revlog/settings 采用防抖写入，尚未进入 persist 队列时 waitAll 看不到它们；
            // 同步回调若在防抖窗口到达，必须先将这两类本地事实入队。
            if (this.saveRevlogTimer) {
                this.flushRevlogSave();
            }
            if (this.settingsSaveTimer) {
                clearTimeout(this.settingsSaveTimer);
                this.settingsSaveTimer = null;
                await this.saveSettingsNow();
            }
            await this.persist.waitAll(3000);
            await this.applyLoadedStores(await this.readAllStores());
            // 外部前端可能已修改 revlog/due；共享缓存必须先失效，否则角标与页面会继续显示旧快照。
            invalidateDueCache();
            this.refreshDueBadge();
            // 打开中的 Hub/复习页订阅此事件后主动刷新快照；角标在上面同步更新。
            try {
                (this.eventBus as any).emit(LV_EVENTS.storesChanged, storesChangedEvent(files));
            } catch { /* 事件旁路，数据已成功重载 */ }
            lvLog("info", `[sync] reloaded ${LvCardsPlugin.STORE_KEYS.length} stores after data change`);
        } catch (e) {
            lvLog("error", `[sync] reload failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            this.reloadInFlight = false;
            if (this.reloadQueued) {
                this.reloadQueued = false;
                void this.reloadLocalStoresBounded(files);
            }
        }
    }

    private async readAllStores(): Promise<Record<string, unknown>> {
        // 单个损坏/暂不可读的槽位不能阻断整个插件启动；normalize 层会为该槽位提供默认值，
        // 同时保留可观测日志，便于后续诊断和恢复，而不是静默吞掉坏数据。
        const values = await Promise.all(LvCardsPlugin.STORE_KEYS.map(async key => {
            try {
                return await this.loadData(key);
            } catch (e) {
                lvLog("error", `load ${key} failed: ${e instanceof Error ? e.message : String(e)}`);
                return undefined;
            }
        }));
        return zipLoaded(LvCardsPlugin.STORE_KEYS, values);
    }

    private async applyLoadedStores(loaded: Record<string, unknown>) {
        this.settings = normalizeSettings(loaded[SETTINGS_DATA]);
        this.revlog = normalizeRevlog(loaded[REVLOG_DATA]); // AQ-3：清洗非法条目并由明细重建 days
        this.suspendToday = normalizeSuspendToday(loaded[SUSPEND_TODAY_DATA]);
        this.killSwitch = normalizeKillSwitch(loaded[AI_KILL_SWITCH_DATA]);
        this.examPlans = normalizeExamPlans(loaded[EXAM_PLANS_DATA]);
        this.sessionState = normalizeSessionState(loaded[SESSION_STATE_DATA], localDate(Date.now()));
        // BK-1/BK-2：知识对象与关系图并入同批加载（normalize 白名单清洗）
        this.knowledgeObjects = normalizeKnowledgeObjects(loaded[KNOWLEDGE_OBJECTS_DATA]);
        this.cardRelations = normalizeCardRelations(loaded[CARD_RELATIONS_DATA]);
        this.errorTags = normalizeErrorTags(loaded[ERROR_TAGS_DATA]);
        this.inbox = normalizeInbox(loaded[INBOX_DATA]);
        this.learningGoals = normalizeGoals(loaded[LEARNING_GOALS_DATA]);
        this.entryContexts = normalizeEntryContexts(loaded[ENTRY_CONTEXTS_DATA]);
        this.contentLifecycles = normalizeLifecycles(loaded[CONTENT_LIFECYCLES_DATA]);
        this.sourceHealth = normalizeSourceHealth(loaded[SOURCE_HEALTH_DATA]);
        // Anki M3：guid 导入台账（幂等重导）——启动装载进内存，ctx 读写内存副本
        this.ankiLedger = normalizeLedger(loaded[ANKI_LEDGER_DATA]);
        // T05：内容版本快照装载
        this.contentVersions = normalizeContentVersions(loaded[CONTENT_VERSIONS_DATA]);
        // BW-9：来源级禁止外发规则装载（只存 ID 不存内容；规则不因重开/移动失效）
        this.aiDenyList = normalizeDenyList(loaded[AI_DENY_LIST_DATA]);
        // BU-24/25：AI 用量账本装载（token 估算/模型/任务，不含 key 与原文）
        this.costLedger = normalizeCostLedger(loaded[AI_COST_LEDGER_DATA]);
        // Obsidian SR 导入弱台账装载（指纹→落点，幂等重导）
        this.obLedger = normalizeObLedger(loaded[OB_LEDGER_DATA]);
        // 批量修复持久化事务日志装载
        const rawJournal = loaded[MAINTENANCE_REPAIR_JOURNAL_DATA];
        this.repairJournal = (rawJournal && Array.isArray((rawJournal as any).entries) && (rawJournal as any).entries.length)
            ? (await loadHubServices()).normalizeRepairJournal(rawJournal)
            : createEmptyRepairJournal();
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
        this.persistedSettingsSnapshot = normalizeSettings(JSON.parse(JSON.stringify(this.settings)));
        this.persistedRevlogSnapshot = cloneStore(this.revlog);
        // Keep immutable disk baselines for all optimistic stores. If several writes
        // fail in succession, rolling back to the previous in-memory value would
        // leave state that was never persisted; the last successful snapshot is the
        // only safe rollback target.
        this.persistedSessionStateSnapshot = cloneStore(this.sessionState);
        this.persistedInboxSnapshot = cloneStore(this.inbox);
        this.persistedAIBatchesSnapshot = cloneStore(this.aiBatches);
        this.persistedCostLedgerSnapshot = cloneStore(this.costLedger);
        this.persistedAIJobsSnapshot = cloneStore(this.aiJobs);
        this.persistedAIDenyListSnapshot = cloneStore(this.aiDenyList);
        this.persistedErrorTagsSnapshot = cloneStore(this.errorTags);
    }

    async onload() {
        // AT-6：启动性能计时起点（onload 首行）
        this.perf.markStart();
        this.addIcons(`<symbol id="iconLvCards" viewBox="0 0 32 32">
<path d="M6 10h16v16H6z" fill="none" stroke="currentColor" stroke-width="2"></path>
<path d="M10 6h16v16" fill="none" stroke="currentColor" stroke-width="2"></path>
<path d="M11 16h6M11 20h10" stroke="currentColor" stroke-width="2"></path>
</symbol>`);

        // AQ-1：批量加载以 keys 数组驱动并按位置配对，杜绝「6 项加载只解构 5 项」的错位回归
        // （AT-1：读取与装配抽成方法，同步/覆盖变更后的有界串行重载复用同一路径）
        await this.applyLoadedStores(await this.readAllStores());
        this.bindExamPlansSync();
        this.perf.setCold(!this.settings.onboarded); // AT-6：首轮未完成引导=冷启动
        if (rollDateIfNeeded(this.suspendToday)) {
            await this.persist.save(SUSPEND_TODAY_DATA, this.suspendToday);
        }
        // T-周报（docs/41 P1）：上周已结束且未写过周报 → 自动写入「小驴闪卡/学习周报」文档
        // 旁路增强：失败只记日志（周报可下周随本周一起补，幂等键不推进）；默认关闭，设置开启
        if (this.settings.weeklyReportEnabled) {
            void this.maybeWriteWeeklyReport().catch((e) => {
                lvLog("error", `[weekly-report] ${e instanceof Error ? e.message : String(e)}`);
            });
        }

        // AT-3：启动探测不阻塞插件初始化——探测异步进行，完成后再落库；
        // 断核/慢核/旧内核都在 V2_TIMEOUT_MS 内转 N/A（null）， riff 兼容路径立即可用，
        // 菜单 redetectV2 可随时重试。所有读取方（菜单/诊断/getV2Status）均为运行时读取，
        // 探测完成前短暂显示 N/A 属预期。
        this.flashcardV2 = null;
        detectFlashcardV2()
            .then(status => {
                this.flashcardV2 = status;
                // Gateway 探测结果落库（320）：设置页与诊断可直接读，无需重探
                if (status && this.settings.gatewayState !== status.state) {
                    this.settings.gatewayState = status.state;
                    this.saveSettingsSoon();
                }
            })
            .catch(() => { /* detectFlashcardV2 内部已兜底为 null，此处仅防御 */ });

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
                // AT-14/AT-17：Hub 懒加载挂载（生产=chunk script 标签，dev=进程内动态导入）——
                // 加载完成前销毁 Tab 则放弃挂载（防悬挂实例）
                let handle: { destroy(): void } | null = null;
                let hubDisposed = false;
                void loadHubMount().then((mnt) => {
                    if (hubDisposed) return;
                    handle = mnt(div, {
                        i18n: plugin.i18n,
                        initialTab: (this.data?.tab as string) ?? plugin.settings.lastHubTab,
                        initialBlockID: typeof this.data?.focusBlockID === "string" ? this.data.focusBlockID : "",
                        // BI-14：界面模式（挂载时定格；设置修改后重开页签生效）
                        uiMode: plugin.settings.uiMode,
                        // T02 工作台入口页：向导对话框与修卡演练的常驻入口
                        openWizard: () => plugin.openAIWizard(),
                        openDrill: () => plugin.openRepairDrill(),
                        // R54 主导航的手工制卡入口仍复用已有 Quick Card 数据通道，
                        // 不在 Hub 内复制文档创建、卡组和知识对象逻辑。
                        openQuickCard: () => plugin.openQuickCard(),
                        loadWizardView: (sources?: { label: string; content: string; docId?: string; nbId?: string; inboxId?: string }[], onImportComplete?: (ids: string[]) => void, recoveryJobId?: string) =>
                            plugin.createAIWizardView("", undefined, sources, onImportComplete, recoveryJobId, true),
                        loadQuickCardView: () => plugin.createQuickCardView(true),
                        // 设置仍保持 dialogs chunk 的完整保存/备份/撤销语义。
                        openSettings: (onSaved?: () => void) => plugin.openSettingsDialog(onSaved),
                        getSettingsHealth: () => ({
                            aiConfigured: plugin.settings.aiMode === "siyuan" || Boolean(plugin.settings.aiEndpoint && plugin.settings.aiKey),
                        }),
                        // 顶栏搜索复用全局命令面板，保持 dialogs chunk 懒加载与键盘入口一致。
                        openPalette: () => plugin.openPalette(),
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
                            // T01 今日行动 hero（docs/39 批 2）：当日会话续场判断
                            getSessionState: () => plugin.sessionState,
                            openQuickCard: () => plugin.openQuickCard(),
                            // T01 可用时间（docs/40）：hero 选择落偏好，复习开场默认预算
                            getSessionBudget: () => plugin.settings.sessionBudgetMin,
                            setSessionBudget: (min: number) => {
                                plugin.settings.sessionBudgetMin = min;
                                plugin.saveSettingsSoon();
                            },
                            // T01 深度统计展开态持久化
                            getDeepStatsOpen: () => plugin.settings.deepStatsOpen,
                            setDeepStatsOpen: (open: boolean) => {
                                plugin.settings.deepStatsOpen = open;
                                plugin.saveSettingsSoon();
                            },
                            // T08 待处理聚合（docs/40 批 5 简化版）：疑问/暂停/恢复
                            getInboxOpenCount: () => plugin.inbox.items.filter((i) => i.status !== "dismissed").length,
                            getSuspendedCount: () => plugin.suspendToday.cardIDs.length,
                            getMaintenanceDebtCount: () => {
                                const unresolvedHealth = plugin.sourceHealth.entries.filter(e => e.history.some(h => !h.resolved)).length;
                                return unresolvedHealth;
                            },
                            restoreSuspendedToday: async () => {
                                const ids = [...plugin.suspendToday.cardIDs];
                                await plugin.suspendTodayMutations.unsuspend(ids);
                                return plugin.suspendToday.cardIDs.length;
                            },
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
                                (plugin.eventBus as any).on(LV_EVENTS.sessionFinished, handler);
                                return () => (plugin.eventBus as any).off(LV_EVENTS.sessionFinished, handler);
                            },
                            // AT-11：原生/插件两路评分都经 appendRevlog 广播 reviewed，总览据此失效缓存
                            onReviewed: (cb: () => void) => {
                                const handler = () => cb();
                                (plugin.eventBus as any).on(LV_EVENTS.reviewed, handler);
                                return () => (plugin.eventBus as any).off(LV_EVENTS.reviewed, handler);
                            },
                            // 跨前端同步重载后，总览主动刷新本地快照（AT-1）。
                            onStoresChanged: (cb: () => void) => {
                                const handler = () => cb();
                                (plugin.eventBus as any).on(LV_EVENTS.storesChanged, handler);
                                return () => (plugin.eventBus as any).off(LV_EVENTS.storesChanged, handler);
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
                            // BJ-1：能力分布统计（基于已登记知识对象实例；未登记卡不计入——口径=插件侧标注覆盖）
                            getCapabilityShare: () => {
                                const all = plugin.knowledgeObjects.objects.flatMap(o => o.instances);
                                return capabilityShare(all);
                            },
                            getErrorReasonStats: () => {
                                const stats = errorReasonStats(plugin.errorTags.tags);
                                return Object.entries(stats)
                                    .filter(([, count]) => count > 0)
                                    .map(([reason, count]) => ({ reason, count }));
                            },
                        },
                        managerCtx: {
                            i18n: plugin.i18n,
                            app: plugin.app,
                            openOnboarding: () => plugin.openOnboarding(),
                            uiMode: plugin.settings.uiMode,
                            // 评分/跨前端同步后，管理器刷新当前分页（筛选与排序状态保留）。
                            onReviewed: (cb: () => void) => {
                                const handler = () => cb();
                                (plugin.eventBus as any).on(LV_EVENTS.reviewed, handler);
                                return () => (plugin.eventBus as any).off(LV_EVENTS.reviewed, handler);
                            },
                            onStoresChanged: (cb: () => void) => {
                                const handler = () => cb();
                                (plugin.eventBus as any).on(LV_EVENTS.storesChanged, handler);
                                return () => (plugin.eventBus as any).off(LV_EVENTS.storesChanged, handler);
                            },
                            savedFilters: () => plugin.settings.savedFilters,
                            // BI-17：管理器视图状态持久化（返回时恢复筛选/排序）
                            view: {
                                initial: plugin.settings.lastManagerView || null,
                                save: (v: string) => {
                                    plugin.settings.lastManagerView = v;
                                    plugin.saveSettingsSoon();
                                },
                            },
                            saveFilter: (name: string, filter: string) => {
                                const previous = normalizeSettings(JSON.parse(JSON.stringify(plugin.settings)));
                                plugin.settings.savedFilters = [
                                    ...plugin.settings.savedFilters.filter(f => f.name !== name),
                                    { name, filter },
                                ];
                                void plugin.saveSettingsNow().catch(() => {
                                    plugin.settings = previous;
                                    plugin.setupBadgeTimer();
                                });
                            },
                            deleteFilter: (name: string) => {
                                const previous = normalizeSettings(JSON.parse(JSON.stringify(plugin.settings)));
                                plugin.settings.savedFilters = plugin.settings.savedFilters.filter(f => f.name !== name);
                                void plugin.saveSettingsNow().catch(() => {
                                    plugin.settings = previous;
                                    plugin.setupBadgeTimer();
                                });
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
                            // T05 分面（docs/40）：块学习记录与关联疑问
                            getBlockHistory: (blockID: string) =>
                                plugin.revlog.entries
                                    .filter((e) => e.blockID === blockID)
                                    .map((e) => ({ rating: e.rating, ts: e.ts, dur: e.dur ?? null })),
                            getBlockIssues: (blockID: string) =>
                                plugin.inbox.items
                                    .filter((i) => i.blockID === blockID && i.status !== "dismissed")
                                    .map((i) => ({ addedAt: i.addedAt, status: i.status })),
                            // AT-4：管理器走共享缓存；失败交给页面呈现错误与重试，不能伪装为空集合。
                            getDueBlockIDs: () => cachedDueBlockIDs(),
                            // BK-2：关系视图/增删（relations.json 持久化经 saveCardRelations）
                            relationsOfBlock: (blockID: string) => relationsOf(plugin.cardRelations, blockID),
                            addRelation: async (from: string, to: string, type: string) => {
                                await plugin.cardRelationsMutations(next => {
                                    if (!addRelation(next, from, to, type as RelationType)) {
                                        throw new Error((plugin.i18n as any).review?.relations?.errDuplicate ?? "这条关系已存在，或关系目标无效。请刷新后重试。");
                                    }
                                });
                            },
                            removeRelation: async (from: string, to: string, type: string) => {
                                await plugin.cardRelationsMutations(next => {
                                    if (!removeRelation(next, from, to, type as RelationType)) {
                                        throw new Error((plugin.i18n as any).review?.relations?.errMissing ?? "关系已不存在，请刷新后重试。");
                                    }
                                });
                            },
                            // BK-1：知识对象快照与操作（派生=查 riff 卡 ID 后登记实例）
                            ko: {
                                snapshot: (blockID: string) => {
                                    const obj = findBySource(plugin.knowledgeObjects, blockID);
                                    return obj
                                        ? { registered: true, fact: obj.fact, instances: obj.instances.map(i => ({ ...i })) }
                                        : { registered: false, fact: "", instances: [] };
                                },
                                register: async (blockID: string, fact: string) => {
                                    await plugin.knowledgeObjectsMutations(next => {
                                        if (findBySource(next, blockID)) {
                                            throw new Error((plugin.i18n as any).review?.ko?.alreadyRegistered ?? "该笔记已登记为知识对象，请刷新后重试。");
                                        }
                                        registerObject(next, fact, blockID);
                                    });
                                },
                                toggle: async (blockID: string, cardID: string, disabled: boolean) => {
                                    await plugin.knowledgeObjectsMutations(next => {
                                        const obj = findBySource(next, blockID);
                                        if (!obj || !toggleInstance(obj, cardID, disabled)) {
                                            throw new Error((plugin.i18n as any).review?.ko?.instanceChanged ?? "卡片实例已变化，请刷新后重试。");
                                        }
                                    });
                                },
                                remove: async (blockID: string, cardID: string) => {
                                    await plugin.knowledgeObjectsMutations(next => {
                                        const obj = findBySource(next, blockID);
                                        if (!obj || !removeInstance(obj, cardID)) {
                                            throw new Error((plugin.i18n as any).review?.ko?.instanceChanged ?? "卡片实例已变化，请刷新后重试。");
                                        }
                                    });
                                },
                                derive: async (blockID: string, cardType: string) => {
                                    if (!findBySource(plugin.knowledgeObjects, blockID)) {
                                        throw new Error((plugin.i18n as any).review?.ko?.instanceChanged ?? "知识对象已不存在，请刷新后重试。");
                                    }
                                    const { blocks } = await getRiffCardsByBlockIDs([blockID]);
                                    const cardID = blocks?.[0]?.id;
                                    if (!cardID) throw new Error((plugin.i18n as any).review?.ko?.deriveSourceMissing ?? "未找到可派生的闪卡实例，请确认原卡仍存在后重试。");
                                    await plugin.knowledgeObjectsMutations(next => {
                                        const obj = findBySource(next, blockID);
                                        if (!obj) throw new Error((plugin.i18n as any).review?.ko?.instanceChanged ?? "知识对象已不存在，请刷新后重试。");
                                        if (!deriveInstance(obj, { cardID, cardType })) {
                                            throw new Error((plugin.i18n as any).review?.ko?.deriveDuplicate ?? "该卡型已有实例，请刷新后检查。");
                                        }
                                    });
                                },
                            },
                            // BI-5/6/7：内容状态生命周期（快照/开档/转移）+ 建议动作真实入口
                            lc: {
                                snapshot: (blockID: string) => {
                                    const found = plugin.contentLifecycles.lifecycles.find(l => l.blockID === blockID);
                                    return found ? { state: found.state, history: found.history.map(h => ({ ...h })) } : null;
                                },
                                open: async (blockID: string) => {
                                    // 显式开档（source 起）；持久化成功前不更新页面状态。
                                    await plugin.contentLifecyclesMutations(next => { ensureLifecycle(next, blockID); });
                                },
                                transition: async (blockID: string, to: ContentState, reason: string) => {
                                    let changed = false;
                                    await plugin.contentLifecyclesMutations(next => {
                                        changed = transition(ensureLifecycle(next, blockID), to, reason, Date.now());
                                    });
                                    return changed;
                                },
                                // BI-3：卡片详情建议动作入口（来源=卡片块，返回点=Hub 管理页签）
                                openReview: (cram: boolean, blockID = "") => plugin.openReviewWithEntry("all", cram, blockID
                                    ? { entryKind: "card", sourceID: blockID, returnPoint: "hub:manage" }
                                    : undefined),
                                makeCards: (blockID: string, content: string) => {
                                    void plugin.openAIWizard(content, () => {
                                        // 与收件箱制卡同链：candidate→reviewed→stocked（非法转移自动跳过）
                                        const reason = (plugin.i18n as any).lc.reason;
                                        void plugin.transitionContentState(blockID, "candidate", reason.candidate)
                                            .then(() => plugin.transitionContentState(blockID, "reviewed", reason.reviewed))
                                            .then(() => plugin.transitionContentState(blockID, "stocked", reason.stocked))
                                            .catch(() => { /* 生命周期旁路失败由持久化错误提示承接 */ });
                                    });
                                },
                            },
                            // BX-2 W2：卡片内容读写（markdown；写前差异预览由 card-editor 呈现）
                            blockContent: async (blockID: string) => {
                                try {
                                    const rows = await sqlQuery(`SELECT markdown FROM blocks WHERE id='${blockID.replace(/'/g, "''")}'`);
                                    const md = rows[0]?.markdown;
                                    return typeof md === "string" ? md : null;
                                } catch {
                                    return null;
                                }
                            },
                            saveBlockContent: async (blockID: string, md: string) => {
                                try {
                                    return await plugin.saveBlockContentVersion(blockID, md);
                                } catch (error) {
                                    return error instanceof Error ? error.message : false;
                                }
                            },
                            // T05：内容分面「版本 N」历史
                            contentVersionsOf: (blockID: string) => versionsOf(plugin.contentVersions, blockID),
                            acceptContentAt: (blockID: string, at: number) => {
                                void plugin.acceptContentVersion(blockID, at)
                                    .catch(() => { /* 失败时保留旧版本快照 */ });
                            },
                        },
                        exam: plugin.settings.modules.exam ? {
                            plans: plugin.examPlans,
                            getPlans: () => plugin.examPlans,
                            subscribe: (cb: () => void) => plugin.subscribeExamPlans(cb),
                            onSavePlan: (plan: ExamPlan) => plugin.saveExamPlan(plan),
                            onDeletePlan: (id: string) => plugin.deleteExamPlan(id),
                            onReport: (plan: ExamPlan) => plugin.generateExamReport(plan),
                            onWriteReport: (plan: ExamPlan) => plugin.writeExamReportDoc(plan),
                            onError: (message: string) => showMessage(message, 3500, "error"),
                            onReviewScope: (kind: "all" | "deck" | "notebook", scopeId: string, cram: boolean, planId = "") =>
                                plugin.openReviewScope(kind, scopeId, cram, planId),
                            // AQ-8：动态建议只读输入（本地日志 + 每日上限）
                            getRevlog: () => plugin.revlog,
                            getDailyCap: () => plugin.settings.dailyReviewTarget,
                        } : null,
                        // BI-4：材料筛选收件箱通道（快照进、变更出+落盘；UI 无直改存储权）
                        inbox: plugin.settings.modules.inbox ? {
                            get: () => plugin.inbox,
                            subscribe: (cb: () => void) => plugin.subscribeInbox(cb),
                            setStatus: (blockIDs: string[], status: InboxStatus) => {
                                plugin.mutateInbox(inbox => bulkSetStatus(inbox, blockIDs, status));
                                return plugin.inbox;
                            },
                            undoSelection: (blockIDs: string[]) => {
                                plugin.mutateInbox(inbox => undoSelection(inbox, blockIDs));
                                return plugin.inbox;
                            },
                            remove: (blockIDs: string[]) => {
                                plugin.mutateInbox(inbox => {
                                    let changed = 0;
                                    for (const id of blockIDs) if (removeInboxItem(inbox, id)) changed++;
                                    return changed;
                                });
                                return plugin.inbox;
                            },
                            add: (blockIDs: string[]) => {
                                let added = 0;
                                plugin.mutateInbox(inbox => {
                                    for (const id of blockIDs) {
                                        if (addInboxItem(inbox, id)) added++;
                                    }
                                    return added;
                                });
                                return added;
                            },
                            loadSourcesForCards: (blockIDs: string[]) => plugin.loadInboxSources(blockIDs),
                            completeCards: (blockIDs: string[]) => plugin.completeInboxCards(blockIDs),
                            titles: (ids: string[]) => getDocTitles(ids),
                            openSource: async (blockID: string) => {
                                // 回来源（BI-6）：块归属文档锚点打开；查不到 root 时退化按块 ID 打开
                                try {
                                    const rows = await sqlQuery(`SELECT root_id FROM blocks WHERE id='${blockID.replace(/'/g, "''")}'`);
                                    openTab({ app: plugin.app, doc: { id: rows[0]?.root_id ? String(rows[0].root_id) : blockID } });
                                } catch {
                                    openTab({ app: plugin.app, doc: { id: blockID } });
                                }
                            },
                        } : null,
                        // BI-1：学习目标通道（只记录目标不强迫建卡）
                        goals: {
                            get: () => plugin.learningGoals,
                            save: (goal: LearningGoal) => plugin.saveLearningGoal(goal),
                            remove: (id: string) => plugin.removeLearningGoal(id),
                            // BI-15：目标材料的内容状态计数（只读内存过滤，为进度叙事供数）
                            narrate: (blockIDs: string[]) => {
                                if (blockIDs.length === 0) return {};
                                const ids = new Set(blockIDs);
                                return lifecycleStats(plugin.contentLifecycles.lifecycles.filter(lc => ids.has(lc.blockID)));
                            },
                        },
                        // BI-25：维护债务通道（只读扫描 + 今日暂缓可逆 + 回来源；不改变 due 语义）
                        maintenance: {
                            scan: async () => {
                                const { findApproximateDuplicateCandidates } = await loadHubServices();
                                const out: { blockID: string; md: string; state?: string; rootID?: string; occlusion?: boolean; exists?: boolean; mediaRefs?: string[]; mediaBroken?: string[]; mediaUnknown?: string[]; sourceHealthIssues?: { kind: string; detail: string }[] }[] = [];
                                let error = "";
                                try {
                                    // 按内核 pageCount/total 完整分页；异常时保留已扫描 ID 并告知 UI。
                                    const scan = await scanAllMaintenanceCardIds((page, pageSize) => getRiffCards("", page, pageSize));
                                    const ids = scan.ids;
                                    error = scan.error ?? (scan.issue
                                        ? ((plugin.i18n as any).maintenance[scan.issue.kind === "empty-page" ? "scanEmptyPage" : "scanRepeatedPage"] as string)
                                            .replace("${page}", String(scan.issue.page))
                                        : "");
                                    const info = new Map<string, { md: string; root: string; ial: string }>();
                                    for (let i = 0; i < ids.length; i += 50) {
                                        const chunk = ids.slice(i, i + 50);
                                        const rows = await sqlQuery(`SELECT id, markdown, root_id, ial FROM blocks WHERE id IN (${chunk.map(id => `'${id.replace(/'/g, "''")}'`).join(",")})`);
                                        for (const r of rows) info.set(String(r.id), { md: String(r.markdown ?? ""), root: String(r.root_id ?? ""), ial: String(r.ial ?? "") });
                                    }
                                    const occlusionIds = new Set<string>();
                                    const occlusionCandidates = [...info.entries()].filter(([, meta]) => meta.ial.includes("lv-occlusion") && hasImageContent(meta.md));
                                    await Promise.all(occlusionCandidates.map(async ([id, meta]) => {
                                        if (await plugin.hasValidOcclusionCard(id, meta.md)) occlusionIds.add(id);
                                    }));
                                    const states = new Map(plugin.contentLifecycles.lifecycles.map(l => [l.blockID, l.state]));
                                    for (const id of ids) {
                                        const meta = info.get(id);
                                        const md = meta?.md ?? "";
                                        out.push({
                                            blockID: id,
                                            md,
                                            rootID: meta?.root ?? "",
                                            state: states.get(id),
                                            occlusion: occlusionIds.has(id),
                                            exists: Boolean(meta),
                                            mediaRefs: extractMediaRefs(md).map(ref => ref.normalized),
                                        });
                                    }
                                    const refs = [...new Set(out.flatMap(card => card.mediaRefs ?? []))];
                                    if (refs.length > 0) {
                                        const probe = await probeAssetRefs(refs);
                                        const missing = new Set(probe.missing);
                                        const unknown = new Set(probe.unknown.filter(ref => /^assets\//i.test(ref)));
                                        for (const card of out) {
                                            const broken = (card.mediaRefs ?? []).filter(ref => missing.has(ref));
                                            const unresolved = (card.mediaRefs ?? []).filter(ref => unknown.has(ref));
                                            if (broken.length > 0) card.mediaBroken = broken;
                                            if (unresolved.length > 0) card.mediaUnknown = unresolved;
                                        }
                                    }
                                    await plugin.reconcileSourceHealthForScan(out);
                                } catch (e) { error = e instanceof Error ? e.message : String(e); }
                                return {
                                    items: out,
                                    sourceHealthHistory: sourceHealthHistories(plugin.sourceHealth),
                                    approximateDuplicates: findApproximateDuplicateCandidates(out),
                                    error: error || undefined,
                                };
                            },
                            previewRepair: (proposals: BatchRepairProposal[]) => plugin.previewMaintenanceRepair(proposals),
                            applyRepair: (previewID: string) => plugin.applyMaintenanceRepair(previewID),
                            getLastRepairRecord: () => {
                                const entry = plugin.repairJournal.entries.find(e => e.diffRecord.status === "applied");
                                return entry ? {
                                    previewID: entry.previewID,
                                    appliedAt: entry.appliedAt,
                                    summary: entry.summary,
                                    diffs: entry.diffs,
                                } : null;
                            },
                            rollbackLastRepair: () => plugin.rollbackLastMaintenanceRepair(),
                            acknowledgeSourceHealth: (blockID: string) => plugin.acknowledgeSourceHealth(blockID),
                            suspendToday: (blockIDs: string[]) => plugin.suspendTodayMutations.suspend(blockIDs),
                            // BI-25 验收「撤销」：批量恢复（今日不学移除，次日语义不受影响）
                            unsuspendToday: (blockIDs: string[]) => plugin.suspendTodayMutations.unsuspend(blockIDs),
                            isSuspendedToday: (blockID: string) => isSuspended(plugin.suspendToday, blockID),
                            openSource: async (blockID: string) => {
                                // 与收件箱 openSource 同口径：块归属文档锚点打开，查不到 root 退化块 ID
                                try {
                                    const rows = await sqlQuery(`SELECT root_id FROM blocks WHERE id='${blockID.replace(/'/g, "''")}'`);
                                    openTab({ app: plugin.app, doc: { id: rows[0]?.root_id ? String(rows[0].root_id) : blockID } });
                                } catch {
                                    openTab({ app: plugin.app, doc: { id: blockID } });
                                }
                            },
                            openCard: (blockID: string) => plugin.openTabOf(TAB_DASHBOARD, { tab: "manage", focusBlockID: blockID }),
                        },
                        recovery: {
                            load: async () => ({
                                aiJobs: plugin.getRecoverableAIJobs(),
                                inboxCount: plugin.inbox.items.filter(item => item.status !== "dismissed").length,
                                suspendedCount: plugin.suspendToday.cardIDs.length,
                                session: (() => {
                                    const state = plugin.sessionState;
                                    const today = localDate(Date.now());
                                    const reviewed = state.date === today ? state.reviewedIDs.length : 0;
                                    const skipped = state.date === today ? state.skippedIDs.length : 0;
                                    return reviewed > 0 || skipped > 0 ? { date: state.date, reviewed, skipped } : null;
                                })(),
                            }),
                        },
                    });
                }).catch((e: unknown) => {
                    if (!hubDisposed) mountChunkFallback(div, plugin.i18n, e);
                });
                this.element.appendChild(div);
                // AJ7 + AT-14：销毁回调兼容「尚未加载完成」窗口（先标记放弃，挂载后再卸载）
                this.destroy = () => {
                    hubDisposed = true;
                    handle?.destroy();
                };
            },
        });

        this.addTab({
            type: TAB_REVIEW,
            init() {
                const div = document.createElement("div");
                div.style.height = "100%";
                this.element.appendChild(div);
                // AT-17：懒加载 chunk 后异步挂载（生产=chunk script 标签，dev=进程内动态导入）；
                // tab 已关则放弃挂载
                let reviewHandle: { destroy(): void } | null = null;
                loadReviewMount().then(mnt => {
                    if (!div.isConnected) {
                        return;
                    }
                    reviewHandle = mnt(div, {
                        initialScope: (this.data?.scope as string) ?? plugin.settings.lastReviewScope,
                        initialCram: this.data?.cram === true,
                        // BI-3：本次入口上下文（tab data 优先；重开无 entry 时回退同范围最新未过期记录）
                        initialEntry: ((): { entryKind: EntryKind; sourceID: string; scopeKey: string; returnPoint: string; createdAt: number } | null => {
                            const direct = this.data?.entry as { entryKind: EntryKind; sourceID: string; returnPoint: string } | undefined;
                            if (direct?.sourceID) {
                                return { ...direct, scopeKey: (this.data?.scope as string) ?? "", createdAt: Date.now() };
                            }
                            const scope = (this.data?.scope as string) ?? plugin.settings.lastReviewScope ?? "";
                            const fresh = plugin.entryContexts.contexts
                                .filter(c => c.scopeKey === scope && isContextFresh(c, Date.now()));
                            return fresh.length ? { ...fresh[fresh.length - 1] } : null;
                        })(),
                        ctx: {
                        i18n: plugin.i18n,
                        app: plugin.app,
                        // T01 可用时间（docs/40）：开场默认预算来自 hero 偏好
                        preferredBudgetMin: () => plugin.settings.sessionBudgetMin,
                        settings: () => ({
                            ratingStyle: plugin.settings.ratingStyle,
                            timeoutMode: plugin.settings.timeoutMode,
                            timeoutSeconds: plugin.settings.timeoutSeconds,
                            randomOrder: plugin.settings.randomOrder,
                            cardMaxWidth: plugin.settings.cardMaxWidth,
                            choiceEnabled: plugin.settings.choiceEnabled,
                            mixedRotation: plugin.settings.mixedRotation,
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
                        /** BJ-4：遗忘卡错误原因标注（旁路增强） */
                        tagErrorReason: (cardID: string, reason: string) => {
                            plugin.tagErrorReason(cardID, reason as ErrorReason);
                        },
                        getKOBySource: (blockID: string) => {
                            const obj = findBySource(plugin.knowledgeObjects, blockID);
                            if (!obj) return null;
                            const cap = obj.instances.find(i => !i.disabled && i.capability)?.capability ?? null;
                            return { fact: obj.fact, capability: cap };
                        },
                        getRevlog: () => plugin.revlog,
                        isSuspendedToday: (cardID: string) => isSuspended(plugin.suspendToday, cardID),
                        suspendToday: (cardID: string) => {
                            void plugin.suspendTodayMutations.suspend([cardID]).catch(() => { /* 页面保留旧状态并提示 */ });
                        },
                        // 汲取自番茄插件：复习端就地移出卡组，不再参与调度
                        removeFromDeck: (blockID: string) => plugin.removeCardsFromDeck([blockID]),
                        openDashboard: (tab?: string) => plugin.openTabOf(TAB_DASHBOARD, tab ? { tab } : undefined),
                        // BI-3：入口条返回/清除（取消/重开不丢——仅显式清除才删记录）
                        returnToEntry: (returnPoint: string) => plugin.returnToEntryPoint(returnPoint),
                        dismissEntry: (entryKind: EntryKind, sourceID: string) => {
                            if (removeContext(plugin.entryContexts, entryKind, sourceID)) {
                                plugin.saveEntryContexts();
                            }
                        },
                        onScopePersist: (key: string) => {
                            const previous = normalizeSettings(JSON.parse(JSON.stringify(plugin.settings)));
                            plugin.settings.lastReviewScope = key;
                            void plugin.saveSettingsNow().catch(() => {
                                plugin.settings = previous;
                                plugin.setupBadgeTimer();
                            });
                        },
                        getSessionState: () => plugin.sessionState,
                        saveSessionState: (s: SessionState) => {
                            const previous = plugin.sessionState;
                            const version = ++plugin.sessionMutationVersion;
                            const next = normalizeSessionState(s, localDate(Date.now()));
                            plugin.sessionState = next;
                            void plugin.persist.save(SESSION_STATE_DATA, next).then(() => {
                                // Persist receives a cloned payload; retain the same
                                // immutable snapshot for a later failure rollback.
                                plugin.persistedSessionStateSnapshot = cloneStore(next);
                            }).catch(() => {
                                if (version === plugin.sessionMutationVersion) {
                                    plugin.sessionState = cloneStore(plugin.persistedSessionStateSnapshot ?? previous);
                                }
                                showMessage(plugin.i18n.storageWriteFail, 4000, "error");
                            });
                        },
                        clearSessionState: () => {
                            const previous = plugin.sessionState;
                            const version = ++plugin.sessionMutationVersion;
                            plugin.sessionState = { date: "", reviewedIDs: [], skippedIDs: [], counters: { new: 0, review: 0, forget: 0, skip: 0 } };
                            const next = plugin.sessionState;
                            void plugin.persist.save(SESSION_STATE_DATA, next).then(() => {
                                plugin.persistedSessionStateSnapshot = cloneStore(next);
                            }).catch(() => {
                                if (version === plugin.sessionMutationVersion) {
                                    plugin.sessionState = cloneStore(plugin.persistedSessionStateSnapshot ?? previous);
                                }
                                showMessage(plugin.i18n.storageWriteFail, 4000, "error");
                            });
                        },
                        emitSessionFinished: (summary: { new: number; review: number; forget: number; skip: number }) => {
                            try {
                                (plugin.eventBus as any).emit(LV_EVENTS.sessionFinished, sessionFinishedEvent(summary));
                            } catch { /* 事件旁路 */ }
                            // 会话结束即刷角标（549），不等 60s 心跳
                            plugin.refreshDueBadge();
                        },
                        // AT-10：设置保存广播 → 复习面板超时参数立即生效
                        onSettingsChanged: (cb: () => void) => {
                            const handler = () => cb();
                            (plugin.eventBus as any).on(LV_EVENTS.settingsChanged, handler);
                            return () => (plugin.eventBus as any).off(LV_EVENTS.settingsChanged, handler);
                        },
                        // BI-10：长期返场检查事实聚合（只读；不写内核不自动重建，重建归 BI-28）
                        getReturnCheckFacts: async () => {
                            const today = localDate(Date.now());
                            const active = plugin.learningGoals.goals.filter(g => isGoalActive(g, today));
                            const deadlines = active
                                .map(g => daysUntilDeadline(g, today))
                                .filter((n): n is number => n !== null);
                            const stats = lifecycleStats(plugin.contentLifecycles.lifecycles);
                            let dueCount = 0;
                            try {
                                dueCount = (await dueCache.get("")).cards?.length ?? 0;
                            } catch { /* 断核按 0：仅影响横幅触发 */ }
                            const lastTs = plugin.revlog.entries.reduce((m, e) => Math.max(m, e.ts ?? 0), 0);
                            return {
                                activeGoals: active.length,
                                nearestDeadlineDays: deadlines.length ? Math.min(...deadlines) : null,
                                staleCount: stats.stale ?? 0,
                                needsRevisionCount: stats.needsRevision ?? 0,
                                dueCount,
                                daysSinceLastStudy: lastTs > 0 ? Math.floor((Date.now() - lastTs) / 86400000) : null,
                                clockSkewSuspect: lastTs > Date.now(),
                                crossDeviceRestore: false,
                            };
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
                    },
                    });
                    this.destroy = () => reviewHandle?.destroy();
                }).catch((e: unknown) => {
                    if (div.isConnected) mountChunkFallback(div, plugin.i18n, e);
                });
            },
        });

        // 管理器已并入闪卡中心（LvTabs「管理」子页），不再注册独立 Tab
        registerPluginCommands({
            addCommand: (options) => this.addCommand(options),
            i18n: this.i18n,
            openDashboard: (tab?: string) => this.openTabOf(TAB_DASHBOARD, tab ? { tab } : undefined),
            openReview: (options?: { scope?: string }) => this.openTabOf(TAB_REVIEW, options),
            openQuickCard: () => this.openQuickCard(),
            openRepairDrill: () => this.openRepairDrill(),
            openPalette: () => this.openPalette(),
            copyDiagnostics: () => this.copyDiagnostics(),
            openChallenge: () => this.openChallenge(),
            openMarkerCards: () => this.openMarkerCards(),
            openPairing: () => this.openPairing(),
            openHelpDoc: () => this.openHelpDoc(),
            createSampleWorkspace: () => this.createSampleWorkspace(),
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
        this.topBarContextMenuHandler = (evt: MouseEvent) => {
            evt.preventDefault();
            this.showTopbarMenu(evt);
        };
        this.topBarElement.addEventListener("contextmenu", this.topBarContextMenuHandler);
        // 面包屑「复习本文档」按钮（M2·FR2，官方 API 3.8.2+；旧版静默跳过）
        if (typeof (this as any).addBreadcrumbButton === "function" && this.settings.modules.review) {
            (this as any).addBreadcrumbButton({
                id: "lv-cards-review-doc",
                icon: "iconLvCards",
                title: this.i18n.breadcrumbReview,
                callback: (_event: any, protyle: any) => {
                    const rootID: string = protyle?.block?.rootID ?? "";
                    if (rootID) {
                        // BI-3：文档入口（来源=文档，返回点=该文档）
                        this.openReviewWithEntry(`doc:${rootID}`, false, { entryKind: "doc", sourceID: rootID, returnPoint: `doc:${rootID}` });
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
            this.onboardingTimer = setTimeout(() => {
                this.onboardingTimer = null;
                void this.openOnboarding();
            }, 2000);
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
        return isWithinQuietHours(this.settings.quietStart, this.settings.quietEnd);
    }

    /** 积压预警（X 组）：连续 N 天未复习时提醒一次（N 固定 3，随提醒开关） */
    private checkBacklogWarn() {
        const last = this.revlog.entries[this.revlog.entries.length - 1];
        const decision = decideBacklogWarning({
            reminderEnabled: this.settings.reminderEnabled,
            lastDue: this.lastDue,
            inQuiet: this.inQuietHours(),
            lastRevlogTs: last?.ts ?? 0,
            today: localDate(Date.now()),
            alreadyWarnedToday: this.backlogWarnedFor === localDate(Date.now()),
        });
        if (decision.shouldWarn) {
            this.backlogWarnedFor = localDate(Date.now());
            showMessage(this.i18n.backlogWarn.replace("${n}", String(decision.days)), 4000, "info");
        }
    }
    /** 考试里程碑提醒（X·372/382）：30/7/1 天各提醒一次，同日同计划去重 */
    private checkExamMilestones() {
        const decision = decideExamMilestoneReminder({
            examEnabled: this.settings.examEnabled,
            reminderEnabled: this.settings.reminderEnabled,
            inQuiet: this.inQuietHours(),
            plans: this.examPlans.plans,
            today: localDate(Date.now()),
            lastNotifiedKey: this.examNotifiedFor,
        });
        if (decision.shouldNotify && decision.plan && decision.daysLeft !== undefined && decision.key) {
            this.examNotifiedFor = decision.key;
            try {
                const n = new Notification(this.i18n.examNotifTitle, {
                    body: this.i18n.examNotifBody.replace("${name}", decision.plan.name).replace("${n}", String(decision.daysLeft)),
                });
                n.onclick = () => this.openTabOf(TAB_DASHBOARD);
            } catch { /* 通知不可用则静默跳过 */ }
        }
    }

    private checkDailyReminder() {
        const today = localDate(Date.now());
        if (!shouldTriggerDailyReminder({
            reminderEnabled: this.settings.reminderEnabled,
            reminderTime: this.settings.reminderTime,
            alreadyShownToday: this.reminderShownFor === today,
        })) {
            return;
        }
        cachedDueCount().then(count => {
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
        this.unbindExamPlansSync();
        this.eventBus.off("click-flashcard-action", this.onNativeCardAction);
        this.eventBus.off("click-blockicon", this.onBlockIcon);
        if (this.topBarElement && this.topBarContextMenuHandler) {
            this.topBarElement.removeEventListener("contextmenu", this.topBarContextMenuHandler);
            this.topBarContextMenuHandler = null;
        }
        if (this.onboardingTimer) {
            clearTimeout(this.onboardingTimer);
            this.onboardingTimer = null;
        }
        // AT-1：取消挂起中的同步重载（卸载后不再触发读盘）
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
            this.reloadTimer = null;
        }
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
        if (!this.topBarElement) {
            return;
        }
        // 请求序号（536）：慢响应不覆盖新数据
        const seq = ++this.badgeSeq;
        cachedDueCount().then(count => {
            if (seq !== this.badgeSeq) {
                return;
            }
            this.lastDue = count;
            const activePlan = this.examPlans.plans.find(p => p.enabled && p.examDate);
            const todayStat = this.revlog.days[localDate(Date.now())];
            const descriptor = computeBadgeDescriptor({
                reviewEnabled: !!this.settings.modules.review,
                count,
                activeExamPlan: activePlan,
                dailyReviewTarget: this.settings.dailyReviewTarget,
                doneToday: todayStat?.review ?? 0,
                i18n: this.i18n,
            });
            this.renderBadge(descriptor, activePlan);
        }).catch((e) => {
            lvLog("warn", "refreshDueBadge failed: " + (e instanceof Error ? e.message : e));
            /* 旁路，静默 */
        });
    }

    private milestonesSeen = new Set<string>();

    private renderBadge(desc: ReturnType<typeof computeBadgeDescriptor>, plan?: ExamPlan) {
        if (!this.topBarElement) return;
        let badge = this.topBarElement.querySelector<HTMLElement>(".lv-badge");
        if (!desc.visible) {
            badge?.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "lv-badge";
            this.topBarElement.appendChild(badge);
        }
        badge.textContent = desc.text;
        badge.title = desc.title;
        badge.classList.toggle("lv-badge--done", desc.isDone);

        // 里程碑提醒（30/7/1 天，每天每档一次，内存态）
        if (desc.milestoneDays && plan) {
            const key = `${plan.id}:${desc.milestoneDays}:${localDate(Date.now())}`;
            if (!this.milestonesSeen.has(key)) {
                this.milestonesSeen.add(key);
                showMessage(this.i18n.examMilestone.replace("${name}", plan.name).replace("${n}", String(desc.milestoneDays)), 4000, "info");
            }
        }
    }

    /** 块图标菜单：制卡入口（M2·FR1）。菜单构建必须同步，耗时操作放 click 回调 */
    private onBlockIcon = ({ detail }: any) => {
        try {
            const blockIDs = extractBlockIDs(detail?.blockElements);
            if (blockIDs.length === 0 || !detail?.menu) {
                return;
            }
            // 挖空可视化（M2）：捕获编辑器当前选区（菜单弹出会抢焦点，须在构建期捕获）
            const clozeRange = blockIDs.length === 1 && document.getSelection()?.rangeCount
                ? document.getSelection()!.getRangeAt(0).cloneRange()
                : null;
            const clozeText = clozeRange?.toString().trim() ?? "";

            const items = computeBlockMenuItems({
                blockIDs,
                modules: this.settings.modules,
                i18n: this.i18n,
                actions: {
                    addToDeck: (ids) => this.openDeckPicker(ids),
                    addToInbox: (ids) => {
                        const added = this.addInboxItems(ids);
                        showMessage(added > 0 ? this.i18n.inboxAdded.replace("${n}", String(added)) : this.i18n.inboxAlready, 2000, "info");
                    },
                    makeCloze: (id) => this.makeClozeCard(id, clozeRange, clozeText),
                    makeOcclusion: (id) => this.openDeckPicker([id], {
                        skipAdd: true,
                        onPicked: (deckID: string) => this.openOcclusionEditor(id, deckID),
                    }),
                    removeFromDeck: (ids) => this.removeCardsFromDeck(ids),
                },
            });

            for (const item of items) {
                detail.menu.addItem({
                    icon: item.icon,
                    label: item.label,
                    click: item.click,
                });
            }
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
                firstDeckNamePlaceholder: this.i18n.deckNewNameFirst,
                emptyDeckText: this.i18n.deckEmpty,
                retryLabel: this.i18n.refresh,
                confirmLabel: this.i18n.deckConfirm,
                loadingLabel: this.i18n.deckLoading,
                busyLabel: this.i18n.deckSaving,
                onBeforeConfirm: async () => {
                    if (opts.skipAdd) {
                        return;
                    }
                    const escapedIDs = blockIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
                    const rows = await sqlQuery(`SELECT id, markdown FROM blocks WHERE id IN (${escapedIDs})`);
                    const markdownById = new Map(rows.map(row => [String(row.id), String(row.markdown ?? "")]));
                    const invalidIds: string[] = [];
                    for (const id of blockIDs) {
                        const markdown = markdownById.get(id) ?? "";
                        const occlusionValid = await this.hasValidOcclusionCard(id, markdown);
                        const decision = validateCardEntry({
                            blockID: id,
                            markdown,
                            exists: markdownById.has(id),
                            occlusionValid,
                        });
                        if (!decision.ok) invalidIds.push(id);
                    }
                    if (invalidIds.length > 0) {
                        showMessage(this.i18n.flashcardNeedsAnswer, 3000, "error");
                        return false;
                    }
                    const dupes = await checkDuplicateCards(blockIDs);
                    if (dupes > 0) {
                        return confirmDialogBool({
                            title: this.i18n.dupTitle,
                            content: `<div class="b3-typography">${this.i18n.dupConfirm.replace("${n}", String(dupes))}</div>`,
                        });
                    }
                },
                onConfirm: async (deckID: string) => {
                    if (!opts.skipAdd) {
                        try {
                            await addRiffCards(deckID, blockIDs);
                        } catch (error) {
                            showMessage(formatRiffCardEntryError(error, this.i18n), 3000, "error");
                            return false;
                        }
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
                    await this.rememberSourceFingerprint(blockID);
                    showMessage((this.i18n as any).occlusion.occlusionSaved, 2000, "info");
                },
                onClose: () => { /* svelteDialog 自理销毁 */ },
            },
        });
    }

    private async removeCardsFromDeck(blockIDs: string[]) {
        try {
            const result = await removeCardsFromDeckFlow(
                blockIDs,
                this.cardRelations,
                (mutator) => this.cardRelationsMutations(mutator),
            );
            if (!result.hadCards) {
                showMessage(this.i18n.deckNotCard, 2000, "info");
                return;
            }
            showMessage(this.i18n.deckRemoved.replace("${n}", String(result.removedCount)), 2000, "info");
        } catch (e: any) {
            showMessage(formatRiffCardEntryError(e, this.i18n, e?.message ?? String(e)), 3000, "error");
        }
    }

    /** 自诊断（AD）：脱敏环境信息复制到剪贴板，供 issue 附带 */
    private async copyDiagnostics() {
        try {
            const { buildDiagnosticsText } = await loadHubServices();
            let kv = "?";
            try {
                kv = await kernelVersion();
            } catch { /* 旁路 */ }
            const text = buildDiagnosticsText({
                pluginVersion: (this as any).manifest?.version ?? "unknown",
                kernelVersion: kv,
                v2State: this.flashcardV2 ? this.flashcardV2.state : null,
                modules: this.settings.modules,
                revlogCount: this.revlog.entries.length,
                streak: calcStreak(this.revlog),
                dueToday: this.lastDue,
                plansCount: this.examPlans.plans.length,
                persistStats: this.persist.stats(),
                hasPersistFailures: this.persist.hasFailures(),
                dueCacheStats: dueCache.stats(),
                recentLogDump: lvLogDump(),
            });
            await navigator.clipboard.writeText(text);
            showMessage(this.i18n.diagCopied, 2000, "info");
        } catch {
            showMessage(this.i18n.diagFail, 3000, "error");
        }
    }

    /** AnkiConnect 客户端连接测试（M9·FR1） */
    private async testAnkiClient(url = this.settings.ankiClientUrl, key = this.settings.ankiClientKey): Promise<string> {
        return probeAnkiConnection(url, key, this.i18n);
    }

    private storageLastWrite: Record<string, number> = {};
    /** AQ-4：失败→恢复跟踪（onFail 置位，下次 onOk 展示恢复提示并清除） */
    private hadPersistFail = false;

    private trackSave(file: string) {
        this.storageLastWrite[file] = Date.now();
        if (this.hadPersistFail) {
            this.hadPersistFail = false;
            // AQ-4：恢复可观测——失败后首次成功写入给用户确认
            try { showMessage(this.i18n.settingsSaved, 1500, "info"); } catch { /* 旁路 */ }
        }
    }

    private storageStats() {
        return computeStorageStats({
            settingsVersion: this.settings.version,
            revlogCount: this.revlog.entries.length,
            suspendTodayCount: this.suspendToday.cardIDs.length,
            examPlansCount: this.examPlans.plans.length,
            aiBatchesCount: this.aiBatches.batches.length,
            aiJobsCount: this.aiJobs.jobs.length,
            knowledgeObjectsCount: this.knowledgeObjects.objects.length,
            relationsCount: this.cardRelations.relations.length,
            errorTagsCount: this.errorTags.tags.length,
            inboxCount: this.inbox.items.length,
            learningGoalsCount: this.learningGoals.goals.length,
            entryContextsCount: this.entryContexts.contexts.length,
            contentLifecyclesCount: this.contentLifecycles.lifecycles.length,
            killSwitchDisabledCount: this.killSwitch.disabledTargets.length,
            killSwitchQuarantinedCount: this.killSwitch.quarantinedJobs.length,
            storageLastWrite: this.storageLastWrite,
        });
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
        // AR-5：成功打开复盘文档
        openTab({ app: this.app, doc: { id: docID } });
    }

    /** 笔记本归属集合（AR-11）：按 revlog 中出现的 blockID 分批查内核，落在该笔记本的才算命中范围 */
    private async notebookBlockIDs(nbId: string, blockIDs: string[]): Promise<Set<string>> {
        return queryNotebookBlockIDs(nbId, blockIDs, (sql) => sqlQuery(sql));
    }

    private async buildExamReportMd(plan: ExamPlan): Promise<string> {
        const { renderExamReportMarkdown } = await loadHubServices();
        // AR-11：时间窗固定为「计划创建以来」，范围按计划过滤；无法归属的记录单独列示
        let inScope: ((e: { deckID?: string; blockID?: string }) => boolean) | undefined;
        if (plan.scopeKind === "deck") {
            inScope = e => e.deckID === plan.scopeId;
        } else if (plan.scopeKind === "notebook" && plan.scopeId) {
            const window = this.revlog.entries.filter(e => e.rating > 0);
            const ids = await this.notebookBlockIDs(plan.scopeId, [...new Set(window.map(e => e.blockID).filter(Boolean))]);
            inScope = e => ids.has(e.blockID ?? "");
        }
        return renderExamReportMarkdown({
            plan,
            entries: this.revlog.entries,
            inScopeFilter: inScope,
        });
    }

    private async generateExamReport(plan: ExamPlan) {
        const md = await this.buildExamReportMd(plan);
        await navigator.clipboard.writeText(md);
        showMessage(this.i18n.examReportCopied, 2500, "info");
    }

    /** 落盘笔记本（605）：设置指定优先，否则第一个打开的笔记本 */
    private async targetNotebook(): Promise<{ id: string; name: string } | null> {
        const notebooks = await getNotebooks();
        return resolveTargetNotebook(notebooks, this.settings.targetNotebookId);
    }

    /** 内置帮助文档（485）：同路径复用「小驴闪卡/使用帮助」文档，内容随插件更新；
     * 帮助文案随 hub chunk 按需加载。 */
    private async openHelpDoc() {
        try {
            const nb = await this.targetNotebook();
            if (!nb) {
                showMessage(this.i18n.onboardingNoNotebook, 2500, "error");
                return;
            }
            const { helpMarkdown } = await loadHubServices();
            const lang = (window.siyuan as any)?.languages?.lang ?? "zh_CN";
            const docID = await createDocWithMd(nb.id, "小驴闪卡/使用帮助", helpMarkdown(lang));
            if (!docID) {
                showMessage(this.i18n.quickCardFail, 2500, "error");
                return;
            }
            openTab({ app: this.app, doc: { id: docID } });
        } catch (error) {
            this.reportDialogOpenFailure(this.i18n.openHelp, error);
        }
    }

    /** 示例工作区（476）：创建 5 张不同形态的示例卡（普通/公式/挖空/列表/问答）并入「示例卡组」 */
    private sampleWsBusy = false;
    private async createSampleWorkspace() {
        if (this.sampleWsBusy) {
            return; // AR-4：并发双击防重入
        }
        this.sampleWsBusy = true;
        try {
            const nb = await this.targetNotebook();
            if (!nb) {
                showMessage(this.i18n.onboardingNoNotebook, 2500, "error");
                return;
            }
            const res = await createFullSampleWorkspace(nb.id, this.i18n);
            if (res.alreadyExisted) {
                showMessage((this.i18n as any).sampleExists ?? this.i18n.sampleDone.replace("${n}", "0"), 2500, "info");
            } else {
                showMessage(this.i18n.sampleDone.replace("${n}", String(res.createdCount)), 3000, "info");
            }
            openTab({ app: this.app, doc: { id: res.docID } });
        } catch (e: any) {
            showMessage(e?.message ?? String(e), 3000, "error");
        } finally {
            this.sampleWsBusy = false;
        }
    }

    private async createQuickCard(markdown: string, deckID: string, _deckName: string, q?: string, a?: string) {
        const nb = await this.targetNotebook();
        if (!nb) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        const created = await executeQuickCardCreation({
            nbId: nb.id,
            markdown,
            deckID,
            qualityErrorMessage: this.i18n.flashcardNeedsAnswer,
            q,
            a,
            mutateKnowledgeObjects: (mutator) => this.knowledgeObjectsMutations(mutator),
        });
        await this.rememberSourceFingerprint(created.blockID, created.docID, markdown);
        showMessage(this.i18n.quickCardDone, 2000, "info");
    }

    private async createQuickCardView(embedded = false) {
        const view: { Component: any; mount?: (comp: any, target: HTMLElement, props: Record<string, any>) => { destroy(): void } } = embedded
            ? await loadQuickCardEmbedded()
            : { Component: await loadQuickCard() };
        return {
            Component: view.Component,
            ...(view.mount ? { mount: view.mount } : {}),
            props: {
                i18n: this.i18n,
                onCreate: (markdown: string, deckID: string, deckName: string, q?: string, a?: string) =>
                    this.createQuickCard(markdown, deckID, deckName, q, a),
                onClose: () => { /* 宿主或 Hub 管理视图生命周期 */ },
            },
        };
    }

    private async openQuickCard() {
        try {
            const view = await this.createQuickCardView();
            svelteDialog({
                title: this.i18n.quickCardTitle,
                component: view.Component,
                width: "min(620px, 94vw)",
                props: view.props,
            });
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.quickCardTitle, e);
        }
    }

    /** 当前打开的文档（M2·FR6 输入源扩展，🧪 getAllEditor 行为真机验证） */
    private async loadCurrentDoc(): Promise<{ name: string; content: string; docId?: string } | null> {
        // name 字段由 hPath 提供；docId 供向导「回源」跳转（T02）
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
        return { name: md.hPath, content: md.content, docId: rootID };
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
        const { items } = extractMarkerCardItems(rows);
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
                onCreate: async (picked: { blockID: string; kind: "qa" | "whole"; front: string; back: string }[]) => {
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
                        const ids = await appendBlock("markdown", serializeQaCard(it.front, it.back), docID);
                        if (ids?.length) {
                            qaIds.push(ids[0]);
                        }
                    }
                    const wholePicked = picked.filter(p => p.kind === "whole").map(p => p.blockID);
                    const all = [...qaIds, ...wholePicked];
                    if (all.length > 0) {
                        try {
                            await addRiffCards(deckID, all);
                            await Promise.all(qaIds.map(id => this.rememberSourceFingerprint(id, docID)));
                            await Promise.all(wholePicked.map(id => this.rememberSourceFingerprint(id)));
                        } catch (error) {
                            throw new Error(formatRiffCardEntryError(error, this.i18n));
                        }
                    }
                    showMessage(this.i18n.markerCreated.replace("${n}", String(all.length)), 2500, "info");
                },
                onClose: () => { /* svelteDialog 自理销毁 */ },
            },
        });
    }

    /** 笔记本范围材料（M2·FR6 扩展，AI 向导用）：聚合最近 200 个文本块 */
    private async loadNotebookMaterial(nbId: string): Promise<string> {
        return queryNotebookMaterialText(nbId, (sql) => sqlQuery(sql));
    }

    private async openOnboarding() {
        try {
            const Onboarding = await loadOnboarding();
            svelteDialog({
                title: this.i18n.onboardingTitle,
                component: Onboarding,
                width: "min(560px, 94vw)",
                props: {
                    i18n: this.i18n,
                    applyPersona: async (id: "exam" | "notes" | "language") => {
                        const preset = PERSONA_PRESETS.find(p => p.id === id);
                        if (!preset) {
                            return;
                        }
                        const previous = this.settings;
                        const next = {
                            ...this.settings,
                            modules: { ...this.settings.modules, ...preset.modules },
                            ...preset.params,
                            persona: id,
                        };
                        try {
                            await this.persist.save(SETTINGS_DATA, next);
                            this.settings = next;
                        } catch (e) {
                            this.settings = previous;
                            showMessage(this.i18n.storageWriteFail, 4000, "error");
                            throw e;
                        }
                    },
                    createSampleCards: (nbId: string) => this.createSampleCards(nbId),
                    openHelp: () => this.openHelpDoc(),
                    openSampleDoc: (docId: string) => openTab({ app: this.app, doc: { id: docId } }),
                    openReview: () => this.openTabOf(TAB_REVIEW),
                    onClose: () => this.markOnboarded(),
                },
            });
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.onboardingTitle, e);
        }
    }

    private sampleBusy = false;
    private async createSampleCards(nbId: string): Promise<string | null> {
        if (this.sampleBusy) {
            return null;
        }
        this.sampleBusy = true;
        try {
            return await createOnboardingSampleCards(nbId, this.i18n);
        } finally {
            this.sampleBusy = false;
        }
    }

    private examPlansMutation = createSnapshotMutationQueue<ExamPlansData>(
        () => this.examPlans,
        current => ({ version: 1, plans: current.plans.map(plan => ({ ...plan })) }),
        next => this.persist.save(EXAM_PLANS_DATA, next),
        next => { this.examPlans = next; },
    );

    private mutateExamPlans(mutate: (plans: ExamPlansData) => void): Promise<ExamPlansData> {
        return this.examPlansMutation(mutate);
    }

    private subscribeExamPlans(cb: () => void): () => void {
        const handler = () => cb();
        (this.eventBus as any).on(LV_EVENTS.storesChanged, handler);
        return () => (this.eventBus as any).off(LV_EVENTS.storesChanged, handler);
    }

    private persistExamPlansAndNotify(mutate: (plans: ExamPlansData) => void): Promise<ExamPlansData> {
        return persistThenNotify(
            () => this.mutateExamPlans(mutate),
            async () => {
                if (!isKernelPluginRunning(this.kernel.state.code)) return;
                const notice = createExamPlansChangedNotice(this.examPlansSourceID, ++this.examPlansSequence);
                await this.kernel.rpc.call[EXAM_PLANS_PUBLISH_RPC](notice);
            },
            error => lvLog("warn", `[exam-plans-sync] notification failed: ${error instanceof Error ? error.message : String(error)}`),
        );
    }

    private saveExamPlan(plan: ExamPlan): Promise<ExamPlansData> {
        return this.persistExamPlansAndNotify(plans => {
            const i = plans.plans.findIndex(x => x.id === plan.id);
            if (i >= 0) plans.plans[i] = plan;
            else plans.plans.push(plan);
        });
    }

    private deleteExamPlan(id: string): Promise<ExamPlansData> {
        return this.persistExamPlansAndNotify(plans => {
            plans.plans = plans.plans.filter(plan => plan.id !== id);
        });
    }

    private openReviewScope(scopeKind: "all" | "deck" | "notebook", scopeId: string, cram: boolean, entrySourceID = "") {
        const scope = buildReviewScopeKey(scopeKind, scopeId);
        // BI-3：考试报告入口（来源=试卷计划，返回点=Hub 考试页签）
        this.openReviewWithEntry(scope, cram, entrySourceID
            ? { entryKind: "report", sourceID: entrySourceID, returnPoint: "hub:exam" }
            : undefined);
    }

    /** BI-3：记录入口上下文并带 entry 打开复习页签（取消/重开不丢——落盘 + 7 天 TTL） */
    private openReviewWithEntry(scope: string, cram: boolean, entry?: { entryKind: EntryKind; sourceID: string; returnPoint: string }) {
        if (entry && entry.sourceID) {
            upsertContext(this.entryContexts, {
                entryKind: entry.entryKind,
                sourceID: entry.sourceID,
                scopeKey: scope,
                goalID: "",
                returnPoint: entry.returnPoint,
                createdAt: Date.now(),
            });
            this.saveEntryContexts();
        }
        this.openTabOf(TAB_REVIEW, { scope, cram, entry });
    }

    /** BI-3：入口返回点导航（doc:<文档ID> / hub:<Hub 页签>） */
    private returnToEntryPoint(returnPoint: string) {
        const target = parseReturnPoint(returnPoint);
        if (target.type === "doc") {
            openTab({ app: this.app, doc: { id: target.docId } });
        } else if (target.type === "hub") {
            this.openTabOf(TAB_DASHBOARD, { tab: target.tab });
        }
    }

    /** 对话框懒加载失败时给出可见反馈，避免入口点击后静默拒绝。 */
    private reportDialogOpenFailure(kind: string, error: unknown): void {
        const detail = error instanceof Error ? error.message : String(error);
        lvLog("error", `[dialog] ${kind} open failed: ${detail}`);
        const prefix = this.i18n.chunkLoadFailedDetail ?? "界面模块加载失败，请重试。";
        showMessage(`${prefix}\n${detail}`, 4000, "error");
    }

    /** AI 制卡向导（M2·FR6-10）：生成回调 + 批次记录落库；initialSource 用于 leech 改写预填 */
    /** T10 修卡演练（docs/13 §12）：独立样例、零网络零写入、进度不迁入真实学习 */
    private async openRepairDrill() {
        let Drill: any;
        try {
            Drill = await loadRepairDrill();
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.drillTitle, e);
            return;
        }
        svelteDialog({
            title: this.i18n.drillTitle,
            component: Drill,
            width: "min(720px, 94vw)",
            props: { i18n: this.i18n, onClose: () => { /* svelteDialog 自理销毁 */ } },
        });
    }

    private async openChallenge() {
        try {
            const ChallengeMode = await loadChallengeMode();
            svelteDialog({
                title: (this.i18n as any).challenge.title,
                component: ChallengeMode,
                width: "min(560px, 94vw)",
                props: { i18n: this.i18n, onExit: () => { /* svelteDialog 自理销毁 */ } },
            });
        } catch (e) {
            this.reportDialogOpenFailure((this.i18n as any).challenge?.title ?? "challenge", e);
        }
    }

    private async openPairing() {
        try {
            const PairingGame = await loadPairingGame();
            svelteDialog({
                title: (this.i18n as any).pairing.title,
                component: PairingGame,
                width: "min(720px, 94vw)",
                props: { i18n: this.i18n, onExit: () => { /* svelteDialog 自理销毁 */ } },
            });
        } catch (e) {
            this.reportDialogOpenFailure((this.i18n as any).pairing?.title ?? "pairing", e);
        }
    }

    /** T13 ⌘K 命令面板（docs/41 P0 · docs/42 §3.10）：动作 + 导航键盘直达；范围随模块开关，不做隐藏入口的命令 */
    private async openPalette() {
        try {
            const Palette = await loadPalette();
            const commands = computePaletteCommands({
                modules: this.settings.modules,
                uiMode: this.settings.uiMode,
                i18n: this.i18n,
            });
            const runners: Record<string, () => void> = {
            review: () => this.openTabOf(TAB_REVIEW),
            wizard: () => this.openAIWizard(),
            quick: () => this.openQuickCard(),
            drill: () => this.openRepairDrill(),
            settings: () => this.openSettingsDialog(),
            overview: () => this.openTabOf(TAB_DASHBOARD),
            manage: () => this.openTabOf(TAB_DASHBOARD, { tab: "manage" }),
            authoring: () => this.openTabOf(TAB_DASHBOARD, { tab: "authoring" }),
            goals: () => this.openTabOf(TAB_DASHBOARD, { tab: "goals" }),
            inbox: () => this.openTabOf(TAB_DASHBOARD, { tab: "inbox" }),
            exam: () => this.openTabOf(TAB_DASHBOARD, { tab: "exam" }),
            maintenance: () => this.openTabOf(TAB_DASHBOARD, { tab: "maintenance" }),
            };
            svelteDialog({
            title: this.i18n.cmdPalette,
            component: Palette,
            width: "min(560px, 94vw)",
            // R53 §3.10：面板为无镶板浮层（去宿主标题栏，容器本身 r20 + shadow-2）
            panel: true,
            props: {
                commands,
                placeholder: this.i18n.palettePlaceholder,
                groupNames: { actions: this.i18n.paletteGroupActions, nav: this.i18n.paletteGroupNav },
                labels: { empty: this.i18n.paletteEmpty, foot: this.i18n.paletteFoot },
                // svelteDialog 只包装已存在的 onClose（AR-2 关闭一次性）——必须显式占位
                onClose: () => { /* 关闭销毁由 svelteDialog 自理 */ },
                onrun: (cmd: PaletteCommand) => runners[cmd.id]?.(),
            },
            });
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.cmdPalette, e);
        }
    }

    private async createAIWizardView(
        initialSource = "",
        onCreated?: () => void,
        initialSources: { label: string; content: string; docId?: string; nbId?: string; inboxId?: string }[] = [],
        onImportComplete?: (ids: string[]) => void,
        recoveryJobId?: string,
        embedded = false,
    ): Promise<{ Component: any; props: Record<string, any>; mount?: (comp: any, target: HTMLElement, props: Record<string, any>) => { destroy(): void } }> {
        const view: { Component: any; mount?: (comp: any, target: HTMLElement, props: Record<string, any>) => { destroy(): void } } = embedded
            ? await loadAIWizardEmbedded()
            : { Component: await loadAIWizard() };
        const Component = view.Component;
        const recoveryJob = recoveryJobId ? await this.getReviewableAIJob(recoveryJobId) : null;
        if (recoveryJobId && !recoveryJob) {
            throw new Error((this.i18n as any).recoveryCenter?.aiReviewUnavailable ?? "This AI review can no longer be restored safely.");
        }
        return {
            Component,
            ...(view.mount ? { mount: view.mount } : {}),
            props: {
                i18n: this.i18n,
                initialSource,
                initialSources,
                onImportComplete,
                recoveryJob,
                loadCurrentDoc: () => this.loadCurrentDoc(),
                loadNotebookMaterial: (nbId: string) => this.loadNotebookMaterial(nbId),
                loadNotebooks: () => getNotebooks(),
                // T02：来源清单「回源」——按文档 ID 跳回原文档
                openDocById: (docId: string) => {
                    openTab({ app: this.app, doc: { id: docId } });
                },
                // AQ-14：signal 随调用传入——向导关闭/换源/重生取消后，晚到响应不写回、不触发 fallback
                // ADR-7 第 3 步：生成阶段入账作业生命周期（drafting→generating→reviewing / failed/canceled）
                generate: async (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }, opts?: { signal?: AbortSignal; provenance?: { notebookIds?: string[]; docIds?: string[] } }) => {
                    // BU-24（v0.196.0）：月度 token 预算——超限在组装 prompt 前阻断（fallback 不会启动，绝不偷换端点）
                    const budget = budgetState(this.costLedger, {
                        enabled: this.settings.aiCostBudgetEnabled,
                        monthlyTokenCap: this.settings.aiCostMonthlyCap,
                    });
                    // BW-9（v0.190.0）：来源级禁止外发——来源 provenance 任一命中 deny 规则即阻断（组装 prompt 前）
                    const prov = opts?.provenance;
                    const denyHit = [
                        ...(prov?.docIds ?? []).map(docId => ({ docId })),
                        ...(prov?.notebookIds ?? []).map(notebookId => ({ notebookId })),
                    ].map(p => isDenied(this.aiDenyList, p)).some(v => v.denied);
                    // BU-33（v0.172.0）：组装 prompt 前的前置检查（阻断+给手工/本地替代；不把环境失败归因模型质量）
                    const elig = checkEligibility({
                        hasMaterial: source.trim().length > 0,
                        // siyuan 模式由内核网关管理视为已配置；custom 模式需端点+密钥
                        aiConfigured: this.settings.aiMode === "siyuan" || Boolean(this.settings.aiEndpoint && this.settings.aiKey),
                        online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
                        // BW-9：deny 规则 = eligibility sensitive 事实源（BL-5 deny 名单的落地形态）
                        sensitive: denyHit,
                        // BU-24：月度预算超限 = eligibility costExceeded 事实源（BU-33 预留位落地）
                        costExceeded: budget.exceeded,
                    });
                    if (!elig.ok) {
                        const e = (this.i18n as any).aiElig;
                        const b = elig.block!;
                        throw new Error(`${e[b.reason]} ${e.alt[b.reason]}`);
                    }
                    // BU-31（v0.173.0）：紧急停用/撤销同意前置（总闸优先；provider/model/task 目标粒度）
                    const killReason = killSwitchBlock(this.killSwitch, [...this.aiProviderTargets(), "task:cards-generate"]);
                    if (killReason) {
                        const e = (this.i18n as any).aiKill;
                        throw new Error(killReason === "consent-revoked" ? e.consentRevoked : e.targetDisabled);
                    }
                    // BU-35（v0.171.0）：提示组装收编流水线单一入口（模板解析/围栏/隔离条款/预算/审计）
                    const assembled = assembleGeneratePrompt({
                        task: "cards-generate",
                        customTemplate: this.settings.aiPromptTemplate,
                        defaultSystem: this.i18n.aiSystemPrompt,
                        userTemplate: this.i18n.aiUserPrompt,
                        source,
                        cfg,
                        typeClozeHint: this.i18n.aiTypeClozeHint,
                        typeQaHint: this.i18n.aiTypeQaHint,
                        guardClause: (this.i18n as any).aiInjectionGuard,
                        untrustedLabel: (this.i18n as any).aiUntrustedLabel,
                        // BU-18：custom 模式按登记模型收紧预算（siyuan 模式模型由内核管理，不判）
                        modelId: this.settings.aiMode === "custom" ? this.settings.aiModel : "",
                    });
                    const { system, user } = assembled;
                    // AuditSink（lvLog）：仅非敏感字段（task/模板来源/token 数/写入目标）
                    lvLog("info", `[ai-pipeline] ${JSON.stringify(assembled.audit)}`);
                    if (assembled.needsBatching) {
                        throw new Error(this.i18n.aiTooLong);
                    }
                    const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
                    let job = createJob(jobId, { type: this.settings.aiMode, label: source.slice(0, 50), excerpt: source.slice(0, 200) }, cfg);
                    job = transitionJob(job, { type: "GENERATE_START" }).job;
                    const beforeJobStart = normalizeAIJobs(JSON.parse(JSON.stringify(this.aiJobs)));
                    this.upsertAIJob(job);
                    await this.persistAIJobs(beforeJobStart);
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
                                        // BU-28：呈现实际降级路径 + 费用提示（不做静默 fallback）
                                        const deg = (this.i18n as any).aiDegrad;
                                        showMessage(`${deg.usedFallback}（${deg.mayCost}）`, 3000, "info");
                                    }
                                },
                            },
                        );
                        // BU-11：非 JSON 输出（典型=模型拒答文本）不得透传原始 SyntaxError——
                        // 与空响应同走「格式失败」拒答呈现（审计 F-6：拒答文本曾泄漏 JSON 异常）
                        let parsed: ReturnType<typeof parseCards>;
                        let parseFailedDetail = "";
                        try {
                            parsed = parseCards(raw).slice(0, cfg.count);
                        } catch {
                            parsed = [];
                            parseFailedDetail = raw.slice(0, 60);
                        }
                        if (parsed.length === 0) {
                            // BU-11：空响应/不可解析按「格式失败」拒答呈现（可读原因 + 有序下一步，不偷偷重试/换端点）
                            const refusal = evaluateRefusal({ "format-failure": parseFailedDetail || "empty" });
                            const dict = (this.i18n as any).aiRefusal;
                            const parts = [
                                dict?.kind?.[refusal.kind] ?? (this.i18n as any).aiWizard?.emptyResult ?? "AI returned no cards",
                                ...refusal.nextKeys.map(k => dict?.next?.[k.replace("aiRefusal.next.", "")]).filter(Boolean),
                            ];
                            throw new Error(parts.join("；"));
                        }
                        job = transitionJob(job, {
                            type: "GENERATE_OK",
                            candidates: parsed.map(c => ({ q: c.q, a: c.a, d: c.d, keep: true, status: "pending" as const })),
                        }).job;
                        const beforeJobReady = normalizeAIJobs(JSON.parse(JSON.stringify(this.aiJobs)));
                        this.upsertAIJob(job);
                        await this.persistAIJobs(beforeJobReady);
                        // 批次元数据（质量反哺数据源，P2 消费）；tokens 供消耗历史（299）
                        // BU-19：批次 pin——生成环境快照落盘（modelId/templateHash/来源 hash，均指纹不含密钥与原文）
                        const previousBatches = normalizeAIBatches(JSON.parse(JSON.stringify(this.aiBatches)));
                        const batchesVersion = ++this.aiBatchesMutationVersion;
                        this.aiBatches.batches.push({
                            id: `ai-${Date.now().toString(36)}`,
                            date: localDate(Date.now()),
                            deckID: "",
                            blockIDs: [],
                            tokens: estimateTokens(system) + estimateTokens(user) + estimateTokens(raw),
                            pin: {
                                mode: this.settings.aiMode,
                                modelId: assembled.audit.modelId,
                                templateHash: fnv1a(system),
                                sourceHash: fnv1a(source),
                                pinnedAt: Date.now(),
                            },
                        });
                        if (this.aiBatches.batches.length > 200) {
                            this.aiBatches.batches = this.aiBatches.batches.slice(-200);
                        }
                        const batchesSnapshot = cloneStore(this.aiBatches);
                        try {
                            await this.persist.save(AI_BATCHES_DATA, batchesSnapshot);
                            if (batchesVersion === this.aiBatchesMutationVersion) {
                                this.persistedAIBatchesSnapshot = cloneStore(batchesSnapshot);
                            }
                        } catch {
                            if (batchesVersion === this.aiBatchesMutationVersion) {
                                this.aiBatches = cloneStore(this.persistedAIBatchesSnapshot ?? previousBatches);
                            }
                            showMessage(this.i18n.storageWriteFail, 4000, "error");
                        }
                        // BU-25（v0.196.0）：用量入账（估算显式标记；价格未知=null 不编数字；不含 key 与原文）
                        const tokensIn = estimateTokens(system) + estimateTokens(user);
                        const tokensOut = estimateTokens(raw);
                        const previousCostLedger = normalizeCostLedger(JSON.parse(JSON.stringify(this.costLedger)));
                        const costVersion = ++this.costLedgerMutationVersion;
                        const nextCostLedger = recordEntry(this.costLedger, {
                            at: Date.now(),
                            task: "cards-generate",
                            mode: this.settings.aiMode,
                            modelId: assembled.audit.modelId,
                            tokens: tokensIn + tokensOut,
                            est: true,
                            costUsd: assembled.audit.modelId
                                ? estimateCallCostUsd(assembled.audit.modelId, tokensIn, tokensOut)
                                : null,
                            algorithm: "chars/4",
                            priceVersion: MODEL_PRICE_SNAPSHOT,
                        });
                        this.costLedger = nextCostLedger;
                        const costSnapshot = cloneStore(nextCostLedger);
                        try {
                            await this.persist.save(AI_COST_LEDGER_DATA, costSnapshot);
                            if (costVersion === this.costLedgerMutationVersion) {
                                this.persistedCostLedgerSnapshot = cloneStore(costSnapshot);
                            }
                        } catch {
                            if (costVersion === this.costLedgerMutationVersion) {
                                this.costLedger = cloneStore(this.persistedCostLedgerSnapshot ?? previousCostLedger);
                            }
                            showMessage(this.i18n.storageWriteFail, 4000, "error");
                        }
                        // BU-24：预算预警（80% 阈值，到顶前提醒；超限已在下一轮请求前置阻断）
                        if (budgetState(this.costLedger, { enabled: this.settings.aiCostBudgetEnabled, monthlyTokenCap: this.settings.aiCostMonthlyCap }).warn) {
                            showMessage((this.i18n as any).aiCost?.warn ?? "AI cost budget warning", 3000, "info");
                        }
                        // BU-15：生成环境快照随结果返回（mode/modelId/templateHash；不含 key），向导记入版本链
                        return {
                            cards: parsed,
                            jobId,
                            gen: {
                                mode: this.settings.aiMode,
                                modelId: assembled.audit.modelId,
                                templateHash: fnv1a(system),
                            },
                        };
                    } catch (e) {
                        // 取消与失败都落账：取消记 CANCEL，失败记 GENERATE_FAIL——重开向导可续传
                        job = transitionJob(job, isAICanceled(e)
                            ? { type: "CANCEL" }
                            : { type: "GENERATE_FAIL", error: e instanceof Error ? e.message : String(e) }).job;
                        this.upsertAIJob(job);
                        const failedJobSnapshot = cloneStore(this.aiJobs);
                        const failedJobVersion = this.aiJobsMutationVersion;
                        await this.persist.save(AI_JOBS_DATA, failedJobSnapshot).then(() => {
                            if (failedJobVersion === this.aiJobsMutationVersion) {
                                this.persistedAIJobsSnapshot = cloneStore(failedJobSnapshot);
                            }
                        }).catch(() => { /* onFail 已记录 */ });
                        throw e;
                    }
                },
                onCreate: async (cards: { q: string; a: string; origIndex: number }[], deckID: string, deckName: string, jobId: string) => {
                    const r = await this.createAICards(cards, deckID, deckName, jobId);
                    // BI-4：收件箱制卡成功回调（清收件箱 + 记内容生命周期，失败不影响制卡结果）
                    if (onCreated) {
                        try {
                            onCreated();
                        } catch { /* 清理旁路 */ }
                    }
                    return r;
                },
                // ADR-7 恢复入口：上次导入中断的续传/放弃
                getUnfinishedJob: () => this.getUnfinishedAIJob(),
                // BW-9：来源级禁止外发——载入前拦截 + 来源条目一键登记（规则落 ai-deny-list.json）
                isSourceDenied: (kind: "doc" | "notebook", id: string) =>
                    isDenied(this.aiDenyList, kind === "doc" ? { docId: id } : { notebookId: id }).denied,
                onDenySource: (kind: "doc" | "notebook", id: string) => {
                    const previous = normalizeDenyList(JSON.parse(JSON.stringify(this.aiDenyList)));
                    const next = addDenyRule(this.aiDenyList, kind, id, Date.now());
                    const version = ++this.aiDenyMutationVersion;
                    this.aiDenyList = next;
                    void this.persist.save(AI_DENY_LIST_DATA, next).then(() => {
                        this.persistedAIDenyListSnapshot = cloneStore(next);
                        lvLog("info", `[ai-deny] +${kind}:${id}`);
                        showMessage((this.i18n as any).aiWizard.deniedToast, 3000, "info");
                    }).catch(() => {
                        if (version === this.aiDenyMutationVersion) {
                            this.aiDenyList = cloneStore(this.persistedAIDenyListSnapshot ?? previous);
                        }
                        showMessage(this.i18n.storageWriteFail, 4000, "error");
                    });
                },
                // BU-8：自定义敏感词（逗号分隔，仅本地）
                sensitiveTerms: this.settings.aiSensitiveTerms,
                // BU-14：模型可信度——siyuan 内核网关视为已配置；custom 模式按注册表登记状态
                modelTrustKnown: () => this.settings.aiMode === "siyuan" || isSelectableModel(this.settings.aiModel),
                // BU-36：上下文包预览——组装纯函数零网络，返回分层预算报告供发送前展示
                previewBudget: (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }) => {
                    return buildBudgetPreview({
                        source,
                        cfg,
                        promptTemplate: this.settings.aiPromptTemplate,
                        aiMode: this.settings.aiMode,
                        aiModel: this.settings.aiModel,
                        i18n: this.i18n,
                    });
                },
                onClose: () => { /* svelteDialog 自理销毁 */ },
            },
        };
    }

    private async openAIWizard(initialSource = "", onCreated?: () => void) {
        try {
            const view = await this.createAIWizardView(initialSource, onCreated);
            svelteDialog({
                title: this.i18n.aiWizardTitle,
                component: view.Component,
                // T03：候选审核需要来源/编辑/卡面对照空间，加宽至 860
                width: "min(860px, 94vw)",
                props: view.props,
            });
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.aiWizardTitle, e);
        }
    }

    /** ADR-7 第 3 步：逐卡提交 + 断点记录——每卡 appendBlock+入组成功即持久化，中断续传只处理 pending */
    private async createAICards(cards: { q: string; a: string; origIndex: number }[], deckID: string, _deckName: string, jobId: string) {
        const operationID = jobId || `cards:${deckID}:${cards.map(card => card.origIndex).join(",")}`;
        const existing = this.aiCommitFlights.get(operationID);
        if (existing) return existing;
        const operation = this.createAICardsOnce(cards, deckID, _deckName, jobId);
        this.aiCommitFlights.set(operationID, operation);
        operation.finally(() => {
            if (this.aiCommitFlights.get(operationID) === operation) this.aiCommitFlights.delete(operationID);
        }).catch(() => { /* 原始 Promise 负责把错误交给调用方 */ });
        return operation;
    }

    private async createAICardsOnce(cards: { q: string; a: string; origIndex: number }[], deckID: string, _deckName: string, jobId: string) {
        const qualityIssues = findAiCardGateIssues(cards);
        if (qualityIssues.some(issues => issues.length > 0)) {
            throw new Error((this.i18n as any).aiWizard.qualityBlocked);
        }
        try {
            for (const card of cards) serializeQaCard(card.q, card.a);
        } catch {
            throw new Error((this.i18n as any).aiWizard.invalidDraft);
        }
        const nb = await this.targetNotebook();
        if (!nb) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        let job: AIJob | undefined = jobId ? this.aiJobs.jobs.find(j => j.id === jobId) : undefined;
        const date = localDate(Date.now());
        const docID = job?.targetDocID || await createDocWithMd(nb.id, `小驴闪卡/AI 制卡/${date}`, "");
        if (!docID) {
            throw new Error(this.i18n.quickCardFail);
        }
        if (job) {
            if (job.targetDocID !== docID) {
                job = { ...job, targetDocID: docID };
                this.upsertAIJob(job);
                await this.persistAIJobsOnce(`${job.id}:doc:${docID}`);
            }
            job = transitionJob(job, { type: "COMMIT_START", deckID }).job;
            this.upsertAIJob(job);
            await this.persistAIJobsOnce(`${job.id}:commit-start:${deckID}`);
        }
        const blockIDs: string[] = [];
        for (const card of cards) {
            // 断点恢复只处理 pending 候选；已创建候选保留原 blockID，
            // 避免重试/双击在内核中生成重复卡片。
            const candidate = job?.candidates[card.origIndex];
            if (candidate?.status === "created" && candidate.blockID) {
                blockIDs.push(candidate.blockID);
                await this.rememberSourceFingerprint(candidate.blockID, docID);
                continue;
            }
            // 写入前先按作业+候选稳定标记查找。若内核写成功后进程在记账前崩溃，
            // 重试会复用原块而不是再造一张重复卡；标记是 HTML 注释，不会出现在卡面。
            const marker = buildAiCardMarker(job?.id, card.origIndex);
            let blockID = "";
            if (marker) {
                try {
                    const escapedDoc = docID.replace(/'/g, "''");
                    const escapedMarker = marker.replace(/'/g, "''");
                    const rows = await sqlQuery(`SELECT id FROM blocks WHERE root_id='${escapedDoc}' AND markdown LIKE '%${escapedMarker}%' LIMIT 1`);
                    blockID = String(rows[0]?.id ?? "");
                } catch {
                    // 查询不可用时仍允许继续写入；成功后候选状态会阻止同一进程内重复。
                }
            }
            const cardMarkdown = buildAiCardBlockMarkdown(card.q, card.a, marker);
            if (!blockID) {
                const ids = await appendBlock("markdown", cardMarkdown, docID);
                blockID = ids[0] ?? "";
            }
            if (!blockID) throw new Error(this.i18n.quickCardFail);
            blockIDs.push(blockID);
            // ADR-7：逐卡入组成功即记账（单卡批），origIndex 指向作业 candidates 原位（✕ 移除后仍正确）
            await addRiffCards(deckID, [blockID]);
            await this.rememberSourceFingerprint(blockID, docID, cardMarkdown);
            if (job) {
                const r = transitionJob(job, { type: "CARD_CREATED", index: card.origIndex, blockID });
                if (r.ok) {
                    job = r.job;
                    this.upsertAIJob(job);
                    await this.persistAIJobsOnce(`${job.id}:card:${card.origIndex}:${blockID}`);
                }
            }
        }
        // 未勾选/被移除的候选记 CARD_SKIPPED，使 COMMIT_DONE 可通过（保留勾选但未导入的语义留痕）
        if (job) {
            for (let idx = 0; idx < job.candidates.length; idx++) {
                if (job.candidates[idx].status === "pending") {
                    const r = transitionJob(job, { type: "CARD_SKIPPED", index: idx });
                    if (r.ok) { job = r.job; }
                }
            }
            this.upsertAIJob(job);
            await this.persistAIJobsOnce(`${job.id}:skipped`);
            const done = transitionJob(job, { type: "COMMIT_DONE" });
            if (done.ok) {
                job = done.job;
                this.upsertAIJob(job);
                await this.persistAIJobsOnce(`${job.id}:done`);
            }
        }
        // docs/14 §8：cards-created 事件从「预留」转正（ADR-7 落地后有了确定 payload）
        // AT-4：新卡即时到期，共享 due 缓存同步失效
        invalidateDueCache();
        try {
            (this.eventBus as any).emit(LV_EVENTS.cardsCreated, cardsCreatedEvent({
                deckID, count: blockIDs.length, blockIDs,
            }));
        } catch { /* 事件旁路 */ }
        showMessage(this.i18n.deckAdded.replace("${n}", String(blockIDs.length)), 2000, "info");
    }

    /** Replace one job snapshot in-place; duplicated IDs make recovery read stale state. */
    private upsertAIJob(job: AIJob) {
        this.aiJobsMutationVersion += 1;
        this.aiJobs.jobs = pruneJobs([...this.aiJobs.jobs.filter(existing => existing.id !== job.id), job]);
    }

    /** 持久化作业快照；失败时恢复调用前的完整作业列表，避免恢复页读到假成功。 */
    private async persistAIJobs(previous: AIJobsData): Promise<void> {
        const version = this.aiJobsMutationVersion;
        const next = cloneStore(this.aiJobs);
        try {
            await this.persist.save(AI_JOBS_DATA, next);
            this.persistedAIJobsSnapshot = cloneStore(next);
        } catch (error) {
            if (version === this.aiJobsMutationVersion) {
                this.aiJobs = cloneStore(this.persistedAIJobsSnapshot ?? previous);
            }
            throw error;
        }
    }

    /** Persist one idempotent job checkpoint and advance the rollback baseline only
     * after the write has actually succeeded. */
    private async persistAIJobsOnce(operationId: string): Promise<void> {
        const next = cloneStore(this.aiJobs);
        const version = this.aiJobsMutationVersion;
        try {
            await this.persist.saveOnce(AI_JOBS_DATA, operationId, next);
            this.persistedAIJobsSnapshot = cloneStore(next);
        } catch (error) {
            if (version === this.aiJobsMutationVersion && this.persistedAIJobsSnapshot) {
                this.aiJobs = cloneStore(this.persistedAIJobsSnapshot);
            }
            throw error;
        }
    }

    /** ADR-7：只提示写入阶段的未完成作业，恢复页负责安全核对或审核恢复。 */
    private getUnfinishedAIJob(): { id: string; done: number; total: number; failed: { index: number; q: string; error: string }[] } | null {
        return findUnfinishedAIJob(this.aiJobs.jobs);
    }

    private async getReviewableAIJob(jobId: string) {
        const job = this.aiJobs.jobs.find(item => item.id === jobId);
        if (!job) return null;
        const prepared = prepareReviewableJob(job, this.i18n.unknown);
        if (!prepared) return null;
        if (prepared.resumed) {
            this.upsertAIJob(prepared.job);
            await this.persistAIJobs(this.persistedAIJobsSnapshot ?? this.aiJobs);
        }
        return prepared.view;
    }

    /** Summary only; raw candidate text stays in the AI wizard. */
    private getRecoverableAIJobs(): {
        id: string; status: string; pending: number; failed: number; created: number; source: string;
        canReview: boolean; needsWriteCheck: boolean; deckID: string;
    }[] {
        return getRecoverableJobSummaries(this.aiJobs.jobs, this.i18n.unknown);
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
        if (!this.revlogPendingSnapshot) {
            this.revlogPendingSnapshot = normalizeRevlog(JSON.parse(JSON.stringify(this.revlog)));
        }
        this.revlogMutationVersion += 1;
        const today = localDate(Date.now());
        const prevCount = this.revlog.days[today]?.review ?? 0;
        const streakBefore = calcStreak(this.revlog);
        appendRevlog(this.revlog, { ts: entry.ts ?? Date.now(), ...entry } as RevlogEntry);
        const streakAfter = calcStreak(this.revlog);
        this.scheduleRevlogSave();
        // AT-4：评分事实先失效共享 due 缓存（插件/原生两路都经此漏斗），badge/总览下一次读取即拉新
        invalidateDueCache();
        this.refreshDueBadge();
        // M8·FR1：目标跨越庆祝；M11·FR1：生态事件广播
        const target = this.settings.dailyReviewTarget;
        const nowCount = this.revlog.days[today]?.review ?? 0;
        if (target > 0 && prevCount < target && nowCount >= target && !this.inQuietHours()) {
            showMessage(this.i18n.dailyTargetReached, 3000, "info");
        }
        try {
            (this.eventBus as any).emit(LV_EVENTS.reviewed, reviewedEvent({
                cardID: entry.cardID, deckID: entry.deckID, blockID: entry.blockID,
                rating: entry.rating, source: entry.source,
            }));
            if (streakAfter !== streakBefore) {
                (this.eventBus as any).emit(LV_EVENTS.streakChanged, streakChangedEvent(streakAfter));
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
        // AQ-4：重试与失败记录统一由 persist 队列承担。若最终失败，
        // 只有在写入期间没有产生新评分时才恢复快照，避免覆盖更新的运行态。
        const snapshot = this.revlogPendingSnapshot;
        const version = this.revlogMutationVersion;
        this.revlogPendingSnapshot = null;
        const next = cloneStore(this.revlog);
        this.persist.save(REVLOG_DATA, next).then(() => {
            this.persistedRevlogSnapshot = cloneStore(next);
        }).catch(() => {
            if (version === this.revlogMutationVersion) {
                this.revlog = cloneStore(this.persistedRevlogSnapshot ?? snapshot ?? next);
                this.refreshDueBadge();
                showMessage(this.i18n.storageWriteFail, 4000, "error");
            }
        });
    }

    /** BK-1/BK-2：知识对象/关系图的落盘入口（未来 UI 修改后调用；persist 队列承担重试与失败记录） */
    saveKnowledgeObjects() {
        return this.persist.save(KNOWLEDGE_OBJECTS_DATA, cloneStore(this.knowledgeObjects)).catch(() => { /* onFail 已记录 */ });
    }

    saveCardRelations() {
        return this.persist.save(CARD_RELATIONS_DATA, cloneStore(this.cardRelations)).catch(() => { /* onFail 已记录 */ });
    }

    /** BJ-4：遗忘卡错误原因标注（旁路增强；persist 队列承担重试与失败记录） */
    tagErrorReason(cardID: string, reason: ErrorReason) {
        const previous = cloneStore(this.persistedErrorTagsSnapshot ?? normalizeErrorTags(JSON.parse(JSON.stringify(this.errorTags))));
        if (tagError(this.errorTags, cardID, reason, localDate(Date.now()))) {
            const version = ++this.errorTagMutationVersion;
            const next = cloneStore(this.errorTags);
            void this.persist.save(ERROR_TAGS_DATA, next).then(() => {
                this.persistedErrorTagsSnapshot = cloneStore(next);
            }).catch(() => {
                if (version === this.errorTagMutationVersion) this.errorTags = cloneStore(this.persistedErrorTagsSnapshot ?? previous);
                showMessage(this.i18n.storageWriteFail, 4000, "error");
            });
        }
    }

    /** BI-4：材料收件箱落盘入口（未来筛选 UI 修改后调用；persist 队列承担重试与失败记录） */
    saveInbox() {
        const next = cloneStore(this.inbox);
        return this.persist.save(INBOX_DATA, next).then(() => {
            this.persistedInboxSnapshot = cloneStore(next);
        }).catch(() => { /* onFail 已记录 */ });
    }

    /** 收件箱允许乐观更新，但写入失败必须恢复完整快照，避免 UI 与磁盘分叉。 */
    private mutateInbox(mutate: (next: InboxData) => number | boolean | void): void {
        // Always roll back to the last confirmed disk snapshot. Using the
        // current in-memory value here would preserve an earlier failed
        // optimistic mutation after two writes overlap.
        const previous = cloneStore(this.persistedInboxSnapshot ?? normalizeInbox(JSON.parse(JSON.stringify(this.inbox))));
        const changed = mutate(this.inbox);
        if (changed === false || changed === 0) return;
        const version = ++this.inboxMutationVersion;
        this.notifyInboxChanged();
        const next = cloneStore(this.inbox);
        void this.persist.save(INBOX_DATA, next).then(() => {
            this.persistedInboxSnapshot = cloneStore(next);
        }).catch(() => {
            if (version === this.inboxMutationVersion) {
                this.inbox = previous;
                this.notifyInboxChanged();
            }
            showMessage(this.i18n.storageWriteFail, 4000, "error");
        });
    }

    /** BI-4：收件箱变更监听（BX-10：块菜单收集等外部变更通知 Hub 收件箱页自动刷新） */
    private inboxListeners = new Set<() => void>();

    subscribeInbox(cb: () => void): () => void {
        this.inboxListeners.add(cb);
        return () => this.inboxListeners.delete(cb);
    }

    private notifyInboxChanged() {
        for (const cb of this.inboxListeners) {
            try {
                cb();
            } catch { /* 监听器旁路 */ }
        }
    }

    /** BI-4：块菜单收集入口（返回新增数；已存在的不重复计） */
    addInboxItems(blockIDs: string[]): number {
        let added = 0;
        this.mutateInbox(inbox => {
            for (const id of blockIDs) {
                if (addInboxItem(inbox, id)) added++;
            }
            return added;
        });
        return added;
    }

    /** BI-4：收件箱材料送入 Hub 向导时保留块与文档身份，便于来源审核和禁止外发规则生效。 */
    private async loadInboxSources(blockIDs: string[]) {
        if (blockIDs.length === 0) return [];
        const ids = blockIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
        const rows = await sqlQuery(`SELECT id, content, root_id FROM blocks WHERE id IN (${ids})`);
        const byID = new Map(rows.map(r => [String(r.id), {
            content: String(r.content ?? "").trim(),
            rootID: String(r.root_id ?? ""),
        }]));
        return blockIDs.flatMap(id => {
            const item = byID.get(id);
            if (!item?.content) return [];
            const label = item.content.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 40) || id.slice(0, 8);
            return [{ label, content: item.content, docId: item.rootID || undefined, inboxId: id }];
        });
    }

    /** 只有候选成功写入后才把对应来源从收件箱移出。 */
    private completeInboxCards(blockIDs: string[]) {
        const unique = [...new Set(blockIDs.filter(Boolean))];
        if (unique.length === 0) return;
        this.mutateInbox(inbox => {
            let changed = 0;
            for (const id of unique) if (removeInboxItem(inbox, id)) changed++;
            return changed;
        });
        for (const id of unique) {
            void this.transitionContentState(id, "candidate", "收件箱入选")
                .then(() => this.transitionContentState(id, "reviewed", "向导逐张确认"))
                .then(() => this.transitionContentState(id, "stocked", "制卡入库"))
                .catch(() => { /* 生命周期旁路失败由持久化错误提示承接 */ });
        }
    }

    /** BI-1/BI-3/BI-5：学习旅程三存储的落盘入口（未来 UI 修改后调用；persist 队列承担重试与失败记录） */
    saveLearningGoals() {
        return this.persist.save(LEARNING_GOALS_DATA, cloneStore(this.learningGoals)).catch(() => { /* onFail 已记录 */ });
    }

    saveEntryContexts() {
        return this.persist.save(ENTRY_CONTEXTS_DATA, cloneStore(this.entryContexts)).catch(() => { /* onFail 已记录 */ });
    }

    saveContentLifecycles() {
        return this.persist.save(CONTENT_LIFECYCLES_DATA, cloneStore(this.contentLifecycles)).catch(() => { /* onFail 已记录 */ });
    }

    /** BU-31：紧急停用状态落盘 */
    saveKillSwitch() {
        return this.persist.save(AI_KILL_SWITCH_DATA, cloneStore(this.killSwitch)).catch(() => { /* onFail 已记录 */ });
    }

    /** AI 安全开关采用“新快照先落盘、成功后发布”的原子写入口。 */
    private async mutateKillSwitch(mutate: (next: AIKillSwitchData) => void): Promise<AIKillSwitchData> {
        const operation = this.killSwitchMutationQueue.then(async () => {
            const previous = cloneStore(this.killSwitch);
            const next = normalizeKillSwitch(cloneStore(this.killSwitch));
            mutate(next);
            try {
                await this.persist.save(AI_KILL_SWITCH_DATA, next);
                this.killSwitch = next;
                return this.killSwitch;
            } catch (error) {
                // Persist-first means the live state has not changed yet; keep
                // the last committed value even when a prior caller mutated it.
                this.killSwitch = previous;
                throw error;
            }
        });
        this.killSwitchMutationQueue = operation.then(() => undefined, () => undefined);
        return operation;
    }

    /** BU-31：当前 provider/model 目标键（紧急停用粒度） */
    private aiProviderTargets(): string[] {
        const targets = [`provider:${this.settings.aiMode}:${this.settings.aiMode === "custom" ? this.settings.aiEndpoint : "siyuan"}`];
        if (this.settings.aiModel) targets.push(`model:${this.settings.aiModel}`);
        return targets;
    }

    /** BU-31：清理待发队列（活动态作业 → canceled；验收「清理待发队列」） */
    private cancelPendingAiJobs(): number {
        const result = cancelAllActiveJobs(this.aiJobs.jobs);
        if (result.modified) {
            this.aiJobs.jobs = result.jobs;
            const version = this.aiJobsMutationVersion;
            const next = cloneStore(this.aiJobs);
            this.persist.save(AI_JOBS_DATA, next).then(() => {
                this.persistedAIJobsSnapshot = cloneStore(next);
            }).catch(() => {
                if (version === this.aiJobsMutationVersion && this.persistedAIJobsSnapshot) {
                    this.aiJobs = cloneStore(this.persistedAIJobsSnapshot);
                }
            });
        }
        return result.canceledCount;
    }

    private learningGoalsMutation = createSnapshotMutationQueue<LearningGoalsData>(
        () => this.learningGoals,
        current => ({
            version: 1,
            goals: current.goals.map(goal => ({
                ...goal,
                materialBlockIDs: [...goal.materialBlockIDs],
                criteriaHistory: goal.criteriaHistory?.map(item => ({ ...item })),
            })),
        }),
        next => this.persist.save(LEARNING_GOALS_DATA, next),
        next => { this.learningGoals = next; },
    );

    /** BI-1：目标写入串行化；先持久化不可变快照，成功后才替换运行态。 */
    private mutateLearningGoals(mutate: (next: LearningGoalsData) => void): Promise<LearningGoalsData> {
        return this.learningGoalsMutation(mutate);
    }

    /** BI-1：目标 upsert（空 id 自动生成）；持久化失败时保留旧运行态并向页面抛错。 */
    saveLearningGoal(goal: LearningGoal): Promise<LearningGoalsData> {
        return this.mutateLearningGoals(next => {
            const g: LearningGoal = { ...goal, updatedAt: Date.now(), materialBlockIDs: [...goal.materialBlockIDs], criteriaHistory: goal.criteriaHistory?.map(item => ({ ...item })) };
            if (!g.id) g.id = `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            const i = next.goals.findIndex(x => x.id === g.id);
            if (i >= 0) next.goals[i] = g;
            else next.goals.push(g);
        });
    }

    /** BI-1：删除目标；确认后持久化失败时保留旧运行态并向页面抛错。 */
    deleteLearningGoal(id: string): Promise<LearningGoalsData> {
        return this.mutateLearningGoals(next => { next.goals = next.goals.filter(goal => goal.id !== id); });
    }

    /** 兼容 Hub 既有命名，同时确保删除走同一事务队列。 */
    removeLearningGoal(id: string): Promise<LearningGoalsData> {
        return this.deleteLearningGoal(id);
    }

    /** BI-5：内容状态转移入口（校验+落盘一体；非法转移返回 false 不写盘） */
    async transitionContentState(blockID: string, to: ContentState, reason: string): Promise<boolean> {
        let changed = false;
        await this.contentLifecyclesMutations(next => {
            changed = transition(ensureLifecycle(next, blockID), to, reason, Date.now());
            if (!changed) throw new Error("invalid content lifecycle transition");
        });
        return changed;
    }

    private openTabOf(type: string, data?: Record<string, unknown>) {
        // 真机验收修正（v0.110.2）：Plugin 实例在 3.8.6 上没有 openTab 方法（旧实例 API 已移除，
        // 仅剩模块级 openTab 函数）——此前经 anySelf 绕过类型检查，真机点击入口即抛
        // "this.openTab is not a function"。改用模块级 openTab + custom 页签契约。
        // 注意 id 必须与 addTab 注册键一致：bundle 中 addTab 以 this.name + type「无分隔符」
        // 登记 models（source: common.js addTab 实现），带 "-" 会查不到模型导致页签空白。
        // T13 去重（docs/40 UX 待办收敛）：中心/复习为单实例工作面——已存在同型页签时激活复用，
        // 不再新开（连点顶栏/命令面板反复入不再堆重复页签）；带 data 的定点打开（scope/cram/子页）
        // 对中心走 lv-switch-tab 事件切换子页，对复习保持新开（有意进入特定状态）。
        const existing = getAllTabs(`${this.name}${type}`)[0];
        if (existing) {
            existing.headElement.click();
            if (type === TAB_DASHBOARD && data?.tab && typeof data.tab === "string") {
                existing.panelElement
                    ?.querySelector(".lv-hub")
                    ?.dispatchEvent(new CustomEvent("lv-switch-tab", { detail: { tab: data.tab, focusBlockID: data.focusBlockID } }));
            }
            return;
        }
        openTab({
            app: this.app,
            custom: {
                id: `${this.name}${type}`,
                icon: "iconLvCards",
                title: type === TAB_REVIEW ? this.i18n.menuReview : this.i18n.menuDashboard,
                data,
            },
        });
    }

    private showTopbarMenu(evt: MouseEvent) {
        showPluginTopbarMenu({
            v2State: this.flashcardV2 ? this.flashcardV2.state : null,
            modules: this.settings.modules,
            i18n: this.i18n,
            actions: {
                openDashboard: () => this.openTabOf(TAB_DASHBOARD),
                openReview: () => this.openTabOf(TAB_REVIEW),
                openManager: () => this.openTabOf(TAB_DASHBOARD, { tab: "manage" }),
                openQuickCard: () => this.openQuickCard(),
                openOnboarding: () => this.openOnboarding(),
                openAIWizard: () => this.openAIWizard(),
                openSettingsDialog: () => this.openSettingsDialog(),
            },
        }, evt);

        const today = localDate(Date.now());
        const stat = this.revlog.days[today];
        if (stat && this.settings.dailyReviewTarget > 0 && stat.review >= this.settings.dailyReviewTarget) {
            showMessage(this.i18n.dailyTargetReached, 3000, "info");
        }
    }

    private async openSettingsDialog(onSaved?: () => void) {
        try {
            const SettingsPanel = await loadSettingsPanel();
            const { close, dialog } = svelteDialog({
                title: this.i18n.settingsTitle,
                component: SettingsPanel,
                width: "min(620px, 94vw)",
                // 完整设置内容远超一屏；明确限制弹窗高度后，设置面板才能建立可滚动边界。
                height: "min(860px, calc(100vh - 48px))",
                props: {
                    ctx: {
                    i18n: this.i18n,
                    settings: this.settings,
                    close: () => close(),
                    save: async (s: LvCardsSettings) => {
                        const previous = this.settings;
                        this.settings = s;
                        try {
                            await this.saveSettingsNow();
                        } catch (e) {
                            this.settings = previous;
                            this.setupBadgeTimer();
                            throw e;
                        }
                        showMessage(this.i18n.settingsSaved, 2000, "info");
                        onSaved?.();
                    },
                    exportRevlog: () => this.exportRevlog(),
                    clearRevlog: () => this.clearRevlog(),
                    // BU-24/25：AI 用量账本（导出/清空 + 本月已用显示）
                    costLedger: {
                        export: () => this.exportCostLedger(),
                        clear: () => this.clearCostLedger(),
                        monthUsed: () => budgetState(this.costLedger, { enabled: false, monthlyTokenCap: 0 }).monthUsed,
                    },
                    // 备份与恢复中心（docs/38 P2）：导出 bundle / 从文件恢复（预览→确认→应用）
                    backup: {
                        export: () => this.exportBackup(),
                        restore: (text: string) => this.restoreBackupFromFile(text),
                    },
                    // Obsidian SR 导入弱台账（幂等重导）；可选——旧宿主不传则不持久化
                    obLedger: {
                        load: async () => this.obLedger,
                        save: async (entries: unknown) => {
                            const previous = this.obLedger;
                            const next = normalizeObLedger(entries);
                            try {
                                await this.persist.save(OB_LEDGER_DATA, next);
                                this.obLedger = next;
                            } catch (e) {
                                this.obLedger = previous;
                                throw e;
                            }
                        },
                    },
                    // Anki M3：guid 导入台账（幂等重导）——启动已装载，读写内存副本
                    ankiLedger: {
                        load: async () => this.ankiLedger,
                        save: async (entries: unknown) => {
                            const previous = this.ankiLedger;
                            const next = normalizeLedger(entries);
                            try {
                                await this.persist.save(ANKI_LEDGER_DATA, next);
                                this.ankiLedger = next;
                            } catch (e) {
                                this.ankiLedger = previous;
                                throw e;
                            }
                        },
                    },
                    rememberSourceFingerprint: (blockID: string, rootID?: string, markdown?: string) => this.rememberSourceFingerprint(blockID, rootID, markdown),
                    // BU-31：紧急停用/撤销同意（停用即清理待发队列；事件记录不含敏感内容）
                    killswitch: {
                        snapshot: () => this.killSwitch,
                        stopCurrent: async () => {
                            const targets = this.aiProviderTargets();
                            this.cancelPendingAiJobs();
                            return this.mutateKillSwitch(next => {
                                for (const t of targets) disableTarget(next, t, Date.now());
                            });
                        },
                        resumeAll: async () => {
                            const targets = this.aiProviderTargets();
                            return this.mutateKillSwitch(next => {
                                for (const t of targets) enableTarget(next, t, Date.now());
                            });
                        },
                        revoke: async () => {
                            this.cancelPendingAiJobs();
                            return this.mutateKillSwitch(next => revokeConsent(next, Date.now()));
                        },
                        grant: async () => {
                            return this.mutateKillSwitch(next => grantConsent(next, Date.now()));
                        },
                    },
                    redetectV2: async () => {
                        this.flashcardV2 = await detectFlashcardV2();
                        const state = this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)";
                        this.settings.gatewayState = state;
                        this.saveSettingsSoon();
                        // gateway-changed（M11 事件契约）：网关状态变化广播
                        try {
                            (this.eventBus as any).emit(LV_EVENTS.gatewayChanged, gatewayChangedEvent(state));
                        } catch { /* 事件旁路 */ }
                        return state;
                    },
                    getV2Status: () => this.flashcardV2 ? this.flashcardV2.state : "N/A (<3.9.0)",
                    getSuspendedCount: () => this.suspendToday.cardIDs.length,
                    restoreAllSuspended: async () => {
                        const ids = [...this.suspendToday.cardIDs];
                        if (ids.length === 0) return;
                        try {
                            await this.suspendTodayMutations.unsuspend(ids);
                            showMessage(this.i18n.settingsSaved, 2000, "info");
                        } catch {
                            showMessage(this.i18n.storageWriteFail, 4000, "error");
                            throw new Error(this.i18n.storageWriteFail);
                        }
                    },
                    testAnkiClient: (url?: string, key?: string) => this.testAnkiClient(url, key),
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
                        const previous = this.settings;
                        const next = normalizeSettings(JSON.parse(fileText));
                        this.settings = next;
                        try {
                            await this.saveSettingsNow();
                        } catch (e) {
                            this.settings = previous;
                            this.setupBadgeTimer();
                            throw e;
                        }
                    },
                    exportRevlogCsv: () => this.exportRevlogCsv(),
                    importRevlogCsv: async (fileText: string) => {
                        const imported = parseRevlogCsv(fileText);
                        const previous = this.revlog;
                        const next = normalizeRevlog(JSON.parse(JSON.stringify(previous)));
                        const result = mergeRevlog(next, imported);
                        const version = ++this.revlogMutationVersion;
                        this.revlog = next;
                        this.refreshDueBadge();
                        await this.persist.save(REVLOG_DATA, cloneStore(next)).then(() => {
                            if (version === this.revlogMutationVersion) this.persistedRevlogSnapshot = cloneStore(next);
                        }).catch(error => {
                            if (version === this.revlogMutationVersion) {
                                this.revlog = cloneStore(this.persistedRevlogSnapshot ?? previous);
                                this.refreshDueBadge();
                            }
                            throw error;
                        });
                        return result;
                    },
                    importRevlogMerge: async (fileText: string, onFork?: "skip" | "preferImport") => {
                        const imported = JSON.parse(fileText);
                        const previous = this.revlog;
                        const next = normalizeRevlog(JSON.parse(JSON.stringify(previous)));
                        const result = mergeRevlog(next, imported, { onFork });
                        const version = ++this.revlogMutationVersion;
                        this.revlog = next;
                        this.refreshDueBadge();
                        await this.persist.save(REVLOG_DATA, cloneStore(next)).then(() => {
                            if (version === this.revlogMutationVersion) this.persistedRevlogSnapshot = cloneStore(next);
                        }).catch(error => {
                            if (version === this.revlogMutationVersion) {
                                this.revlog = cloneStore(this.persistedRevlogSnapshot ?? previous);
                                this.refreshDueBadge();
                            }
                            throw error;
                        });
                        return result;
                    },
                    },
                },
            });
            dialog.element.classList.add("lv-dialog--settings");
        } catch (e) {
            this.reportDialogOpenFailure(this.i18n.settingsTitle, e);
        }
    }

    /** 导出本地复习日志（M10·FR1） */
    private exportRevlog() {
        const stamp = localDate(Date.now());
        downloadFile(`lv-cards-revlog-${stamp}.json`, formatRevlogExportJson(this.revlog), "application/json");
    }

    /** 导出设置为 JSON 文件 */
    private exportSettings() {
        downloadFile(`lv-cards-settings-${localDate(Date.now())}.json`, formatSettingsExportJson(this.settings), "application/json");
    }

    /** 导出 CSV（带 BOM，Excel 友好） */
    private exportRevlogCsv() {
        const stamp = localDate(Date.now());
        downloadFile(`lv-cards-revlog-${stamp}.csv`, formatRevlogExportCsv(this.revlog), "text/csv");
    }

    /** 清空本地复习日志（热力图与连击归零；不影响内核调度） */
    private async clearRevlog() {
        const previous = cloneStore(this.persistedRevlogSnapshot ?? this.revlog);
        const next = emptyRevlog();
        const version = ++this.revlogMutationVersion;
        this.revlog = next;
        this.refreshDueBadge();
        try {
            await this.persist.save(REVLOG_DATA, cloneStore(next));
            if (version === this.revlogMutationVersion) this.persistedRevlogSnapshot = cloneStore(next);
            showMessage(this.i18n.settingsSaved, 2000, "info");
        } catch {
            if (version === this.revlogMutationVersion) {
                this.revlog = cloneStore(this.persistedRevlogSnapshot ?? previous);
                this.refreshDueBadge();
            }
            showMessage(this.i18n.storageWriteFail, 4000, "error");
            throw new Error(this.i18n.storageWriteFail);
        }
    }

    /** BU-25：导出 AI 用量账本（聚合视图 + 明细；不含 key 与原文） */
    private exportCostLedger() {
        const payload = buildCostLedgerExportPayload(this.costLedger);
        downloadFile(`lv-cards-ai-cost-${localDate(Date.now())}.json`, JSON.stringify(payload, null, 2), "application/json");
    }

    /** BU-25：清空 AI 用量账本（预算随之归零重计） */
    private async clearCostLedger() {
        const previous = cloneStore(this.persistedCostLedgerSnapshot ?? this.costLedger);
        const next = emptyCostLedger();
        const version = ++this.costLedgerMutationVersion;
        this.costLedger = next;
        try {
            await this.persist.save(AI_COST_LEDGER_DATA, cloneStore(next));
            if (version === this.costLedgerMutationVersion) this.persistedCostLedgerSnapshot = cloneStore(next);
            showMessage(this.i18n.settingsSaved, 2000, "info");
        } catch {
            if (version === this.costLedgerMutationVersion) {
                this.costLedger = cloneStore(this.persistedCostLedgerSnapshot ?? previous);
            }
            showMessage(this.i18n.storageWriteFail, 4000, "error");
            throw new Error(this.i18n.storageWriteFail);
        }
    }

    /** 备份与恢复中心：导出全部私有存储为单文件 bundle（manifest 含校验和；含用户内容，用户自管） */
    private exportBackup() {
        void (async () => {
            const files = await this.readAllStores();
            const bundle = buildBackupBundle(files);
            downloadFile(`lv-cards-backup-${localDate(Date.now())}.json`, JSON.stringify(bundle, null, 2), "application/json");
        })();
    }

    /** 备份与恢复中心：导入恢复——预览（校验+逐 key 对比）→ 确认 → 队列落盘 → 内存重载。
     * 预览失败直接抛可读原因（不改任何状态）；确认前当前状态不受影响（可先导出回滚）。 */
    private async restoreBackupFromFile(text: string) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new Error((this.i18n as any).backup?.badJson ?? "invalid JSON");
        }
        const current = await this.readAllStores();
        const preview = previewRestore(parsed, current, [...LvCardsPlugin.STORE_KEYS]);
        const dict = (this.i18n as any).backup ?? {};
        if (!preview.ok) {
            throw new Error(`${dict.badBundle ?? "backup rejected"}: ${preview.errors.slice(0, 3).join("; ")}`);
        }
        const actLabel = { replace: dict.actReplace ?? "overwrite", add: dict.actAdd ?? "add", unchanged: dict.actUnchanged ?? "keep" } as const;
        const rows = preview.perKey
            .slice(0, 12)
            .map(k => `<li>${actLabel[k.action]} · ${k.key}</li>`)
            .join("") + (preview.perKey.length > 12 ? `<li>… +${preview.perKey.length - 12}</li>` : "");
        const created = preview.createdAt ? new Date(preview.createdAt).toLocaleString() : "—";
        const ok = await confirmDialogBool({
            title: dict.restoreTitle ?? "Restore backup",
            content: `<div class="b3-typography"><p>${(dict.restoreWarn ?? "").replace("${created}", created)
                .replace("${r}", String(preview.summary.replace))
                .replace("${a}", String(preview.summary.add))
                .replace("${u}", String(preview.summary.unchanged))}</p><ul>${rows}</ul></div>`,
        });
        if (!ok) {
            return;
        }
        await applyRestoreTransaction({
            restoreFiles: preview.files,
            currentFiles: current,
            saveFile: (key, data) => this.persist.save(key, cloneStore(data)),
            logError: (msg) => lvLog("error", msg),
        });
        // 内存态与磁盘对齐（重载走与 onload 同一装配路径）
        await this.applyLoadedStores(await this.readAllStores());
        this.refreshDueBadge();
        showMessage(dict.restoreDone ?? "restored", 2500, "info");
        lvLog("info", `[backup] restored ${Object.keys(preview.files).length} files (replace=${preview.summary.replace} add=${preview.summary.add})`);
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
        // AR-5：成功回显路径并打开文档（失败由调用方 catch 展示，报告可重试）
        showMessage((this.i18n as any).dashboard?.reportWritten ?? docID, 2500, "info");
        openTab({ app: this.app, doc: { id: docID } });
    }

    /** T-周报（docs/41 P1）：自动把上周复盘写入「小驴闪卡/学习周报」文档——静默写入，不自动打开（区别于手动报告） */
    private async maybeWriteWeeklyReport() {
        const payload = assembleWeeklyReportPayload({
            now: new Date(),
            lastWeekKey: this.settings.weeklyReportLast,
            enabled: this.settings.weeklyReportEnabled,
            revlog: this.revlog,
            i18n: this.i18n,
        });
        if (!payload.shouldWrite || !payload.docTitle || !payload.markdown || !payload.weekKey) {
            return;
        }
        const nb = await this.targetNotebook();
        if (!nb) {
            throw new Error(this.i18n.onboardingNoNotebook);
        }
        const docID = await createDocWithMd(nb.id, payload.docTitle, payload.markdown);
        if (!docID) {
            throw new Error(this.i18n.quickCardFail);
        }
        // 幂等键推进（仅在写入成功后；失败下周随本周一起补）
        this.settings.weeklyReportLast = payload.weekKey;
        this.saveSettingsSoon();
        showMessage((this.i18n as any).weeklyReport_written ?? docID, 2500, "info");
    }
}
