<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { rafThrottle } from "@/libs/throttle";
    import { countUp } from "./kit/countup";
    import { getMotionDuration } from "./kit/motion";
    import { openTab, showMessage } from "siyuan";
    import {
        getRiffDueCards, getRiffDecks, getNotebookRiffDueCards, getTreeRiffDueCards, reviewRiffCard, skipReviewRiffCard,
        batchSetRiffCardsDueTime,
        type RiffDueCard, type RiffDeck, type Rating,
    } from "@/api/riff";
    import { getNotebooks, getBlockAttrs, getBlockDOM, type Notebook } from "@/api/siyuan";
    import * as siyuanApi from "@/api/siyuan";
    import { isCardNew, calcStreak, type RevlogData } from "@/core/revlog";
    import { gradeTyping, type Rating1to4 } from "@/core/card-types";
    import { parseOcclusion, type OcclusionData } from "@/core/occlusion";
    import { parseDelimitedQa, hasDelimitedQa } from "@/core/delimited-qa";
    import { hasQuestionMediaContent, validateFlashcardMarkdown } from "@/core/flashcard-quality";
    import { partitionReviewCardsByQuality } from "@/core/review-queue-quality";
    import { mapChunksOrdered } from "@/core/query-chunks";
    import { todayKey } from "@/core/exam";
    import { mergeSessionPrefs, pruneSessionPrefs } from "@/core/session-prefs";
    import { END_REASONS, hasSessionProgress, markSessionCompleted, withEndReason, type EndReason } from "@/core/session-state";
    import { isLongReturn, returnCheck, type ReturnCheckFacts } from "@/core/return-check";
    import { avgSecPerCard, budgetLeftSec, BUDGET_PRESETS, clampBudgetMinutes, estimateCompletable, estimateLeftover, isBudgetExpired } from "@/core/session-budget";
    import { nominateVariant } from "@/core/question-rotation";
    import { buildChoiceOptions } from "@/core/choice-options";
    import { analyzeFaceRichness, extractMarkTexts, faceHintKeys, hasRichContent, maskMarkedAnswersForQuestion } from "@/core/card-face";
    import { loadReliefChoices, type LoadChoice } from "@/core/load-relief";
    import { recoveryOptions, type RecoveryOption, type RecoverySnapshot } from "@/core/session-recovery";
    import { triageReturn, RETURN_REASONS, type ReturnReason } from "@/core/return-triage";
    import { SESSION_PURPOSES, PURPOSE_PROFILES, type SessionPurpose } from "@/core/session-purpose";
    import { reviewSwipeAction, shouldIgnoreSwipeTarget } from "@/core/review-gesture";
    import { playReviewSfx, speakReviewText, speakAnswerText, closeReviewAudio } from "@/core/review-audio";
    import { resolveReviewKeyAction } from "@/core/review-shortcuts";
    import { createReviewCountdown, formatCountdown, type ReviewCountdownController } from "@/core/review-countdown";
    import { enqueueDelayedRequeue, nextRequeueDelay, SHORT_REQUEUE_DELAY_MS, takeDueRequeues, type DelayedRequeue } from "@/core/delayed-requeue";
    import { invalidateDueCache, dueCache } from "@/api/due-shared";
    import { nextHint, logHint, deriveHintLevels, availableLevels, type HintLevel, type HintLevelsInput } from "@/core/hint-ladder";
    import LvKbd from "./kit/LvKbd.svelte";
    import LvLive from "./kit/LvLive.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvError from "./kit/LvError.svelte";
    import LvSkeleton from "./kit/LvSkeleton.svelte";
    import LvIcon from "./kit/LvIcon.svelte";
    import { friendlyError } from "@/api/errors";
    import { triggerHaptic } from "@/core/haptic";
    import { lvLog } from "@/libs/log";
    import { trapFocus } from "@/libs/focus-trap";
    import { parseHPathToBreadcrumbs, type ReviewBreadcrumbChain } from "@/core/review-breadcrumbs";
    import { parseInteractiveQuiz, type InteractiveQuizData } from "@/core/quiz-interactive";
    import { filterBurySiblings } from "@/core/sibling-cards";
    import { logCheckinEventSafely } from "@/libs/ecosystem-bridge-kit";

    export interface ReviewSettings {
        ratingStyle: "four" | "three";
        timeoutMode: "off" | "reveal" | "forget";
        timeoutSeconds: number;
        randomOrder: boolean;
        burySiblings: boolean;
        cardMaxWidth: number;
        typingEnabled: boolean;
        typingStrict: boolean;
        choiceEnabled: boolean;
        /** 混合题型轮换（v0.179.0）：按本场张数在翻面/打字/选择间轮换（展示层，不动调度） */
        mixedRotation: boolean;
        ttsEnabled: boolean;
        ttsRate: number;
        ttsVoice: string;
        batchLimit: number;
        dictationEnabled: boolean;
        requeueAgain: boolean;
        /** 每日复习目标（完成页进度展示） */
        dailyReviewTarget: number;
        /** 卡面字号缩放（438） */
        cardFontScale: number;
        /** 自定义卡面样式（仅作用于卡面正文内部） */
        customCardCss?: string;
        /** 评分按钮密度（441） */
        ratingDensity: "cozy" | "compact";
        /** 评分音效开关与风格（250） */
        sfxEnabled: boolean;
        sfxStyle: "chime" | "wood" | "bell";
        /** 答案揭示前隐藏卡面元信息（442） */
        hideMetaUntilAnswer: boolean;
        /** 队列倒序（431） */
        reverseOrder: boolean;
        /** 单卡作答耗时封顶秒（AQ-13） */
        answerTimeCapSec: number;
        /** 易混淆卡片遗忘次数门限 */
        leechThreshold?: number;
        /** 每日一语（375） */
        dailyTipEnabled: boolean;
        /** 联动小驴打卡目标条目 ID（可选，空=不联动） */
        checkinItemId?: string;
    }

    export interface ReviewCtx {
        i18n: any;
        app: any;
        /** 实时读取设置（保存后热生效，无需重建面板） */
        settings: () => ReviewSettings;
        /** T01 可用时间偏好（分钟，0=不限）：复习开场默认预算（hero 选择落偏好） */
        preferredBudgetMin?: () => number;
        /** 初始范围（考试模式直达）："" 或 "deck:<id>" / "notebook:<id>" */
        initialScope?: string;
        /** 初始 cram 模式（考前：lapses 降序） */
        initialCram?: boolean;
        appendRevlog: (entry: { cardID: string; deckID: string; blockID: string; rating: number; source: "plugin" }) => void;
        /** BJ-4：遗忘卡错误原因标注（旁路增强） */
        tagErrorReason?: (cardID: string, reason: string) => void;
        /** BK-1↔BJ-2：按来源块查知识对象（提示内容优先来源） */
        getKOBySource?: (blockID: string) => { fact: string; capability: string | null } | null;
        getRevlog: () => RevlogData;
        isSuspendedToday: (cardID: string) => boolean;
        suspendToday: (cardID: string) => void;
        openDashboard: (tab?: string) => void;
        onScopePersist: (scopeKey: string) => void;
        getSessionState: () => { date: string; reviewedIDs: string[]; skippedIDs: string[]; counters: { new: number; review: number; forget: number; skip: number }; endReason?: EndReason | null; completed?: boolean } | null;
        saveSessionState: (s: { date: string; reviewedIDs: string[]; skippedIDs: string[]; counters: { new: number; review: number; forget: number; skip: number }; endReason?: EndReason | null; completed?: boolean }) => void;
        clearSessionState: () => void;
        emitSessionFinished: (summary: { new: number; review: number; forget: number; skip: number }) => void;
        /** 订阅设置变更（AT-10）：保存设置后回调，超时参数立即生效，返回取消函数 */
        onSettingsChanged?: (cb: () => void) => () => void;
        /** 源上下文预览（M3）：来源块前后各 2 块（只读，不含自身） */
        getContextBlocks: (blockID: string) => Promise<{ id: string; html: string }[]>;
        /** BI-10：长期返场检查事实聚合（只读；缺省=不显示检查横幅） */
        getReturnCheckFacts?: () => Promise<ReturnCheckFacts | null>;
        /** BI-3：入口条返回（returnPoint = "doc:<id>" / "hub:<页签>"）；缺省=不显示返回按钮 */
        returnToEntry?: (returnPoint: string) => void;
        /** BI-3：显式清除入口记录（取消/重开不丢——只有用户点 × 才删） */
        dismissEntry?: (entryKind: string, sourceID: string) => void;
        /** 汲取自番茄插件：复习端就地将卡片移出卡组（不伤正文） */
        removeFromDeck?: (blockID: string) => Promise<{ success: boolean; removedCount?: number } | void>;
    }

    let { ctx, initialScope = "all", initialCram = false, initialEntry = null }: {
        ctx: ReviewCtx;
        initialScope?: string;
        initialCram?: boolean;
        /** BI-3：本次会话入口上下文（宿主记录并传入；重开恢复用） */
        initialEntry?: { entryKind: string; sourceID: string; scopeKey: string; returnPoint: string; createdAt: number } | null;
    } = $props();
    const t = $derived(ctx.i18n);
    // BI-3：入口条状态（× 清除后本面板不再显示；记录本身归宿主管）
    // svelte-ignore state_referenced_locally
    let entryCtx = $state(initialEntry);

    /** 会话内重现标记：lvRequeue>0 表示本卡由遗忘卡短期循环追加 */
    type QueueCard = RiffDueCard & { lvRequeue?: number };
    let queue: QueueCard[] = $state([]);
    /** 评分 Again 后的本地延迟队列；不写入会话快照，也不参与内核调度。 */
    let pendingRequeues: DelayedRequeue<QueueCard>[] = $state([]);
    let requeueTimer: ReturnType<typeof setTimeout> | null = null;
    let requeueClockTimer: ReturnType<typeof setInterval> | null = null;
    let requeueNow = $state(Date.now());
    let reviewedIDs: string[] = $state([]);
    let current: QueueCard | null = $state(null);
    let showAnswer = $state(false);
    // 混合题型轮换（v0.179.0）：混合开时按本场张数提名本题形态；关时保持既有静态设置
    const answerVariant = $derived.by(() => {
        void settingsRev; // 设置保存 → settings-changed → rev++ → 出题形态立即重算
        if (eff().mixedRotation) {
            return nominateVariant(reviewedIDs.length, { typing: eff().typingEnabled, choice: eff().choiceEnabled });
        }
        return eff().typingEnabled ? "typing" : eff().choiceEnabled ? "choice" : "flip";
    });
    // 轮换提名 choice 时自动本地采样干扰项（无网络；等同手动 🎲）
    $effect(() => {
        if (answerVariant === "choice" && current && !choices && !choiceLoading && choiceFallbackMode === "none") {
            void startChoice();
        }
    });
    // BJ-2：分级提示（不自动提交评分；纯展示+日志）
    let hintLevel: HintLevel | null = $state(null);
    let hintText = $state("");
    let hintLog: ReturnType<typeof logHint>[] = $state([]);
    // BJ-4：遗忘卡错误原因标注（评分后可选旁路动作；标签走 i18n errReasons 段）
    const ERROR_REASON_IDS = [
        "memory-blank", "concept-confusion", "condition-missed",
        "step-error", "question-unclear", "source-outdated", "attention-lapse",
    ] as const;
    let showErrTags = $state(false);
    let errTagCardID = $state("");
    let errTagged = $state(false);
    let cardHtml = $state("");
    let maskedCardHtml = $derived(maskMarkedAnswersForQuestion(cardHtml));
    /** AS-3：卡面加载失败占位（区别于队列级 errorMsg——队列保持可用，占位可重试） */
    let faceError = $state("");
    // 卡面尚未加载时不允许提前翻面，避免空卡面进入评分流程。
    const faceReady = $derived(Boolean(cardHtml) && !faceError);
    /** AS-3：富内容特征提示（随卡面派生） */
    let faceRich = $derived(cardHtml ? analyzeFaceRichness(cardHtml) : null);
    let faceHints = $derived(faceRich && hasRichContent(faceRich) ? faceHintKeys(faceRich) : []);
    function faceHintText(key: string): string {
        const [, , name] = key.split(".");
        return (t as any).aiFace?.hint?.[name] ?? key;
    }
    // 复习范围（M3·FR1）：all | deck:<id> | notebook:<id>
    // 初值语义：范围仅经命令/考试入口传入一次，运行时由用户切换；
    // 空串/未知的持久化范围归一为 all（否则 select 空白、下拉无选中项）
    // svelte-ignore state_referenced_locally
    let scopeKey = $state(initialScope || "all");
    // svelte-ignore state_referenced_locally
    let cramActive = $state(initialCram === true);
    let decks: RiffDeck[] = $state([]);
    let notebooks: Notebook[] = $state([]);
    let sessionNew = $state(0);
    let sessionReview = $state(0);
    let sessionForget = $state(0);
    let sessionSkip = $state(0);
    let sessionQuizTotal = $state(0);
    let sessionQuizCorrect = $state(0);
    let sessionDone = $state(false);
    // T07 结果页（docs/13 §9）：真实剩余到期（共享缓存，完成时读取；null=未取到不显示）
    let remainingDue = $state<number | null>(null);
    $effect(() => {
        if (!sessionDone) return;
        dueCache.get?.("")
            ?.then((d) => (remainingDue = d?.unreviewedCount ?? null))
            ?.catch(() => (remainingDue = null));
    });
    let loading = $state(false);
    let errorMsg = $state("");
    let submitting = $state(false); // 评分/跳过提交锁（AJ8：重复点击只产生一次写入）
    let loadSeq = 0;                // 卡面异步加载序号（AJ10：旧 DOM 不覆盖新卡）
    let queueSeq = 0;               // 队列请求序号（AQ-19：旧范围/旧重试响应不覆盖新队列）
    let isDisposed = false;
    // AQ-13：题面呈现时刻（monotonic 按壁钟差），评分时按设置封顶后记入 revlog.dur
    let cardShownAt = 0;
    let sessionSkipped = $state<string[]>([]); // 本场跳过排除集（AJ9：跳过的卡不再被下一批拉回）
    let starredCardIDs = $state<Set<string>>(new Set()); // 星标重点卡片集合（对标 Anki Flag / Quizlet Starred）
    let qualityExcludedCardIDs = $state<string[]>([]); // 结构无效/未能验证的存量卡：仅本场排除，不改内核 due
    let lastAnswered = $state<{ html: string; card: RiffDueCard; revealed: boolean } | null>(null); // 回看数据源（AJ2：不再自动打开）

    const requeueWaiting = $derived(!sessionDone && !current && pendingRequeues.length > 0 && !loading && !errorMsg);
    const requeueWaitSeconds = $derived(Math.max(0, Math.ceil((nextRequeueDelay(pendingRequeues, requeueNow) ?? 0) / 1000)));

    function stopRequeueTimers() {
        if (requeueTimer) {
            clearTimeout(requeueTimer);
            requeueTimer = null;
        }
        if (requeueClockTimer) {
            clearInterval(requeueClockTimer);
            requeueClockTimer = null;
        }
    }

    function scheduleRequeueTimer() {
        if (requeueTimer) {
            clearTimeout(requeueTimer);
            requeueTimer = null;
        }
        if (pendingRequeues.length === 0) {
            if (requeueClockTimer) {
                clearInterval(requeueClockTimer);
                requeueClockTimer = null;
            }
            return;
        }
        requeueNow = Date.now();
        const delay = nextRequeueDelay(pendingRequeues, requeueNow);
        requeueTimer = setTimeout(() => {
            requeueTimer = null;
            releaseDueRequeues();
        }, Math.max(0, delay ?? SHORT_REQUEUE_DELAY_MS));
        if (!requeueClockTimer) {
            requeueClockTimer = setInterval(() => {
                requeueNow = Date.now();
            }, 1000);
        }
    }

    function releaseDueRequeues() {
        // Do not race an in-flight kernel fetch. The timer is rescheduled by
        // loadQueue's finally block after the fetched cards have been merged.
        if (loading) {
            requeueTimer = setTimeout(() => {
                requeueTimer = null;
                releaseDueRequeues();
            }, 250);
            return;
        }
        const result = takeDueRequeues(pendingRequeues, Date.now());
        pendingRequeues = result.pending;
        if (result.due.length > 0) {
            queue = [...queue, ...result.due];
            sessionDone = false;
            if (!current && queue.length > 0) {
                void setCurrent(queue[0]);
            }
        }
        scheduleRequeueTimer();
    }

    function queueDelayedRequeue(card: QueueCard) {
        pendingRequeues = enqueueDelayedRequeue(pendingRequeues, { ...card, lvRequeue: 1 });
        scheduleRequeueTimer();
    }

    function clearPendingRequeues() {
        pendingRequeues = [];
        stopRequeueTimers();
    }

    function changeScope() {
        // 延迟卡属于原范围；切换范围后丢弃，避免跨范围误出卡。
        clearPendingRequeues();
        recovery = null;
        void loadQueue();
    }
    // BI-9：中断恢复分支（快照存在时给出四选一；不自动重复评分/写卡）
    let recovery = $state<RecoveryOption[] | null>(null);
    // BI-27 返场分流横幅（跨天 + 上日收工原因；展示性方案，可忽略）
    let returnBanner = $state<{ planText: string; steps: string[]; capText: string } | null>(null);
    let recoverySnap: RecoverySnapshot | null = null;
    // BI-8：收工原因（done 屏收集；可跳过，写入当日现场供恢复横幅/返场分流读取）
    // svelte-ignore state_referenced_locally -- 初值刻意的：恢复路径在 onMount 恢复现场时回填 endPicked
    let endPicked = $state<string | null>(ctx.getSessionState()?.endReason ?? null);
    function pickEnd(r: EndReason) {
        const s = ctx.getSessionState();
        if (!s) return;
        const next = withEndReason(s, r);
        if (next) {
            ctx.saveSessionState(next);
            endPicked = r;
        }
    }
    // BI-10：长期返场检查横幅（只读预览；触发=长间隔或大积压；仅本次会话内可关闭）
    let returnItems = $state<{ key: string; level: string; text: string }[] | null>(null);
    let returnDismissed = $state(false);
    function tvPath(path: string): string {
        const v = path.split(".").reduce<any>((o, k) => o?.[k], t);
        return typeof v === "string" ? v : path;
    }
    function loadReturnCheck() {
        if (!ctx.getReturnCheckFacts) return;
        ctx.getReturnCheckFacts().then(f => {
            if (!f || returnDismissed || !isLongReturn(f)) return;
            returnItems = returnCheck(f).items.map(i => ({ key: i.key, level: i.level, text: tvPath(i.whyKey) }));
        }).catch(() => { /* 事实聚合失败=不弹横幅，不影响复习 */ });
    }
    // BI-13：减负选择（只读建议；点击展开对 due/历史的影响说明，可跳过）
    const reliefChoices = loadReliefChoices();
    let reliefOpen = $state<LoadChoice | null>(null);
    function onReliefPick(key: LoadChoice) {
        reliefOpen = reliefOpen === key ? null : key;
        // 「缩小范围」联动范围选择器（聚焦提示用户收窄；不代选任何范围）
        if (key === "narrow") {
            scopeEl?.focus();
        }
    }
    // BI-2：本次会话目的（默认复习到期；informal 目的完成屏不庆祝每日目标）
    let purpose = $state<SessionPurpose>("review");
    // svelte-ignore non_reactive_update -- scopeEl 仅作 bind:this 引用（focus 用），无需响应式
    let scopeEl: HTMLSelectElement | null = null;

    // 撤销历史栈（M3·FR7，ZY 技法：快照恢复 + 内核重评时按官方缓存恢复原状态）
    interface HistorySnapshot {
        queue: QueueCard[];
        pendingRequeues: DelayedRequeue<QueueCard>[];
        reviewedIDs: string[];
        skippedIDs: string[];
        current: QueueCard;
        showAnswer: boolean;
        cardHtml: string;
        expectedText: string;
        faceError: string;
        occlusion: OcclusionData | null;
        counters: { new: number; review: number; forget: number; skip: number };
    }
    // Svelte 5 state proxy keeps the completion actions in sync with the
    // actual undo stack. Without this, the button stayed enabled after the
    // last undo because push/pop mutations were not reflected in the view.
    let history = $state<HistorySnapshot[]>([]);

    /** 会话快照统一出口（AQ-2）：计数与 skip 集合的当前值即时落盘 */
    function persistSession() {
        ctx.saveSessionState({
            date: todayKey(),
            reviewedIDs,
            skippedIDs: sessionSkipped,
            counters: { new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip },
            completed: false,
        });
    }

    // 回看上一张（M3·FR6）
    let peek = $state<{ html: string; card: RiffDueCard; revealed: boolean } | null>(null);
    // 超时倒计时（M3·FR8）
    let timeoutLeft = $state(0);
    // docs/13 §6：「遗忘」限时到点标记——揭示答案并提示自评，不自动记分
    let timeoutExpired = $state(false);
    let countdownCtrl: ReviewCountdownController | null = null;
    // AT-10：最近一次生效的超时参数（设置变更时对比决定是否重启计时）
    let lastTimeoutMode: "off" | "reveal" | "forget" = "off";
    let lastTimeoutSeconds = 60;
    // 打字模式（M4·FR2，全局练习模式）
    let typingInput = $state("");
    let typingGrade = $state<{ chars: { ch: string; ok: boolean }[]; suggested: Rating1to4; isTypo?: boolean } | null>(null);
    let expectedText = $state("");
    // 评分音效（M 组 P2，Web Audio 合成）
    let audioCtx: AudioContext | null = null;
    let activeUtterance: SpeechSynthesisUtterance | null = null;
    // 快捷键帮助覆盖层（AB 组）
    let helpOpen = $state(false);
    // AS-4：读屏播报（评分/跳过/加载/完成 → polite；错误 → assertive）
    let liveMsg = $state("");
    let liveTone = $state<"polite" | "assertive">("polite");
    function announce(msg: string, tone: "polite" | "assertive" = "polite") {
        liveMsg = msg;
        liveTone = tone;
    }
    // 移动端软键盘动态避让（visualViewport，防输入法遮挡题面与评分栏）
    let keyboardInset = $state(0);
    const isKeyboardOpen = $derived(keyboardInset > 120);

    const throttledViewportChange = rafThrottle(() => {
        if (isDisposed || typeof window === "undefined" || !window.visualViewport) return;
        const inset = Math.max(0, window.innerHeight - window.visualViewport.height);
        keyboardInset = inset;
        if (inset > 120 && document.activeElement && rootEl?.contains(document.activeElement)) {
            (document.activeElement as HTMLElement).scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        }
    });

    function onViewportChange() {
        throttledViewportChange();
    }
    let showReschedule = $state(false);
    /** BX-3 本场偏好：覆盖全局设置（仅当前复习面板生命周期内有效，切页后还原） */
    let sessionOverride: Partial<ReviewSettings> = $state({});
    /** AT-10 补充：ctx.settings() 返回普通对象（非响应式），出题形态/判定类 derived 无法感知
     * 设置保存——以版本号信号桥接 settings-changed 广播，保存后立即按新设置出题（C-3 审计修复） */
    let settingsRev = $state(0);
    let prefsOpen = $state(false);
    /** BI-12 时间预算：本场维度（非全局设置，不进覆盖集）；预算到≠失败——只提示不强制收工 */
    let budgetMin = $state(0);
    let budgetStartedAt = $state(0);
    let budgetAvg = $state(10); // 设定预算时按 revlog dur 采样一次
    let budgetNow = $state(0);
    $effect(() => {
        if (budgetMin <= 0 || budgetStartedAt <= 0) return;
        budgetNow = Date.now();
        const t = setInterval(() => { budgetNow = Date.now(); }, 1000);
        return () => clearInterval(t);
    });
    function setBudget(min: number) {
        budgetMin = min;
        budgetStartedAt = min > 0 ? Date.now() : 0;
        budgetNow = budgetStartedAt;
        budgetAvg = min > 0 ? avgSecPerCard(ctx.getRevlog().entries.map(e => e.dur ?? 0)) : 10;
    }
    const budgetLeft = $derived(budgetLeftSec(budgetStartedAt, budgetMin, budgetNow || Date.now()));
    const budgetExpired = $derived(isBudgetExpired(budgetStartedAt, budgetMin, budgetNow || Date.now()));
    const budgetEstimate = $derived(
        Number.isFinite(budgetLeft) && !budgetExpired && budgetMin > 0
            ? { done: estimateCompletable(budgetLeft, budgetAvg, queue.length), left: estimateLeftover(budgetLeft, budgetAvg, queue.length) }
            : null
    );
    function budgetClockText(): string {
        const s = budgetLeft;
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${String(r).padStart(2, "0")}`;
    }
    /** 统一设置读取：本场覆盖优先，否则走全局设置 */
    function eff(): ReviewSettings {
        return mergeSessionPrefs(ctx.settings() as unknown as Record<string, unknown>, sessionOverride) as unknown as ReviewSettings;
    }
    const hasOverrides = $derived(Object.keys(sessionOverride).length > 0);
    /** R52 review 面 eyebrow：当前卡的卡组名优先，退回所选范围文案（不暴露原始 deckID） */
    const headScopeLabel = $derived.by(() => {
        const deckName = decks.find(d => d.id === current?.deckID)?.name;
        if (deckName) return deckName;
        if (scopeKey === "new") return t.review.scopeNew;
        if (scopeKey === "old") return t.review.scopeOld;
        const sep = scopeKey.indexOf(":");
        if (sep > 0) {
            const kind = scopeKey.slice(0, sep), id = scopeKey.slice(sep + 1);
            if (kind === "deck") return decks.find(d => d.id === id)?.name ?? t.review.scopeAll;
            if (kind === "notebook") return notebooks.find(n => n.id === id)?.name ?? t.review.scopeAll;
        }
        return t.review.scopeAll;
    });
    /** BX-3：设置本场覆盖项（与全局同值时自动摘除，保持覆盖面最小；超时相关变更即时重启计时器） */
    function setOverride(key: keyof ReviewSettings, value: unknown) {
        const next = pruneSessionPrefs(ctx.settings() as unknown as Record<string, unknown>, { ...sessionOverride, [key]: value }) as Partial<ReviewSettings>;
        sessionOverride = next;
        if (key === "timeoutMode" || key === "timeoutSeconds") restartTimeout();
    }
    let rescheduleDays = $state(1);
    let rescheduleBusy = $state(false);
    let rescheduleError = $state("");
    const actionBusy = $derived(submitting || rescheduleBusy);
    let retryReschedule = $state<{ cardID: string; days: number; due: string } | null>(null);

    // R54 原型高级交互：改期目标时间友好预览
    function formatRescheduleTimestamp(d: Date): string {
        if (!Number.isFinite(d.getTime())) return "";
        const language = document.documentElement.lang || (window.siyuan as any)?.config?.lang || (window.siyuan as any)?.languages?.lang || navigator.language;
        const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
        try {
            return new Intl.DateTimeFormat(String(language || "").replace(/_/g, "-") || undefined, options).format(d);
        } catch {
            return new Intl.DateTimeFormat(undefined, options).format(d);
        }
    }

    function parseDueStringToDate(dueStr: string): Date | null {
        if (!dueStr || dueStr.length < 14) return null;
        const y = parseInt(dueStr.slice(0, 4), 10);
        const m = parseInt(dueStr.slice(4, 6), 10) - 1;
        const d = parseInt(dueStr.slice(6, 8), 10);
        const h = parseInt(dueStr.slice(8, 10), 10);
        const min = parseInt(dueStr.slice(10, 12), 10);
        const s = parseInt(dueStr.slice(12, 14), 10);
        const date = new Date(y, m, d, h, min, s);
        return Number.isFinite(date.getTime()) ? date : null;
    }

    let previewTargetLabel = $derived.by(() => {
        if (retryReschedule && retryReschedule.due) {
            const d = parseDueStringToDate(retryReschedule.due);
            if (d) return formatRescheduleTimestamp(d);
        }
        const days = Number(rescheduleDays);
        if (!Number.isSafeInteger(days) || days < 1 || days > 36500) return "";
        return formatRescheduleTimestamp(new Date(Date.now() + days * 86400000));
    });

    // R54 原型高级交互：暂停复习并返回今日
    let showPauseModal = $state(false);
    let sessionPaused = $state(false);
    let pausedTimeoutSeconds: number | undefined;
    function pauseSessionAndReturn() {
        sessionPaused = true;
        pausedTimeoutSeconds = timeoutLeft;
        const s = {
            date: todayKey(),
            reviewedIDs,
            skippedIDs: sessionSkipped,
            counters: {
                new: sessionNew,
                review: sessionReview,
                forget: sessionForget,
                skip: sessionSkip,
            },
            completed: false,
        };
        ctx.saveSessionState(s);
        stopTimeout();
        stopRequeueTimers();
        closeReviewAudio(audioCtx);
        audioCtx = null;
        showPauseModal = false;
        try {
            ctx.openDashboard("overview");
        } catch (error) {
            showMessage(friendlyError(error, t), 5000, "error");
            return;
        }
        showMessage(t.review.pauseToast, 3000, "info");
    }

    function resumePausedSession() {
        if (!sessionPaused) return;
        sessionPaused = false;
        scheduleRequeueTimer();
        if (!showAnswer && faceReady) restartTimeout(pausedTimeoutSeconds);
        pausedTimeoutSeconds = undefined;
    }

    // R54 原型高级交互：就地标记疑问
    let markedIssueCardIDs = $state<Set<string>>(new Set());
    // 专注复习顶栏：折叠收纳二级操作气泡
    let showMoreToolbar = $state(false);
    // 汲取自闪卡小助手 ZY 与 RemNote：卡片所属文档上下文路径与结构化面包屑
    let currentHPath = $state("");
    let currentBreadcrumbs = $state<ReviewBreadcrumbChain | null>(null);
    // 汲取自渐进学习插件：给未来的自己留助记线索
    let cardMemo = $state("");
    let showMemoEditor = $state(false);
    let memoDraft = $state("");
    let memoSaving = $state(false);
    // 卡面大图全屏原图聚焦预览（Lightroom Zoom）
    let zoomedImage = $state<{ src: string; alt?: string } | null>(null);
    let imgScale = $state(1);
    let imgPanX = $state(0);
    let imgPanY = $state(0);
    let isDraggingImg = $state(false);
    let dragStartX = 0;
    let dragStartY = 0;
    let reversedRecall = $state(false);
    let stepRevealedCount = $state(0);
    let pressedKeyFeedback = $state<string | null>(null);
    let lightboxEl: HTMLDivElement | null = $state(null);

    // 汲取自番茄插件：复习端就地移出卡组
    let showRetireModal = $state(false);
    let retireBusy = $state(false);
    function adjustFontScale(delta: number) {
        const cur = eff().cardFontScale || 1;
        const next = Math.min(1.6, Math.max(0.8, Math.round((cur + delta) * 10) / 10));
        setOverride("cardFontScale", next);
        announce(`字号已调整至 ${Math.round(next * 100)}%`, "polite");
        showMessage(`${t.review.fontScaleTitle ?? "卡面字号"}: ${Math.round(next * 100)}%`, 1200, "info");
    }

    function toggleMarkIssue() {
        if (!current || actionBusy || markedIssueCardIDs.has(current.cardID)) return;
        const cardID = current.cardID;
        markedIssueCardIDs.add(cardID);
        markedIssueCardIDs = new Set(markedIssueCardIDs);
        ctx.tagErrorReason?.(cardID, "question-unclear");
        showMessage(t.review.issueMarked, 2500, "info");
        announce(t.review.issueMarked, "polite");
    }

    // R54 原型高级交互：本场作答方式即时覆盖
    let showSessionOptionsModal = $state(false);
    let sessionModalEl: HTMLDivElement | null = $state(null);
    let sessionModalWasOpen = false;
    let sessionModalTimeoutSeconds: number | undefined;
    $effect(() => {
        const open = showPauseModal || showSessionOptionsModal || showMemoEditor || showRetireModal;
        if (open && sessionModalEl && !sessionModalWasOpen) {
            sessionModalWasOpen = true;
            sessionModalTimeoutSeconds = countdownCtrl?.getRemaining();
            stopTimeout();
            sessionModalEl.querySelector<HTMLElement>("button, select")?.focus();
        } else if (!open && sessionModalWasOpen) {
            sessionModalWasOpen = false;
            if (sessionPaused) return;
            returnFocus();
            if (!showAnswer && faceReady) restartTimeout(sessionModalTimeoutSeconds);
            sessionModalTimeoutSeconds = undefined;
        }
    });
    let tempAnswerVariant = $state<"normal" | "typing" | "choice">("normal");
    function openSessionOptions() {
        tempAnswerVariant = eff().typingEnabled ? "typing" : eff().choiceEnabled ? "choice" : "normal";
        showSessionOptionsModal = true;
    }
    function applySessionOptions() {
        if (tempAnswerVariant === "typing") {
            setOverride("typingEnabled", true);
            setOverride("choiceEnabled", false);
            setOverride("mixedRotation", false);
            typingInput = "";
        } else if (tempAnswerVariant === "choice") {
            setOverride("typingEnabled", false);
            setOverride("choiceEnabled", true);
            setOverride("mixedRotation", false);
            if (!choices) {
                void startChoice();
            }
        } else {
            setOverride("typingEnabled", false);
            setOverride("choiceEnabled", false);
            setOverride("mixedRotation", false);
        }
        showSessionOptionsModal = false;
        showMessage(t.review.sessionOptionsApplied, 1500, "info");
    }
    // 图片遮挡（M4·FR4 riff 先行）：数据来自块属性 lv-occlusion，坐标相对图片包围盒
    let cardEl: HTMLDivElement | null = $state(null);
    let rootEl: HTMLDivElement | null = $state(null);
    let occl = $state<OcclusionData | null>(null);
    let occlBox = $state<{ l: number; t: number; w: number; h: number } | null>(null);
    let occlHidden = $state<number[]>([]);
    let isCustomPluginAnswer = $state(false);
    // 选择题模式（M4·FR3，干扰项取自同队列后续卡）
    let answerCache = new Map<string, string>();
    let choiceRequestSeq = 0;
    let choices = $state<{ options: string[]; answerIdx: number; picked: number | null } | null>(null);
    let choiceLoading = $state(false);
    // 当同队列没有任何可靠干扰项时，选择题退回正常自由回忆，避免伪造选项。
    let choiceFallbackMode = $state<"none" | "free-recall">("none");
    // 交互式题型模型与作答状态（支持选择题选项卡片、判断题、填空打字与解析）
    let interactiveQuiz = $state<InteractiveQuizData | null>(null);
    let selectedChoiceKeys = $state<string[]>([]);
    let userJudgeChoice = $state<boolean | null>(null);
    let isAnswerCorrect = $state<boolean | null>(null);
    let suggestedRating = $state<number | null>(null);
    let zenMode = $state(false);

    async function loadBlockDOM(blockID: string) {
        const seq = ++loadSeq;
        try {
            // AQ-20：统一内核响应校验（非 0/缺字段抛错），失败保留旧卡面
            const dom = await getBlockDOM(blockID);
            if (seq !== loadSeq) {
                return; // 已切到新卡，丢弃旧响应
            }
            if (cardHtml && cardHtml !== dom) {
                // 编辑返回后题面变化：旧选择题、打字判分与请求都失效。
                choiceRequestSeq++;
                choices = null;
                choiceLoading = false;
                choiceFallbackMode = "none";
                typingGrade = null;
                answerCache.delete(blockID);
            }
            cardHtml = dom;
            faceError = "";
            // 打字题期望答案 = 挖空（mark）文本合集；无挖空时自适应存量 ::、Q/A
            const holder = document.createElement("div");
            holder.innerHTML = cardHtml;
            const marks = extractMarkTexts(holder);
            if (marks.length > 0) {
                expectedText = marks.join(" / ");
            } else {
                const rawText = (holder.textContent ?? "").trim();
                const delimited = parseDelimitedQa(rawText);
                expectedText = delimited?.answer ? delimited.answer : rawText;
            }
            answerCache.set(blockID, expectedText);
            // 遮挡数据与块备注（宽容解析，无属性即为普通卡）
            try {
                const attrs = await getBlockAttrs(blockID);
                if (seq === loadSeq) {
                    occl = parseOcclusion(attrs);
                    occlHidden = [];
                    const customAns = String(attrs["custom-card-answer"] || attrs["custom-flashcard-answer"] || attrs["custom-exam-answer"] || "").trim();
                    const memo = String(attrs.memo || attrs["custom-card-memo"] || attrs["custom-memo"] || attrs["custom-exam-analysis"] || "").trim();
                    isCustomPluginAnswer = Boolean(customAns);
                    cardMemo = customAns || memo;
                    memoDraft = cardMemo;
                    if (marks.length === 0 && (!expectedText || expectedText === (holder.textContent ?? "").trim()) && cardMemo) {
                        expectedText = cardMemo;
                        answerCache.set(blockID, expectedText);
                    }
                    interactiveQuiz = parseInteractiveQuiz({
                        domHtml: cardHtml,
                        attrs,
                        cardMemo,
                        expectedText,
                    });
                }
            } catch {
                if (seq === loadSeq) {
                    occl = null;
                }
            }
            // 汲取自闪卡小助手 ZY：查询卡片所属文档路径与知识语境
            try {
                if (siyuanApi.sqlQuery) {
                    const rows = await siyuanApi.sqlQuery(`SELECT hpath FROM blocks WHERE id = '${blockID.replace(/'/g, "''")}' LIMIT 1`);
                    if (seq === loadSeq && rows?.[0]?.hpath) {
                        currentHPath = String(rows[0].hpath).replace(/^\//, "").replace(/\//g, " › ");
                        currentBreadcrumbs = parseHPathToBreadcrumbs(blockID, String(rows[0].hpath));
                    }
                }
            } catch {
                if (seq === loadSeq) {
                    currentHPath = "";
                    currentBreadcrumbs = null;
                }
            }
        } catch (e) {
            if (seq !== loadSeq) {
                return;
            }
            if (!cardHtml) {
                // AS-3：新卡首载失败 → 卡面占位+可重试（不再整页切错误视图，队列保持可用）
                faceError = friendlyError(e, t);
            } else {
                // 刷新失败（已有卡面）：保留旧内容，仅记诊断
                lvLog("warn", "card DOM refresh failed: " + (e instanceof Error ? e.message : e));
            }
        }
    }

    /** AS-3：卡面加载失败占位的重试 */
    async function retryFace() {
        if (!current || !faceError) {
            return;
        }
        faceError = "";
        await loadBlockDOM(current.blockID);
    }

    function positionOcclusion() {
        if (!cardEl || !occl) {
            occlBox = null;
            return;
        }
        const img = cardEl.querySelector<HTMLElement | SVGElement>("img, svg:not(.lv-occl-overlay), canvas");
        if (!img) {
            occlBox = null;
            return;
        }
        const cardRect = cardEl.getBoundingClientRect();
        const imageRect = img.getBoundingClientRect();
        occlBox = {
            l: imageRect.left - cardRect.left + cardEl.scrollLeft,
            t: imageRect.top - cardRect.top + cardEl.scrollTop,
            w: imageRect.width,
            h: imageRect.height,
        };
    }

    function shuffle<T>(arr: T[]): T[] {
        const out = [...arr];
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    /** 从块 DOM 提取答案文本（mark 合集优先，自适应存量问答语法与备注），带缓存（M4·FR3 干扰项采样用） */
    async function answerOf(blockID: string): Promise<string> {
        const cached = answerCache.get(blockID);
        if (cached !== undefined) {
            return cached;
        }
        try {
            const dom = await getBlockDOM(blockID);
            const holder = document.createElement("div");
            holder.innerHTML = dom;
            const marks = extractMarkTexts(holder);
            let text = "";
            if (marks.length > 0) {
                text = marks.join(" / ");
            } else {
                const rawText = (holder.textContent ?? "").trim();
                const delimited = parseDelimitedQa(rawText);
                if (delimited?.answer) {
                    text = delimited.answer;
                } else {
                    text = rawText;
                }
            }
            // 当前卡面可能在采样请求期间已刷新，优先保留新卡面的权威答案。
            const answer = answerCache.get(blockID) ?? text;
            answerCache.set(blockID, answer);
            return answer;
        } catch {
            return "";
        }
    }

    /** 选择题（M4·FR3）：本卡答案 + 同队列后续卡采样最多 3 个干扰项。 */
    async function startChoice() {
        if (!current || choiceLoading || typingInput.trim()) {
            return;
        }
        const seq = ++choiceRequestSeq;
        const cardID = current.cardID;
        const blockID = current.blockID;
        const candidates = queue.slice(1, 8);
        choiceLoading = true;
        try {
            const answer = await answerOf(blockID);
            if (seq !== choiceRequestSeq || current?.cardID !== cardID) return;
            answerCache.set(blockID, answer);
            const pool: string[] = [];
            for (const c of candidates) {
                if (pool.length >= 3) break;
                const text = await answerOf(c.blockID);
                if (seq !== choiceRequestSeq || current?.cardID !== cardID) return;
                if (text && text !== answer && !pool.includes(text)) {
                    pool.push(text);
                }
            }
            const built = buildChoiceOptions(answer, pool);
            if (!built) {
                // 没有可靠的干扰项时保持自由回忆路径；不使用“干扰项 1/2/3”
                // 一类占位文本，以免把提示内容误当作知识。
                choices = null;
                choiceFallbackMode = "free-recall";
                return;
            }
            const options = shuffle(built);
            choices = { options, answerIdx: options.indexOf(built[0]), picked: null };
            choiceFallbackMode = "none";
        } catch {
            if (seq === choiceRequestSeq && current?.cardID === cardID) {
                choices = null;
                choiceFallbackMode = "free-recall";
            }
        } finally {
            if (seq === choiceRequestSeq) choiceLoading = false;
        }
    }

    function pickChoice(idx: number) {
        if (!choices || choices.picked !== null) {
            return;
        }
        choices = { ...choices, picked: idx };
        showAnswer = true;
    }

    async function loadQueue() {
        choiceRequestSeq++;
        const seq = ++queueSeq; // AQ-19：范围切换/重试并发时只接受最后一次请求
        loading = true;
        errorMsg = "";
        try {
            const kernelReviewedIDs = [...new Set([...reviewedIDs, ...qualityExcludedCardIDs])];
            let data;
            if (scopeKey.startsWith("deck:")) {
                data = await getRiffDueCards(scopeKey.slice(5), kernelReviewedIDs);
            } else if (scopeKey.startsWith("notebook:")) {
                data = await getNotebookRiffDueCards(scopeKey.slice(9), kernelReviewedIDs);
            } else if (scopeKey.startsWith("doc:")) {
                data = await getTreeRiffDueCards(scopeKey.slice(4), kernelReviewedIDs);
            } else {
                data = await getRiffDueCards("", kernelReviewedIDs);
            }
            if (seq !== queueSeq) {
                return; // 旧响应：不改队列、卡面、计数或计时器
            }
            let cards = data.cards ?? [];
            // 「今天不学」+ 本场已跳过的卡本地过滤（内核调度不受影响，AJ9）
            cards = cards.filter(c => !ctx.isSuspendedToday(c.cardID) && !sessionSkipped.includes(c.cardID));
            // 先验证源块的最终 Markdown，避免没有有效挖空标记的历史坏卡在问题态直接露出答案。
            // 此处只从本场展示队列排除；不评分、不跳过、不修改真实 due。
            if (cards.length > 0) {
                // 测试/降级宿主若没有 SQL 读能力，不能把未验证内容当作安全卡面；
                // 但保留已有的卡面加载路径，避免把整个复习页变成不可用状态。
                let queryBlocks: typeof siyuanApi.sqlQuery | undefined;
                try {
                    queryBlocks = (siyuanApi as typeof siyuanApi).sqlQuery;
                } catch {
                    queryBlocks = undefined;
                }
                if (typeof queryBlocks !== "function") {
                    // 兼容精简宿主/测试注入：没有只读 SQL 能力时保留原队列，
                    // 真实思源运行时由共享入组门禁保证新卡结构，维护页负责存量扫描。
                } else {
                const blockIDs: string[] = Array.from(new Set(cards.map((card): string => String(card.blockID ?? "")).filter((id): id is string => Boolean(id))));
                const chunkSize = 400;
                const concurrency = 3;
                const chunks: string[][] = Array.from({ length: Math.ceil(blockIDs.length / chunkSize) }, (_, index) =>
                    blockIDs.slice(index * chunkSize, (index + 1) * chunkSize),
                );
                const rowsByChunk = await mapChunksOrdered(chunks, (ids: string[]) => {
                    const safeIDs = ids.map(id => `'${String(id).replace(/'/g, "''")}'`).join(",");
                    return queryBlocks(`SELECT id, markdown FROM blocks WHERE id IN (${safeIDs})`);
                }, concurrency);
                const rows = rowsByChunk.flat().map(row => ({ id: String(row.id ?? ""), markdown: String(row.markdown ?? "") }));
                const markdownByID = new Map(rows.map(row => [row.id, row.markdown]));
                const occlusionCandidates = blockIDs.filter(id => {
                    const markdown = markdownByID.get(id);
                    return Boolean(markdown && validateFlashcardMarkdown(markdown) === "missing-answer" && hasQuestionMediaContent(markdown));
                });
                const attrChunks: string[][] = Array.from({ length: Math.ceil(occlusionCandidates.length / concurrency) }, (_, index) =>
                    occlusionCandidates.slice(index * concurrency, (index + 1) * concurrency),
                );
                const attrsByChunk = await mapChunksOrdered(attrChunks, (ids: string[]) => Promise.all(ids.map(async id => {
                    try {
                        return [id, await getBlockAttrs(id)] as const;
                    } catch {
                        return [id, {}] as const;
                    }
                })), concurrency);
                if (seq !== queueSeq) return;
                const validOcclusionIDs = new Set<string>();
                for (const [id, attrs] of attrsByChunk.flat() as Array<[string, Record<string, string>]>) {
                    if (parseOcclusion(attrs)?.rects.length) validOcclusionIDs.add(String(id));
                }
                const quality = partitionReviewCardsByQuality(cards, rows, validOcclusionIDs, { allowLegacyFormat: true });
                cards = quality.valid;
                if (quality.invalid.length > 0) {
                    qualityExcludedCardIDs = [...new Set([...qualityExcludedCardIDs, ...quality.invalid.map(item => item.cardID).filter(Boolean)])];
                    announce(t.review.qualityExcluded.replace("${n}", String(qualityExcludedCardIDs.length)), "polite");
                }
                }
            }
            // 仅新卡 / 仅旧卡模式（睡前巩固包，W 组）
            if (scopeKey === "new" || scopeKey === "old") {
                cards = cards.filter(c => (scopeKey === "new") === (c.state === 0));
            }
            const bl = eff().batchLimit;
            if (bl > 0) {
                cards = cards.slice(0, bl);
            }
            if (!cramActive && eff().burySiblings) {
                // 同源兄弟卡防剧透推迟（Anki Bury Siblings）：每笔记块同一会话优先考 1 空，杜绝即时互为提示
                const buryRes = filterBurySiblings(cards);
                cards = buryRes.retained;
            }
            if (cramActive) {
                // 考前 cram：遗忘多的卡优先（M7·FR4）
                cards = [...cards].sort((a, b) => b.lapses - a.lapses);
            } else if (eff().reverseOrder) {
                // 倒序模式（431）：内核到期顺序反转，最新到期优先
                cards = [...cards].reverse();
            } else if (eff().randomOrder) {
                cards = shuffle(cards);
            }
            queue = cards;
            // BI-27 返场分流：跨天返场且上日有收工原因 → 今日方案横幅（展示性，不自动改预算/队列）。
            // 口径映射：BI-8 收工原因 → BI-27 返场原因（time-up→time-short、energy→pressure、其余→plain-leave）
            if (!recovery) {
                const ss = ctx.getSessionState();
                const today = new Date();
                const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                const reasonRaw = ss?.endReason;
                if (ss?.date && ss.date !== localToday && reasonRaw) {
                    const mapped: ReturnReason = reasonRaw === "time-up" ? "time-short" : reasonRaw === "energy" ? "pressure" : "plain-leave";
                    if ((RETURN_REASONS as readonly string[]).includes(mapped)) {
                        const daysGap = Math.max(1, Math.round((Date.now() - new Date(`${ss.date}T00:00:00`).getTime()) / 86400000));
                        const plan = triageReturn(mapped, { dueCount: queue.length, daysGap, staleCount: 0 });
                        const tt = t.returnTriage as any;
                        const capText = plan.suggestedCap === null ? tt.capNone : plan.suggestedCap === 0 ? tt.capReadonly : tt.capN.replace("${n}", String(plan.suggestedCap));
                        returnBanner = {
                            planText: tt.plan?.[plan.planKey] ?? plan.planKey,
                            steps: plan.steps.map((k) => tt.step?.[k.replace("step.", "")] ?? k),
                            capText,
                        };
                    }
                }
            }
            // BI-9：首刷后回填队列剩余数，恢复分支可用性随之刷新（继续原场/缩小范围是否可选）
            if (recovery && recoverySnap) {
                recoverySnap.queueRemaining = queue.length;
                recovery = recoveryOptions(recoverySnap);
            }
            if (queue.length > 0) {
                announce(t.review.liveQueued.replace("${n}", String(queue.length)), "polite");
            }
            if (queue.length === 0) {
                current = null;
                if (pendingRequeues.length > 0) {
                    // 延迟循环仍属于本场：先显示等待态，不能把本场提前广播为完成。
                    sessionDone = false;
                    stopTimeout();
                    scheduleRequeueTimer();
                    return;
                }
                const finished = !sessionDone; // 只在首次进入完成态时广播
                sessionDone = true;
                if (finished && (reviewedIDs.length > 0 || sessionSkipped.length > 0)) {
                    const s = ctx.getSessionState();
                    if (s && !s.completed) ctx.saveSessionState(markSessionCompleted(s));
                }
                // Skipping a card changes the due queue too. Broadcast a
                // finished session when either rating or skip produced work,
                // so the dashboard refreshes after a skip-only session.
                if (finished && (reviewedIDs.length > 0 || sessionSkipped.length > 0)) {
                    ctx.emitSessionFinished({ new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip });
                }
                // 联动小驴打卡（Ecosystem Federation Epoch 6）
                if (finished && reviewedIDs.length > 0) {
                    const checkinItemId = eff().checkinItemId;
                    const reviewedCount = reviewedIDs.length;
                    if (checkinItemId && reviewedCount > 0) {
                        const today = new Date().toISOString().slice(0, 10);
                        const accuracy = sessionQuizTotal > 0
                            ? Math.round((sessionQuizCorrect / sessionQuizTotal) * 100)
                            : (sessionNew + sessionReview > 0
                                ? Math.round(Math.max(0, (sessionNew + sessionReview - sessionForget)) / (sessionNew + sessionReview) * 100)
                                : 100);
                        void logCheckinEventSafely({
                            itemId: checkinItemId,
                            value: reviewedCount,
                            unit: "张",
                            externalRef: `cards:${checkinItemId}:${today}`,
                            note: `完成闪卡复习 ${reviewedCount} 张（命中率 ${accuracy}%）`,
                        });
                    }
                }
                // BI-8/BI-12：预算到点自动记「时间到」收工原因（中性事实；用户手动点选的原因优先）
                if (finished && budgetExpired && !ctx.getSessionState()?.endReason) {
                    const s = ctx.getSessionState();
                    const next = s ? withEndReason(s, "time-up") : null;
                    if (next) ctx.saveSessionState(next);
                }
                stopTimeout();
            } else {
                sessionDone = false;
                await setCurrent(queue[0]);
            }
        } catch (e: any) {
            if (seq !== queueSeq) {
                return; // 失败的旧请求不覆盖新状态
            }
            errorMsg = friendlyError(e, t);
        } finally {
            if (seq === queueSeq) {
                loading = false;
                // 处理网络请求期间已经到期的本地遗忘卡，避免响应覆盖延迟队列。
                releaseDueRequeues();
            }
        }
    }

    async function recheckQualityExcluded() {
        qualityExcludedCardIDs = [];
        await loadQueue();
    }

    async function setCurrent(card: RiffDueCard) {
        resetCardState();
        current = card;
        cardShownAt = Date.now(); // AQ-13：题面呈现即作答计时起点（与内核「题面到评分」口径一致）
        await loadBlockDOM(card.blockID);
        if (card !== current) {
            return; // 等待期间已切卡（AQ-19）：不重启旧卡计时器、不朗读旧卡
        }
        restartTimeout();
        // 听写模式：问题态自动朗读答案（M4·FR6，需打字模式开启）
        if (eff().typingEnabled && eff().dictationEnabled && expectedText) {
            speakText(expectedText);
        }
    }

    /** 切卡和撤销共用清理，防止上一张的倒计时、答案与异步响应污染新卡。 */
    function resetCardState() {
        stopTimeout();
        choiceRequestSeq++;
        loadSeq++;
        contextRequestSeq++;
        showAnswer = false;
        expectedText = "";
        typingInput = "";
        typingGrade = null;
        choices = null;
        choiceLoading = false;
        choiceFallbackMode = "none";
        occl = null;
        occlBox = null;
        occlHidden = [];
        cardHtml = ""; // AS-3：切卡先清卡面——新卡加载失败显示占位而非上一张的残留内容
        faceError = "";
        showReschedule = false;
        rescheduleError = "";
        retryReschedule = null;
        showMoreToolbar = false;
        currentHPath = "";
        currentBreadcrumbs = null;
        cardMemo = "";
        showMemoEditor = false;
        memoDraft = "";
        interactiveQuiz = null;
        selectedChoiceKeys = [];
        userJudgeChoice = null;
        isAnswerCorrect = null;
        suggestedRating = null;
        memoSaving = false;
        showRetireModal = false;
        retireBusy = false;
        zoomedImage = null;
        imgScale = 1;
        imgPanX = 0;
        imgPanY = 0;
        isDraggingImg = false;
        reversedRecall = false;
        stepRevealedCount = 0;
        ctxOpen = false;
        ctxBlocks = [];
        ctxLoading = false;
        hintLevel = null;
        hintText = "";
        showErrTags = false;
    }

    /** 汲取自渐进学习插件：保存助记便签（给未来的自己留线索） */
    async function saveCardMemo() {
        if (!current || memoSaving) return;
        const card = current;
        const trimmed = memoDraft.trim();
        memoSaving = true;
        try {
            if (siyuanApi.setBlockAttrs) {
                await siyuanApi.setBlockAttrs(card.blockID, { memo: trimmed });
            }
            if (isDisposed) return;
            if (current?.cardID === card.cardID) {
                cardMemo = trimmed;
                showMemoEditor = false;
            }
            showMessage(t.review.memoSavedToast ?? "助记便签已保存，下次复习时将提醒你", 2500, "info");
        } catch (e: any) {
            if (isDisposed) return;
            showMessage(friendlyError(e, t), 4000, "error");
        } finally {
            if (!isDisposed) memoSaving = false;
        }
    }

    /** 汲取自番茄插件：复习端就地移出卡组（安全不修改正文） */
    async function retireCurrentCard() {
        if (!current || retireBusy) return;
        const card = current;
        retireBusy = true;
        try {
            if (ctx.removeFromDeck) {
                await ctx.removeFromDeck(card.blockID);
            }
            if (isDisposed) return;
            showMessage(t.review.retireCardDone ?? "已将卡片移出卡组", 2500, "info");
            queue = queue.filter(c => c.cardID !== card.cardID);
            if (current?.cardID !== card.cardID) return;
            showRetireModal = false;
            if (queue.length > 0) {
                await setCurrent(queue[0]);
            } else {
                current = null;
            }
        } catch (e: any) {
            if (isDisposed) return;
            showMessage(friendlyError(e, t), 4000, "error");
        } finally {
            if (!isDisposed) retireBusy = false;
        }
    }

    function closeMemoEditor() {
        if (!memoSaving) showMemoEditor = false;
    }

    function closeRetireModal() {
        if (!retireBusy) showRetireModal = false;
    }

    function onCardContentClick(e: MouseEvent) {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.tagName.toLowerCase() === "img") {
            e.stopPropagation();
            const img = target as HTMLImageElement;
            openZoomedImage(img.src, img.alt);
            return;
        }

        // 问题态下点击遮罩：支持逐步单独揭晓该空（Progressive Cloze Recall）
        if (!showAnswer) {
            const mark = target.closest("span[data-type='mark'], mark.lv-masked, [data-cloze-idx]") as HTMLElement | null;
            if (mark) {
                e.stopPropagation();
                revealSingleClozeElement(mark);
                return;
            }
        }
    }

    function openZoomedImage(src: string, alt?: string) {
        zoomedImage = { src, alt };
        imgScale = 1;
        imgPanX = 0;
        imgPanY = 0;
    }

    function onLightboxWheel(e: WheelEvent) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        imgScale = Math.min(4, Math.max(0.5, Math.round((imgScale + delta) * 100) / 100));
    }

    function onLightboxPointerDown(e: PointerEvent) {
        if (e.button !== 0) return;
        isDraggingImg = true;
        dragStartX = e.clientX - imgPanX;
        dragStartY = e.clientY - imgPanY;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    function onLightboxPointerMove(e: PointerEvent) {
        if (!isDraggingImg) return;
        imgPanX = e.clientX - dragStartX;
        imgPanY = e.clientY - dragStartY;
    }

    function onLightboxPointerUp(_e?: PointerEvent) {
        isDraggingImg = false;
    }

    function onImageDblClick() {
        if (imgScale !== 1) {
            imgScale = 1;
            imgPanX = 0;
            imgPanY = 0;
        } else {
            imgScale = 2;
        }
    }

    function revealSingleClozeElement(mark: HTMLElement) {
        if (mark.classList.contains("lv-step-revealed")) return;
        const answer = mark.getAttribute("data-real-answer");
        if (answer) {
            mark.textContent = answer;
            mark.removeAttribute("aria-hidden");
            mark.classList.add("lv-step-revealed");
            mark.setAttribute("title", "已揭晓");
        } else {
            mark.classList.add("lv-step-revealed");
        }
        stepRevealedCount++;
        checkAllClozeRevealed();
    }

    function checkAllClozeRevealed() {
        if (!cardEl) return;
        const allMarks = cardEl.querySelectorAll("span[data-type='mark'][data-cloze-idx], mark.lv-masked[data-cloze-idx]");
        if (allMarks.length === 0) return;
        const unrevealed = Array.from(allMarks).filter(m => !m.classList.contains("lv-step-revealed"));
        if (unrevealed.length === 0) {
            revealAnswer();
        }
    }

    function revealNextClozeOrAll(forceAll = false): boolean {
        if (!cardEl) return false;
        const allMarks = Array.from(cardEl.querySelectorAll("span[data-type='mark'][data-cloze-idx], mark.lv-masked[data-cloze-idx]")) as HTMLElement[];
        if (allMarks.length <= 1 || forceAll) {
            return false;
        }
        const nextUnrevealed = allMarks.find(m => !m.classList.contains("lv-step-revealed"));
        if (nextUnrevealed) {
            revealSingleClozeElement(nextUnrevealed);
            return true;
        }
        return false;
    }

    function triggerKeyFeedback(key: string) {
        pressedKeyFeedback = key;
        setTimeout(() => {
            if (pressedKeyFeedback === key) pressedKeyFeedback = null;
        }, 180);
    }

    function closeZoomedImage() {
        zoomedImage = null;
        returnFocus();
    }

    // 图片灯箱也是模态对话框：焦点移入并在关闭按钮中循环，Esc/关闭后归还卡面焦点。
    $effect(() => {
        if (!zoomedImage || !lightboxEl) return;
        const trap = trapFocus(lightboxEl, { onEscape: closeZoomedImage, restoreOnRelease: false });
        return () => trap.release();
    });

    /** TTS 朗读（Web Speech，防御式） */
    function speakText(text: string) {
        activeUtterance = speakReviewText(text, eff());
    }

    /** TTS 朗读答案（C9 朗读部分，Web Speech，防御式） */
    function speakAnswer() {
        activeUtterance = speakAnswerText(expectedText, cardHtml, eff());
    }

    /** 评分音效（Web Audio 合成，M 组 P2）：chime 清音 / wood 木鱼 / bell 铃；受 sfxEnabled 开关（250） */
    function playSfx(rating: Rating) {
        audioCtx = playReviewSfx(rating, eff(), audioCtx);
    }

    /** 打字题提交：判分并亮出答案（评分仍由用户按键确认，建议值显示为 chip） */
    function submitTyping() {
        if (!current || typingGrade || !typingInput.trim() || !expectedText) {
            return;
        }
        const s = eff();
        const g = gradeTyping(expectedText, typingInput, s.typingStrict);
        typingGrade = { chars: g.chars, suggested: g.suggested };
        showAnswer = true;
    }

    // —— 超时模式 ——

    function restartTimeout(remainingSeconds?: number) {
        stopTimeout();
        timeoutExpired = false;
        const s = eff();
        if (s.timeoutMode === "off" || !current || !faceReady || sessionPaused || showPauseModal || showSessionOptionsModal) {
            timeoutLeft = 0;
            return;
        }
        lastTimeoutMode = s.timeoutMode;
        lastTimeoutSeconds = s.timeoutSeconds;
        countdownCtrl = createReviewCountdown({
            timeoutMode: s.timeoutMode,
            timeoutSeconds: remainingSeconds ?? s.timeoutSeconds,
            onTick: (left) => {
                timeoutLeft = left;
            },
            onExpire: (mode) => {
                showAnswer = true;
                if (mode === "forget") {
                    timeoutExpired = true;
                }
            },
        });
        countdownCtrl.start();
    }

    function stopTimeout() {
        countdownCtrl?.stop();
        countdownCtrl = null;
    }

    function timeoutText(): string {
        return formatCountdown(timeoutLeft);
    }

    /** 完成页会话时长（544）：本页面挂载即会话起点，恢复会话也从恢复点起算 */
    let sessionStartedAt = Date.now();
    function sessionDurationText(): string {
        const total = Math.max(0, Math.round((Date.now() - sessionStartedAt) / 1000));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${String(s).padStart(2, "0")}`;
    }

    /** 空队列态（R53 §3.9）：无任何作答即完成 → 「该范围没有到期的卡」而非 0 值完成庆祝 */
    const emptyQueue = $derived(
        sessionDone && sessionNew === 0 && sessionReview === 0 && sessionForget === 0 && sessionSkip === 0
    );

    /** 完成页今日目标进度（544）：本次会话有效评分 vs 每日复习目标 */
    function targetProgressText(): string {
        const target = eff().dailyReviewTarget;
        const done = sessionNew + sessionReview;
        if (target <= 0) {
            return "";
        }
        return t.review.doneTarget.replace("${a}", String(done)).replace("${b}", String(target));
    }

    /** 连击里程碑（374）：7/30/100/365 天完成页专属庆祝 */
    function streakMilestoneText(): string {
        const streak = calcStreak(ctx.getRevlog());
        return [365, 100, 30, 7].includes(streak) ? t.review.streakMilestone.replace("${n}", String(streak)) : "";
    }

    /** 每日一语（375）：按日期轮换的学习科学小贴士 */
    function dailyTip(): string {
        if (!eff().dailyTipEnabled) {
            return "";
        }
        const tips = [t.review.tip1, t.review.tip2, t.review.tip3, t.review.tip4, t.review.tip5];
        const idx = Math.floor(Date.now() / 86400000) % tips.length;
        return tips[idx];
    }

    // —— 评分 / 跳过 / 屏蔽 ——

    function pushHistory() {
        history.push({
            queue: [...queue],
            pendingRequeues: pendingRequeues.map(item => ({ ...item })),
            reviewedIDs: [...reviewedIDs],
            skippedIDs: [...sessionSkipped],
            current: current!,
            showAnswer,
            cardHtml,
            expectedText,
            faceError,
            occlusion: occl,
            counters: { new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip },
        });
        if (history.length > 50) {
            history.shift();
        }
    }

    function undoHistory() {
        if (submitting || rescheduleBusy) {
            return;
        }
        const snap = history.pop();
        if (!snap) {
            showMessage(t.review.undoNone, 1800, "info");
            return;
        }
        errorMsg = "";
        resetCardState();
        sessionDone = false;
        queue = snap.queue;
        pendingRequeues = snap.pendingRequeues;
        scheduleRequeueTimer();
        reviewedIDs = snap.reviewedIDs;
        sessionSkipped = snap.skippedIDs;
        current = snap.current;
        showAnswer = false;
        cardHtml = snap.cardHtml;
        expectedText = snap.expectedText;
        faceError = snap.faceError;
        occl = snap.occlusion;
        cardShownAt = Date.now();
        sessionNew = snap.counters.new;
        sessionReview = snap.counters.review;
        sessionForget = snap.counters.forget;
        sessionSkip = snap.counters.skip;
        persistSession(); // 撤销后的计数同样落盘（AQ-2）
        restartTimeout();
        showMessage(t.review.undoDone, 1500, "info");
    }

    async function rate(rating: Rating, force = false) {
        if (!current || sessionPaused || (!showAnswer && !force) || submitting || rescheduleBusy) {
            return;
        }
        triggerHaptic(rating === 1 ? [15, 30, 15] : 12);
        recovery = null; // BI-9：已开始评分=隐式选择继续原场
        submitting = true;
        pushHistory();
        let writeSucceeded = false;
        // 会话强化重现卡（M3）：仅本地翻牌推进，不重复评内核、不计 revlog（调度不变）
        if (current.lvRequeue) {
            playSfx(rating);
            await next();
            submitting = false;
            return;
        }
        try {
            const wasNew = isCardNew(ctx.getRevlog(), current.cardID);
            playSfx(rating);
            await reviewRiffCard(current.deckID, current.cardID, rating, reviewedIDs);
            writeSucceeded = true;
            // AQ-13：作答耗时按设置封顶（后台停留/离席不制造超长样本），原生事件无此字段保持 N/A
            const cap = Math.max(5, eff().answerTimeCapSec || 60);
            const dur = cardShownAt > 0 ? Math.min(cap, Math.max(0, Math.round((Date.now() - cardShownAt) / 1000))) : undefined;
            ctx.appendRevlog({ cardID: current.cardID, deckID: current.deckID, blockID: current.blockID, rating, source: "plugin", ...(dur !== undefined ? { dur } : {}) });
            reviewedIDs = [...reviewedIDs, current.cardID];
            if (rating === 1) {
                sessionForget += 1;
                // 遗忘卡短期循环：延迟数分钟后本地重现，避免立即重复；不动内核调度。
                if (eff().requeueAgain) {
                    queueDelayedRequeue(current);
                }
            } else if (wasNew) {
                sessionNew += 1;
            } else {
                sessionReview += 1;
            }
            // AQ-2：先更新计数再落盘——重载恢复的进度与界面一致，不丢刚评的一张
            persistSession();
            announce(t.review.liveRated, "polite");
            const forgotCardID = rating === 1 ? current.cardID : null;
            await next();
            // BJ-4：遗忘后显示错误原因标注（旁路增强，不阻塞下一张）。
            // 必须在 next() 之后置位——next() 开头会重置 showErrTags（F-3 审计修复：
            // 原先在 next() 前置位导致 chips 行被立即清除、从不显示）
            if (forgotCardID && ctx.tagErrorReason) {
                errTagCardID = forgotCardID;
                errTagged = false;
                showErrTags = true;
            }
        } catch (e: any) {
            // 评分失败保留现场（AJ11）：当前卡/答案态/队列不动，只提示错误
            // The snapshot was created before the write. Since no write took
            // effect, keeping it would expose a phantom undo after retry.
            if (!writeSucceeded) history.pop();
            errorMsg = friendlyError(e, t);
            announce(errorMsg, "assertive");
        } finally {
            submitting = false;
        }
    }

    async function skip() {
        if (!current || sessionPaused || submitting || rescheduleBusy) {
            return;
        }
        recovery = null; // BI-9：同评分——有动作即隐式续场
        submitting = true;
        pushHistory();
        let writeSucceeded = false;
        try {
            // 重现卡不计内核跳过（同评分类：调度不变）
            if (!current.lvRequeue) {
                await skipReviewRiffCard(current.deckID, current.cardID);
                writeSucceeded = true;
                invalidateDueCache(); // AT-4：skip 移出今日到期，共享缓存失效（badge/总览下次读取拉新）
            } else {
                // Requeue cards are local-only and do not call the kernel.
                writeSucceeded = true;
            }
            sessionSkip += 1;
            sessionSkipped = [...sessionSkipped, current.cardID];
            // AQ-2：skip 也落盘——故障注入重载后跳过的卡不重复出现
            persistSession();
            announce(t.review.liveSkipped, "polite");
            await next();
        } catch (e: any) {
            // Skip follows the same pre-write snapshot rule as rating: a
            // failed request must not leave an undo entry for an unchanged
            // queue.
            if (!writeSucceeded) history.pop();
            errorMsg = friendlyError(e, t);
        } finally {
            submitting = false;
        }
    }

    async function suspendToday() {
        if (!current || submitting || rescheduleBusy) { return; }
        ctx.suspendToday(current.cardID);
        showMessage(t.review.suspendedToast, 2000, "info");
        await next();
    }

    /** BJ-2：推进分级提示（不自动提交评分；纯展示+日志；v0.133.0 内容推导） */
    /** BJ-2：推进分级提示（BK-1 KO 优先 + 文本推导兜底；不自动提交评分） */
    /** BJ-2：提示级别指示文本（如"关键词提示 (1/2)"） */
    let cachedAvailLevels: HintLevel[] = [];
    function hintLevelText(): string {
        if (!hintLevel || !current) return "";
        const cardText = (cardHtml || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        const avail = cachedAvailLevels.length > 0 ? cachedAvailLevels : availableLevels(deriveHintLevels(cardText));
        const idx = avail.indexOf(hintLevel);
        return idx >= 0 ? `${idx + 1}/${avail.length}` : "";
    }

    function advanceHint() {
        if (!current || showAnswer) return;
        const ko = ctx.getKOBySource?.(current.blockID);
        const input: HintLevelsInput = ko
            ? { "recall-target": `回忆：${ko.fact}`, keyword: ko.fact, full: (cardHtml || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() }
            : deriveHintLevels((cardHtml || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
        if (!input.full) return;
        const result = nextHint(input, hintLevel);
        if (result) {
            hintLog = [...hintLog, logHint(current.cardID, result.level)];
            if (result.level === "full") {
                // BJ-2：full 级=即翻面（设计口径）
                showAnswer = true;
                hintLevel = null;
                hintText = "";
            } else {
                hintLevel = result.level;
                hintText = result.text;
            }
        }
    }

    async function next() {
        if (rescheduleBusy) return;
        // BJ-2：翻卡/切卡时重置提示
        hintLevel = null;
        hintText = "";
        // BJ-4：同步重置错误标注显示
        showErrTags = false;
        errTagged = false;
        // 记录上一张供回看（AJ2：只存数据，不自动打开浮层）
        if (current) {
            lastAnswered = { html: cardHtml, card: current, revealed: showAnswer };
        }
        const idx = current ? queue.findIndex(c => c.cardID === current!.cardID) : -1;
        const rest = queue.slice(idx + 1);
        if (rest.length > 0) {
            queue = rest;
            await setCurrent(rest[0]);
        } else {
            // 本批复习完，继续拉取下一批（内核按每日上限分批返回）
            await loadQueue();
        }
    }

    /** 浮层关闭后焦点归还卡面（429）：键盘流不因开过关浮层而丢焦 */
    function returnFocus() {
        (rootEl ?? cardEl)?.focus?.();
    }

    /** 浮层焦点移入（542）：帮助浮层打开即聚焦自身，Esc 关闭后归还 */
    let helpEl: HTMLDivElement | null = $state(null);
    $effect(() => {
        if (helpOpen && helpEl) {
            helpEl.focus();
        }
    });

    function togglePeek() {
        if (peek) {
            peek = null;
            returnFocus();
        } else if (lastAnswered) {
            peek = { ...lastAnswered };
        } else {
            showMessage(t.review.peekNone, 1800, "info");
        }
    }

    function openInEditor() {
        if (!current) { return; }
        openTab({ app: ctx.app, doc: { id: current.blockID, zoomIn: true } });
    }

    /** 快速改期（M3·FR5，f 键/按钮）：N 天后到期 */
    async function reschedule() {
        const card = current;
        const days = Number(rescheduleDays);
        if (!card || submitting || rescheduleBusy || !Number.isSafeInteger(days) || days < 1 || days > 36500) return;
        let request = retryReschedule?.cardID === card.cardID && retryReschedule.days === days ? retryReschedule : null;
        if (!request) {
            const d = new Date(Date.now() + days * 86400000);
            if (!Number.isFinite(d.getTime())) return;
            const due = "" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") +
                String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + String(d.getSeconds()).padStart(2, "0");
            request = { cardID: card.cardID, days, due };
            retryReschedule = request;
        }
        rescheduleBusy = true;
        rescheduleError = "";
        try {
            await batchSetRiffCardsDueTime([{ id: request.cardID, due: request.due }]);
            retryReschedule = null;
            rescheduleError = "";
            invalidateDueCache(); // AT-4：改期改变到期时间，共享缓存失效
            showMessage(t.review.rescheduled.replace("${n}", String(days)), 2000, "info");
            if (current?.cardID === card.cardID) {
                showReschedule = false;
                rescheduleBusy = false;
                await next();
            }
        } catch (e: any) {
            rescheduleError = friendlyError(e, t);
            announce(rescheduleError, "assertive");
        } finally {
            rescheduleBusy = false;
        }
    }

    /** 刷新当前卡内容（编辑返回后手动/自动触发） */
    async function refreshCard() {
        if (!current) return;
        answerCache.delete(current.blockID);
        await loadBlockDOM(current.blockID);
    }

    /** 编辑返回自动刷新（M3·FR5）：监听 visible 状态恢复时刷新卡面 */
    $effect(() => {
        if (typeof document === "undefined") return;
        const handler = () => {
            if (document.visibilityState === "visible" && current) {
                refreshCard();
            }
        };
        document.addEventListener("visibilitychange", handler);
        return () => document.removeEventListener("visibilitychange", handler);
    });

    /** 应用内返回检测（M3）：思源内切回复习页不触发 visibilitychange，
     * 以「离开面板 ≥15s 后重新点入」为编辑返回信号，节流刷新当前卡 */
    let lastPanelPointer = 0;
    function onPanelPointerDown(e: PointerEvent) {
        if (!current || !(e.target instanceof Node) || !rootEl?.contains(e.target)) {
            return;
        }
        resumePausedSession();
        const now = Date.now();
        if (lastPanelPointer > 0 && now - lastPanelPointer >= 15000) {
            refreshCard();
        }
        lastPanelPointer = now;
    }

    /** 源上下文预览（M3）：只读展示来源块前后各 2 块 */
    let ctxOpen = $state(false);
    let ctxBlocks = $state<{ id: string; html: string }[]>([]);
    let ctxLoading = $state(false);
    let contextRequestSeq = 0;
    async function toggleContext() {
        ctxOpen = !ctxOpen;
        const seq = ++contextRequestSeq;
        if (ctxOpen && current) {
            const cardID = current.cardID;
            ctxLoading = true;
            ctxBlocks = [];
            try {
                const blocks = await ctx.getContextBlocks(current.blockID);
                if (seq === contextRequestSeq && current?.cardID === cardID && ctxOpen) ctxBlocks = blocks;
            } catch { /* 静默降级为空列表 */ }
            if (seq === contextRequestSeq) ctxLoading = false;
        }
    }

    function dueText(rating: string): string {
        const due = current?.nextDues?.[rating];
        if (!due) { return ""; }
        return due.replace(/^\d{4}-0?/, "").replace(/:\d{2}$/, "");
    }

    /** 键盘双通道去重（AJ 复核）：容器与 window 都绑了 onKeydown，
     * 焦点在面板内时事件会冒泡到 window 造成双触发（如 [ 开回看又立即关闭）。
     * 约定：容器通道处理焦点在面板内的按键；window 通道只处理面板外的。 */
    function onWindowKeydown(e: KeyboardEvent) {
        if (rootEl && e.target instanceof Node && rootEl.contains(e.target)) {
            return;
        }
        onKeydown(e);
    }

    function onKeydown(e: KeyboardEvent) {
        if (sessionPaused) return;
        if (zoomedImage) {
            if (e.key === "Escape") {
                closeZoomedImage();
                e.preventDefault();
            }
            return;
        }
        if (showPauseModal || showSessionOptionsModal || showMemoEditor || showRetireModal) {
            if (e.key === "Escape") {
                if (memoSaving || retireBusy) {
                    e.preventDefault();
                    return;
                }
                showPauseModal = false;
                showSessionOptionsModal = false;
                showMemoEditor = false;
                showRetireModal = false;
                e.preventDefault();
                returnFocus();
            } else if (e.key === "Tab" && sessionModalEl) {
                const controls = Array.from(sessionModalEl.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), textarea:not(:disabled)"));
                const first = controls[0], last = controls[controls.length - 1];
                if (controls.length === 0) { sessionModalEl.focus(); e.preventDefault(); }
                else if (e.shiftKey && document.activeElement === first) { last?.focus(); e.preventDefault(); }
                else if (!e.shiftKey && document.activeElement === last) { first?.focus(); e.preventDefault(); }
            }
            return;
        }
        if (showMoreToolbar) {
            if (e.key === "Escape") { showMoreToolbar = false; e.preventDefault(); returnFocus(); }
            return;
        }
        if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        // Enter/Space 保留控件自身行为（展开菜单、选择选项、点击按钮），避免触发后台评分。
        if ((e.key === "Enter" || e.key === " ") && e.target instanceof Element && e.target.closest("button, select, a, [role='button']")) return;
        const action = resolveReviewKeyAction(e, {
            peekOpen: Boolean(peek),
            helpOpen,
            showAnswer,
            faceReady,
            hasCurrent: Boolean(current),
            hasLastAnswered: Boolean(lastAnswered),
            ratingStyle: eff().ratingStyle,
            isTargetInsideRoot: Boolean(rootEl && e.target instanceof Node && rootEl.contains(e.target)),
        });

        if (!action) return;

        // 交互式选择题键盘快捷键（A/B/C/D 或 1/2/3/4 或多选提交 Enter）
        if (!showAnswer && interactiveQuiz?.kind === "choice" && interactiveQuiz.options.length >= 2) {
            if (interactiveQuiz.isMultiple && (e.key === "Enter" || e.key === " ") && selectedChoiceKeys.length > 0) {
                e.preventDefault();
                submitChoiceAnswer();
                return;
            }
            const keyUpper = e.key.toUpperCase();
            const matchedOpt = interactiveQuiz.options.find(o => o.key === keyUpper)
                || (Number(e.key) >= 1 && Number(e.key) <= interactiveQuiz.options.length ? interactiveQuiz.options[Number(e.key) - 1] : null);
            if (matchedOpt) {
                e.preventDefault();
                handleOptionPick(matchedOpt.key);
                return;
            }
        }

        // 交互式判断题键盘快捷键（T/1/Y 或 F/2/N）
        if (!showAnswer && interactiveQuiz?.kind === "judge") {
            const keyLower = e.key.toLowerCase();
            if (keyLower === "t" || keyLower === "y" || e.key === "1") {
                e.preventDefault();
                handleJudgePick(true);
                return;
            } else if (keyLower === "f" || keyLower === "n" || e.key === "2") {
                e.preventDefault();
                handleJudgePick(false);
                return;
            }
        }

        if ((e.key === "r" || e.key === "R") && !showAnswer && current && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
            reversedRecall = !reversedRecall;
            return;
        }

        // 答案揭晓后连击空格或回车：极速采用推荐评分提交并切下一张
        if (showAnswer && (e.key === " " || e.key === "Enter") && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
            const ratingToSubmit = (suggestedRating as any) ?? 3;
            void rate(ratingToSubmit);
            return;
        }

        if ((e.key === "z" || e.key === "Z") && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
            zenMode = !zenMode;
            showMessage(zenMode ? "已开启沉浸专注模式 (按 z 退出)" : "已退出专注模式", 1500, "info");
            return;
        }

        if (e.key === "*" && current) {
            e.preventDefault();
            toggleStarCurrent();
            return;
        }

        switch (action) {
            case "close-peek":
                peek = null;
                returnFocus();
                break;
            case "toggle-help":
                helpOpen = !helpOpen;
                break;
            case "close-help":
                helpOpen = false;
                returnFocus();
                break;
            case "reveal":
                triggerKeyFeedback(" ");
                if (e.shiftKey || !revealNextClozeOrAll(false)) {
                    revealAnswer();
                }
                break;
            case "rate-default":
                triggerKeyFeedback("3");
                rate(3);
                break;
            case "advance-hint":
                advanceHint();
                break;
            case "toggle-peek":
                togglePeek();
                break;
            case "skip":
                skip();
                break;
            case "toggle-reschedule":
                showReschedule = !showReschedule;
                break;
            case "suspend":
                suspendToday();
                break;
            case "toggle-memo":
                showMemoEditor = !showMemoEditor;
                break;
            case "rate-1":
                triggerKeyFeedback("1");
                rate(1);
                break;
            case "rate-2":
                triggerKeyFeedback("2");
                rate(2);
                break;
            case "rate-3":
                triggerKeyFeedback("3");
                rate(3);
                break;
            case "rate-4":
                triggerKeyFeedback("4");
                rate(4);
                break;
            case "undo":
                undoHistory();
                break;
        }
    }

    /** 点击翻面热区：卡面空白处才翻面（输入控件/链接/按钮不触发，为打字题预留） */
    // 触屏滑卡手势（M3·FR10）：右=良好 左=遗忘 上=翻面
    let touchStartX = 0;
    let touchStartY = 0;

    function onTouchStart(e: TouchEvent) {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    }

    // BI-9：恢复分支动作——resume 保场续用；summary 复用完成屏只读展示；narrow 直达范围选择；end 清现场重开
    function recoveryAct(branch: string) {
        recovery = null;
        recoverySnap = null;
        if (branch === "resume") {
            return; // 计数已恢复，队列照常
        }
        if (branch === "summary") {
            sessionDone = true; // 只看摘要：完成屏展示已恢复计数，不评分不写卡
            return;
        }
        if (branch === "narrow") {
            scopeEl?.focus();
            showMessage(t.review.recoveryNarrowTip, 2500, "info");
            return;
        }
        // end：清空现场重新开始
        ctx.clearSessionState();
        // The previous session is no longer the session shown on screen. Do
        // not offer an undo that would restore cards from that discarded run.
        history = [];
        clearPendingRequeues();
        reviewedIDs = [];
        sessionSkipped = [];
        sessionNew = 0;
        sessionReview = 0;
        sessionForget = 0;
        sessionSkip = 0;
        loadQueue();
    }

    function onTouchEnd(e: TouchEvent) {
        if (showPauseModal || showSessionOptionsModal || showMoreToolbar || isOverlayTarget(e.target)) return;
        if (shouldIgnoreSwipeTarget(e.target)) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (!current) return;
        const action = reviewSwipeAction(showAnswer, dx, dy);
        if (action === "good") { rate(3); }
        else if (action === "again") { rate(1); }
        else if (action === "reveal" && faceReady) { revealAnswer(); }
    }

    function revealAnswer() {
        if (!faceReady || showAnswer) return;
        showAnswer = true;
        triggerHaptic(10);
    }

    function toggleStarCurrent() {
        if (!current) return;
        const cid = current.cardID;
        const next = new Set(starredCardIDs);
        if (next.has(cid)) {
            next.delete(cid);
            showMessage("已取消星标", 1500, "info");
        } else {
            next.add(cid);
            showMessage("⭐ 已加入重点星标卡片", 1800, "info");
            triggerHaptic(15);
        }
        starredCardIDs = next;
    }

    function autoFocusInput(node: HTMLElement) {
        const timer = setTimeout(() => {
            try { node.focus(); } catch {}
        }, 60);
        return {
            destroy() { clearTimeout(timer); }
        };
    }

    function handleOptionPick(key: string) {
        if (!faceReady || showAnswer || !interactiveQuiz) return;
        if (interactiveQuiz.isMultiple) {
            if (selectedChoiceKeys.includes(key)) {
                selectedChoiceKeys = selectedChoiceKeys.filter(k => k !== key);
            } else {
                selectedChoiceKeys = [...selectedChoiceKeys, key];
            }
            triggerHaptic(5);
        } else {
            selectedChoiceKeys = [key];
            submitChoiceAnswer();
        }
    }

    function submitChoiceAnswer() {
        if (!interactiveQuiz || selectedChoiceKeys.length === 0) return;
        sessionQuizTotal++;
        const correctOptions = interactiveQuiz.options.filter(o => o.isAnswer);
        const correctKeys = correctOptions.map(o => o.key);
        if (correctKeys.length > 0) {
            const allMatch = correctKeys.length === selectedChoiceKeys.length && selectedChoiceKeys.every(k => correctKeys.includes(k));
            const hasWrong = selectedChoiceKeys.some(k => !correctKeys.includes(k));
            if (allMatch) {
                isAnswerCorrect = true;
                suggestedRating = 3;
                sessionQuizCorrect++;
                playSfx(3);
                triggerHaptic(15);
                showMessage(interactiveQuiz.isMultiple ? "多选全部正确！" : "回答正确！", 1800, "info");
            } else if (!hasWrong && selectedChoiceKeys.length < correctKeys.length) {
                isAnswerCorrect = false;
                suggestedRating = 2;
                playSfx(2);
                triggerHaptic(20);
                showMessage("回答部分正确（多选漏选），已标出全部答案", 2000, "info");
            } else {
                isAnswerCorrect = false;
                suggestedRating = 1;
                playSfx(1);
                triggerHaptic(25);
                showMessage("回答错误，已标出正确选项", 1800, "error");
            }
        }
        revealAnswer();
    }

    function handleJudgePick(val: boolean) {
        if (!faceReady || showAnswer || !interactiveQuiz) return;
        userJudgeChoice = val;
        sessionQuizTotal++;
        if (interactiveQuiz.judgeAnswer !== null) {
            isAnswerCorrect = val === interactiveQuiz.judgeAnswer;
            suggestedRating = isAnswerCorrect ? 3 : 1;
            if (isAnswerCorrect) sessionQuizCorrect++;
            playSfx(isAnswerCorrect ? 3 : 1);
            triggerHaptic(isAnswerCorrect ? 15 : 25);
            showMessage(isAnswerCorrect ? "判断正确！" : "判断错误，已标出正确答案", 1800, isAnswerCorrect ? "info" : "error");
        }
        revealAnswer();
    }

    function handleFillCheck() {
        if (!faceReady || showAnswer || !interactiveQuiz) return;
        const text = typingInput.trim();
        if (!text) {
            // 输入为空敲 Enter 直接翻面查看答案（放弃思考/不输入直接揭晓）
            revealAnswer();
            return;
        }
        const target = interactiveQuiz.fillExpected || expectedText;
        if (target) {
            const g = gradeTyping(target, text, eff().typingStrict);
            typingGrade = g;
            isAnswerCorrect = g.suggested >= 3;
            suggestedRating = g.suggested;
            sessionQuizTotal++;
            if (isAnswerCorrect) sessionQuizCorrect++;
            playSfx(g.suggested as any);
            triggerHaptic(isAnswerCorrect ? 15 : 25);
            if (g.isTypo) {
                showMessage("拼写微瑕（1 字之差），智能容错放行通过！", 2200, "info");
            } else {
                showMessage(isAnswerCorrect ? "填空正确！" : "填空已对比，查看答案", 1800, isAnswerCorrect ? "info" : "error");
            }
        }
        revealAnswer();
    }

    function onContainerClick(e: MouseEvent) {
        if (showPauseModal || showSessionOptionsModal || showMoreToolbar || isOverlayTarget(e.target) || shouldIgnoreSwipeTarget(e.target)) {
            return;
        }
        if (!showAnswer && current && faceReady) {
            revealAnswer();
        }
    }

    function isOverlayTarget(target: EventTarget | null): boolean {
        return target instanceof Element && Boolean(target.closest(".lv-modal-backdrop, .lv-toolbar-more-scrim, .lv-toolbar-more-menu"));
    }

    onMount(() => {
        // T01 可用时间（docs/40）：开场即按偏好挂预算（原型 hero「可用时间 [15 分钟▾]」→ 会话结束条件）
        const prefBudget = ctx.preferredBudgetMin?.() ?? 0;
        if (prefBudget > 0) {
            setBudget(prefBudget);
        }
        // 会话中断恢复（M3）：当日已有评分进度时，恢复计数并从剩余卡继续
        const ss = ctx.getSessionState();
        if (ss && ss.completed !== true && hasSessionProgress(ss)) {
            reviewedIDs = ss.reviewedIDs;
            sessionSkipped = ss.skippedIDs ?? []; // AQ-2：跳过集合恢复，重载不重复出卡
            sessionNew = ss.counters.new;
            sessionReview = ss.counters.review;
            sessionForget = ss.counters.forget;
            sessionSkip = ss.counters.skip;
            // BI-9：有现场→给出恢复分支（跨天/零进度/队列空的禁用语义由纯模块判定）
            recoverySnap = {
                date: ss.date,
                today: todayKey(),
                reviewedCount: ss.counters.new + ss.counters.review,
                skippedCount: ss.counters.skip,
                queueRemaining: -1, // 队列未拉取：首刷后回填
            };
            // BI-8：上次收工原因（若已收集）随横幅展示，辅助返场分流
            endPicked = ss.endReason ?? null;
            recovery = recoveryOptions(recoverySnap);
        }
        loadQueue();
        loadReturnCheck(); // BI-10：长期返场检查（只读，触发=长间隔或大积压）
        // 范围选择器数据源（失败静默：仅影响下拉项，不影响默认全部复习）
        getRiffDecks().then(d => (decks = d)).catch(() => { /* 旁路 */ });
        getNotebooks().then(n => (notebooks = n)).catch(() => { /* 旁路 */ });
        if (typeof window !== "undefined" && window.visualViewport) {
            window.visualViewport.addEventListener("resize", onViewportChange);
            window.visualViewport.addEventListener("scroll", onViewportChange);
        }
        // AT-10：设置保存后超时参数立即生效；评分风格/顺序等下一卡自然生效
        const offSettings = ctx.onSettingsChanged?.(() => {
            settingsRev++; // C-3：出题形态等 derived 以此为响应式信号，保存后立即生效
            const s = eff();
            if (current && !showAnswer && (s.timeoutMode !== lastTimeoutMode || s.timeoutSeconds !== lastTimeoutSeconds)) {
                restartTimeout();
            }
            lastTimeoutMode = s.timeoutMode;
            lastTimeoutSeconds = s.timeoutSeconds;
        });
        return () => offSettings?.();
    });

    // 遮罩 overlay 定位：监听图片加载、卡面布局和视口变化，避免晚加载或窄屏时坐标过期。
    $effect(() => {
        const activeOcclusion = occl;
        const target = cardEl;
        const html = cardHtml;
        positionOcclusion();
        if (!activeOcclusion || !target || !html) return;
        const image = target.querySelector<HTMLElement | SVGElement>("img, svg:not(.lv-occl-overlay), canvas");
        if (!image) return;
        const throttledRemeasure = rafThrottle(() => {
            if (isDisposed) return;
            positionOcclusion();
        });
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => throttledRemeasure()) : null;
        observer?.observe(target);
        observer?.observe(image);
        image.addEventListener("load", throttledRemeasure);
        window.addEventListener("resize", throttledRemeasure);
        window.visualViewport?.addEventListener("resize", throttledRemeasure);
        window.visualViewport?.addEventListener("scroll", throttledRemeasure);
        return () => {
            throttledRemeasure.cancel();
            observer?.disconnect();
            image.removeEventListener("load", throttledRemeasure);
            window.removeEventListener("resize", throttledRemeasure);
            window.visualViewport?.removeEventListener("resize", throttledRemeasure);
            window.visualViewport?.removeEventListener("scroll", throttledRemeasure);
        };
    });

    onDestroy(() => {
        isDisposed = true;
        throttledViewportChange.cancel();
        stopTimeout(); // AJ7：销毁时清理倒计时，防止泄漏
        stopRequeueTimers();
        if (typeof window !== "undefined" && window.visualViewport) {
            window.visualViewport.removeEventListener("resize", onViewportChange);
            window.visualViewport.removeEventListener("scroll", onViewportChange);
        }
        if (activeUtterance && "speechSynthesis" in window) {
            speechSynthesis.cancel();
            activeUtterance = null;
        }
        closeReviewAudio(audioCtx);
        audioCtx = null;
    });
</script>

<svelte:window on:keydown={onWindowKeydown} />
<svelte:document on:pointerdown={onPanelPointerDown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
    class="lv-review"
    class:lv-review--zen={zenMode}
    class:lv-keyboard-open={isKeyboardOpen}
    style={isKeyboardOpen ? `--lv-keyboard-inset:${keyboardInset}px;` : undefined}
    bind:this={rootEl}
    role="presentation"
    onclick={onContainerClick}
    onkeydown={(e) => onKeydown(e)}
    onfocusin={resumePausedSession}
    ontouchstart={onTouchStart}
    ontouchend={onTouchEnd}
    tabindex="-1"
>
    {#if zenMode}
        <button type="button" class="b3-button b3-button--small lv-btn-ghost lv-zen-exit-pill" onclick={() => (zenMode = false)}>
            ⤢ 退出专注 (z)
        </button>
    {/if}
    <!-- AS-4：读屏播报区域（视觉隐藏） -->
    <LvLive message={liveMsg} tone={liveTone} />
    {#if sessionPaused}
        <div class="lv-recover" role="status">
            <span>{t.review.pauseTitle}</span>
            <button class="b3-button b3-button--small" onclick={resumePausedSession}>{t.review.pauseContinue}</button>
        </div>
    {/if}
    <!-- BI-27 返场分流（docs/13 §4 BI-27 UI 接线）：方案展示可忽略，不自动改预算/队列 -->
    {#if returnBanner && !recovery}
        <div class="lv-notice" role="status">
            <div class="lv-eyebrow">{t.review.returnTriageTitle}</div>
            <div style="margin-top: calc(var(--lv-space-unit) * 2)">{returnBanner.planText}</div>
            <div class="ft__smaller ft__on-surface" style="margin-top: calc(var(--lv-space-unit) * 2)">{returnBanner.steps.join(" · ")}</div>
            <div class="ft__smaller ft__on-surface" style="margin-top: calc(var(--lv-space-unit) * 1)">{returnBanner.capText}</div>
            <div style="margin-top: calc(var(--lv-space-unit) * 3); text-align: right">
                <button class="b3-button b3-button--small" onclick={() => (returnBanner = null)}>{t.review.returnDismiss}</button>
            </div>
        </div>
    {/if}
    <!-- BI-9：中断恢复分支（四选一，用户拍板；disabled 项带原因） -->
    {#if recovery}
        <div class="lv-recover" role="group" aria-label={t.review.recoveryTitle}>
            <span class="lv-recover-title">{t.review.recoveryTitle}</span>
            {#if endPicked}
                <!-- BI-8：上次收工原因随横幅提示（辅助返场分流；不改变任何分支语义） -->
                <span class="ft__smaller ft__on-surface" style="opacity:.75">{t.endReason.last}{t.endReason[endPicked] ?? ""}</span>
            {/if}
            {#each recovery as opt (opt.branch)}
                <button
                    class="b3-button b3-button--small"
                    class:b3-button--outline={opt.branch !== "resume"}
                    class:lv-btn-primary={opt.branch === "resume"}
                    disabled={!opt.enabled}
                    title={opt.enabled ? "" : (t.recovery[opt.disabledWhyKey?.replace("recovery.", "")] ?? opt.disabledWhyKey ?? "")}
                    onclick={() => recoveryAct(opt.branch)}
                >{t.recovery[opt.branch]}</button>
            {/each}
        </div>
    {/if}
    {#if returnItems && !returnDismissed}
        <!-- BI-10：长期返场检查（只读预览；不写内核，重建归 BI-28 可撤销批次） -->
        <div class="lv-return" role="status" aria-live="polite">
            <span class="lv-return-title">{t.returnCheck.bannerTitle}</span>
            {#each returnItems as it (it.key)}
                <span class="b3-chip" class:b3-chip--warning={it.level === "warn"}>{it.text}</span>
            {/each}
            <button class="b3-button b3-button--text b3-button--small" onclick={() => (returnDismissed = true)}>{t.returnCheck.dismiss}</button>
        </div>
        <!-- BI-13：减负选择（点击展开对 due/历史的影响说明；纯建议可跳过） -->
        <div class="lv-return lv-relief" role="group" aria-label={t.loadRelief.title}>
            <span class="lv-return-title">{t.loadRelief.title}</span>
            {#each reliefChoices as c (c.key)}
                <button class="b3-button b3-button--small" aria-expanded={reliefOpen === c.key}
                    onclick={() => onReliefPick(c.key)}>{t.loadRelief[c.key]}</button>
            {/each}
        </div>
        {#if reliefOpen}
            <div class="lv-return lv-relief-impact" aria-live="polite">
                <span class="ft__smaller ft__on-surface">{t.loadRelief.impact[reliefOpen]}</span>
            </div>
        {/if}
    {/if}
    {#if qualityExcludedCardIDs.length > 0 && !emptyQueue}
        <div class="lv-notice lv-notice--warn" role="status" aria-live="polite" style="display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-2); flex-wrap: wrap;">
            <span>{t.review.qualityExcluded.replace("${n}", String(qualityExcludedCardIDs.length))}</span>
            <div style="display: flex; gap: var(--lv-sp-2); align-items: center;">
                <button class="b3-button b3-button--small b3-button--outline" onclick={recheckQualityExcluded}>{t.review.qualityRecheck}</button>
                <button class="b3-button b3-button--small lv-btn-primary" onclick={() => ctx.openDashboard("maintenance")}>{t.review.openMaintenance ?? "前往维护中心修复"}</button>
            </div>
        </div>
    {/if}
    {#if loading}
        <div class="lv-center">{t.dashboard.loading}</div>
    {:else if errorMsg}
        <div class="lv-center lv-error-wrap">
            <LvError message={errorMsg} onretry={loadQueue} retryLabel={t.dashboard.refresh} />
        </div>
    {:else if requeueWaiting}
        <div class="lv-center lv-done">
            <div class="lv-done-panel lv-empty-queue" role="status" aria-live="polite">
                <div class="lv-eyebrow">REVIEW / {headScopeLabel}</div>
                <div class="lv-empty-queue-title">{t.review.requeueWaitingTitle}</div>
                <p class="ft__smaller ft__on-surface" style="margin: calc(var(--lv-space-unit) * 3) 0 0">
                    {t.review.requeueWaitingSub.replace("${n}", String(requeueWaitSeconds))}
                </p>
                <div class="fn__flex lv-done-actions" style="justify-content: center; margin-top: var(--lv-sp-4)">
                    <button class="b3-button b3-button--outline" onclick={loadQueue}>{t.dashboard.refresh}</button>
                    <button class="b3-button b3-button--outline" disabled={history.length === 0 || actionBusy} onclick={undoHistory}>{t.review.undoLast}</button>
                </div>
            </div>
        </div>
    {:else if emptyQueue}
        <!-- 复习就绪看板（Review Ready Dashboard）：Bento 便当盒排布，内聚隔离提示，提供丰富的后续步骤 -->
        <div class="lv-center lv-ready-wrap">
            <div class="lv-ready-hub">
                <!-- 顶部导航与状态条 -->
                <div class="lv-ready-header">
                    <div class="lv-ready-title-group">
                        <span class="lv-ready-eyebrow">
                            <LvIcon name="cards" size={13} /> REVIEW HUB · {headScopeLabel}
                        </span>
                        <h2 class="lv-ready-title">
                            {qualityExcludedCardIDs.length > 0
                                ? (t.review.readyHasIssuesTitle ?? "当前队列暂无可学闪卡")
                                : (t.review.readyEmptyTitle ?? "今日复习任务已轻松搞定")}
                        </h2>
                        <p class="lv-ready-desc">
                            {qualityExcludedCardIDs.length > 0
                                ? (t.review.readyHasIssuesDesc ?? "检测到当前范围内部分卡片存在异常并已被安全隔离保护，其它卡片均已完成。")
                                : (t.review.readyEmptyDesc ?? "当前选择的范围内没有到期的卡片，已有的复习进度与掌握度统计均已完好保存。")}
                        </p>
                    </div>

                    <!-- 快捷范围切换胶囊 -->
                    <div class="lv-ready-scope-pill">
                        <span class="lv-ready-scope-label"><LvIcon name="book" size={14} /> {t.review.scopeTitle}</span>
                        <select
                            class="b3-select lv-ready-scope-select"
                            aria-label={t.review.scopeTitle}
                            bind:value={scopeKey}
                            onchange={() => { ctx.onScopePersist(scopeKey); changeScope(); }}
                        >
                            <option value="all">{t.review.scopeAll}</option>
                            <option value="new">{t.review.scopeNew}</option>
                            <option value="old">{t.review.scopeOld}</option>
                            {#if decks.length > 0}
                                <optgroup label={t.dashboard.decks}>
                                    {#each decks as d (d.id)}<option value={`deck:${d.id}`}>{d.name}</option>{/each}
                                </optgroup>
                            {/if}
                            {#if notebooks.length > 0}
                                <optgroup label={t.review.scopeNotebooks}>
                                    {#each notebooks as n (n.id)}<option value={`notebook:${n.id}`}>{n.name}</option>{/each}
                                </optgroup>
                            {/if}
                        </select>
                    </div>
                </div>

                <!-- 若存在被隔离的卡片：内聚为看板专属警告卡，不漂浮在视口顶部 -->
                {#if qualityExcludedCardIDs.length > 0}
                    <div class="lv-ready-alert" role="status" aria-live="polite">
                        <div class="lv-ready-alert-main">
                            <span class="lv-ready-alert-icon"><LvIcon name="warning" size={18} /></span>
                            <div class="lv-ready-alert-text">
                                <strong>{t.review.qualityExcluded.replace("${n}", String(qualityExcludedCardIDs.length))}</strong>
                                <p>{t.review.qualityExcludedHelp ?? "这通常是因为原笔记块被移动、删除或内容为空。它们已受安全保护，不会影响正常进度。"}</p>
                            </div>
                        </div>
                        <div class="lv-ready-alert-actions">
                            <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={recheckQualityExcluded}>
                                <LvIcon name="refresh" size={14} /> {t.review.qualityRecheck}
                            </button>
                            <button type="button" class="b3-button b3-button--small lv-btn-primary" onclick={() => ctx.openDashboard("maintenance")}>
                                <LvIcon name="target" size={14} /> {t.review.openMaintenance ?? "前往维护中心修复"}
                            </button>
                        </div>
                    </div>
                {/if}

                <!-- 便当盒功能矩阵：引导用户下一步干什么 -->
                <div class="lv-ready-grid">
                    <!-- 便当 1：进阶练习与突击 -->
                    <div class="lv-ready-card">
                        <div class="lv-ready-card-head">
                            <span class="lv-ready-icon-bubble lv-bubble--brand"><LvIcon name="zap" size={17} /></span>
                            <div>
                                <div class="lv-ready-card-title">{t.review.readyCramTitle ?? "自主提前巩固"}</div>
                                <div class="lv-ready-card-subtitle">{t.review.readyCramSubtitle ?? "无需等待到期，自主提前练习未来卡片"}</div>
                            </div>
                        </div>
                        <p class="lv-ready-card-desc">{t.review.readyCramDesc ?? "按遗忘次数智能排序，优先复习最易遗忘的薄弱知识点，让长效记忆更牢固。"}</p>
                        <div class="lv-ready-card-footer">
                            <button type="button" class="b3-button b3-button--small lv-btn-primary" onclick={() => { cramActive = true; void loadQueue(); }}>
                                <LvIcon name="flame" size={14} /> {t.review.startCram ?? "开启 Cram 提前冲刺"}
                            </button>
                            <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={() => { scopeKey = "new"; ctx.onScopePersist("new"); changeScope(); }}>
                                <LvIcon name="star" size={14} /> {t.review.scopeNew ?? "仅学新卡"}
                            </button>
                        </div>
                    </div>

                    <!-- 便当 2：扩充与积累知识 -->
                    <div class="lv-ready-card">
                        <div class="lv-ready-card-head">
                            <span class="lv-ready-icon-bubble lv-bubble--good"><LvIcon name="edit" size={17} /></span>
                            <div>
                                <div class="lv-ready-card-title">{t.review.readyCreateTitle ?? "制作与积累新卡"}</div>
                                <div class="lv-ready-card-subtitle">{t.review.readyCreateSubtitle ?? "将当前正在研读的笔记转化为闪卡"}</div>
                            </div>
                        </div>
                        <p class="lv-ready-card-desc">{t.review.readyCreateDesc ?? "支持自由回忆、问答、选区挖空（==答案==）及图片遮挡等多样化制卡形态。"}</p>
                        <div class="lv-ready-card-footer">
                            <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={() => ctx.openDashboard("authoring")}>
                                + {t.review.createCards ?? "去制作新卡"}
                            </button>
                            <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={() => ctx.openDashboard("inbox")}>
                                <LvIcon name="inbox" size={14} /> {t.dashboard.inbox ?? "材料收件箱"}
                            </button>
                        </div>
                    </div>

                    <!-- 便当 3：卡库浏览与管理 -->
                    <div class="lv-ready-card">
                        <div class="lv-ready-card-head">
                            <span class="lv-ready-icon-bubble lv-bubble--warn"><LvIcon name="cards" size={17} /></span>
                            <div>
                                <div class="lv-ready-card-title">{t.review.readyManageTitle ?? "卡片库浏览与整理"}</div>
                                <div class="lv-ready-card-subtitle">{t.review.readyManageSubtitle ?? "全面掌控沉淀的所有闪卡资产"}</div>
                            </div>
                        </div>
                        <p class="lv-ready-card-desc">{t.review.readyManageDesc ?? "跨卡组搜索检索、批量归组迁移、查看历史复习表现与生命周期健康度。"}</p>
                        <div class="lv-ready-card-footer">
                            <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={() => ctx.openDashboard("manage")}>
                                <LvIcon name="search" size={14} /> {t.menuManager ?? "闪卡管理器"}
                            </button>
                            <button type="button" class="b3-button b3-button--small b3-button--outline" onclick={() => ctx.openDashboard("maintenance")}>
                                <LvIcon name="target" size={14} /> {t.dashboard.maintenance ?? "维护中心"}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 底栏全局主路径 -->
                <div class="lv-ready-bottom-bar">
                    <button type="button" class="b3-button b3-button--cancel lv-ready-refresh-btn" onclick={loadQueue}>
                        <LvIcon name="refresh" size={14} /> {t.dashboard.refresh ?? "刷新状态"}
                    </button>
                    <button type="button" class="b3-button lv-btn-primary lv-ready-home-btn" onclick={() => ctx.openDashboard()}>
                        <LvIcon name="home" size={15} /> {t.review.returnHome ?? "返回闪卡主页"}
                    </button>
                </div>
            </div>
        </div>
    {:else if sessionDone || !current}
        <div class="lv-center lv-done">
            <!-- T07 结果面（R52 results）：单面板 + check 徽 + 大数字统计 + 行式补充 + NEXT 软面板 -->
            <div class="lv-done-panel">
                <div class="lv-done-head">
                    <span class="check lv-done-check" aria-hidden="true">✓</span>
                    <div class="lv-done-headtext">
                        <div class="lv-done-title">{t.review.done}</div>
                        <div class="lv-done-sub">
                            {t.review.doneNew} {sessionNew} · {t.review.doneReview} {sessionReview} · {t.review.doneForget} {sessionForget} · {t.review.doneSkip} {sessionSkip}
                        </div>
                    </div>
                    {#if (sessionNew + sessionReview) > 0}
                        {@const ret = Math.round(Math.max(0, (sessionNew + sessionReview - sessionForget)) / (sessionNew + sessionReview) * 100)}
                        <div class="lv-done-retention-bubble" class:lv-ret-high={ret >= 80} class:lv-ret-mid={ret >= 60 && ret < 80}>
                            <LvIcon name="zap" size={13} />
                            <span>{t.review.doneRetention ?? "留存率"} {ret}%</span>
                        </div>
                    {/if}
                    {#if sessionQuizTotal > 0}
                        {@const acc = Math.round(sessionQuizCorrect / sessionQuizTotal * 100)}
                        <div class="lv-done-quiz-bubble" class:lv-quiz-high={acc >= 80} class:lv-quiz-mid={acc >= 60 && acc < 80}>
                            <LvIcon name="check" size={13} />
                            <span>实战命中率 {acc}% ({sessionQuizCorrect}/{sessionQuizTotal})</span>
                        </div>
                    {/if}
                </div>
                <div class="lv-done-stats">
                    <div class="lv-done-stat">
                        <span class="lv-done-stat-label">{t.review.doneReview} · {t.review.doneNew}</span>
                        <span class="lv-hero-num" use:countUp={sessionNew + sessionReview}>{sessionNew + sessionReview}</span>
                        <p>{PURPOSE_PROFILES[purpose].grading === "informal" ? t.review.purposeInformal : t.review.doneConfirm}</p>
                    </div>
                    <div class="lv-done-stat">
                        <span class="lv-done-stat-label">{t.review.doneSkip}</span>
                        <span class="lv-hero-num" use:countUp={sessionSkip}>{sessionSkip}</span>
                        <p>{t.review.skipNotRated}</p>
                    </div>
                    <div class="lv-done-stat">
                        <span class="lv-done-stat-label">{t.review.sessionTime}</span>
                        <span class="lv-hero-num">{sessionDurationText()}</span>
                        <p>{targetProgressText()}</p>
                    </div>
                </div>
                {#if budgetMin > 0}
                    <!-- BI-12：预算中性提示（到点收工不算失败；未完成项真实保留） -->
                    <div class="lv-notice">{budgetExpired ? t.review.budgetDoneTip : t.review.budgetOn}</div>
                {/if}
                {#if remainingDue !== null && remainingDue > 0}
                    <!-- T07 结果页（docs/13 §9）：真实剩余如实呈现——不需要为了清零而继续 -->
                    <div class="lv-notice">{t.review.remainingDue.replace("${n}", String(remainingDue))}</div>
                {/if}
                {#if streakMilestoneText()}
                    <div class="lv-done-milestone">{streakMilestoneText()}</div>
                {/if}
                {#if dailyTip()}
                    <div class="lv-done-tip">{dailyTip()}</div>
                {/if}
                <!-- BI-8：收工原因收集（可跳过；写当日现场，返场时恢复横幅/分流可读） -->
                <div class="lv-done-end" role="group" aria-label={t.endReason.title}>
                    <span class="ft__smaller ft__on-surface">{t.endReason.title}</span>
                    {#each END_REASONS as r (r)}
                        <button class="b3-button b3-button--small lv-btn-ghost" class:lv-btn-primary={endPicked === r}
                            aria-pressed={endPicked === r}
                            onclick={() => pickEnd(r)}>{t.endReason[r]}</button>
                    {/each}
                </div>
                {#if sessionSkip > 0 || sessionForget > 0}
                    <!-- T07 下一步建议（docs/40）：本场数据推导，本地口径、可忽略——"把疑问留下，也把下一步留下" -->
                    <div class="lv-done-next">
                        <div class="lv-eyebrow">{t.review.nextTitle}</div>
                        {#if sessionSkip > 0}
                            <div class="lv-next-row">
                                <span>{t.review.nextSkipped.replace("${n}", String(sessionSkip))}</span>
                                <button class="b3-button b3-button--small" onclick={() => ctx.openDashboard()}>{t.review.nextAct}</button>
                            </div>
                        {/if}
                        {#if sessionForget > 0}
                            <div class="lv-next-row" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                                <span>{t.review.nextForgotten.replace("${n}", String(sessionForget))}</span>
                                <button type="button" class="b3-button b3-button--small lv-btn-primary" onclick={() => { cramActive = true; void loadQueue(); }}>
                                    <LvIcon name="flame" size={13} /> {t.review.reinforceMistakes ?? "强化这批遗忘卡"}
                                </button>
                            </div>
                        {/if}
                        {#if starredCardIDs.size > 0}
                            <div class="lv-next-row" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                                <span>⭐ 本场共星标了 {starredCardIDs.size} 张重点卡片</span>
                                <button type="button" class="b3-button b3-button--small lv-btn-primary" onclick={() => { cramActive = true; void loadQueue(); }}>
                                    <LvIcon name="star" size={13} /> 立即专项练习星标卡
                                </button>
                            </div>
                        {/if}
                    </div>
                {/if}
                <div class="fn__flex lv-done-actions" style="justify-content: center; gap: var(--lv-sp-2)">
                    <button class="b3-button lv-btn-primary" onclick={() => ctx.openDashboard()}><LvIcon name="home" size={16} /> {t.review.returnHome ?? "返回闪卡主页"}</button>
                    <button class="b3-button b3-button--outline" onclick={() => ctx.openDashboard("manage")}>{t.menuManager}</button>
                    <button class="b3-button b3-button--text" onclick={loadQueue}>{t.review.again}</button>
                </div>
            </div>
        </div>
    {:else}
        <div class="lv-head">
            <!-- R52 review 面三行结构：①身份+状态 ②进度条 ③范围/目的控制 + 工具 -->
            <div class="lv-head-row">
                <div class="fn__flex" style="align-items: center; gap: var(--lv-sp-2)">
                    <span class="lv-eyebrow">REVIEW / {headScopeLabel}</span>
                    <button
                        type="button"
                        class="b3-button b3-button--small lv-btn-ghost lv-review-return-home"
                        title={t.review.returnHome ?? "返回闪卡主页"}
                        onclick={() => ctx.openDashboard()}
                    >
                        <LvIcon name="home" size={15} /> {t.review.returnHome ?? "返回主页"}
                    </button>
                </div>
                {#if entryCtx}
                    <!-- BI-3：入口上下文条（来源保留；取消/重开不丢，仅 × 显式清除） -->
                    <span class="lv-entry" title={t.entry.title}>
                        <span class="lv-entry-from ft__smaller">{t.entry.title}·{t.entry.kind[entryCtx.entryKind] || entryCtx.entryKind}</span>
                        {#if ctx.returnToEntry && entryCtx.returnPoint}
                            <button class="b3-button b3-button--text b3-button--small" onclick={() => ctx.returnToEntry!(entryCtx!.returnPoint)}>{t.entry.return}</button>
                        {/if}
                        {#if ctx.dismissEntry}
                            <button class="b3-button b3-button--text b3-button--small" aria-label={t.entry.dismiss} title={t.entry.dismiss} onclick={() => { ctx.dismissEntry!(entryCtx!.entryKind, entryCtx!.sourceID); entryCtx = null; }}>×</button>
                        {/if}
                    </span>
                {/if}
                <div class="fn__flex-1"></div>
                {#if cramActive}<span class="b3-chip b3-chip--error">{t.exam.cramOn}</span>{/if}
                {#if budgetMin > 0}
                    <!-- BI-12：预算倒计时；到点转为中性提示（不自动结束、不算失败） -->
                    {#if budgetExpired}
                        <span class="lv-chip2 lv-chip2--default" title={t.review.budgetDoneTip}>{t.review.budgetDone}</span>
                    {:else}
                        <span class="lv-timeout lv-budget-chip" title={t.review.budgetLabel}><LvIcon name="timer" size={13} /><small>总余</small> {budgetClockText()}</span>
                    {/if}
                {/if}
                {#if current.lvRequeue}<span class="lv-chip2 lv-chip2--warn" title={t.review.requeueTip}>{t.review.requeueChip}</span>{/if}
                {#if eff().timeoutMode !== "off" && !showAnswer}
                    <span class="lv-timeout lv-card-timeout-chip" class:lv-timeout-low={timeoutLeft <= 10} title="单卡作答限时"><LvIcon name="zap" size={13} /><small>限时</small> {timeoutText()}</span>
                {/if}
                <span class="lv-tags">
                    {#if !(eff().hideMetaUntilAnswer && !showAnswer)}
                        {#if current.state === 0}<span class="lv-chip2 lv-chip2--primary">{t.review.tagNew}</span>{/if}
                        <span class="lv-chip2 lv-chip2--default">{t.review.reps} {current.reps} · {t.review.lapses} {current.lapses}</span>
                    {/if}
                    <span class="lv-chip2 lv-chip2--default">
                        {#if occl}<LvIcon name="image" size={14} /> {t.cardTypeBadgeOcclusion ?? "遮挡"}
                        {:else if cardHtml?.includes("language-")}<LvIcon name="code" size={14} /> {t.cardTypeBadgeCode ?? "代码"}
                        {:else if cardHtml?.includes("lv-masked") || cardHtml?.includes("data-type=\"mark\"")}<LvIcon name="edit" size={14} /> {t.cardTypeBadgeCloze ?? "挖空"}
                        {:else if cardMemo}<LvIcon name="lightbulb" size={14} /> {isCustomPluginAnswer ? (t.cardTypeBadgePlugin ?? "插件答") : (t.cardTypeBadgeMemo ?? "备注答")}
                        {:else if hasDelimitedQa(cardHtml)}<LvIcon name="message" size={14} /> {t.cardTypeBadgeQA ?? "问答"}
                        {:else}<LvIcon name="book" size={14} /> {t.cardTypeBadgeNative ?? "原生闪卡"}
                        {/if}
                    </span>
                    {#if current.lapses >= (eff().leechThreshold ?? 4)}
                        <span class="lv-chip2 lv-chip2--warn" title={t.review.leechTip?.replace("${n}", String(current.lapses)) ?? `已遗忘 ${current.lapses} 次，建议拆解知识点`}><LvIcon name="warning" size={14} /> {t.review.leechChip ?? "易混淆"}</span>
                    {/if}
                    {#if markedIssueCardIDs.has(current.cardID)}
                        <span class="lv-chip2 lv-chip2--warn" title={t.review.issueMarked}><LvIcon name="flag" size={14} /> {t.review.issueChip}</span>
                    {/if}
                </span>
                <span class="lv-progress">{reviewedIDs.length + 1} / {reviewedIDs.length + queue.length}</span>
            </div>
            <div class="lv-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={reviewedIDs.length + queue.length} aria-valuenow={reviewedIDs.length}>
                <!-- 灵感融合（AnkiDroid）：进度条按本场评分语义分段——遗忘段 error 色、已评段 primary 色，
                     宽度取持久化计数（sessionForget/总进度），刷新恢复后口径一致 -->
                <div class="lv-progress-seg lv-progress-seg--forget" style={`width:${(Math.max(0, sessionForget) / Math.max(1, reviewedIDs.length + queue.length)) * 100}%`}></div>
                <div class="lv-progress-seg" style={`width:${(Math.max(0, reviewedIDs.length - sessionForget) / Math.max(1, reviewedIDs.length + queue.length)) * 100}%`}></div>
            </div>
            <div class="lv-head-row lv-head-tools">
                <select class="b3-select lv-scope" bind:this={scopeEl} bind:value={scopeKey} onchange={() => { ctx.onScopePersist(scopeKey); changeScope(); }} title={t.review.scopeTitle} aria-label={t.review.scopeTitle}>
                    <option value="all">{t.review.scopeAll}</option>
                    <option value="new">{t.review.scopeNew}</option>
                    <option value="old">{t.review.scopeOld}</option>
                    {#if decks.length > 0}
                        <optgroup label={t.dashboard.decks}>
                            {#each decks as d (d.id)}
                                <option value={`deck:${d.id}`}>{d.name}</option>
                            {/each}
                        </optgroup>
                    {/if}
                    {#if notebooks.length > 0}
                        <optgroup label={t.review.scopeNotebooks}>
                            {#each notebooks as n (n.id)}
                                <option value={`notebook:${n.id}`}>{n.name}</option>
                            {/each}
                        </optgroup>
                    {/if}
                </select>
                <!-- BI-2：本次会话目的（结束条件随目的显示；informal 不计入每日目标） -->
                <select class="b3-select lv-scope" bind:value={purpose} title={t.review.purposeTitle} aria-label={t.review.purposeTitle}>
                    {#each SESSION_PURPOSES as p (p)}
                        <option value={p}>{t.purpose[p].name}</option>
                    {/each}
                </select>
                <!-- R53 主色即动作：结束条件章是信息不是按钮——优雅胶囊态 + 目标语义前缀 + 提示解释 -->
                <span class="lv-chip2 lv-chip2--default lv-purpose-end-chip" title={PURPOSE_PROFILES[purpose].grading === "formal" ? t.review.purposeFormal : t.review.purposeInformal}>
                    <LvIcon name="target" size={12} /> {t.purpose[purpose].end}
                </span>
                <div class="fn__flex-1"></div>
                <!-- docs/13 §4：图标可读、操作不依赖 hover；常驻核心高频操作，二级动作折叠进更多气泡 -->
                <div class="lv-font-scale-group" title={t.review.fontScaleTitle ?? "调整卡面字号"}>
                    <button type="button" class="b3-button b3-button--small lv-btn-ghost lv-font-btn" title="缩小卡面字号" onclick={() => adjustFontScale(-0.1)}>A−</button>
                    <button type="button" class="b3-button b3-button--small lv-btn-ghost lv-font-btn" title="放大卡面字号" onclick={() => adjustFontScale(0.1)}>A+</button>
                </div>
                <button class="b3-button b3-button--small lv-btn-ghost lv-tool-btn" title={t.review.sessionOptionsTitle} aria-label={t.review.sessionOptionsTitle} onclick={openSessionOptions}><LvIcon name="zap" size={14} /><span class="lv-tool-btn-label"> {t.review.sessionOptionsTitle.slice(0, 4)}</span></button>
                <button class="b3-button b3-button--small lv-btn-ghost lv-tool-btn" class:lv-btn-starred={starredCardIDs.has(current?.cardID ?? '')} title="星标重点卡片 (*)" aria-label="星标重点卡片" aria-pressed={starredCardIDs.has(current?.cardID ?? '')} disabled={!current || actionBusy} onclick={toggleStarCurrent}><LvIcon name="star" size={14} /><span class="lv-tool-btn-label"> {starredCardIDs.has(current?.cardID ?? '') ? "已星标" : "星标"}</span></button>
                <button class="b3-button b3-button--small lv-btn-ghost lv-tool-btn" class:lv-btn-primary={markedIssueCardIDs.has(current?.cardID ?? '')} title={markedIssueCardIDs.has(current?.cardID ?? '') ? t.review.issueMarked : t.review.tbMarkIssue} aria-label={t.review.tbMarkIssue} aria-pressed={markedIssueCardIDs.has(current?.cardID ?? '')} disabled={!current || actionBusy || markedIssueCardIDs.has(current?.cardID ?? '')} onclick={toggleMarkIssue}><LvIcon name="flag" size={14} /><span class="lv-tool-btn-label"> {markedIssueCardIDs.has(current?.cardID ?? '') ? t.review.issueChip : t.review.tbMarkIssue}</span></button>
                <button class="b3-button b3-button--small lv-btn-ghost lv-tool-btn" title={t.review.pauseTitle} aria-label={t.review.pauseTitle} disabled={actionBusy} onclick={() => (showPauseModal = true)}><LvIcon name="moon" size={14} /><span class="lv-tool-btn-label"> {t.review.tbPause}</span></button>
                <button class="b3-button b3-button--small lv-btn-ghost lv-tool-btn" title={t.review.undoTitle} aria-label={t.review.undoTitle} disabled={actionBusy || history.length === 0} onclick={undoHistory}>{t.review.tbUndo}</button>
                <button class="b3-button b3-button--small lv-btn-ghost lv-tool-btn" disabled={actionBusy} onclick={skip}>{t.review.skip}</button>
                <div class="lv-toolbar-more-wrap">
                    <button
                        type="button"
                        class="b3-button b3-button--small lv-btn-ghost lv-tool-btn"
                        class:lv-btn-primary={showMoreToolbar}
                        title={t.review.tbMoreDesc ?? t.review.tbMore}
                        aria-label={t.review.tbMoreDesc ?? t.review.tbMore}
                        aria-expanded={showMoreToolbar}
                        onclick={() => (showMoreToolbar = !showMoreToolbar)}
                    >
                        ··· {t.review.tbMore}
                    </button>
                    {#if showMoreToolbar}
                        <div class="lv-toolbar-more-scrim" onclick={() => (showMoreToolbar = false)}></div>
                        <div class="lv-toolbar-more-menu" role="menu">
                            <button type="button" class="lv-toolbar-menu-item" class:lv-active={reversedRecall} title={t.review.enableReversed ?? "翻转问答自测 (R)"} onclick={() => { reversedRecall = !reversedRecall; showMoreToolbar = false; }}>
                                <span class="lv-menu-icon"><LvIcon name="refresh" size={16} /></span><span>{reversedRecall ? (t.review.cancelReversed ?? "恢复正常顺序") : (t.review.enableReversed ?? "翻转问答自测 (R)")}</span>
                            </button>
                            <button type="button" class="lv-toolbar-menu-item" class:lv-active={zenMode} title="沉浸专注模式 (z)" onclick={() => { zenMode = !zenMode; showMoreToolbar = false; }}>
                                <span class="lv-menu-icon"><LvIcon name="eye" size={16} /></span><span>{zenMode ? "退出专注模式 (z)" : "沉浸专注模式 (z)"}</span>
                            </button>
                            <button type="button" class="lv-toolbar-menu-item" class:lv-active={ctxOpen} title={t.review.ctxToggle} onclick={() => { toggleContext(); showMoreToolbar = false; }}>
                                <span class="lv-menu-icon"><LvIcon name="book" size={16} /></span><span>{t.review.tbCtx}</span>
                            </button>
                            <button type="button" class="lv-toolbar-menu-item" class:lv-active={prefsOpen || hasOverrides} title={t.review.prefsTitle} onclick={() => { prefsOpen = !prefsOpen; showMoreToolbar = false; }}>
                                <span class="lv-menu-icon"><LvIcon name="settings" size={16} /></span><span>{t.review.tbPrefs}{hasOverrides ? " ●" : ""}</span>
                            </button>
                            <button type="button" class="lv-toolbar-menu-item" disabled={!lastAnswered} title={t.review.peekPrev} onclick={() => { togglePeek(); showMoreToolbar = false; }}>
                                <span class="lv-menu-icon"><LvIcon name="eye" size={16} /></span><span>{t.review.peekPrev}</span>
                            </button>
                            <button type="button" class="lv-toolbar-menu-item" title={t.review.openInEditor} onclick={() => { openInEditor(); showMoreToolbar = false; }}>
                                <span class="lv-menu-icon"><LvIcon name="edit" size={16} /></span><span>{t.review.openInEditor ?? t.review.open}</span>
                            </button>
                            <button type="button" class="lv-toolbar-menu-item" title={t.review.refreshCard} onclick={() => { refreshCard(); showMoreToolbar = false; }}>
                                <span class="lv-menu-icon"><LvIcon name="refresh" size={16} /></span><span>{t.review.tbRefresh}</span>
                            </button>
                            <button type="button" class="lv-toolbar-menu-item" disabled={actionBusy} title={t.review.suspendToday} onclick={() => { suspendToday(); showMoreToolbar = false; }}>
                                <span class="lv-menu-icon"><LvIcon name="moon" size={16} /></span><span>{t.review.suspendToday ?? t.review.tbSuspend}</span>
                            </button>
                            <button type="button" class="lv-toolbar-menu-item" disabled={!current || actionBusy} title={t.review.tbMemo} onclick={() => { showMemoEditor = true; showMoreToolbar = false; }}>
                                <span class="lv-menu-icon"><LvIcon name="lightbulb" size={16} /></span><span>{t.review.tbMemo ?? "助记便签"}</span>
                            </button>
                            <button type="button" class="lv-toolbar-menu-item lv-menu-danger" disabled={!current || actionBusy} title={t.review.retireCard} onclick={() => { showRetireModal = true; showMoreToolbar = false; }}>
                                <span class="lv-menu-icon"><LvIcon name="ban" size={16} /></span><span>{t.review.retireCard ?? "移出卡组"}</span>
                            </button>
                            <div class="lv-toolbar-menu-divider"></div>
                            <button type="button" class="lv-toolbar-menu-item" title={t.review.helpTitle} onclick={() => { helpOpen = true; showMoreToolbar = false; }}>
                                <span class="lv-menu-icon"><LvIcon name="question" size={16} /></span><span>{t.review.tbHelp}</span>
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
        <div class="lv-card b3-typography" class:lv-anim-glow={showAnswer} bind:this={cardEl} style={`max-width:${eff().cardMaxWidth}px; width:100%; margin:0 auto;`}>
            {#if currentBreadcrumbs && currentBreadcrumbs.nodes.length > 0}
                <!-- 汲取自闪卡小助手 ZY 与 RemNote：卡面来源文档知识语境层级面包屑 -->
                <button
                    type="button"
                    class="lv-card-source-breadcrumb"
                    title={(currentBreadcrumbs.formattedText || currentHPath) + " · " + (t.review.breadcrumbHint ?? "点击查阅来源文档上下文")}
                    onclick={toggleContext}
                    data-testid="review-breadcrumbs-btn"
                >
                    <span class="lv-breadcrumb-icon"><LvIcon name="book" size={16} /></span>
                    <span class="lv-breadcrumb-text">
                        {#each currentBreadcrumbs.nodes as node, idx}
                            {#if idx > 0}<span class="lv-breadcrumb-sep" aria-hidden="true">›</span>{/if}
                            <span class="lv-breadcrumb-node" title={node.fullTitle}>{node.displayTitle}</span>
                        {/each}
                    </span>
                </button>
            {:else if currentHPath}
                <!-- 汲取自闪卡小助手 ZY 与 RemNote：卡面来源文档知识语境面包屑 -->
                <button
                    type="button"
                    class="lv-card-source-breadcrumb"
                    title={t.review.breadcrumbHint ?? "点击查阅来源文档上下文"}
                    onclick={toggleContext}
                >
                    <span class="lv-breadcrumb-icon"><LvIcon name="book" size={16} /></span>
                    <span class="lv-breadcrumb-text">{currentHPath}</span>
                </button>
            {/if}
            {#if !cardHtml && faceError}
                <!-- AS-3：卡面加载失败占位（不白屏；重试不丢队列位置） -->
                <div class="lv-center" style="display: flex; flex-direction: column; gap: calc(var(--lv-space-unit) * 5); align-items: center; justify-content: center; min-height: 220px" role="status">
                    <span style="font-size: var(--lv-type-hero-size)"><LvIcon name="warning" size={30} /></span>
                    <span class="ft__smaller ft__on-surface" style="text-align: center">{faceError}</span>
                    <button class="b3-button b3-button--outline b3-button--small" onclick={retryFace}>{t.dashboard.refresh}</button>
                </div>
            {:else if !cardHtml}
                <div class="lv-center" style="min-height: 220px" aria-busy="true">
                    <span class="ft__smaller ft__on-surface">{t.dashboard.loading}</span>
                </div>
            {:else}
                {#key current?.cardID}
                    <!-- 灵动感（R53 纪律内）：切卡 140ms 单次淡入，只动 opacity；翻面淡入由 lv-anim-glow 承担 -->
                    <div class="lv-card-content lv-unified-face" class:has-interactive-choice={interactiveQuiz?.kind === "choice" && interactiveQuiz.options.length >= 2} class:lv-masked={!showAnswer} onclick={onCardContentClick} style={`font-size: ${eff().cardFontScale || 1}em`} in:fade={{ duration: getMotionDuration("standard") }}>
                        {#if eff().customCardCss}
                            {@html `<style>${eff().customCardCss}</style>`}
                        {/if}
                        {@html showAnswer ? cardHtml : maskedCardHtml}
                    </div>

                    <!-- 交互式选择题选项矩阵（点击或按 A/B/C/D 作答） -->
                    {#if interactiveQuiz?.kind === "choice" && interactiveQuiz.options.length >= 2}
                        <div class="lv-interactive-choice-container" role={interactiveQuiz.isMultiple ? "group" : "radiogroup"} aria-label={interactiveQuiz.isMultiple ? "多选题选项列表" : "单选题选项列表"}>
                            <div class="lv-interactive-choice-prompt">
                                <LvIcon name="check" size={14} />
                                <span>{interactiveQuiz.isMultiple ? "多选作答（点击选项）" : "选择作答（点击或敲键盘 A/B/C/D）"}</span>
                            </div>
                            <div class="lv-interactive-choice-grid">
                                {#each interactiveQuiz.options as opt (opt.key)}
                                    <button
                                        type="button"
                                        role={interactiveQuiz.isMultiple ? "checkbox" : "radio"}
                                        aria-checked={selectedChoiceKeys.includes(opt.key)}
                                        class="lv-interactive-choice-card"
                                        class:lv-choice-selected={selectedChoiceKeys.includes(opt.key)}
                                        class:lv-choice-correct={showAnswer && opt.isAnswer}
                                        class:lv-choice-wrong={showAnswer && selectedChoiceKeys.includes(opt.key) && !opt.isAnswer}
                                        disabled={showAnswer}
                                        onclick={() => handleOptionPick(opt.key)}
                                    >
                                        <span class="lv-choice-key-badge">{opt.key}</span>
                                        <span class="lv-choice-text-body">{opt.text}</span>
                                        <span class="lv-choice-kbd-badge" aria-hidden="true">{opt.key}</span>
                                        {#if showAnswer}
                                            {#if opt.isAnswer}
                                                <span class="lv-choice-result-pill lv-result-correct">✓ 正确答案</span>
                                            {:else if selectedChoiceKeys.includes(opt.key)}
                                                <span class="lv-choice-result-pill lv-result-wrong">✗ 你的选择</span>
                                            {/if}
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                            {#if interactiveQuiz.isMultiple && !showAnswer}
                                <div class="lv-choice-submit-row">
                                    <button
                                        type="button"
                                        class="b3-button lv-btn-primary lv-choice-submit-btn"
                                        disabled={selectedChoiceKeys.length === 0}
                                        onclick={submitChoiceAnswer}
                                    >
                                        <LvIcon name="check" size={14} /> 确认提交多选 ({selectedChoiceKeys.length} 项) · Enter
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <!-- 交互式判断题按钮组（点击或按 T/F 作答） -->
                    {#if interactiveQuiz?.kind === "judge"}
                        <div class="lv-interactive-judge-container" role="radiogroup" aria-label="判断题正误判定">
                            <div class="lv-interactive-choice-prompt">
                                <LvIcon name="target" size={14} />
                                <span>判断作答（点击判定或敲键盘 T/F）</span>
                            </div>
                            <div class="lv-interactive-judge-grid">
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={userJudgeChoice === true}
                                    class="lv-interactive-judge-btn lv-judge-btn--true"
                                    class:lv-judge-selected={userJudgeChoice === true}
                                    class:lv-judge-correct={showAnswer && interactiveQuiz.judgeAnswer === true}
                                    class:lv-judge-wrong={showAnswer && userJudgeChoice === true && interactiveQuiz.judgeAnswer === false}
                                    disabled={showAnswer}
                                    onclick={() => handleJudgePick(true)}
                                >
                                    <span class="lv-judge-circle-icon">✓</span>
                                    <div class="lv-judge-text-wrap">
                                        <strong class="lv-judge-main-label">正确 / 对</strong>
                                        <small class="lv-judge-sub-label">True</small>
                                    </div>
                                    <span class="lv-judge-kbd-badge" aria-hidden="true">T / 1</span>
                                    {#if showAnswer && interactiveQuiz.judgeAnswer === true}
                                        <span class="lv-judge-result-badge lv-result-correct">✓ 正确结论</span>
                                    {/if}
                                </button>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={userJudgeChoice === false}
                                    class="lv-interactive-judge-btn lv-judge-btn--false"
                                    class:lv-judge-selected={userJudgeChoice === false}
                                    class:lv-judge-correct={showAnswer && interactiveQuiz.judgeAnswer === false}
                                    class:lv-judge-wrong={showAnswer && userJudgeChoice === false && interactiveQuiz.judgeAnswer === true}
                                    disabled={showAnswer}
                                    onclick={() => handleJudgePick(false)}
                                >
                                    <span class="lv-judge-circle-icon">✗</span>
                                    <div class="lv-judge-text-wrap">
                                        <strong class="lv-judge-main-label">错误 / 错</strong>
                                        <small class="lv-judge-sub-label">False</small>
                                    </div>
                                    <span class="lv-judge-kbd-badge" aria-hidden="true">F / 2</span>
                                    {#if showAnswer && interactiveQuiz.judgeAnswer === false}
                                        <span class="lv-judge-result-badge lv-result-correct">✓ 正确结论</span>
                                    {/if}
                                </button>
                            </div>
                        </div>
                    {/if}

                    <!-- 交互式填空即时打字槽 -->
                    {#if interactiveQuiz?.kind === "fill" && !showAnswer}
                        <div class="lv-interactive-fill-container">
                            <div class="lv-interactive-fill-inner">
                                <span class="lv-fill-icon"><LvIcon name="edit" size={15} /></span>
                                <input
                                    type="text"
                                    class="b3-text-field lv-fill-input"
                                    use:autoFocusInput
                                    bind:value={typingInput}
                                    placeholder="在此输入你的填空答案，按 Enter 智能判定..."
                                    onkeydown={(e) => { if (e.key === "Enter") handleFillCheck(); }}
                                />
                                <button type="button" class="b3-button lv-btn-primary lv-fill-submit-btn" onclick={handleFillCheck}>
                                    判定 Enter
                                </button>
                            </div>
                        </div>
                    {/if}

                    <!-- 翻面后参考解析卡片（若存在解析） -->
                    {#if showAnswer && interactiveQuiz?.analysis}
                        <div class="lv-interactive-analysis-card" in:fade={{ duration: getMotionDuration("normal") }}>
                            <div class="lv-analysis-head">
                                <span class="lv-analysis-icon"><LvIcon name="lightbulb" size={16} /></span>
                                <strong>参考解析</strong>
                            </div>
                            <p class="lv-analysis-text">{interactiveQuiz.analysis}</p>
                        </div>
                    {/if}
                {/key}
            {/if}
            {#if showAnswer}
                {#if cardMemo}
                    <!-- 汲取自渐进学习与闪卡小助手插件：展示备注与生态插件答案 -->
                    <div class="lv-card-memo-callout">
                        <span class="lv-memo-icon"><LvIcon name="lightbulb" size={18} /></span>
                        <div class="lv-memo-body">
                            <strong>{isCustomPluginAnswer ? (t.review.customAnswerTitle ?? "参考答案（来自生态插件）") : !cardHtml?.includes("data-type=\"mark\"") ? (t.review.memoAnswerTitle ?? "参考答案（来自思源块备注）") : (t.review.memoTitle ?? "助记线索")}</strong>
                            <p>{cardMemo}</p>
                        </div>
                        <button
                            type="button"
                            class="b3-button b3-button--text b3-button--small lv-memo-edit-btn"
                            title={t.review.memoEdit ?? "修改助记线索"}
                            onclick={() => (showMemoEditor = true)}
                        >
                            <LvIcon name="edit" size={13} />
                        </button>
                    </div>
                {:else if !occl && !cardHtml?.includes("data-type=\"mark\"") && !hasDelimitedQa(cardHtml)}
                    <!-- 思源原生整块闪卡无损自评引导 -->
                    <div class="lv-native-recall-guidance">
                        <span class="lv-native-recall-icon"><LvIcon name="target" size={16} /></span>
                        <div class="lv-native-recall-body">
                            <strong>{t.review.nativeRecallTitle ?? "思源原生自由回忆"}</strong>
                            <p>{t.review.nativeRecallDesc ?? "该卡为原生笔记闪卡；原笔记未做任何修改。请对照上方内容，在下方直接自评打分。"}</p>
                        </div>
                    </div>
                {:else if cardHtml && !faceError}
                    <!-- 翻面后轻量静默入口：随时为该卡记录口诀与线索 -->
                    <div class="lv-memo-prompt">
                        <button
                            type="button"
                            class="lv-memo-add-btn"
                            title={t.review.memoModalTitle ?? "给未来的自己留助记线索"}
                            onclick={() => (showMemoEditor = true)}
                        >
                            <span><LvIcon name="lightbulb" size={15} /> {t.review.tbMemo ?? "助记便签"}</span>
                        </button>
                    </div>
                {/if}
            {/if}
            {#if faceHints.length > 0 && !faceError}
                <!-- AS-3：富内容提示行（特征告知 + 窄屏横滚提示；只读不遮挡） -->
                <div class="fn__flex fn__flex-wrap ft__smaller ft__on-surface" style="gap: calc(var(--lv-space-unit) * 3); margin-top: var(--lv-sp-2)" role="note">
                    {#each faceHints as hintKey (hintKey)}
                        <span class="b3-chip">{faceHintText(hintKey)}</span>
                    {/each}
                    <span class="ft__on-surface">{t.aiFace.scrollHint}</span>
                </div>
            {/if}
            {#if occl && occlBox}
                <!-- 遮罩 overlay：问题态实心（点击逐框显隐），答案态半透明全显 -->
                <svg
                    class="lv-occl-overlay"
                    style={`left:${occlBox.l}px;top:${occlBox.t}px;width:${occlBox.w}px;height:${occlBox.h}px;`}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                >
                    {#each occl.rects as r, i (i)}
                        {@const revealed = showAnswer || occlHidden.includes(i)}
                        <rect
                            x={r.x * 100} y={r.y * 100} width={r.w * 100} height={r.h * 100}
                            fill="var(--lv-color-brand)"
                            opacity={revealed ? (showAnswer ? 0.12 : 0.05) : 0.55}
                            stroke="var(--lv-primary-border)" stroke-width="0.3"
                            style={`cursor:${showAnswer ? "default" : "pointer"}`}
                            onclick={(e: Event) => {
                                if (showAnswer) return;
                                e.stopPropagation();
                                occlHidden = occlHidden.includes(i) ? occlHidden.filter(x => x !== i) : [...occlHidden, i];
                            }}
                        />
                    {/each}
                </svg>
            {/if}
            {#if !showAnswer}
                {#if showReschedule}
                    {@const invalidRescheduleDays = !Number.isSafeInteger(rescheduleDays) || rescheduleDays < 1 || rescheduleDays > 36500}
                    <div class="lv-reschedule lv-card2" aria-busy={rescheduleBusy} style="display:flex;flex-direction:column;gap:var(--lv-sp-2);padding:var(--lv-sp-3);margin:var(--lv-sp-2) 0;border:1px solid var(--lv-border);border-radius:12px;background:var(--lv-color-surface-subtle)">
                        <div style="display:flex;gap:var(--lv-sp-2);align-items:center;flex-wrap:wrap">
                            <span class="ft__smaller ft__on-surface">{t.review.rescheduleIn}</span>
                            <input class="b3-text-field" style="width:70px" type="number" min="1" max="36500" step="1" bind:value={rescheduleDays} aria-invalid={invalidRescheduleDays} aria-describedby={invalidRescheduleDays ? "lv-reschedule-error" : undefined} />
                            <span class="ft__smaller ft__on-surface">{t.review.rescheduleDays}</span>
                            {#if previewTargetLabel}
                                <span class="ft__smaller ft__on-surface" style="color:var(--lv-color-brand);margin-left:var(--lv-sp-2)">
                                    {t.review.rescheduleTarget}: <strong>{previewTargetLabel}</strong>
                                </span>
                            {/if}
                        </div>
                        {#if invalidRescheduleDays}
                            <span id="lv-reschedule-error" class="ft__smaller" role="alert" style="color:var(--b3-theme-error)">{t.review.rescheduleRange}</span>
                        {/if}
                        {#if rescheduleError}
                            <div class="ft__smaller lv-reschedule-error" role="alert" style="color:var(--b3-theme-error);background:var(--lv-danger-soft);padding:var(--lv-sp-1) var(--lv-sp-2);border-radius:6px">
                                <strong>{t.review.rescheduleErrorPreserved}</strong>: {rescheduleError}
                            </div>
                        {/if}
                        <div style="display:flex;gap:var(--lv-sp-2);align-items:center;justify-content:flex-end">
                            <button class="b3-button b3-button--text b3-button--small" onclick={() => { showReschedule = false; rescheduleError = ''; }}>{t.review.rescheduleCancel}</button>
                            <button class="b3-button b3-button--small lv-btn-primary" disabled={actionBusy || invalidRescheduleDays} aria-busy={rescheduleBusy} onclick={reschedule}>
                                {rescheduleBusy ? t.dashboard.loading : retryReschedule && rescheduleError ? t.review.rescheduleRetrySame : window.siyuan.languages.confirm}
                            </button>
                        </div>
                        <span class="ft__smaller ft__on-surface" style="opacity:0.75;font-size:11px">{t.review.rescheduleTargetHint}</span>
                    </div>
                {/if}
                {#if answerVariant === "typing"}
                    <div class="lv-typing">
                        <input
                            class="b3-text-field fn__block"
                            bind:value={typingInput}
                            onkeydown={(e: KeyboardEvent) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    submitTyping();
                                }
                            }}
                            placeholder={t.review.typingPlaceholder}
                        />
                    </div>
                {:else if answerVariant === "choice"}
                    {#if choiceFallbackMode === "free-recall"}
                        <div class="ft__smaller ft__on-surface lv-choice-fallback" role="status">
                            {t.review.choiceFallbackFreeRecall}
                        </div>
                    {:else if choices}
                        <div class="lv-choices">
                            {#each choices.options as opt, i (i)}
                                <button
                                    class="b3-button lv-choice-opt"
                                    class:lv-choice-correct={choices.picked !== null && i === choices.answerIdx}
                                    class:lv-choice-wrong={choices.picked === i && i !== choices.answerIdx}
                                    disabled={choices.picked !== null}
                                    onclick={() => {
                                        pickChoice(i);
                                        showMessage(i === choices.answerIdx ? t.review.choiceCorrect : t.review.choiceWrong, 1500, i === choices.answerIdx ? "info" : "error");
                                    }}
                                >{String.fromCharCode(65 + i)}. {opt}</button>
                            {/each}
                            {#if choices.picked !== null}
                                <LvChip tone={choices.picked === choices.answerIdx ? "primary" : "error"}>
                                    {t.review.typingSuggested}: {choices.picked === choices.answerIdx ? 3 : 1}
                                </LvChip>
                            {/if}
                        </div>
                    {:else if choiceLoading}
                        <div class="ft__smaller ft__on-surface" role="status" aria-busy="true">{t.review.choiceLoading}</div>
                    {:else}
                        <button class="b3-button b3-button--small lv-choice-btn" onclick={startChoice}><LvIcon name="dice" size={15} /> {t.review.choiceMake}</button>
                    {/if}
                {/if}
                <!-- BJ-2：分级提示显示区（不自动提交评分；含级别指示器） -->
                {#if hintText}
                    <div class="lv-hint-text">
                        <span class="ft__smaller ft__on-surface lv-hint-level">{hintLevelText()}</span>
                        {hintText}
                    </div>
                {/if}
                <!-- AQ-2：显示答案按钮补 onclick——此前覆盖层按钮无处理器且容器点击跳过 button，鼠标点击翻面失效 -->
                <div class="fn__flex" style="gap: var(--lv-sp-2); justify-content: center; align-items: center;">
                    {#if !showAnswer}
                        <button class="b3-button b3-button--small lv-btn-ghost" onclick={advanceHint}>{t.review.hintBtn}</button>
                    {/if}
                    <button class="b3-button b3-button--text lv-reveal" disabled={!faceReady} onclick={revealAnswer}>{t.review.showAnswer}</button>
                </div>
                <span class="lv-reveal-hint" aria-hidden="true">⎵ {t.review.revealHint}</span>
            {/if}
            {#if typingGrade}
                <div class="lv-typing-diff">
                    <span class="ft__smaller ft__on-surface">{typingGrade.isTypo ? "拼写微瑕容错" : t.review.typingSuggested}</span>
                    <LvChip tone={typingGrade.isTypo ? "warn" : typingGrade.suggested === 3 ? "primary" : typingGrade.suggested === 2 ? "warn" : "error"}>
                        {typingGrade.isTypo ? "微瑕 · 建议: 3" : typingGrade.suggested}
                    </LvChip>
                    <span class="lv-diff">
                        {#each typingGrade.chars as c, i (i)}
                            <span class:lv-diff-ok={c.ok} class:lv-diff-bad={!c.ok}>{c.ch}</span>
                        {/each}
                    </span>
                </div>
            {:else if showAnswer && eff().ttsEnabled}
                <div class="lv-tts-row">
                    <button class="b3-button b3-button--small lv-btn-ghost" title={t.review.speak} onclick={speakAnswer}>{t.review.speak}</button>
                </div>
            {/if}
        </div>
        {#if ctxOpen}
            <div class="lv-ctxpanel b3-typography">
                <div class="lv-ctx-title">{t.review.ctxTitle}</div>
                {#if ctxLoading}
                    <LvSkeleton count={2} height={36} />
                {:else if ctxBlocks.length === 0}
                    <div class="lv-hint">{t.review.ctxNone}</div>
                {:else}
                    {#each ctxBlocks as b (b.id)}
                        <div class="lv-ctx-block" class:lv-ctx-cur={current && b.id === current.blockID}>
                            {@html b.html}
                        </div>
                    {/each}
                {/if}
            </div>
        {/if}
        {#if prefsOpen}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="lv-prefs">
                <div class="lv-prefs-head">
                    <span>{t.review.prefsTitle}</span>
                    <span class="ft__smaller ft__on-surface">{t.review.prefsHint}</span>
                </div>
                <div class="lv-prefs-row">
                    <span>{t.settings.ratingStyle}</span>
                    <div class="fn__flex-1"></div>
                    <button class="b3-button b3-button--small" class:lv-btn-primary={eff().ratingStyle === "four"} onclick={() => setOverride("ratingStyle", "four")}>{t.review.prefsFour}</button>
                    <button class="b3-button b3-button--small" class:lv-btn-primary={eff().ratingStyle === "three"} onclick={() => setOverride("ratingStyle", "three")}>{t.review.prefsThree}</button>
                </div>
                <div class="lv-prefs-row">
                    <span>{t.settings.reverseOrder}</span>
                    <div class="fn__flex-1"></div>
                    <input type="checkbox" class="b3-switch" checked={eff().reverseOrder} onchange={(e: Event) => setOverride("reverseOrder", (e.target as HTMLInputElement).checked)} />
                </div>
                <!-- 混合题型轮换（v0.179.0）：本场按张数轮换翻面/打字/选择（展示层） -->
                <div class="lv-prefs-row">
                    <span>{t.settings.mixedRotationLabel}</span>
                    <div class="fn__flex-1"></div>
                    <input type="checkbox" class="b3-switch" checked={eff().mixedRotation === true} onchange={(e: Event) => setOverride("mixedRotation", (e.target as HTMLInputElement).checked)} />
                </div>
                <div class="lv-prefs-row">
                    <span>{t.settings.timeoutMode}</span>
                    <div class="fn__flex-1"></div>
                    <select class="b3-select b3-select--small" value={eff().timeoutMode} onchange={(e: Event) => setOverride("timeoutMode", (e.target as HTMLSelectElement).value)}>
                        <option value="off">{t.settings.timeoutOff}</option>
                        <option value="reveal">{t.settings.timeoutReveal}</option>
                        <option value="forget">{t.settings.timeoutForget}</option>
                    </select>
                </div>
                <!-- BI-12：本场时间预算（预设或自定义；预算到≠失败，仅提示；剩余卡保留队列） -->
                <div class="lv-prefs-row">
                    <span>{t.review.budgetLabel}</span>
                    <div class="fn__flex-1"></div>
                    <select class="b3-select b3-select--small" value={String(budgetMin)} onchange={(e: Event) => setBudget(Number((e.target as HTMLSelectElement).value))}>
                        <option value="0">{t.review.budgetOff}</option>
                        {#each BUDGET_PRESETS as m (m)}
                            <option value={String(m)}>{t.review.budgetMinutes.replace("${n}", String(m))}</option>
                        {/each}
                        {#if budgetMin > 0 && !(BUDGET_PRESETS as readonly number[]).includes(budgetMin)}
                            <!-- 自定义值回显（否则 select 空白） -->
                            <option value={String(budgetMin)}>{t.review.budgetMinutes.replace("${n}", String(budgetMin))}</option>
                        {/if}
                    </select>
                    <input
                        class="b3-text-field b3-text-field--small lv-budget-custom"
                        type="number" min="5" max="480" step="5"
                        aria-label={t.review.budgetCustomLabel}
                        placeholder={t.review.budgetCustomHint}
                        onchange={(e: Event) => setBudget(clampBudgetMinutes((e.target as HTMLInputElement).value))}
                    />
                </div>
                {#if budgetEstimate}
                    <div class="lv-prefs-row">
                        <span class="ft__smaller ft__on-surface">{t.review.budgetEst.replace("${done}", String(budgetEstimate.done)).replace("${left}", String(budgetEstimate.left))}</span>
                    </div>
                {/if}
                <div class="lv-prefs-row">
                    <div class="fn__flex-1"></div>
                    <button class="b3-button b3-button--small" disabled={!hasOverrides} onclick={() => (sessionOverride = {})}>{t.review.prefsReset}</button>
                </div>
            </div>
        {/if}
            {#if budgetMin === 25 && budgetExpired && showAnswer}
                <!-- 汲取自番茄闪卡 sy-tomato：25 分钟番茄专注周期达成，温和建议休息保护精力 -->
                <div class="lv-notice lv-notice--warn lv-pomodoro-alert" role="status">
                    <span class="lv-pomodoro-icon"><LvIcon name="timer" size={18} /></span>
                    <div class="lv-pomodoro-text">
                        <strong>{t.review.pomodoroDoneTitle ?? "25 分钟番茄专注达成！"}</strong>
                        <p>{(t.review.pomodoroDoneDesc ?? "已完成本轮专注复习（已评 ${n} 张），建议休息 5 分钟，让大脑巩固记忆再继续。").replace("${n}", String(reviewedIDs.length))}</p>
                    </div>
                    <div class="lv-pomodoro-actions">
                        <button class="b3-button b3-button--small lv-btn-primary" onclick={pauseSessionAndReturn}>
                            {t.review.pomodoroRest ?? "休息并返回今日"}
                        </button>
                        <button class="b3-button b3-button--small b3-button--outline" onclick={() => (budgetMin = 0)}>
                            {t.review.pomodoroContinue ?? "继续复习"}
                        </button>
                    </div>
                </div>
            {:else if timeoutExpired && showAnswer}
                <!-- docs/13 §6：限时到点不自动记分，评分由用户确认 -->
                <div class="lv-notice lv-notice--warn" style="margin-bottom: var(--lv-sp-2)">{t.review.timeoutExpiredNote}</div>
            {/if}
            <div class="lv-actions" class:lv-actions-compact={eff().ratingDensity === "compact"}>
            {#if !showAnswer}
                {#if stepRevealedCount > 0}
                    <div class="fn__flex" style="width: 100%; gap: var(--lv-sp-2)">
                        <button class="b3-button lv-btn-primary fn__flex-1 lv-btn-wide" class:lv-btn-pressed={pressedKeyFeedback === " "} disabled={!faceReady} onclick={() => { if (!revealNextClozeOrAll(false)) revealAnswer(); }}>
                            {t.review.clozeRevealNext ?? "揭晓下一空"}
                            <span class="lv-btn-wide-kbd">Space</span>
                        </button>
                        <button class="b3-button b3-button--outline lv-btn-small-pill" title="全部揭晓（Shift+Space）" onclick={() => revealAnswer()}>
                            {t.review.clozeRevealAll ?? "全部揭晓"}
                        </button>
                    </div>
                {:else}
                    <button class="b3-button lv-btn-primary lv-btn-wide" class:lv-btn-pressed={pressedKeyFeedback === " "} disabled={!faceReady} onclick={revealAnswer}>{t.review.showAnswer}<span class="lv-btn-wide-kbd">Space</span></button>
                {/if}
            {:else if eff().ratingStyle === "three"}
                <button class="b3-button lv-btn-rate lv-b1" class:lv-btn-suggested={suggestedRating === 1} class:lv-btn-pressed={pressedKeyFeedback === "1"} disabled={actionBusy} onclick={() => rate(1)}><span class="lv-rate-top"><span class="lv-rate-label">{t.review.unknown}</span><LvKbd k="1" /></span><small>{dueText("1")}</small></button>
                <button class="b3-button lv-btn-rate lv-b2" class:lv-btn-suggested={suggestedRating === 2} class:lv-btn-pressed={pressedKeyFeedback === "2"} disabled={actionBusy} onclick={() => rate(2)}><span class="lv-rate-top"><span class="lv-rate-label">{t.review.vague}</span><LvKbd k="2" /></span><small>{dueText("2")}</small></button>
                <button class="b3-button lv-btn-rate lv-b3" class:lv-btn-suggested={suggestedRating === 3} class:lv-btn-pressed={pressedKeyFeedback === "3"} disabled={actionBusy} onclick={() => rate(3)}><span class="lv-rate-top"><span class="lv-rate-label">{t.review.know}</span><LvKbd k="3" /></span><small>{dueText("3")}</small></button>
            {:else}
                <button class="b3-button lv-btn-rate lv-b1" class:lv-btn-suggested={suggestedRating === 1} class:lv-btn-pressed={pressedKeyFeedback === "1"} disabled={actionBusy} onclick={() => rate(1)}><span class="lv-rate-top"><span class="lv-rate-label">{t.review.againBtn}</span><LvKbd k="1" /></span><small>{dueText("1")}</small></button>
                <button class="b3-button lv-btn-rate lv-b2" class:lv-btn-suggested={suggestedRating === 2} class:lv-btn-pressed={pressedKeyFeedback === "2"} disabled={actionBusy} onclick={() => rate(2)}><span class="lv-rate-top"><span class="lv-rate-label">{t.review.hard}</span><LvKbd k="2" /></span><small>{dueText("2")}</small></button>
                <button class="b3-button lv-btn-rate lv-b3" class:lv-btn-suggested={suggestedRating === 3} class:lv-btn-pressed={pressedKeyFeedback === "3"} disabled={actionBusy} onclick={() => rate(3)}><span class="lv-rate-top"><span class="lv-rate-label">{t.review.good}</span><LvKbd k="3" /></span><small>{dueText("3")}</small></button>
                <button class="b3-button lv-btn-rate lv-b4" class:lv-btn-suggested={suggestedRating === 4} class:lv-btn-pressed={pressedKeyFeedback === "4"} disabled={actionBusy} onclick={() => rate(4)}><span class="lv-rate-top"><span class="lv-rate-label">{t.review.easy}</span><LvKbd k="4" /></span><small>{dueText("4")}</small></button>
            {/if}
        </div>
    {/if}

    {#if showErrTags && !errTagged && ctx.tagErrorReason}
        <!-- BJ-4：遗忘卡错误原因标注（旁路增强；点选后自动隐藏） -->
        <div class="lv-err-tags">
            <span class="ft__smaller ft__on-surface">{t.review.errTagPrompt}</span>
            {#each ERROR_REASON_IDS as rid (rid)}
                <button class="b3-button b3-button--small lv-err-tag" onclick={() => {
                    ctx.tagErrorReason?.(errTagCardID, rid);
                    errTagged = true;
                    announce(`${t.review.errTagDone}: ${t.review.ko.errReasons[rid] ?? rid}`, "polite");
                }}>
                    {t.review.ko.errReasons[rid] ?? rid}
                </button>
            {/each}
            <button class="b3-button b3-button--small" onclick={() => (showErrTags = false)} aria-label={t.review.skip}>✕</button>
        </div>
    {/if}

    {#if helpOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lv-help lv-glass" tabindex="-1" bind:this={helpEl} transition:fade={{ duration: getMotionDuration("normal") }} onclick={(e: Event) => e.stopPropagation()}>
            <div class="lv-help-head">
                <span>{t.review.helpTitle}</span>
                <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--small" aria-label={window.siyuan.languages.cancel} onclick={() => (helpOpen = false)}>✕</button>
            </div>
            <div class="lv-help-body">
                {#each [
                    { k: "Space / Enter", d: t.review.helpFlipRate },
                    { k: "Shift+Space", d: t.review.helpRevealAll ?? "全部揭晓（跳过逐步回忆）" },
                    { k: "A / B / C / D", d: "选择题选项点击或快捷作答" },
                    { k: "T / F (1 / 2)", d: "判断题正确 / 错误判定" },
                    { k: "1-4 / ← ↓ → ↑", d: "自评打分（重来 / 困难 / 良好 / 简单）" },
                    { k: "z", d: "沉浸专注模式（隐藏多余干扰）" },
                    { k: "*", d: "快速星标收藏重点卡片" },
                    { k: "r", d: t.review.helpReverse ?? "翻转问答自测" },
                    { k: "p / q", d: t.review.helpUndo },
                    { k: "x / 0", d: t.review.helpSkip },
                    { k: "s", d: t.review.helpSuspend },
                    { k: "m", d: t.review.tbMemo ?? "助记便签" },
                    { k: "[", d: t.review.helpPeek },
                    { k: "f", d: t.review.helpReschedule },
                    { k: "e", d: t.review.helpEdit },
                    { k: "h", d: t.review.helpHint },
                ] as row (row.k)}
                    <div class="lv-help-row"><span class="lv-kbd2">{row.k}</span><span class="fn__flex-1">{row.d}</span></div>
                {/each}
            </div>
        </div>
    {/if}
    {#if peek}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
            class="lv-peek lv-glass"
            tabindex="-1"
                transition:fade={{ duration: getMotionDuration("normal") }}
            onclick={(e: Event) => e.stopPropagation()}
        >
            <div class="lv-peek-head">
                <span>{t.review.peekTitle}</span>
                <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--small" aria-label={window.siyuan.languages.cancel} onclick={togglePeek}>✕</button>
            </div>
            <div class="lv-peek-body b3-typography lv-card-content" class:lv-masked={!peek.revealed}>{@html peek.revealed ? peek.html : maskMarkedAnswersForQuestion(peek.html)}</div>
        </div>
    {/if}

    {#if showPauseModal}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lv-modal-backdrop lv-glass" tabindex="-1" onclick={() => (showPauseModal = false)}>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="lv-pause-dialog lv-card2" role="dialog" aria-modal="true" aria-label={t.review.pauseTitle} tabindex="-1" bind:this={sessionModalEl} onclick={(e: Event) => e.stopPropagation()}>
                <div class="lv-help-head">
                    <span style="font-weight:600;font-size:16px">{t.review.pauseTitle}</span>
                    <div class="fn__flex-1"></div>
                    <button class="b3-button b3-button--small" aria-label={window.siyuan.languages.cancel} onclick={() => (showPauseModal = false)}>✕</button>
                </div>
                <div style="padding:var(--lv-sp-3) 0">
                    <p class="ft__smaller ft__on-surface" style="line-height:1.6">{t.review.pauseDesc}</p>
                    <div style="margin-top:var(--lv-sp-2);font-size:12px;color:var(--lv-color-brand)">
                        {t.review.doneConfirm}: <strong>{reviewedIDs.length}</strong> · {t.review.skipNotRated}: <strong>{sessionSkipped.length}</strong>
                    </div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:var(--lv-sp-2);margin-top:var(--lv-sp-3)">
                    <button class="b3-button b3-button--text" onclick={() => (showPauseModal = false)}>{t.review.pauseContinue}</button>
                    <button class="b3-button lv-btn-primary" onclick={pauseSessionAndReturn}>{t.review.pauseConfirm}</button>
                </div>
            </div>
        </div>
    {/if}

    {#if showSessionOptionsModal}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lv-modal-backdrop lv-glass" tabindex="-1" onclick={() => (showSessionOptionsModal = false)}>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="lv-pause-dialog lv-card2" role="dialog" aria-modal="true" aria-label={t.review.sessionOptionsTitle} tabindex="-1" bind:this={sessionModalEl} onclick={(e: Event) => e.stopPropagation()}>
                <div class="lv-help-head">
                    <span style="font-weight:600;font-size:16px">{t.review.sessionOptionsTitle}</span>
                    <div class="fn__flex-1"></div>
                    <button class="b3-button b3-button--small" aria-label={window.siyuan.languages.cancel} onclick={() => (showSessionOptionsModal = false)}>✕</button>
                </div>
                <div style="padding:var(--lv-sp-3) 0;display:flex;flex-direction:column;gap:var(--lv-sp-2)">
                    <p class="ft__smaller ft__on-surface">{t.review.sessionOptionsHint}</p>
                    <label class="ft__smaller ft__on-surface" style="display:flex;align-items:center;gap:var(--lv-sp-2);margin-top:var(--lv-sp-1)">
                        <span>{t.review.answerModeLabel}</span>
                        <select class="b3-select fn__flex-1" bind:value={tempAnswerVariant}>
                            <option value="normal">{t.review.modeRecall}</option>
                            <option value="choice">{t.review.modeChoice}</option>
                            <option value="typing">{t.review.modeTyping}</option>
                        </select>
                    </label>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:var(--lv-sp-2);margin-top:var(--lv-sp-3)">
                    <button class="b3-button b3-button--text" onclick={() => (showSessionOptionsModal = false)}>{window.siyuan.languages.cancel}</button>
                    <button class="b3-button lv-btn-primary" onclick={applySessionOptions}>{t.review.applySessionOptions}</button>
                </div>
            </div>
        </div>
    {/if}

    {#if showMemoEditor && current}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lv-modal-backdrop lv-glass" tabindex="-1" onclick={closeMemoEditor}>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="lv-pause-dialog lv-card2" role="dialog" aria-modal="true" aria-label={t.review.memoModalTitle} tabindex="-1" bind:this={sessionModalEl} onclick={(e: Event) => e.stopPropagation()}>
                <div class="lv-help-head">
                    <span style="font-weight:600;font-size:16px"><LvIcon name="lightbulb" size={17} /> {t.review.memoModalTitle ?? "给未来的自己留助记线索"}</span>
                    <div class="fn__flex-1"></div>
                    <button class="b3-button b3-button--small" disabled={memoSaving} aria-label={window.siyuan.languages.cancel} onclick={closeMemoEditor}>✕</button>
                </div>
                <div style="padding:var(--lv-sp-3) 0">
                    <p class="ft__smaller ft__on-surface" style="line-height:1.6">{t.review.memoModalDesc ?? "写下一句巧记口诀、易错陷阱或关键关联。下次复习此卡时将直接呈现。"}</p>
                    <textarea
                        class="b3-text-field fn__block"
                        rows="3"
                        style="margin-top:var(--lv-sp-2)"
                        placeholder={t.review.memoPlaceholder ?? "例如：谐音记忆口诀、与某定理的对比..."}
                        aria-label={t.review.memoPlaceholder ?? "助记便签"}
                        bind:value={memoDraft}
                        disabled={memoSaving}
                    ></textarea>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:var(--lv-sp-2);margin-top:var(--lv-sp-3)">
                    <button class="b3-button b3-button--text" disabled={memoSaving} onclick={closeMemoEditor}>{window.siyuan.languages.cancel ?? "取消"}</button>
                    <button class="b3-button lv-btn-primary" disabled={memoSaving} onclick={saveCardMemo}>
                        {memoSaving ? t.dashboard.loading : (t.review.memoSave ?? "保存便签")}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if showRetireModal && current}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lv-modal-backdrop lv-glass" tabindex="-1" onclick={closeRetireModal}>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="lv-pause-dialog lv-card2" role="dialog" aria-modal="true" aria-label={t.review.retireCardTitle} tabindex="-1" bind:this={sessionModalEl} onclick={(e: Event) => e.stopPropagation()}>
                <div class="lv-help-head">
                    <span style="font-weight:600;font-size:16px"><LvIcon name="ban" size={17} /> {t.review.retireCardTitle ?? "移出复习卡组"}</span>
                    <div class="fn__flex-1"></div>
                    <button class="b3-button b3-button--small" disabled={retireBusy} aria-label={window.siyuan.languages.cancel} onclick={closeRetireModal}>✕</button>
                </div>
                <div style="padding:var(--lv-sp-3) 0">
                    <p class="ft__smaller ft__on-surface" style="line-height:1.6">{t.review.retireCardDesc ?? "将此卡移出当前复习卡组，不再参与复习调度。思源笔记正文内容不会受到任何修改。确认移出？"}</p>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:var(--lv-sp-2);margin-top:var(--lv-sp-3)">
                    <button class="b3-button b3-button--text" disabled={retireBusy} onclick={closeRetireModal}>{window.siyuan.languages.cancel ?? "取消"}</button>
                    <button class="b3-button lv-btn-danger" disabled={retireBusy} onclick={retireCurrentCard}>
                        {retireBusy ? t.dashboard.loading : (t.review.retireCardConfirm ?? "确认移出")}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if zoomedImage}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
            class="lv-img-lightbox lv-glass"
            role="dialog"
            aria-modal="true"
            aria-label="图片全屏聚焦预览"
            tabindex="-1"
            bind:this={lightboxEl}
            onclick={closeZoomedImage}
            onwheel={onLightboxWheel}
        >
            <div class="lv-lightbox-toolbar" onclick={(e) => e.stopPropagation()} tabindex="-1">
                <button type="button" tabindex="-1" class="b3-button b3-button--small b3-button--text" title="缩小" onclick={() => (imgScale = Math.max(0.5, Math.round((imgScale - 0.2) * 100) / 100))}>−</button>
                <span class="lv-lightbox-scale-num" title="双击图片还原">{Math.round(imgScale * 100)}%</span>
                <button type="button" tabindex="-1" class="b3-button b3-button--small b3-button--text" title="放大" onclick={() => (imgScale = Math.min(4, Math.round((imgScale + 0.2) * 100) / 100))}>+</button>
                <button type="button" tabindex="-1" class="b3-button b3-button--small b3-button--outline lv-lightbox-reset" onclick={() => { imgScale = 1; imgPanX = 0; imgPanY = 0; }}>1:1</button>
                <button type="button" class="b3-button b3-button--small lv-img-lightbox-close" aria-label={window.siyuan.languages.cancel ?? "关闭"} onclick={closeZoomedImage}>✕</button>
            </div>

            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
                class="lv-img-lightbox-content"
                style={`transform: translate(${imgPanX}px, ${imgPanY}px) scale(${imgScale}); cursor: ${imgScale > 1 ? (isDraggingImg ? 'grabbing' : 'grab') : 'zoom-in'};`}
                onclick={(e) => e.stopPropagation()}
                ondblclick={onImageDblClick}
                onpointerdown={onLightboxPointerDown}
                onpointermove={onLightboxPointerMove}
                onpointerup={onLightboxPointerUp}
                onpointercancel={onLightboxPointerUp}
            >
                <img src={zoomedImage.src} alt={zoomedImage.alt ?? "Flashcard image preview"} draggable="false" />
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .lv-review {
        height: 100%;
        min-height: 0;
        min-width: 0;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        /* 移动端安全区（306）：刘海屏/手势条不遮挡内容 */
        padding: calc(var(--lv-sp-4) + env(safe-area-inset-top, 0)) calc(var(--lv-sp-5) + env(safe-area-inset-right, 0))
            calc(var(--lv-sp-4) + env(safe-area-inset-bottom, 0)) calc(var(--lv-sp-5) + env(safe-area-inset-left, 0));
        gap: var(--lv-sp-3);
        position: relative;
        max-width: 880px;
        margin: 0 auto;
        width: 100%;

        &.lv-keyboard-open {
            padding-bottom: calc(var(--lv-sp-2) + env(safe-area-inset-bottom, 0));
            gap: var(--lv-sp-2);

            .lv-card {
                min-height: 180px;
                padding: calc(var(--lv-space-unit) * 12) calc(var(--lv-space-unit) * 11);
            }

            .lv-actions {
                margin-top: 0;
            }

            .lv-btn-rate {
                min-height: 60px;
                padding: calc(var(--lv-space-unit) * 4) calc(var(--lv-space-unit) * 6);
            }
        }

        .lv-center { margin: auto; color: var(--lv-color-text-muted); }
        .lv-error-wrap { width: min(560px, 92vw); }

        /* T07 结果面板（R52 .panel）：白面 1px 边框居中，内容左对齐 */
        .lv-done-panel {
            width: min(620px, 100%);
            background: var(--lv-color-surface);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-l);
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
            padding: var(--lv-sp-5);
            text-align: left;
        }
        /* 复习就绪看板：宽屏居中，Bento 排布，内聚隔离警告与后续动作 */
        .lv-ready-wrap {
            width: 100%;
            max-width: 820px;
            margin: var(--lv-sp-3) auto;
            padding: 0 var(--lv-sp-3);
        }
        .lv-ready-hub {
            background: var(--lv-color-surface);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-l);
            box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
            padding: var(--lv-sp-5);
            display: flex;
            flex-direction: column;
            gap: var(--lv-sp-4);
            animation: lv-modal-pop var(--lv-dur-2) var(--lv-ease);
        }
        .lv-ready-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: var(--lv-sp-4);
            flex-wrap: wrap;
            padding-bottom: var(--lv-sp-3);
            border-bottom: 1px solid var(--lv-border);

            .lv-ready-title-group {
                flex: 1;
                min-width: 260px;

                .lv-ready-eyebrow {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    font-weight: var(--lv-fw-semibold);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: var(--lv-color-brand);
                    background: var(--lv-primary-soft);
                    border: 1px solid var(--lv-primary-border);
                    border-radius: var(--lv-r-pill);
                    padding: 2px 10px;
                    margin-bottom: var(--lv-sp-2);
                }

                .lv-ready-title {
                    font-size: var(--lv-type-title-lg-size);
                    font-weight: var(--lv-fw-heading);
                    color: var(--lv-color-text);
                    margin: 0 0 6px 0;
                    letter-spacing: -0.02em;
                }

                .lv-ready-desc {
                    margin: 0;
                    font-size: var(--lv-type-control-size);
                    color: var(--lv-color-text-muted);
                    line-height: var(--lv-lh-reading);
                }
            }

            .lv-ready-scope-pill {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 10px;
                background: color-mix(in srgb, var(--lv-color-surface) 60%, var(--lv-color-canvas));
                border: 1px solid var(--lv-border);
                border-radius: var(--lv-r-pill);
                font-size: 12px;

                .lv-ready-scope-label {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    color: var(--lv-color-text-muted);
                    white-space: nowrap;
                }

                .lv-ready-scope-select {
                    border: none;
                    background: transparent;
                    font-size: 12px;
                    font-weight: var(--lv-fw-semibold);
                    color: var(--lv-color-brand);
                    padding: 2px 4px;
                    cursor: pointer;
                    &:focus { outline: none; }
                }
            }
        }
        .lv-ready-alert {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--lv-sp-3);
            flex-wrap: wrap;
            padding: 12px 16px;
            background: color-mix(in srgb, var(--lv-color-warning) 8%, var(--lv-color-surface));
            border: 1px solid color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
            border-radius: var(--lv-r-m);

            .lv-ready-alert-main {
                display: flex;
                align-items: flex-start;
                gap: 10px;
                flex: 1;
                min-width: 240px;

                .lv-ready-alert-icon {
                    color: var(--lv-color-warning);
                    flex: none;
                    margin-top: 2px;
                }

                strong {
                    display: block;
                    font-size: 13px;
                    font-weight: var(--lv-fw-semibold);
                    color: var(--lv-color-warning);
                    margin-bottom: 2px;
                }

                p {
                    margin: 0;
                    font-size: 12px;
                    color: var(--lv-color-text-muted);
                    line-height: 1.4;
                }
            }

            .lv-ready-alert-actions {
                display: flex;
                align-items: center;
                gap: 8px;
            }
        }
        .lv-ready-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: var(--lv-sp-3);

            @media (max-width: 600px) {
                grid-template-columns: 1fr;
            }

            .lv-ready-card {
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: var(--lv-sp-3) var(--lv-sp-4);
                background: color-mix(in srgb, var(--lv-color-canvas) 60%, var(--lv-color-surface));
                border: 1px solid var(--lv-border);
                border-radius: var(--lv-r-m);
                transition: all var(--lv-dur-2) var(--lv-ease);

                &:hover {
                    border-color: var(--lv-primary-border);
                    transform: translateY(-2px);
                    box-shadow: var(--lv-shadow-card-hover);
                }

                .lv-ready-card-head {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: var(--lv-sp-2);

                    .lv-ready-icon-bubble {
                        width: 32px;
                        height: 32px;
                        border-radius: var(--lv-r-s);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex: none;

                        &.lv-bubble--brand {
                            background: var(--lv-primary-soft);
                            color: var(--lv-color-brand);
                        }
                        &.lv-bubble--good {
                            background: var(--lv-good-soft);
                            color: var(--lv-color-success);
                        }
                        &.lv-bubble--warn {
                            background: var(--lv-warn-soft);
                            color: var(--lv-color-warning);
                        }
                    }

                    .lv-ready-card-title {
                        font-size: 14px;
                        font-weight: var(--lv-fw-semibold);
                        color: var(--lv-color-text);
                    }

                    .lv-ready-card-subtitle {
                        font-size: 11px;
                        color: var(--lv-color-text-muted);
                    }
                }

                .lv-ready-card-desc {
                    margin: 0 0 var(--lv-sp-3) 0;
                    font-size: 12px;
                    color: var(--lv-color-text-muted);
                    line-height: 1.45;
                    flex: 1;
                }

                .lv-ready-card-footer {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;

                    .b3-button {
                        border-radius: var(--lv-r-pill);
                        font-size: 11px;
                    }
                }
            }
        }
        .lv-ready-bottom-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--lv-sp-2);
            padding-top: var(--lv-sp-2);
            border-top: 1px solid var(--lv-border);

            .lv-ready-home-btn {
                border-radius: var(--lv-r-pill);
                padding: 6px 18px;
                font-weight: var(--lv-fw-semibold);
            }

            .lv-ready-refresh-btn {
                border-radius: var(--lv-r-pill);
                font-size: 12px;
            }
        }
        /* 空队列面板：居中叙述，不做庆祝形态 */
        .lv-empty-queue {
            text-align: center;
            .lv-empty-queue-title {
                margin-top: var(--lv-sp-3);
                font-size: var(--lv-type-title-lg-size);
                font-weight: var(--lv-fw-heading);
                letter-spacing: -0.02em;
            }
        }
        .lv-done-head {
            display: flex; align-items: center; gap: var(--lv-sp-3);
            margin-bottom: var(--lv-sp-4);
            flex-wrap: wrap;
        }
        .lv-done-retention-bubble {
            margin-left: auto;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 10px;
            border-radius: var(--lv-r-pill);
            font-size: 11px;
            font-weight: var(--lv-fw-semibold);
            background: var(--lv-primary-soft);
            color: var(--lv-color-brand);
            border: 1px solid var(--lv-primary-border);

            &.lv-ret-high {
                background: var(--lv-good-soft);
                color: var(--lv-color-success);
                border-color: color-mix(in srgb, var(--lv-color-success) 30%, transparent);
            }
            &.lv-ret-mid {
                background: var(--lv-warn-soft);
                color: var(--lv-color-warning);
                border-color: color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
            }
        }
        .lv-done-check {
            width: 32px; height: 32px; border-radius: var(--lv-r-circle);
            display: inline-flex; align-items: center; justify-content: center;
            font-size: var(--lv-type-title-size); flex: none;
            background: var(--lv-good-soft);
            color: var(--lv-color-success);
            box-shadow: 0 0 0 4px color-mix(in srgb, var(--lv-color-success) 14%, transparent);
        }
        .lv-done-title { font-size: var(--lv-type-display-size); font-weight: 650; letter-spacing: -0.03em; line-height: 1.4; }
        .lv-done-sub { font-size: var(--lv-type-body-size); color: var(--lv-color-text-muted); font-variant-numeric: tabular-nums; margin-top: 2px; }
        .lv-done-stats {
            display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--lv-sp-4);
            padding: var(--lv-sp-3) 0 var(--lv-sp-2);
            border-top: 1px solid var(--lv-border);
        }
        .lv-done-stat {
            display: flex; flex-direction: column; gap: calc(var(--lv-space-unit) * 1); min-width: 0;
            .lv-done-stat-label { font-size: var(--lv-type-meta-size); color: var(--lv-color-text-muted); }
            .lv-hero-num { font-size: var(--lv-type-display-size); }
            p { margin: 0; font-size: 11px; color: var(--lv-color-text-muted); opacity: .85; }
        }
        .lv-done-milestone { color: var(--lv-color-warning); font-weight: 600; font-size: var(--lv-type-body-size); }
        .lv-done-tip {
            color: var(--lv-color-text-muted);
            font-size: var(--lv-type-control-size);
            opacity: 0.85;
            line-height: var(--lv-lh-reading);
        }
        /* BI-8：收工原因 chips（可跳过，不占完成屏视觉重心；中性 ghost，选中才亮主色） */
        .lv-done-end {
            display: flex; flex-wrap: wrap; gap: var(--lv-sp-1); align-items: center;
            margin-top: var(--lv-sp-3);
            padding-top: var(--lv-sp-3);
            border-top: 1px solid var(--lv-border);
            font-size: var(--lv-type-control-size);
        }
        .lv-done-actions { gap: var(--lv-sp-2); justify-content: flex-end; margin-top: var(--lv-sp-4); padding-top: var(--lv-sp-4); border-top: 1px solid var(--lv-border); }

        /* BI-9：恢复分支横幅 */
        .lv-recover {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-2);
            flex-wrap: wrap;
            margin: 0 var(--lv-sp-5) var(--lv-sp-2);
            padding: var(--lv-sp-2) var(--lv-sp-3);
            background: var(--lv-primary-softer);
            border: 1px solid var(--lv-primary-border);
            border-radius: var(--lv-r-m);
            font-size: var(--lv-type-body-size);
        }
        /* BI-10：长期返场检查横幅（warn 项多时换行；只读预览） */
        .lv-return {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-2);
            flex-wrap: wrap;
            margin: 0 var(--lv-sp-5) var(--lv-sp-2);
            padding: var(--lv-sp-2) var(--lv-sp-3);
            background: color-mix(in srgb, var(--lv-color-warning) 8%, transparent);
            border: 1px solid color-mix(in srgb, var(--lv-color-warning) 35%, transparent);
            border-radius: var(--lv-r-m);
            font-size: var(--lv-type-body-size);
        }
        .lv-return-title {
            color: var(--lv-color-text-muted);
            margin-right: var(--lv-sp-1);
            font-weight: var(--lv-fw-semibold);
        }
        .lv-recover-title {
            color: var(--lv-color-text-muted);
            margin-right: var(--lv-sp-1);
        }
        .lv-done-milestone { color: var(--lv-color-warning); font-weight: 600; }
        .lv-done-tip {
            max-width: 420px;
            color: var(--lv-color-text-muted);
            font-size: var(--lv-type-control-size);
            opacity: 0.85;
            line-height: var(--lv-lh-reading);
        }
        /* T07 下一步建议（docs/40）：软面板 + 行式布局 */
        .lv-done-next {
            margin-top: var(--lv-sp-4);
            padding: var(--lv-sp-3) var(--lv-sp-4);
            background: var(--lv-surface-hover);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-m);
            text-align: left;
        }
        .lv-next-row {
            display: flex; align-items: center; justify-content: space-between; gap: var(--lv-sp-2);
            font-size: var(--lv-type-body-size);
            padding: calc(var(--lv-space-unit) * 2) 0;
        }

        /* R52 docs/15 §6：完成态单次淡入，不做逐行错峰 */
        .lv-done { animation: lv-done-fade var(--lv-dur-3) var(--lv-ease) both; }
        @keyframes lv-done-fade {
            from { opacity: 0; transform: translateY(4px); }
        }

        .lv-head {
            /* R52 review 面：三行结构（身份行 / 进度条 / 控制行），行距 8px、条底 1px 分隔 */
            display: flex; flex-direction: column; gap: var(--lv-sp-2);
            max-width: 760px; margin: 0 auto; width: 100%;
            .lv-head-row {
                display: flex; align-items: center; gap: var(--lv-sp-2);
                min-width: 0; flex-wrap: wrap;
            }
            .lv-head-tools {
                flex-wrap: nowrap !important;
                gap: 5px;
                min-width: 0;

                .lv-scope {
                    height: 28px;
                    min-width: 6em;
                    max-width: 125px;
                    padding: 2px 6px;
                    font-size: var(--lv-type-control-size);
                    flex-shrink: 1;
                }

                .lv-purpose-end-chip {
                    height: 28px;
                    box-sizing: border-box;
                    padding: 0 8px;
                    font-size: 11px;
                    font-weight: 500;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    white-space: nowrap;
                    flex-shrink: 0;
                }

                .lv-font-scale-group {
                    height: 28px;
                    box-sizing: border-box;
                    flex-shrink: 0;
                }

                .lv-tool-btn {
                    height: 28px;
                    box-sizing: border-box;
                    padding: 0 7px;
                    white-space: nowrap;
                    flex-shrink: 0;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }

                .lv-toolbar-more-wrap {
                    flex-shrink: 0;
                }
            }

            .lv-scope { min-width: 8.5em; max-width: 200px; font-size: var(--lv-type-control-size); padding: 4px 8px; }
            /* BI-3：入口上下文条（窄屏换行不挤压进度） */
            .lv-entry {
                display: inline-flex; align-items: center; gap: calc(var(--lv-space-unit) * 1);
                padding: var(--lv-space-hairline) calc(var(--lv-space-unit) * 2);
                border-left: 2px solid var(--lv-color-brand);
                .lv-entry-from { color: var(--lv-color-text-muted); white-space: nowrap; }
            }
            .lv-progress {
                font-size: var(--lv-type-control-size);
                color: var(--lv-color-text);
                background: color-mix(in srgb, var(--lv-color-brand) 10%, var(--lv-color-surface));
                border: 1px solid var(--lv-primary-border);
                border-radius: var(--lv-r-pill);
                padding: 3px 12px;
                font-weight: 600;
                font-variant-numeric: tabular-nums;
                white-space: nowrap;
                box-shadow: 0 1px 3px color-mix(in srgb, black 3%, transparent);
            }
            .lv-progress-bar {
                width: 100%;
                height: 6px;
                border-radius: var(--lv-r-pill);
                background: color-mix(in srgb, var(--lv-color-text) 8%, transparent);
                box-shadow: inset 0 1px 2px color-mix(in srgb, black 6%, transparent);
                overflow: hidden;
                display: flex;
                margin: 4px 0 8px;
                .lv-progress-seg {
                    height: 100%;
                    border-radius: var(--lv-r-pill);
                    background: linear-gradient(90deg, var(--lv-color-brand), color-mix(in srgb, var(--lv-color-brand) 75%, var(--lv-color-success)));
                    transition: width var(--lv-dur-3) var(--lv-ease);
                    box-shadow: 0 1px 3px color-mix(in srgb, var(--lv-color-brand) 30%, transparent);
                }
                .lv-progress-seg--forget {
                    background: var(--lv-color-danger);
                    box-shadow: 0 1px 3px color-mix(in srgb, var(--lv-color-danger) 30%, transparent);
                }
            }
            .lv-timeout {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                font-size: var(--lv-type-control-size);
                color: var(--lv-color-text);
                background: color-mix(in srgb, var(--lv-color-text) 6%, transparent);
                border: 1px solid var(--lv-border);
                border-radius: var(--lv-r-pill);
                padding: 3px 10px;
                font-variant-numeric: tabular-nums;
                font-weight: 600;
            }
            .lv-timeout-low {
                background: var(--lv-danger-soft);
                color: var(--lv-color-danger);
                border-color: var(--lv-danger-border);
                font-weight: 700;
            }
            .lv-tags { display: flex; gap: var(--lv-sp-1); }
        }

        @media (max-width: 740px) {
            .lv-head-tools {
                .lv-tool-btn-label { display: none; }
                .lv-tool-btn { padding: 0 5px; }
            }
        }

        .lv-purpose-end-chip {
            padding: 3px 8px;
            font-size: 11px;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
        }

        .lv-font-scale-group {
            display: inline-flex;
            align-items: center;
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-pill);
            overflow: hidden;
            background: color-mix(in srgb, var(--lv-color-surface) 60%, var(--lv-color-canvas));
            flex-shrink: 0;

            .lv-font-btn {
                padding: 2px 7px;
                font-size: 11px;
                font-weight: var(--lv-fw-semibold);
                border: none;
                border-radius: 0;
                line-height: 1.2;
                &:first-child {
                    border-right: 1px solid var(--lv-border);
                }
            }
        }

        .lv-err-tags {
            display: flex; flex-wrap: wrap; gap: calc(var(--lv-space-unit) * 3); align-items: center;
            padding: var(--lv-sp-2) var(--lv-sp-3);
            margin: 0 auto;
            font-size: var(--lv-type-control-size);
            background: var(--lv-color-surface);
            border-radius: var(--b3-border-radius);
        }
        .lv-err-tag { opacity: .8; }

        .lv-card {
            flex: 1;
            box-sizing: border-box;
            position: relative;
            overflow: auto;
            background: var(--lv-color-surface);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-dialog);
            box-shadow: var(--lv-shadow-review-card), var(--lv-inset-shine);
            /* R54 卡面规范：48/44 内边距、min-height 320，窄屏收窄 */
            padding: clamp(20px, 3.5vw, 36px) clamp(20px, 4vw, 40px);
            min-height: 280px;
            @media (max-width: 740px) { padding: 18px 16px; }
            position: relative;
            background: linear-gradient(180deg, color-mix(in srgb, var(--lv-color-brand) 2.5%, var(--lv-color-surface)) 0%, var(--lv-color-surface) 80px);
            box-shadow: 0 16px 36px -6px color-mix(in srgb, black 8%, transparent), 0 4px 16px color-mix(in srgb, black 4%, transparent), var(--lv-inset-shine);
            transition: box-shadow var(--lv-dur-2) var(--lv-ease), transform var(--lv-dur-2) var(--lv-ease), border-color var(--lv-dur-2) var(--lv-ease);

            &:hover { box-shadow: 0 20px 40px -6px color-mix(in srgb, black 12%, transparent), var(--lv-inset-shine); }

            // 超长卡面底部柔和滚动指示羽化（防突兀截断）
            &::after {
                content: "";
                position: sticky;
                bottom: 0;
                left: 0;
                right: 0;
                height: 20px;
                background: linear-gradient(to bottom, transparent, var(--lv-color-surface));
                pointer-events: none;
                margin-top: -20px;
                display: block;
                border-bottom-left-radius: var(--lv-r-dialog);
                border-bottom-right-radius: var(--lv-r-dialog);
                opacity: 0.9;
            }

            // 问题态遮罩规则已移至 index.scss 全局（scoped 编译会误剪 :global 结尾选择器）

            .lv-typing { margin-top: var(--lv-sp-3); }

            // AQ-2：翻面覆盖层按钮（inset:0）在最底层；交互元素抬高一层，鼠标可直达
            .lv-typing,
            .lv-choices,
            .lv-reschedule {
                position: relative;
                z-index: var(--lv-z-card-control);
            }
            // 遮挡 overlay 需绝对定位贴图（内联 left/top 才生效），且高于翻面层接收 rect 点击
            .lv-occl-overlay {
                position: absolute;
                z-index: var(--lv-z-card-control);
            }

            // AS-3：富内容窄屏横向滚动（表格/长链不撑破卡面）与大图/公式防溢出
            .lv-card-content {
                overflow-x: auto;
                max-width: 100%;

                :global(img) {
                    max-width: 100%;
                    max-height: 52vh;
                    height: auto;
                    object-fit: contain;
                    border-radius: var(--lv-r-m);
                    box-shadow: var(--lv-shadow-card);
                    margin: var(--lv-sp-2) 0;
                    display: inline-block;
                    vertical-align: middle;
                    cursor: zoom-in;
                    transition: transform var(--lv-dur-1) var(--lv-ease);
                    &:hover { transform: scale(1.01); }
                }

                :global(.language-math),
                :global(.katex-display) {
                    overflow-x: auto;
                    overflow-y: hidden;
                    scrollbar-width: thin;
                    padding: var(--lv-sp-2) var(--lv-sp-3);
                    border-radius: var(--lv-r-m);
                    background: color-mix(in srgb, var(--lv-color-canvas) 85%, transparent);
                    margin: var(--lv-sp-2) 0;
                }

                :global(pre) {
                    overflow-x: auto;
                    scrollbar-width: thin;
                    padding: var(--lv-sp-3) var(--lv-sp-4);
                    border-radius: var(--lv-r-m);
                    background: var(--lv-color-canvas);
                    border: 1px solid var(--lv-border);
                    margin: var(--lv-sp-2) 0;
                }

                :global(blockquote) {
                    border-left: 3px solid var(--lv-color-brand);
                    padding: var(--lv-sp-2) var(--lv-sp-3);
                    margin: var(--lv-sp-2) 0;
                    background: var(--lv-surface-hover);
                    border-radius: 0 var(--lv-r-s) var(--lv-r-s) 0;
                    color: var(--lv-color-text-muted);
                    font-style: italic;
                }

                :global(ul), :global(ol) {
                    padding-left: calc(var(--lv-space-unit) * 6);
                    margin: var(--lv-sp-2) 0;
                    :global(li) {
                        margin: 4px 0;
                        line-height: var(--lv-lh-reading-loose);
                        padding-left: 2px;
                        &::marker {
                            color: var(--lv-color-brand);
                            font-weight: var(--lv-fw-semibold);
                        }
                    }
                }

                :global(table) {
                    width: 100%;
                    border-collapse: collapse;
                    margin: var(--lv-sp-3) 0;
                    :global(th), :global(td) {
                        padding: var(--lv-sp-2) var(--lv-sp-3);
                        border: 1px solid var(--lv-border);
                    }
                    :global(th) {
                        background: var(--lv-color-canvas);
                        font-weight: var(--lv-fw-semibold);
                    }
                }
            }

            .lv-tts-row { display: flex; justify-content: flex-end; margin-top: var(--lv-sp-2); }

            .lv-choice-btn { margin-top: var(--lv-sp-3); }
            .lv-choices {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: var(--lv-sp-2);
                .lv-choice-opt {
                    text-align: left;
                    border: 1px solid var(--lv-border);
                    background: var(--lv-color-canvas);
                    transition: border-color var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease);
                    &:hover:not(:disabled) { border-color: var(--lv-primary-border); background: var(--lv-primary-softer); }
                    &:disabled { cursor: default; opacity: 0.9; }
                }
                .lv-choice-correct { border-color: var(--lv-color-brand) !important; background: var(--lv-primary-soft) !important; }
                .lv-choice-wrong { border-color: var(--lv-danger-border) !important; background: var(--lv-danger-soft) !important; }
            }
            .lv-typing-diff {
                display: flex; align-items: center; gap: var(--lv-sp-2);
                margin-top: var(--lv-sp-3);
                flex-wrap: wrap;
                .lv-diff span { font-variant-numeric: normal; }
                .lv-diff-ok { color: var(--lv-color-brand); }
                .lv-diff-bad {
                    color: var(--lv-color-danger);
                    text-decoration: line-through;
                    opacity: 0.85;
                }
            }

            .lv-reveal {
                position: absolute; inset: 0;
                z-index: var(--lv-z-base);
                width: 100%; height: 100%;
                background: transparent;
                /* 翻面热区覆盖整卡：文字隐藏（底部 48px 宽钮已承担指引），只留可点击与 hover 微光 */
                color: transparent;
                font-size: var(--lv-type-body-sm-size);
                transition: background var(--lv-dur-2) var(--lv-ease);

                &:hover { background: color-mix(in srgb, var(--lv-primary-softer) 55%, transparent); }
            }

            .lv-hint-text {
                padding: var(--lv-sp-2) var(--lv-sp-3);
                border-left: 3px solid var(--lv-color-brand);
                background: var(--lv-color-surface);
                border-radius: var(--b3-border-radius);
                margin: var(--lv-sp-2) auto;
                max-width: inherit;
                font-size: var(--lv-type-fluid-size);
                color: var(--lv-color-text-muted);
            }
            .lv-reveal-hint {
                position: absolute;
                right: var(--lv-sp-3);
                bottom: var(--lv-sp-2);
                font-size: var(--lv-type-meta-size);
                color: var(--lv-color-text-muted);
                opacity: 0.7;
                pointer-events: none;
            }

            &.lv-anim-glow {
                border-color: var(--lv-primary-border);
            }

            .lv-card-source-breadcrumb {
                display: inline-flex;
                align-items: center;
                gap: calc(var(--lv-space-unit) * 2);
                max-width: 100%;
                padding: 4px 12px;
                border: 1px solid var(--lv-border);
                border-radius: var(--lv-r-pill);
                background: color-mix(in srgb, var(--lv-color-canvas) 85%, transparent);
                color: var(--lv-color-text-muted);
                font-size: 11px;
                margin-bottom: var(--lv-sp-3);
                cursor: pointer;
                box-shadow: 0 1px 2px color-mix(in srgb, black 3%, transparent);
                transition: background var(--lv-dur-1) var(--lv-ease),
                    color var(--lv-dur-1) var(--lv-ease),
                    border-color var(--lv-dur-1) var(--lv-ease),
                    transform var(--lv-dur-1) var(--lv-ease),
                    box-shadow var(--lv-dur-2) var(--lv-ease);

                &:hover {
                    background: var(--lv-surface-hover);
                    color: var(--lv-color-brand);
                    border-color: var(--lv-primary-border);
                    transform: translateY(-1.5px);
                    box-shadow: 0 2px 6px color-mix(in srgb, var(--lv-color-brand) 12%, transparent);
                }
                &:active {
                    transform: translateY(0.5px);
                }
                .lv-breadcrumb-icon {
                    font-size: 12px;
                    flex-shrink: 0;
                    color: var(--lv-color-brand);
                    opacity: 0.85;
                }
                .lv-breadcrumb-text {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                }
                .lv-breadcrumb-sep {
                    opacity: 0.4;
                    font-weight: 300;
                    padding: 0 1px;
                }
            }
        }

        .lv-pomodoro-alert {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-3);
            margin-bottom: var(--lv-sp-2);
            padding: var(--lv-sp-3) var(--lv-sp-4);
            border-radius: var(--lv-r-m);
            border: 1px solid color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
            background: color-mix(in srgb, var(--lv-warn-soft) 80%, var(--lv-color-surface));
            box-shadow: var(--lv-shadow-card);
            animation: lv-modal-pop var(--lv-dur-2) var(--lv-ease);

            .lv-pomodoro-icon { font-size: 22px; flex: none; }
            .lv-pomodoro-text {
                flex: 1;
                strong { font-weight: var(--lv-fw-semibold); display: block; font-size: var(--lv-type-body-size); color: var(--lv-color-text); }
                p { margin: 2px 0 0; font-size: var(--lv-type-meta-size); color: var(--lv-color-text-muted); }
            }
            .lv-pomodoro-actions {
                display: flex;
                gap: var(--lv-sp-2);
                flex-wrap: wrap;
            }
        }

        .lv-native-recall-guidance {
            display: flex;
            align-items: flex-start;
            gap: calc(var(--lv-space-unit) * 3);
            padding: 12px 16px;
            margin-top: var(--lv-sp-3);
            border: 1px solid var(--lv-primary-border);
            border-radius: var(--lv-r-m);
            background: color-mix(in srgb, var(--lv-color-brand) 6%, var(--lv-color-surface));
            font-size: var(--lv-type-control-size);
            box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-color-brand) 8%, transparent);
            animation: lv-modal-pop var(--lv-dur-2) var(--lv-ease);

            .lv-native-recall-icon {
                color: var(--lv-color-brand);
                flex: none;
                margin-top: 1px;
            }
            .lv-native-recall-body {
                flex: 1;
                strong {
                    display: block;
                    font-weight: var(--lv-fw-semibold);
                    color: var(--lv-color-brand);
                    font-size: 11px;
                    letter-spacing: 0.04em;
                    margin-bottom: 2px;
                }
                p {
                    margin: 0;
                    color: var(--lv-color-text-muted);
                    line-height: 1.45;
                    font-size: 12px;
                }
            }
        }

        .lv-card-memo-callout {
            display: flex;
            align-items: flex-start;
            gap: calc(var(--lv-space-unit) * 3);
            padding: calc(var(--lv-space-unit) * 3) calc(var(--lv-space-unit) * 4);
            margin-top: var(--lv-sp-3);
            border: 1px solid color-mix(in srgb, var(--lv-color-warning) 30%, transparent);
            border-radius: var(--lv-r-m);
            background: color-mix(in srgb, var(--lv-warn-soft) 70%, var(--lv-color-surface));
            font-size: var(--lv-type-control-size);
            animation: lv-modal-pop var(--lv-dur-2) var(--lv-ease);

            .lv-memo-icon { font-size: 16px; flex: none; line-height: 1.3; }
            .lv-memo-body {
                flex: 1;
                strong { display: block; font-weight: var(--lv-fw-semibold); color: var(--lv-color-warning); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
                p { margin: 0; color: var(--lv-color-text); line-height: 1.5; font-size: var(--lv-type-control-size); }
            }
            .lv-memo-edit-btn { flex: none; opacity: 0.7; &:hover { opacity: 1; } }
        }

        .lv-memo-prompt {
            display: flex;
            justify-content: flex-end;
            margin-top: var(--lv-sp-2);
        }
        .lv-memo-add-btn {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            border: 1px dashed var(--lv-border);
            border-radius: var(--lv-r-pill);
            background: transparent;
            color: var(--lv-color-text-muted);
            font-size: 11px;
            padding: 2px 8px;
            cursor: pointer;
            opacity: 0.75;
            transition: all var(--lv-dur-1) var(--lv-ease);

            &:hover {
                opacity: 1;
                color: var(--lv-color-brand);
                border-color: var(--lv-primary-border);
                background: var(--lv-surface-hover);
                transform: translateY(-1px);
            }
            &:active {
                transform: translateY(1px);
            }
        }

        .lv-menu-danger {
            color: var(--lv-color-danger) !important;
            &:hover:not(:disabled) {
                background: var(--lv-danger-soft) !important;
                color: var(--lv-color-danger) !important;
            }
        }

        :global(.lv-step-revealed) {
            background: color-mix(in srgb, var(--lv-color-brand) 14%, transparent) !important;
            color: var(--lv-color-text) !important;
            border-bottom: 2px solid var(--lv-color-brand) !important;
            border-radius: var(--lv-r-track);
            padding: 0 4px;
            box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-color-brand) 20%, transparent);
            animation: lv-pulse-glow 0.3s var(--lv-ease);
        }

        .lv-btn-pressed {
            transform: scale(0.94) !important;
            border-color: var(--lv-color-brand) !important;
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--lv-color-brand) 35%, transparent) !important;
            transition: all 0.1s var(--lv-ease) !important;
        }

        .lv-lightbox-toolbar {
            position: absolute;
            top: 20px;
            right: 24px;
            z-index: 1002;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: color-mix(in srgb, var(--lv-color-surface) 88%, black 12%);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-pill);
            box-shadow: var(--lv-shadow-float);

            .lv-lightbox-scale-num {
                font-size: 12px;
                font-weight: var(--lv-fw-semibold);
                color: var(--lv-color-text);
                min-width: 44px;
                text-align: center;
                user-select: none;
            }

            .lv-lightbox-reset {
                font-size: 11px;
                padding: 2px 7px;
                border-radius: var(--lv-r-pill);
            }
        }

        .lv-img-lightbox {
            position: fixed;
            inset: 0;
            z-index: var(--lv-z-dialog, 9999);
            background: rgba(0, 0, 0, 0.82);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--lv-sp-4);
            cursor: zoom-out;
            animation: lv-modal-pop var(--lv-dur-2) var(--lv-ease);

            .lv-img-lightbox-content {
                position: relative;
                max-width: 95vw;
                max-height: 92vh;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: default;

                img {
                    max-width: 100%;
                    max-height: 90vh;
                    object-fit: contain;
                    border-radius: var(--lv-r-m);
                    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
                    user-select: none;
                }
            }

            .lv-img-lightbox-close {
                width: 28px;
                height: 28px;
                border-radius: var(--lv-r-circle);
                background: var(--lv-color-surface);
                color: var(--lv-color-text);
                display: grid;
                place-items: center;
                cursor: pointer;
                border: 1px solid var(--lv-border);
                &:hover {
                    background: var(--lv-surface-hover);
                    color: var(--lv-color-brand);
                }
            }
        }

        .lv-ctxpanel {
            max-width: var(--lv-card-max, 880px);
            width: 100%;
            margin: 0 auto;
            padding: var(--lv-sp-3);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-m);
            background: var(--lv-surface-hover);
            font-size: var(--lv-type-body-size);
            opacity: 0.92;
            .lv-ctx-title {
                font-size: var(--lv-type-control-size);
                color: var(--lv-color-text-muted);
                margin-bottom: var(--lv-sp-2);
            }
            .lv-ctx-block {
                padding: var(--lv-sp-2);
                border-bottom: 1px dashed var(--lv-border);
                &:last-child { border-bottom: none; }
            }
            .lv-ctx-cur {
                border-left: 2px solid var(--lv-color-brand);
                background: var(--lv-primary-softer);
                border-radius: var(--lv-r-s);
            }
        }

        /* BX-3 本场偏好弹层：与源上下文面板同层的内联面板 */
        .lv-prefs {
            max-width: var(--lv-card-max, 880px);
            width: 100%;
            margin: 0 auto var(--lv-sp-2);
            padding: var(--lv-sp-3);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-m);
            background: var(--lv-surface-hover);
            font-size: var(--lv-type-body-size);
            .lv-prefs-head {
                display: flex; align-items: baseline; gap: var(--lv-sp-2);
                margin-bottom: var(--lv-sp-2);
                & > span:first-child { font-weight: var(--lv-fw-medium); }
            }
            .lv-budget-custom { width: 72px; font-size: 12px; padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 4); }
            .lv-prefs-row {
                display: flex; align-items: center; gap: var(--lv-sp-2);
                padding: var(--lv-sp-1) 0;
                & > span:first-child { color: var(--lv-color-text-muted); }
                .b3-select { min-width: 9em; }
            }
        }

        .lv-actions {
            display: flex; gap: var(--lv-sp-3); justify-content: center;
            max-width: 640px; width: 100%; margin: var(--lv-sp-2) auto 0;
            padding-bottom: var(--lv-sp-2);
            /* 紧凑密度（441）：评分按钮收窄高度与内边距 */
            &.lv-actions-compact { gap: var(--lv-sp-2); .lv-btn-rate { max-width: 150px; padding: 10px 14px; min-height: 52px; } }
            .lv-btn-wide {
                flex: 1;
                min-height: 46px;
                border-radius: var(--lv-r-pill);
                background: linear-gradient(135deg, var(--lv-color-brand), color-mix(in srgb, var(--lv-color-brand) 85%, #6366f1));
                font-weight: var(--lv-fw-semibold);
                box-shadow: 0 4px 16px color-mix(in srgb, var(--lv-color-brand) 28%, transparent), var(--lv-inset-shine);
                transition: transform var(--lv-dur-1) var(--lv-ease),
                    box-shadow var(--lv-dur-2) var(--lv-ease),
                    filter var(--lv-dur-1) var(--lv-ease);

                &:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px color-mix(in srgb, var(--lv-color-brand) 38%, transparent);
                }
                &:active {
                    transform: translateY(0.5px);
                }

                .lv-btn-wide-kbd {
                    margin-left: 12px;
                    padding: 2px 8px;
                    border-radius: var(--lv-r-pill);
                    background: rgba(255, 255, 255, 0.22);
                    border: 1px solid rgba(255, 255, 255, 0.35);
                    font-size: 11px;
                    font-weight: 600;
                    color: #fff;
                }
            }
            @keyframes lv-rating-reveal {
                from {
                    opacity: 0;
                    transform: translate3d(0, 5px, 0);
                }
                to {
                    opacity: 1;
                    transform: translate3d(0, 0, 0);
                }
            }
            .lv-btn-rate {
                flex: 1;
                max-width: 180px;
                animation: lv-rating-reveal var(--lv-dur-2) var(--lv-ease);
                /* R54 rating：高卡、左对齐、kbd 右置、间隔提示下沉、物理微阴影与按压弹性 */
                display: flex; flex-direction: column; align-items: stretch; gap: 5px;
                text-align: left;
                border-radius: var(--lv-r-m);
                border: 1px solid var(--lv-border);
                padding: calc(var(--lv-space-unit) * 7) calc(var(--lv-space-unit) * 8 + var(--lv-space-hairline));
                min-height: 80px;
                background: var(--lv-color-surface);
                box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
                transition: transform var(--lv-dur-1) var(--lv-ease),
                    background var(--lv-dur-1) var(--lv-ease),
                    box-shadow var(--lv-dur-2) var(--lv-ease),
                    border-color var(--lv-dur-1) var(--lv-ease),
                    filter var(--lv-dur-1) var(--lv-ease);

                &:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
                    border-color: var(--lv-border-strong);
                }
                &:active {
                    transform: translateY(1px) scale(0.98);
                    filter: brightness(0.96);
                }

                .lv-rate-top {
                    display: flex; align-items: center; justify-content: space-between;
                    gap: var(--lv-sp-2); font-weight: 600;
                }
                small { opacity: 0.7; font-size: 11px; font-variant-numeric: tabular-nums; }
            }

            // R52 动效纪律：评分条不做逐钮错峰；窄屏按原型折为 2×2
            @media (max-width: 740px) {
                display: grid;
                grid-template-columns: 1fr 1fr;
                .lv-btn-rate { max-width: none; }
            }
            // R54 .rating button：白面微投影、ink 标签、muted 间隔，色相顶标线与语义微反馈
            .lv-b1, .lv-b2, .lv-b3, .lv-b4 {
                background: var(--lv-color-surface);
                color: var(--lv-color-text);
            }
            .lv-b1 {
                box-shadow: inset 0 2.5px 0 0 color-mix(in srgb, var(--lv-color-danger) 70%, transparent), var(--lv-shadow-card);
                &:hover {
                    border-color: var(--lv-danger-border);
                    background: color-mix(in srgb, var(--lv-color-danger) 6%, var(--lv-color-surface));
                    box-shadow: inset 0 3px 0 0 var(--lv-color-danger), var(--lv-shadow-card-hover);
                }
                &:active {
                    background: color-mix(in srgb, var(--lv-color-danger) 14%, var(--lv-color-surface));
                }
            }
            .lv-b2 {
                box-shadow: inset 0 2.5px 0 0 color-mix(in srgb, var(--lv-color-warning) 70%, transparent), var(--lv-shadow-card);
                &:hover {
                    border-color: color-mix(in srgb, var(--lv-color-warning) 35%, transparent);
                    background: color-mix(in srgb, var(--lv-color-warning) 6%, var(--lv-color-surface));
                    box-shadow: inset 0 3px 0 0 var(--lv-color-warning), var(--lv-shadow-card-hover);
                }
                &:active {
                    background: color-mix(in srgb, var(--lv-color-warning) 14%, var(--lv-color-surface));
                }
            }
            .lv-b3 {
                box-shadow: inset 0 2.5px 0 0 color-mix(in srgb, var(--lv-color-brand) 70%, transparent), var(--lv-shadow-card);
                &:hover {
                    border-color: var(--lv-primary-border);
                    background: color-mix(in srgb, var(--lv-color-brand) 6%, var(--lv-color-surface));
                    box-shadow: inset 0 3px 0 0 var(--lv-color-brand), var(--lv-shadow-card-hover);
                }
                &:active {
                    background: color-mix(in srgb, var(--lv-color-brand) 14%, var(--lv-color-surface));
                }
            }
            .lv-b4 {
                box-shadow: inset 0 2.5px 0 0 color-mix(in srgb, var(--lv-color-success) 70%, transparent), var(--lv-shadow-card);
                &:hover {
                    border-color: color-mix(in srgb, var(--lv-color-success) 35%, transparent);
                    background: color-mix(in srgb, var(--lv-color-success) 6%, var(--lv-color-surface));
                    box-shadow: inset 0 3px 0 0 var(--lv-color-success), var(--lv-shadow-card-hover);
                }
                &:active {
                    background: color-mix(in srgb, var(--lv-color-success) 14%, var(--lv-color-surface));
                }
            }
        }

        .lv-toolbar-more-wrap {
            position: relative;
            display: inline-flex;
        }
        .lv-toolbar-more-scrim {
            position: fixed;
            inset: 0;
            z-index: 100;
            background: transparent;
        }
        .lv-toolbar-more-menu {
            position: absolute;
            top: calc(100% + 6px);
            right: 0;
            z-index: 101;
            min-width: 180px;
            background: color-mix(in srgb, var(--lv-color-surface) 92%, transparent);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-m);
            box-shadow: var(--lv-shadow-float), var(--lv-inset-shine);
            padding: calc(var(--lv-space-unit) * 2);
            display: flex;
            flex-direction: column;
            gap: 2px;
            animation: lv-modal-pop var(--lv-dur-1) var(--lv-ease);
        }
        .lv-toolbar-menu-item {
            display: flex;
            align-items: center;
            gap: calc(var(--lv-space-unit) * 3);
            width: 100%;
            padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 3);
            border: 0;
            border-radius: var(--lv-r-s);
            background: transparent;
            color: var(--lv-color-text);
            font-size: var(--lv-type-control-size);
            text-align: left;
            cursor: pointer;
            transition: background var(--lv-dur-1) var(--lv-ease), color var(--lv-dur-1) var(--lv-ease);

            &:hover:not(:disabled) {
                background: var(--lv-surface-hover);
                color: var(--lv-color-brand);
            }
            &:disabled {
                opacity: 0.45;
                cursor: not-allowed;
            }
            &.lv-active {
                color: var(--lv-color-brand);
                background: var(--lv-primary-soft);
                font-weight: var(--lv-fw-semibold);
            }
        }
        .lv-menu-icon {
            font-size: 13px;
            flex-shrink: 0;
        }
        .lv-toolbar-menu-divider {
            height: 1px;
            background: var(--lv-border);
            margin: calc(var(--lv-space-unit) * 1) 0;
        }

        .lv-peek {
            position: absolute;
            inset: var(--lv-sp-4) var(--lv-sp-5);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-l);
            box-shadow: var(--lv-shadow-2);
            display: flex;
            flex-direction: column;
            z-index: var(--lv-z-review-peek);
            overflow: hidden;
            .lv-peek-head {
                display: flex; align-items: center; gap: var(--lv-sp-2);
                padding: var(--lv-sp-2) var(--lv-sp-4);
                border-bottom: 1px solid var(--lv-border);
                font-size: var(--lv-type-control-size); color: var(--lv-color-text-muted);
            }
            .lv-peek-body { flex: 1; overflow: auto; padding: var(--lv-sp-4); }
        }

        .lv-help {
            position: absolute;
            inset: var(--lv-sp-4) var(--lv-sp-5);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-l);
            box-shadow: var(--lv-shadow-2);
            display: flex;
            flex-direction: column;
            z-index: var(--lv-z-review-help);
            overflow: hidden;
            .lv-help-head {
                display: flex; align-items: center; gap: var(--lv-sp-2);
                padding: var(--lv-sp-2) var(--lv-sp-4);
                border-bottom: 1px solid var(--lv-border);
                font-size: var(--lv-type-control-size); color: var(--lv-color-text-muted);
            }
            .lv-help-body { flex: 1; overflow: auto; padding: var(--lv-sp-4); }
            .lv-help-row {
                display: flex; gap: var(--lv-sp-3); align-items: center;
                padding: var(--lv-sp-2) 0;
                border-bottom: 1px solid var(--lv-border);
                font-size: var(--lv-type-body-size);
                &:last-child { border-bottom: none; }
            }
        }

        .lv-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(4px);
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--lv-sp-4);
        }

        .lv-pause-dialog {
            width: min(460px, 92vw);
            background: var(--lv-color-surface-raised, var(--lv-color-surface));
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-l);
            box-shadow: var(--lv-shadow-2);
            padding: var(--lv-sp-4);
            text-align: left;
        }
    }
</style>
