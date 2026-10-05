<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { openTab, showMessage } from "siyuan";
    import {
        getRiffDueCards, getRiffDecks, getNotebookRiffDueCards, getTreeRiffDueCards, reviewRiffCard, skipReviewRiffCard,
        batchSetRiffCardsDueTime,
        type RiffDueCard, type RiffDeck, type Rating,
    } from "@/api/riff";
    import { getNotebooks, getBlockAttrs, getBlockDOM, type Notebook } from "@/api/siyuan";
    import { isCardNew, calcStreak, type RevlogData } from "@/core/revlog";
    import { gradeTyping, type Rating1to4 } from "@/core/card-types";
    import { parseOcclusion, type OcclusionData } from "@/core/occlusion";
    import { todayKey } from "@/core/exam";
    import { mergeSessionPrefs, pruneSessionPrefs } from "@/core/session-prefs";
    import { END_REASONS, withEndReason, type EndReason } from "@/core/session-state";
    import { isLongReturn, returnCheck, type ReturnCheckFacts } from "@/core/return-check";
    import { avgSecPerCard, budgetLeftSec, BUDGET_PRESETS, clampBudgetMinutes, estimateCompletable, estimateLeftover, isBudgetExpired } from "@/core/session-budget";
    import { nominateVariant } from "@/core/question-rotation";
    import { loadReliefChoices, type LoadChoice } from "@/core/load-relief";
    import { recoveryOptions, type RecoveryOption, type RecoverySnapshot } from "@/core/session-recovery";
    import { SESSION_PURPOSES, PURPOSE_PROFILES, type SessionPurpose } from "@/core/session-purpose";
    import { invalidateDueCache } from "@/api/due-shared";
    import { nextHint, logHint, deriveHintLevels, availableLevels, type HintLevel, type HintLevelsInput } from "@/core/hint-ladder";
    import LvKbd from "./kit/LvKbd.svelte";
    import LvLive from "./kit/LvLive.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvError from "./kit/LvError.svelte";
    import { friendlyError } from "@/api/errors";
    import { lvLog } from "@/libs/log";

    export interface ReviewSettings {
        ratingStyle: "four" | "three";
        timeoutMode: "off" | "reveal" | "forget";
        timeoutSeconds: number;
        randomOrder: boolean;
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
        /** 每日一语（375） */
        dailyTipEnabled: boolean;
    }

    export interface ReviewCtx {
        i18n: any;
        app: any;
        /** 实时读取设置（保存后热生效，无需重建面板） */
        settings: () => ReviewSettings;
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
        openDashboard: () => void;
        onScopePersist: (scopeKey: string) => void;
        getSessionState: () => { date: string; reviewedIDs: string[]; skippedIDs: string[]; counters: { new: number; review: number; forget: number; skip: number }; endReason?: EndReason | null } | null;
        saveSessionState: (s: { date: string; reviewedIDs: string[]; skippedIDs: string[]; counters: { new: number; review: number; forget: number; skip: number }; endReason?: EndReason | null }) => void;
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

    /** 会话内重现标记：lvRequeue>0 表示本卡由「忘记卡本批重现」追加 */
    type QueueCard = RiffDueCard & { lvRequeue?: number };
    let queue: QueueCard[] = $state([]);
    let reviewedIDs: string[] = $state([]);
    let current: QueueCard | null = $state(null);
    let showAnswer = $state(false);
    // 混合题型轮换（v0.179.0）：混合开时按本场张数提名本题形态；关时保持既有静态设置
    const answerVariant = $derived.by(() => {
        if (eff().mixedRotation) {
            return nominateVariant(reviewedIDs.length, { typing: eff().typingEnabled, choice: eff().choiceEnabled });
        }
        return eff().typingEnabled ? "typing" : eff().choiceEnabled ? "choice" : "flip";
    });
    // 轮换提名 choice 时自动本地采样干扰项（无网络；等同手动 🎲）
    $effect(() => {
        if (answerVariant === "choice" && current && !choices && !choiceLoading) {
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
    // 复习范围（M3·FR1）：all | deck:<id> | notebook:<id>
    // 初值语义：范围仅经命令/考试入口传入一次，运行时由用户切换
    // svelte-ignore state_referenced_locally
    let scopeKey = $state(initialScope ?? "all");
    // svelte-ignore state_referenced_locally
    let cramActive = $state(initialCram === true);
    let decks: RiffDeck[] = $state([]);
    let notebooks: Notebook[] = $state([]);
    let sessionNew = $state(0);
    let sessionReview = $state(0);
    let sessionForget = $state(0);
    let sessionSkip = $state(0);
    let sessionDone = $state(false);
    let loading = $state(false);
    let errorMsg = $state("");
    let submitting = $state(false); // 评分/跳过提交锁（AJ8：重复点击只产生一次写入）
    let loadSeq = 0;                // 卡面异步加载序号（AJ10：旧 DOM 不覆盖新卡）
    let queueSeq = 0;               // 队列请求序号（AQ-19：旧范围/旧重试响应不覆盖新队列）
    // AQ-13：题面呈现时刻（monotonic 按壁钟差），评分时按设置封顶后记入 revlog.dur
    let cardShownAt = 0;
    let sessionSkipped: string[] = []; // 本场跳过排除集（AJ9：跳过的卡不再被下一批拉回）
    let lastAnswered: { html: string; card: RiffDueCard } | null = null; // 回看数据源（AJ2：不再自动打开）
    // BI-9：中断恢复分支（快照存在时给出四选一；不自动重复评分/写卡）
    let recovery = $state<RecoveryOption[] | null>(null);
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
    // BI-2：本次会话目的（默认复习到期；informal 目的完成屏不庆祝每日目标）
    let purpose = $state<SessionPurpose>("review");
    // svelte-ignore non_reactive_update -- scopeEl 仅作 bind:this 引用（focus 用），无需响应式
    let scopeEl: HTMLSelectElement | null = null;

    // 撤销历史栈（M3·FR7，ZY 技法：快照恢复 + 内核重评时按官方缓存恢复原状态）
    interface HistorySnapshot {
        queue: RiffDueCard[];
        reviewedIDs: string[];
        current: RiffDueCard;
        showAnswer: boolean;
        cardHtml: string;
        counters: { new: number; review: number; forget: number; skip: number };
    }
    let history: HistorySnapshot[] = [];

    /** 会话快照统一出口（AQ-2）：计数与 skip 集合的当前值即时落盘 */
    function persistSession() {
        ctx.saveSessionState({
            date: todayKey(),
            reviewedIDs,
            skippedIDs: sessionSkipped,
            counters: { new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip },
        });
    }

    // 回看上一张（M3·FR6）
    let peek = $state<{ html: string; card: RiffDueCard } | null>(null);
    // 超时倒计时（M3·FR8）
    let timeoutLeft = $state(0);
    let timeoutTimer: ReturnType<typeof setInterval> | null = null;
    // AT-10：最近一次生效的超时参数（设置变更时对比决定是否重启计时）
    let lastTimeoutMode: "off" | "reveal" | "forget" = "off";
    let lastTimeoutSeconds = 60;
    // 打字模式（M4·FR2，全局练习模式）
    let typingInput = $state("");
    let typingGrade = $state<{ chars: { ch: string; ok: boolean }[]; suggested: Rating1to4 } | null>(null);
    let expectedText = $state("");
    // 评分音效（M 组 P2，Web Audio 合成）
    let audioCtx: AudioContext | null = null;
    // 快捷键帮助覆盖层（AB 组）
    let helpOpen = $state(false);
    // AS-4：读屏播报（评分/跳过/加载/完成 → polite；错误 → assertive）
    let liveMsg = $state("");
    let liveTone = $state<"polite" | "assertive">("polite");
    function announce(msg: string, tone: "polite" | "assertive" = "polite") {
        liveMsg = msg;
        liveTone = tone;
    }
    let showReschedule = $state(false);
    /** BX-3 本场偏好：覆盖全局设置（仅当前复习面板生命周期内有效，切页后还原） */
    let sessionOverride: Partial<ReviewSettings> = $state({});
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
    /** BX-3：设置本场覆盖项（与全局同值时自动摘除，保持覆盖面最小；超时相关变更即时重启计时器） */
    function setOverride(key: keyof ReviewSettings, value: unknown) {
        const next = pruneSessionPrefs(ctx.settings() as unknown as Record<string, unknown>, { ...sessionOverride, [key]: value }) as Partial<ReviewSettings>;
        sessionOverride = next;
        if (key === "timeoutMode" || key === "timeoutSeconds") restartTimeout();
    }
    let rescheduleDays = $state(1);
    // 图片遮挡（M4·FR4 riff 先行）：数据来自块属性 lv-occlusion，坐标相对图片包围盒
    let cardEl: HTMLDivElement | null = $state(null);
    let rootEl: HTMLDivElement | null = $state(null);
    let occl = $state<OcclusionData | null>(null);
    let occlBox = $state<{ l: number; t: number; w: number; h: number } | null>(null);
    let occlHidden = $state<number[]>([]);
    // 选择题模式（M4·FR3，干扰项取自同队列后续卡）
    let answerCache = new Map<string, string>();
    let choices = $state<{ options: string[]; answerIdx: number; picked: number | null } | null>(null);
    let choiceLoading = $state(false);

    async function loadBlockDOM(blockID: string) {
        const seq = ++loadSeq;
        try {
            // AQ-20：统一内核响应校验（非 0/缺字段抛错），失败保留旧卡面
            const dom = await getBlockDOM(blockID);
            if (seq !== loadSeq) {
                return; // 已切到新卡，丢弃旧响应
            }
            cardHtml = dom;
            // 打字题期望答案 = 高亮（mark）文本合集；无 mark 则退化为全文
            const holder = document.createElement("div");
            holder.innerHTML = cardHtml;
            const marks = Array.from(holder.querySelectorAll("mark"))
                .map(m => (m.textContent ?? "").trim())
                .filter(Boolean);
            expectedText = marks.length > 0 ? marks.join(" / ") : (holder.textContent ?? "").trim();
            // 遮挡数据（宽容解析，无属性即为普通卡）
            try {
                const attrs = await getBlockAttrs(blockID);
                if (seq === loadSeq) {
                    occl = parseOcclusion(attrs);
                    occlHidden = [];
                }
            } catch {
                if (seq === loadSeq) {
                    occl = null;
                }
            }
        } catch (e) {
            if (seq !== loadSeq) {
                return;
            }
            if (!cardHtml) {
                // 新卡首载失败：给出可重试错误态（旧卡面本就不存在）
                errorMsg = friendlyError(e, t);
            } else {
                // 刷新失败（已有卡面）：保留旧内容，仅记诊断
                lvLog("warn", "card DOM refresh failed: " + (e instanceof Error ? e.message : e));
            }
        }
    }

    function positionOcclusion() {
        if (!cardEl || !occl) {
            occlBox = null;
            return;
        }
        const img = cardEl.querySelector("img");
        if (!img) {
            occlBox = null;
            return;
        }
        occlBox = { l: img.offsetLeft, t: img.offsetTop, w: img.offsetWidth, h: img.offsetHeight };
    }

    function shuffle<T>(arr: T[]): T[] {
        const out = [...arr];
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    /** 从块 DOM 提取答案文本（mark 合集优先），带缓存（M4·FR3 干扰项采样用） */
    async function answerOf(blockID: string): Promise<string> {
        const cached = answerCache.get(blockID);
        if (cached !== undefined) {
            return cached;
        }
        try {
            const dom = await getBlockDOM(blockID);
            const holder = document.createElement("div");
            holder.innerHTML = dom;
            const marks = Array.from(holder.querySelectorAll("mark"))
                .map(m => (m.textContent ?? "").trim())
                .filter(Boolean);
            const text = marks.length > 0 ? marks.join(" / ") : (holder.textContent ?? "").trim();
            answerCache.set(blockID, text);
            return text;
        } catch {
            return "";
        }
    }

    /** 选择题（M4·FR3）：本卡答案 + 同队列后续卡采样 3 个干扰项 */
    async function startChoice() {
        if (!current || choiceLoading || typingInput.trim()) {
            return;
        }
        choiceLoading = true;
        try {
            const answer = await answerOf(current.blockID);
            answerCache.set(current.blockID, answer);
            const pool: string[] = [];
            for (const c of queue.slice(1, 8)) {
                if (pool.length >= 3) break;
                const text = await answerOf(c.blockID);
                if (text && text !== answer && !pool.includes(text)) {
                    pool.push(text);
                }
            }
            while (pool.length < 3) {
                pool.push(`${t.review.choiceFallback} ${pool.length + 1}`);
            }
            const options = shuffle([answer, ...pool]);
            choices = { options, answerIdx: options.indexOf(answer), picked: null };
        } finally {
            choiceLoading = false;
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
        const seq = ++queueSeq; // AQ-19：范围切换/重试并发时只接受最后一次请求
        loading = true;
        errorMsg = "";
        try {
            let data;
            if (scopeKey.startsWith("deck:")) {
                data = await getRiffDueCards(scopeKey.slice(5), reviewedIDs);
            } else if (scopeKey.startsWith("notebook:")) {
                data = await getNotebookRiffDueCards(scopeKey.slice(9), reviewedIDs);
            } else if (scopeKey.startsWith("doc:")) {
                data = await getTreeRiffDueCards(scopeKey.slice(4), reviewedIDs);
            } else {
                data = await getRiffDueCards("", reviewedIDs);
            }
            if (seq !== queueSeq) {
                return; // 旧响应：不改队列、卡面、计数或计时器
            }
            let cards = data.cards ?? [];
            // 「今天不学」+ 本场已跳过的卡本地过滤（内核调度不受影响，AJ9）
            cards = cards.filter(c => !ctx.isSuspendedToday(c.cardID) && !sessionSkipped.includes(c.cardID));
            // 仅新卡 / 仅旧卡模式（睡前巩固包，W 组）
            if (scopeKey === "new" || scopeKey === "old") {
                cards = cards.filter(c => (scopeKey === "new") === (c.state === 0));
            }
            const bl = eff().batchLimit;
            if (bl > 0) {
                cards = cards.slice(0, bl);
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
                const finished = !sessionDone; // 只在首次进入完成态时广播
                sessionDone = true;
                if (finished && reviewedIDs.length > 0) {
                    ctx.emitSessionFinished({ new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip });
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
            }
        }
    }

    async function setCurrent(card: RiffDueCard) {
        current = card;
        showAnswer = false;
        typingInput = "";
        typingGrade = null;
        choices = null;
        choiceLoading = false;
        occl = null;
        occlBox = null;
        occlHidden = [];
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

    /** TTS 朗读（Web Speech，防御式） */
    function speakText(text: string) {
        if (!("speechSynthesis" in window) || !text) {
            return;
        }
        try {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = /[\u4e00-\u9fa5]/.test(text) ? "zh-CN" : "en-US";
            speechSynthesis.cancel();
            speechSynthesis.speak(u);
        } catch { /* 旁路 */ }
    }

    /** TTS 朗读答案（C9 朗读部分，Web Speech，防御式） */
    function speakAnswer() {
        if (!eff().ttsEnabled || !("speechSynthesis" in window)) {
            return;
        }
        try {
            const text = expectedText || (cardHtml || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            if (!text) return;
            const u = new SpeechSynthesisUtterance(text);
            u.lang = /[\u4e00-\u9fa5]/.test(text) ? "zh-CN" : "en-US";
            u.rate = eff().ttsRate || 1;
            const voiceName = eff().ttsVoice;
            if (voiceName) {
                const voice = speechSynthesis.getVoices().find(v => v.name === voiceName);
                if (voice) u.voice = voice;
            }
            speechSynthesis.cancel();
            speechSynthesis.speak(u);
        } catch { /* 旁路 */ }
    }

    /** 评分音效（Web Audio 合成，M 组 P2）：chime 清音 / wood 木鱼 / bell 铃；受 sfxEnabled 开关（250） */
    function playSfx(rating: Rating) {
        if (!eff().sfxEnabled) {
            return;
        }
        if (!audioCtx) audioCtx = new AudioContext();
        try {
            const style = eff().sfxStyle || "chime";
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            const now = audioCtx.currentTime;
            if (style === "wood") {
                // 木鱼：短促三角波单音，音高随评分微升
                osc.type = "triangle";
                osc.frequency.setValueAtTime(600 + rating * 45, now);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.005, now + 0.09);
                osc.start(now);
                osc.stop(now + 0.1);
                return;
            }
            const freqs: Record<number, number[]> = { 1: [220], 2: [330, 392], 3: [440, 554], 4: [523, 659] };
            const notes = (freqs[rating] ?? [440]).map(f => (style === "bell" ? f * 2 : f));
            const step = 0.08;
            const tail = style === "bell" ? 0.45 : 0.1;
            osc.type = "sine";
            notes.forEach((f, i) => {
                osc.frequency.setValueAtTime(f, now + i * step);
            });
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + notes.length * step + tail);
            osc.start(now);
            osc.stop(now + notes.length * step + tail);
        } catch { /* 旁路 */ }
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

    function restartTimeout() {
        stopTimeout();
        const s = eff();
        if (s.timeoutMode === "off" || !current) {
            timeoutLeft = 0;
            return;
        }
        lastTimeoutMode = s.timeoutMode;
        lastTimeoutSeconds = s.timeoutSeconds;
        timeoutLeft = s.timeoutSeconds;
        // AR-7：deadline 持续计时政策——后台节流/休眠后按壁钟校正，恢复前台剩余时长可预期，不自动重复评分
        const deadline = Date.now() + s.timeoutSeconds * 1000;
        timeoutTimer = setInterval(() => {
            if (!current || showAnswer) {
                stopTimeout();
                return;
            }
            timeoutLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            if (timeoutLeft <= 0) {
                stopTimeout();
                if (s.timeoutMode === "reveal") {
                    showAnswer = true;
                } else if (s.timeoutMode === "forget") {
                    rate(1, true);
                }
            }
        }, 250);
    }

    function stopTimeout() {
        if (timeoutTimer) {
            clearInterval(timeoutTimer);
            timeoutTimer = null;
        }
    }

    function timeoutText(): string {
        const total = Math.max(0, timeoutLeft);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        // >1 小时显示 H:MM:SS，否则 M:SS
        return h > 0
            ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
            : `${m}:${String(s).padStart(2, "0")}`;
    }

    /** 完成页会话时长（544）：本页面挂载即会话起点，恢复会话也从恢复点起算 */
    let sessionStartedAt = Date.now();
    function sessionDurationText(): string {
        const total = Math.max(0, Math.round((Date.now() - sessionStartedAt) / 1000));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${String(s).padStart(2, "0")}`;
    }

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
            reviewedIDs: [...reviewedIDs],
            current: current!,
            showAnswer,
            cardHtml,
            counters: { new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip },
        });
        if (history.length > 50) {
            history.shift();
        }
    }

    function undoHistory() {
        const snap = history.pop();
        if (!snap) {
            showMessage(t.review.undoNone, 1800, "info");
            return;
        }
        errorMsg = "";
        sessionDone = false;
        queue = snap.queue;
        reviewedIDs = snap.reviewedIDs;
        current = snap.current;
        showAnswer = false;
        cardHtml = snap.cardHtml;
        sessionNew = snap.counters.new;
        sessionReview = snap.counters.review;
        sessionForget = snap.counters.forget;
        sessionSkip = snap.counters.skip;
        persistSession(); // 撤销后的计数同样落盘（AQ-2）
        restartTimeout();
        showMessage(t.review.undoDone, 1500, "info");
    }

    async function rate(rating: Rating, force = false) {
        if (!current || (!showAnswer && !force) || submitting) {
            return;
        }
        recovery = null; // BI-9：已开始评分=隐式选择继续原场
        submitting = true;
        pushHistory();
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
            // AQ-13：作答耗时按设置封顶（后台停留/离席不制造超长样本），原生事件无此字段保持 N/A
            const cap = Math.max(5, eff().answerTimeCapSec || 60);
            const dur = cardShownAt > 0 ? Math.min(cap, Math.max(0, Math.round((Date.now() - cardShownAt) / 1000))) : undefined;
            ctx.appendRevlog({ cardID: current.cardID, deckID: current.deckID, blockID: current.blockID, rating, source: "plugin", ...(dur !== undefined ? { dur } : {}) });
            reviewedIDs = [...reviewedIDs, current.cardID];
            if (rating === 1) {
                sessionForget += 1;
                // BJ-4：遗忘后显示错误原因标注（旁路增强，不阻塞下一张）
                if (ctx.tagErrorReason) {
                    errTagCardID = current.cardID;
                    errTagged = false;
                    showErrTags = true;
                }
                // 忘记卡本批重现（M3）：评 1 的卡在批尾再出现一次，会话内强化，不动内核调度
                if (eff().requeueAgain) {
                    queue = [...queue, { ...current, lvRequeue: 1 }];
                }
            } else if (wasNew) {
                sessionNew += 1;
            } else {
                sessionReview += 1;
            }
            // AQ-2：先更新计数再落盘——重载恢复的进度与界面一致，不丢刚评的一张
            persistSession();
            announce(t.review.liveRated, "polite");
            await next();
        } catch (e: any) {
            // 评分失败保留现场（AJ11）：当前卡/答案态/队列不动，只提示错误
            errorMsg = friendlyError(e, t);
            announce(errorMsg, "assertive");
        } finally {
            submitting = false;
        }
    }

    async function skip() {
        if (!current || submitting) {
            return;
        }
        recovery = null; // BI-9：同评分——有动作即隐式续场
        submitting = true;
        pushHistory();
        try {
            // 重现卡不计内核跳过（同评分类：调度不变）
            if (!current.lvRequeue) {
                await skipReviewRiffCard(current.deckID, current.cardID);
                invalidateDueCache(); // AT-4：skip 移出今日到期，共享缓存失效（badge/总览下次读取拉新）
            }
            sessionSkip += 1;
            sessionSkipped = [...sessionSkipped, current.cardID];
            // AQ-2：skip 也落盘——故障注入重载后跳过的卡不重复出现
            persistSession();
            announce(t.review.liveSkipped, "polite");
            await next();
        } catch (e: any) {
            errorMsg = friendlyError(e, t);
        } finally {
            submitting = false;
        }
    }

    async function suspendToday() {
        if (!current) { return; }
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
        // BJ-2：翻卡/切卡时重置提示
        hintLevel = null;
        hintText = "";
        // BJ-4：同步重置错误标注显示
        showErrTags = false;
        errTagged = false;
        // 记录上一张供回看（AJ2：只存数据，不自动打开浮层）
        if (current) {
            lastAnswered = { html: cardHtml, card: current };
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
        if (!current || submitting || rescheduleDays < 1) return;
        const d = new Date(Date.now() + rescheduleDays * 86400000);
        const due = "" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") +
            String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + String(d.getSeconds()).padStart(2, "0");
        try {
            await batchSetRiffCardsDueTime([{ id: current.cardID, due }]);
            invalidateDueCache(); // AT-4：改期改变到期时间，共享缓存失效
            showMessage(t.review.rescheduled.replace("${n}", String(rescheduleDays)), 2000, "info");
            showReschedule = false;
            await next();
        } catch (e: any) {
            errorMsg = friendlyError(e, t);
        }
    }

    /** 刷新当前卡内容（编辑返回后手动/自动触发） */
    async function refreshCard() {
        if (!current) return;
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
    async function toggleContext() {
        ctxOpen = !ctxOpen;
        if (ctxOpen && current) {
            ctxLoading = true;
            ctxBlocks = [];
            try {
                ctxBlocks = await ctx.getContextBlocks(current.blockID);
            } catch { /* 静默降级为空列表 */ }
            ctxLoading = false;
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
        if (peek) {
            if (e.key === "Escape" || e.key === "[") {
                e.preventDefault();
                peek = null;
                returnFocus();
            }
            return;
        }
        if (e.key === "?") {
            helpOpen = !helpOpen;
            return;
        }
        if (helpOpen) {
            if (e.key === "Escape") {
                helpOpen = false;
                returnFocus();
            }
            return;
        }
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable) {
            return;
        }
        // 交互控件防护（541）：焦点在按钮/下拉/链接上时不抢按键——
        // 面板外的控件（如思源工具栏按钮）Space 触发其自身行为；面板内的由下方 preventDefault 接管避免双动作
        const el = e.target as HTMLElement;
        const interactive = el instanceof HTMLButtonElement || el instanceof HTMLSelectElement || el instanceof HTMLAnchorElement;
        if (interactive && !(rootEl && rootEl.contains(el))) {
            return;
        }
        if (e.code === "Space" || e.code === "Enter") {
            e.preventDefault();
            if (!showAnswer) { showAnswer = true; } else { rate(3); }
            return;
        }
        // BJ-2：h 键推进分级提示（仅问题态）
        if (e.key === "h" && !showAnswer && current) {
            e.preventDefault();
            advanceHint();
            return;
        }
        if (e.key === "[") {
            if (lastAnswered) { togglePeek(); }
            return;
        }
        if (!showAnswer) { return; }
        if (eff().ratingStyle === "three") {
            if (e.key === "1") { rate(1); }
            if (e.key === "2") { rate(2); }
            if (e.key === "3") { rate(3); }
        } else {
            if (["1", "2", "3", "4"].includes(e.key)) { rate(Number(e.key) as Rating); }
        }
        if (e.key === "x" || e.key === "0") { skip(); }
        if (e.key === "p" || e.key === "q") { undoHistory(); }
        if (e.key === "f") { showReschedule = !showReschedule; return; }
        if (e.key === "s") { suspendToday(); }
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
        reviewedIDs = [];
        sessionSkipped = [];
        sessionNew = 0;
        sessionReview = 0;
        sessionForget = 0;
        sessionSkip = 0;
        loadQueue();
    }

    function onTouchEnd(e: TouchEvent) {
        const el = e.target as HTMLElement;
        if (el.closest("input,textarea,select,button,a,[contenteditable]")) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < 60 && Math.abs(dy) < 60) return;
        if (!current || showAnswer) return;
        if (dx > 60 && Math.abs(dy) < 60) { rate(3); }
        else if (dx < -60 && Math.abs(dy) < 60) { rate(1); }
        else if (dy < -60 && Math.abs(dx) < 60) { showAnswer = true; }
    }

    function onContainerClick(e: MouseEvent) {
        const el = e.target as HTMLElement;
        if (el.closest("input,textarea,select,button,a,[contenteditable]")) {
            return;
        }
        if (!showAnswer && current) {
            showAnswer = true;
        }
    }

    onMount(() => {
        // 会话中断恢复（M3）：当日已有评分进度时，恢复计数并从剩余卡继续
        const ss = ctx.getSessionState();
        if (ss && ss.reviewedIDs.length > 0) {
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
        // AT-10：设置保存后超时参数立即生效；评分风格/顺序等下一卡自然生效
        const offSettings = ctx.onSettingsChanged?.(() => {
            const s = eff();
            if (current && !showAnswer && (s.timeoutMode !== lastTimeoutMode || s.timeoutSeconds !== lastTimeoutSeconds)) {
                restartTimeout();
            }
            lastTimeoutMode = s.timeoutMode;
            lastTimeoutSeconds = s.timeoutSeconds;
        });
        return () => offSettings?.();
    });

    // 遮罩 overlay 定位：DOM 更新与窗口缩放后重算（$effect 兼容 runes 模式）
    $effect(() => {
        positionOcclusion();
    });

    onDestroy(() => {
        stopTimeout(); // AJ7：销毁时清理倒计时，防止泄漏
    });
</script>

<svelte:window on:keydown={onWindowKeydown} />
<svelte:document on:pointerdown={onPanelPointerDown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
    class="lv-review"
    bind:this={rootEl}
    role="presentation"
    onclick={onContainerClick}
    onkeydown={(e) => onKeydown(e)}
    ontouchstart={onTouchStart}
    ontouchend={onTouchEnd}
    tabindex="-1"
>
    <!-- AS-4：读屏播报区域（视觉隐藏） -->
    <LvLive message={liveMsg} tone={liveTone} />
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
                    onclick={() => (reliefOpen = reliefOpen === c.key ? null : c.key)}>{t.loadRelief[c.key]}</button>
            {/each}
        </div>
        {#if reliefOpen}
            <div class="lv-return lv-relief-impact" aria-live="polite">
                <span class="ft__smaller ft__on-surface">{t.loadRelief.impact[reliefOpen]}</span>
            </div>
        {/if}
    {/if}
    {#if loading}
        <div class="lv-center">{t.dashboard.loading}</div>
    {:else if errorMsg}
        <div class="lv-center lv-error-wrap">
            <LvError message={errorMsg} onretry={loadQueue} retryLabel={t.dashboard.refresh} />
        </div>
    {:else if sessionDone || !current}
        <div class="lv-center lv-done">
            <div class="lv-done-badge" aria-hidden="true">✓</div>
            <div class="lv-done-title lv-anim-rise">{t.review.done}</div>
            <div class="lv-done-desc lv-anim-rise" style="animation-delay: 60ms">
                {t.review.doneNew} {sessionNew} · {t.review.doneReview} {sessionReview} · {t.review.doneForget} {sessionForget} · {t.review.doneSkip} {sessionSkip}
            </div>
            <div class="lv-done-desc lv-anim-rise" style="animation-delay: 90ms">
                ⏱ {sessionDurationText()}{#if targetProgressText()} · {targetProgressText()}{/if}
            </div>
            {#if budgetExpired || budgetMin > 0}
                <!-- BI-12：预算中性提示（到点收工不算失败；未完成项真实保留） -->
                <div class="lv-done-desc lv-anim-rise" style="animation-delay: 100ms">
                    ⏳ {budgetExpired ? t.review.budgetDoneTip : t.review.budgetOn}
                </div>
            {/if}
            <!-- BI-8：会话收工建议（buildSummary 推导） -->
            <div class="lv-done-desc lv-anim-rise" style="animation-delay: 110ms">
                <!-- BI-2：评分口径随目的——formal 庆祝每日目标，informal 只给鼓励不占目标 -->
                {#if PURPOSE_PROFILES[purpose].grading === "informal"}
                    💪 {t.purpose[purpose].end} · {t.review.purposeInformal}
                {:else if (sessionNew + sessionReview) >= eff().dailyReviewTarget && eff().dailyReviewTarget > 0}
                    🎉 {t.review.dailyTargetReached}
                {:else if (sessionNew + sessionReview) > 0}
                    💪 {t.review.doneProgress}
                {/if}
            </div>
            {#if streakMilestoneText()}
                <div class="lv-done-milestone lv-anim-rise" style="animation-delay: 120ms">🔥 {streakMilestoneText()}</div>
            {/if}
            {#if dailyTip()}
                <div class="lv-done-tip lv-anim-rise" style="animation-delay: 150ms">💡 {dailyTip()}</div>
            {/if}
            <!-- BI-8：收工原因收集（可跳过；写当日现场，返场时恢复横幅/分流可读） -->
            <div class="lv-done-end lv-anim-rise" style="animation-delay: 130ms" role="group" aria-label={t.endReason.title}>
                <span class="ft__smaller ft__on-surface">{t.endReason.title}</span>
                {#each END_REASONS as r (r)}
                    <button class="b3-button b3-button--small" class:lv-btn-primary={endPicked === r}
                        aria-pressed={endPicked === r}
                        onclick={() => pickEnd(r)}>{t.endReason[r]}</button>
                {/each}
            </div>
            <div class="fn__flex lv-done-actions lv-anim-rise" style="animation-delay: 120ms">
                <button class="b3-button b3-button--text" onclick={loadQueue}>{t.review.again}</button>
                <button class="b3-button b3-button--outline" onclick={undoHistory}>{t.review.undoLast}</button>
                <button class="b3-button b3-button--outline" onclick={ctx.openDashboard}>{t.review.viewStats}</button>
            </div>
        </div>
    {:else}
        <div class="lv-head">
            <select class="b3-select lv-scope" bind:this={scopeEl} bind:value={scopeKey} onchange={() => { ctx.onScopePersist(scopeKey); recovery = null; loadQueue(); }} title={t.review.scopeTitle}>
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
            <select class="b3-select lv-scope" bind:value={purpose} title={t.review.purposeTitle}>
                {#each SESSION_PURPOSES as p (p)}
                    <option value={p}>{t.purpose[p].name}</option>
                {/each}
            </select>
            <span class="lv-chip2" class:lv-chip2--primary={PURPOSE_PROFILES[purpose].grading === "formal"} title={PURPOSE_PROFILES[purpose].grading === "formal" ? t.review.purposeFormal : t.review.purposeInformal}>
                {t.purpose[purpose].end}
            </span>
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
            <span class="lv-progress">{reviewedIDs.length + 1} / {reviewedIDs.length + queue.length}</span>
            <div class="lv-progress-bar">
                <div class="lv-progress-fill" style={`width:${reviewedIDs.length / Math.max(1, reviewedIDs.length + queue.length) * 100}%`}></div>
            </div>
            {#if cramActive}<span class="b3-chip b3-chip--error">{t.exam.cramOn}</span>{/if}
            {#if budgetMin > 0}
                <!-- BI-12：预算倒计时；到点转为中性提示（不自动结束、不算失败） -->
                {#if budgetExpired}
                    <span class="b3-chip" title={t.review.budgetDoneTip}>{t.review.budgetDone}</span>
                {:else}
                    <span class="lv-timeout" title={t.review.budgetLabel}>⏳ {budgetClockText()}</span>
                {/if}
            {/if}
            {#if current.lvRequeue}<span class="b3-chip b3-chip--warning" title={t.review.requeueTip}>{t.review.requeueChip}</span>{/if}
            {#if eff().timeoutMode !== "off" && !showAnswer}
                <span class="lv-timeout" class:lv-timeout-low={timeoutLeft <= 10}>⏱ {timeoutText()}</span>
            {/if}
            <span class="lv-tags">
                {#if !(eff().hideMetaUntilAnswer && !showAnswer)}
                    {#if current.state === 0}<span class="b3-chip b3-chip--primary">{t.review.tagNew}</span>{/if}
                    <span class="b3-chip">{t.review.reps} {current.reps} · {t.review.lapses} {current.lapses}</span>
                {/if}
            </span>
            {#if current.deckID && !(eff().hideMetaUntilAnswer && !showAnswer)}
                <span class="ft__smaller ft__on-surface" style="opacity:.7">{current.deckID}</span>
            {/if}
            <div class="fn__flex-1"></div>
            <button class="b3-button b3-button--small" title={t.review.ctxToggle} aria-label={t.review.ctxToggle} class:lv-btn-primary={ctxOpen} onclick={toggleContext}>≡</button>
            <button class="b3-button b3-button--small" title={t.review.prefsTitle} aria-label={t.review.prefsTitle} class:lv-btn-primary={prefsOpen || hasOverrides} onclick={() => (prefsOpen = !prefsOpen)}>{hasOverrides ? "⚙●" : "⚙"}</button>
            <button class="b3-button b3-button--small" title={t.review.refreshCard} aria-label={t.review.refreshCard} onclick={refreshCard}>⟳</button>
            <button class="b3-button b3-button--small" title={t.review.helpTitle} aria-label={t.review.helpTitle} onclick={() => (helpOpen = true)}>?</button>
            <button class="b3-button b3-button--small" title={t.review.undoTitle} aria-label={t.review.undoTitle} onclick={undoHistory}>↶</button>
            <button class="b3-button b3-button--small" title={t.review.peekPrev} aria-label={t.review.peekPrev} onclick={togglePeek}>[{t.review.peekPrev.slice(0, 2)}]</button>
            <button class="b3-button b3-button--small" title={t.review.openInEditor} onclick={openInEditor}>{t.review.open}</button>
            <button class="b3-button b3-button--small" title={t.review.suspendToday} aria-label={t.review.suspendToday} onclick={suspendToday}>✕</button>
            <button class="b3-button b3-button--small" onclick={skip}>{t.review.skip}</button>
        </div>
        <div class="lv-card b3-typography" class:lv-anim-glow={showAnswer} bind:this={cardEl} style={`max-width:${eff().cardMaxWidth}px; width:100%; margin:0 auto;`}>
            <div class="lv-card-content" class:lv-masked={!showAnswer} style={`font-size:${eff().cardFontScale || 1}em`}>{@html cardHtml}</div>
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
                            fill="var(--b3-theme-primary)"
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
                    <div class="lv-reschedule" style="display:flex;gap:var(--lv-sp-2);align-items:center;margin:var(--lv-sp-2) 0">
                        <span class="ft__smaller ft__on-surface">{t.review.rescheduleIn}</span>
                        <input class="b3-text-field" style="width:60px" type="number" min="1" bind:value={rescheduleDays} />
                        <span class="ft__smaller ft__on-surface">{t.review.rescheduleDays}</span>
                        <button class="b3-button b3-button--text" onclick={reschedule}>{window.siyuan.languages.confirm}</button>
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
                    {#if choices}
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
                        <div class="ft__smaller ft__on-surface">{t.review.choiceLoading}</div>
                    {:else}
                        <button class="b3-button b3-button--small lv-choice-btn" onclick={startChoice}>🎲 {t.review.choiceMake}</button>
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
                        <button class="b3-button b3-button--small" onclick={advanceHint}>💡 {t.review.hintBtn}</button>
                    {/if}
                    <button class="b3-button b3-button--text lv-reveal" onclick={() => (showAnswer = true)}>{t.review.showAnswer}</button>
                </div>
                <span class="lv-reveal-hint" aria-hidden="true">⎵ {t.review.revealHint}</span>
            {/if}
            {#if typingGrade}
                <div class="lv-typing-diff">
                    <span class="ft__smaller ft__on-surface">{t.review.typingSuggested}</span>
                    <LvChip tone={typingGrade.suggested === 3 ? "primary" : typingGrade.suggested === 2 ? "warn" : "error"}>
                        {typingGrade.suggested}
                    </LvChip>
                    <span class="lv-diff">
                        {#each typingGrade.chars as c, i (i)}
                            <span class:lv-diff-ok={c.ok} class:lv-diff-bad={!c.ok}>{c.ch}</span>
                        {/each}
                    </span>
                </div>
            {:else if showAnswer && eff().ttsEnabled}
                <div class="lv-tts-row">
                    <button class="b3-button b3-button--small" title={t.review.speak} onclick={speakAnswer}>🔊 {t.review.speak}</button>
                </div>
            {/if}
        </div>
        {#if ctxOpen}
            <div class="lv-ctxpanel b3-typography">
                <div class="lv-ctx-title">{t.review.ctxTitle}</div>
                {#if ctxLoading}
                    <div class="lv-skeleton" style="height: 36px"></div>
                    <div class="lv-skeleton" style="height: 36px"></div>
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
        <div class="lv-actions" class:lv-actions-compact={eff().ratingDensity === "compact"}>
            {#if !showAnswer}
                <button class="b3-button b3-button--text lv-btn-wide" onclick={() => (showAnswer = true)}>{t.review.showAnswer}</button>
            {:else if eff().ratingStyle === "three"}
                <button class="b3-button lv-btn-rate lv-b1" onclick={() => rate(1)}><span class="lv-rate-label"><LvKbd k="1" />{t.review.unknown}</span><small>{dueText("1")}</small></button>
                <button class="b3-button lv-btn-rate lv-b2" onclick={() => rate(2)}><span class="lv-rate-label"><LvKbd k="2" />{t.review.vague}</span><small>{dueText("2")}</small></button>
                <button class="b3-button lv-btn-rate lv-b3" onclick={() => rate(3)}><span class="lv-rate-label"><LvKbd k="3" />{t.review.know}</span><small>{dueText("3")}</small></button>
            {:else}
                <button class="b3-button lv-btn-rate lv-b1" onclick={() => rate(1)}><span class="lv-rate-label"><LvKbd k="1" />{t.review.againBtn}</span><small>{dueText("1")}</small></button>
                <button class="b3-button lv-btn-rate lv-b2" onclick={() => rate(2)}><span class="lv-rate-label"><LvKbd k="2" />{t.review.hard}</span><small>{dueText("2")}</small></button>
                <button class="b3-button lv-btn-rate lv-b3" onclick={() => rate(3)}><span class="lv-rate-label"><LvKbd k="3" />{t.review.good}</span><small>{dueText("3")}</small></button>
                <button class="b3-button lv-btn-rate lv-b4" onclick={() => rate(4)}><span class="lv-rate-label"><LvKbd k="4" />{t.review.easy}</span><small>{dueText("4")}</small></button>
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
                    announce(`${t.review.errTagDone}: ${t.errReasons[rid] ?? rid}`, "polite");
                }}>
                    {t.errReasons[rid] ?? rid}
                </button>
            {/each}
            <button class="b3-button b3-button--small" onclick={() => (showErrTags = false)} aria-label={t.review.skip}>✕</button>
        </div>
    {/if}

    {#if helpOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="lv-help lv-glass" tabindex="-1" bind:this={helpEl} transition:fade={{ duration: 160 }} onclick={(e: Event) => e.stopPropagation()}>
            <div class="lv-help-head">
                <span>{t.review.helpTitle}</span>
                <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--small" onclick={() => (helpOpen = false)}>✕</button>
            </div>
            <div class="lv-help-body">
                {#each [
                    { k: "Space / Enter", d: t.review.helpFlipRate },
                    { k: "1-4", d: t.review.helpRate },
                    { k: "p / q / u", d: t.review.helpUndo },
                    { k: "x / 0", d: t.review.helpSkip },
                    { k: "s", d: t.review.helpSuspend },
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
            transition:fade={{ duration: 160 }}
            onclick={(e: Event) => e.stopPropagation()}
        >
            <div class="lv-peek-head">
                <span>{t.review.peekTitle}</span>
                <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--small" onclick={togglePeek}>✕</button>
            </div>
            <div class="lv-peek-body b3-typography">{@html peek.html}</div>
        </div>
    {/if}
</div>

<style lang="scss">
    .lv-review {
        height: 100%;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        /* 移动端安全区（306）：刘海屏/手势条不遮挡内容 */
        padding: calc(var(--lv-sp-4) + env(safe-area-inset-top, 0px)) calc(var(--lv-sp-5) + env(safe-area-inset-right, 0px))
            calc(var(--lv-sp-4) + env(safe-area-inset-bottom, 0px)) calc(var(--lv-sp-5) + env(safe-area-inset-left, 0px));
        gap: var(--lv-sp-3);
        position: relative;
        max-width: 880px;
        margin: 0 auto;
        width: 100%;

        .lv-center { margin: auto; color: var(--b3-theme-on-surface); }
        .lv-error-wrap { width: min(560px, 92vw); }

        .lv-done-title { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin: var(--lv-sp-3) 0 var(--lv-sp-1); }

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
            font-size: 13px;
        }
        /* BI-10：长期返场检查横幅（warn 项多时换行；只读预览） */
        .lv-return {
            display: flex;
            align-items: center;
            gap: var(--lv-sp-2);
            flex-wrap: wrap;
            margin: 0 var(--lv-sp-5) var(--lv-sp-2);
            padding: var(--lv-sp-2) var(--lv-sp-3);
            background: color-mix(in srgb, var(--b3-theme-warning) 8%, transparent);
            border: 1px solid color-mix(in srgb, var(--b3-theme-warning) 35%, transparent);
            border-radius: var(--lv-r-m);
            font-size: 13px;
        }
        .lv-return-title {
            color: var(--b3-theme-on-surface);
            margin-right: var(--lv-sp-1);
            font-weight: 600;
        }
        .lv-recover-title {
            color: var(--b3-theme-on-surface);
            margin-right: var(--lv-sp-1);
        }
        .lv-done-desc { color: var(--b3-theme-on-surface); font-variant-numeric: tabular-nums; }
        .lv-done-milestone { color: var(--b3-theme-warning); font-weight: 600; }
        .lv-done-tip {
            max-width: 420px;
            color: var(--b3-theme-on-surface);
            font-size: 12px;
            opacity: 0.85;
            line-height: 1.6;
        }
        /* BI-8：收工原因 chips（可跳过，不占完成屏视觉重心） */
        .lv-done-end {
            display: flex; flex-wrap: wrap; gap: var(--lv-sp-1); align-items: center; justify-content: center;
            max-width: 460px;
            font-size: 12px;
        }
        .lv-done-actions { gap: var(--lv-sp-2); justify-content: center; margin-top: var(--lv-sp-4); }

        .lv-done-badge {
            width: 56px; height: 56px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 26px; font-weight: 700;
            color: var(--b3-theme-on-primary);
            background: linear-gradient(135deg, var(--b3-theme-primary),
                    color-mix(in srgb, var(--b3-theme-primary) 55%, var(--b3-theme-warning)));
            box-shadow: var(--lv-shadow-2);
        }

        .lv-head {
            display: flex; align-items: center; gap: var(--lv-sp-2);
            .lv-scope { max-width: 200px; font-size: 12px; padding: 4px 8px; }
            /* BI-3：入口上下文条（窄屏换行不挤压进度） */
            .lv-entry {
                display: inline-flex; align-items: center; gap: 2px;
                padding: 1px 4px;
                border-left: 2px solid var(--b3-theme-primary);
                .lv-entry-from { color: var(--b3-theme-on-surface); white-space: nowrap; }
            }
            .lv-progress {
                font-size: 12px; color: var(--b3-theme-on-surface);
                background: var(--lv-primary-softer);
                border-radius: 999px;
                padding: 2px 10px;
                font-variant-numeric: tabular-nums;
            }
            .lv-progress-bar {
                width: 100%; height: 3px; border-radius: 2px;
                background: color-mix(in srgb, var(--b3-theme-on-background) 8%, transparent);
                overflow: hidden;
                margin-top: 2px;
                .lv-progress-fill {
                    height: 100%; border-radius: 2px;
                    background: linear-gradient(90deg, var(--b3-theme-primary),
                        color-mix(in srgb, var(--b3-theme-primary) 55%, var(--b3-theme-warning)));
                    transition: width var(--lv-dur-3) var(--lv-ease);
                }
            }
            .lv-timeout { font-size: 12px; color: var(--b3-theme-on-surface); font-variant-numeric: tabular-nums; }
            .lv-timeout-low { color: var(--b3-theme-error); font-weight: 700; }
            .lv-tags { display: flex; gap: var(--lv-sp-1); }
        }

        .lv-err-tags {
            display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
            padding: var(--lv-sp-2) var(--lv-sp-3);
            margin: 0 auto;
            font-size: 12px;
            background: var(--b3-theme-surface);
            border-radius: var(--b3-border-radius);
        }
        .lv-err-tag { opacity: .8; }

        .lv-card {
            flex: 1;
            position: relative;
            overflow: auto;
            background: var(--lv-surface-grad);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-l);
            box-shadow: var(--lv-shadow-2);
            padding: 32px;
            position: relative;
            transition: box-shadow var(--lv-dur-2) var(--lv-ease), transform var(--lv-dur-2) var(--lv-ease);

            &:hover { box-shadow: var(--lv-shadow-2), var(--lv-shadow-1); }

            // 问题态遮罩规则已移至 index.scss 全局（scoped 编译会误剪 :global 结尾选择器）

            .lv-typing { margin-top: var(--lv-sp-3); }

            // AQ-2：翻面覆盖层按钮（inset:0）在最底层；交互元素抬高一层，鼠标可直达
            .lv-typing,
            .lv-choices,
            .lv-reschedule {
                position: relative;
                z-index: 1;
            }
            // 遮挡 overlay 需绝对定位贴图（内联 left/top 才生效），且高于翻面层接收 rect 点击
            .lv-occl-overlay {
                position: absolute;
                z-index: 1;
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
                    background: var(--b3-theme-background);
                    transition: border-color var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease);
                    &:hover:not(:disabled) { border-color: var(--lv-primary-border); background: var(--lv-primary-softer); }
                    &:disabled { cursor: default; opacity: 0.9; }
                }
                .lv-choice-correct { border-color: var(--b3-theme-primary) !important; background: var(--lv-primary-soft) !important; }
                .lv-choice-wrong { border-color: var(--lv-danger-border) !important; background: var(--lv-danger-soft) !important; }
            }
            .lv-typing-diff {
                display: flex; align-items: center; gap: var(--lv-sp-2);
                margin-top: var(--lv-sp-3);
                flex-wrap: wrap;
                .lv-diff span { font-variant-numeric: normal; }
                .lv-diff-ok { color: var(--b3-theme-primary); }
                .lv-diff-bad {
                    color: var(--b3-theme-error);
                    text-decoration: line-through;
                    opacity: 0.85;
                }
            }

            .lv-reveal {
                position: absolute; inset: 0;
                z-index: 0;
                width: 100%; height: 100%;
                background: transparent;
                color: var(--b3-theme-on-surface);
                font-size: 14px;
                opacity: 0.9;
                transition: opacity var(--lv-dur-2) var(--lv-ease), background var(--lv-dur-2) var(--lv-ease);

                &:hover { opacity: 1; background: var(--lv-primary-softer); }
            }

            .lv-hint-text {
                padding: var(--lv-sp-2) var(--lv-sp-3);
                border-left: 3px solid var(--b3-theme-primary);
                background: var(--b3-theme-surface);
                border-radius: var(--b3-border-radius);
                margin: var(--lv-sp-2) auto;
                max-width: inherit;
                font-size: 0.9em;
                color: var(--b3-theme-on-surface);
            }
            .lv-reveal-hint {
                position: absolute;
                right: var(--lv-sp-3);
                bottom: var(--lv-sp-2);
                font-size: 11px;
                color: var(--b3-theme-on-surface);
                opacity: 0.7;
                pointer-events: none;
            }

            &.lv-anim-glow {
                border-color: var(--lv-primary-border);
            }
        }

        .lv-ctxpanel {
            max-width: var(--lv-card-max, 880px);
            width: 100%;
            margin: 0 auto;
            padding: var(--lv-sp-3);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-m);
            background: color-mix(in srgb, var(--b3-theme-on-background) 4%, transparent);
            font-size: 13px;
            opacity: 0.92;
            .lv-ctx-title {
                font-size: 12px;
                color: var(--b3-theme-on-surface);
                margin-bottom: var(--lv-sp-2);
            }
            .lv-ctx-block {
                padding: var(--lv-sp-2);
                border-bottom: 1px dashed var(--lv-border);
                &:last-child { border-bottom: none; }
            }
            .lv-ctx-cur {
                border-left: 2px solid var(--b3-theme-primary);
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
            background: color-mix(in srgb, var(--b3-theme-on-background) 4%, transparent);
            font-size: 13px;
            .lv-prefs-head {
                display: flex; align-items: baseline; gap: var(--lv-sp-2);
                margin-bottom: var(--lv-sp-2);
                & > span:first-child { font-weight: 500; }
            }
            .lv-budget-custom { width: 72px; font-size: 12px; padding: 4px 8px; }
            .lv-prefs-row {
                display: flex; align-items: center; gap: var(--lv-sp-2);
                padding: var(--lv-sp-1) 0;
                & > span:first-child { color: var(--b3-theme-on-surface); }
                .b3-select { min-width: 9em; }
            }
        }

        .lv-actions {
            display: flex; gap: var(--lv-sp-3); justify-content: center;
            /* 紧凑密度（441）：评分按钮收窄高度与内边距 */
            &.lv-actions-compact { gap: var(--lv-sp-2); .lv-btn-rate { max-width: 150px; padding: 4px 0; } }
            .lv-btn-wide { flex: 1; }
            .lv-btn-rate {
                flex: 1;
                max-width: 180px;
                display: flex; flex-direction: column; align-items: center; gap: 2px;
                border-radius: var(--lv-r-m);
                padding: 10px 12px;
                /* 触屏命中区（546）：粗指针设备保底 44px 高 */
                @media (pointer: coarse) { min-height: 44px; }
                transition: transform var(--lv-dur-1) var(--lv-ease),
                    background var(--lv-dur-1) var(--lv-ease),
                    box-shadow var(--lv-dur-2) var(--lv-ease);

                &:hover { transform: translateY(-1px); }
                &:active { transform: scale(0.98); }

                .lv-rate-label { display: flex; align-items: center; gap: var(--lv-sp-1); font-weight: 600; }
                small { opacity: 0.7; font-size: 11px; font-variant-numeric: tabular-nums; }
            }

            // 评分条错峰入场（答案展示时）
            @media (prefers-reduced-motion: no-preference) {
                .lv-btn-rate { animation: lv-rise var(--lv-dur-2) var(--lv-ease) both; }
                .lv-btn-rate:nth-child(1) { animation-delay: 0ms; }
                .lv-btn-rate:nth-child(2) { animation-delay: 40ms; }
                .lv-btn-rate:nth-child(3) { animation-delay: 80ms; }
                .lv-btn-rate:nth-child(4) { animation-delay: 120ms; }
            }
            .lv-b1 {
                background: var(--lv-danger-soft); color: var(--b3-theme-error);
                &:hover { background: color-mix(in srgb, var(--b3-theme-error) 18%, transparent); }
            }
            .lv-b2 {
                background: var(--lv-warn-soft); color: var(--b3-theme-warning);
                &:hover { background: color-mix(in srgb, var(--b3-theme-warning) 20%, transparent); }
            }
            .lv-b3 {
                background: var(--lv-primary-soft); color: var(--b3-theme-primary);
                &:hover { background: color-mix(in srgb, var(--b3-theme-primary) 18%, transparent); }
            }
            .lv-b4 {
                background: var(--lv-primary-soft); color: var(--b3-theme-primary);
                &:hover { background: color-mix(in srgb, var(--b3-theme-primary) 18%, transparent); }
            }
        }

        .lv-peek {
            position: absolute;
            inset: var(--lv-sp-4) var(--lv-sp-5);
            border: 1px solid var(--lv-border);
            border-radius: var(--lv-r-l);
            box-shadow: var(--lv-shadow-2);
            display: flex;
            flex-direction: column;
            z-index: 10;
            overflow: hidden;
            .lv-peek-head {
                display: flex; align-items: center; gap: var(--lv-sp-2);
                padding: var(--lv-sp-2) var(--lv-sp-4);
                border-bottom: 1px solid var(--lv-border);
                font-size: 12px; color: var(--b3-theme-on-surface);
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
            z-index: 11;
            overflow: hidden;
            .lv-help-head {
                display: flex; align-items: center; gap: var(--lv-sp-2);
                padding: var(--lv-sp-2) var(--lv-sp-4);
                border-bottom: 1px solid var(--lv-border);
                font-size: 12px; color: var(--b3-theme-on-surface);
            }
            .lv-help-body { flex: 1; overflow: auto; padding: var(--lv-sp-4); }
            .lv-help-row {
                display: flex; gap: var(--lv-sp-3); align-items: center;
                padding: var(--lv-sp-2) 0;
                border-bottom: 1px solid var(--lv-border);
                font-size: 13px;
                &:last-child { border-bottom: none; }
            }
        }
    }
</style>
