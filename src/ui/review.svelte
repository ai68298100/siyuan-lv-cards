<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { fetchSyncPost, openTab, showMessage } from "siyuan";
    import {
        getRiffDueCards, getRiffDecks, getNotebookRiffDueCards, getTreeRiffDueCards, reviewRiffCard, skipReviewRiffCard,
        batchSetRiffCardsDueTime,
        type RiffDueCard, type RiffDeck, type Rating,
    } from "@/api/riff";
    import { getNotebooks, getBlockAttrs, type Notebook } from "@/api/siyuan";
    import { isCardNew, calcStreak, type RevlogData } from "@/core/revlog";
    import { gradeTyping, type Rating1to4 } from "@/core/card-types";
    import { parseOcclusion, type OcclusionData } from "@/core/occlusion";
    import { todayKey } from "@/core/exam";
    import LvKbd from "./kit/LvKbd.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvError from "./kit/LvError.svelte";
    import { friendlyError } from "@/api/errors";

    export interface ReviewSettings {
        ratingStyle: "four" | "three";
        timeoutMode: "off" | "reveal" | "forget";
        timeoutSeconds: number;
        randomOrder: boolean;
        cardMaxWidth: number;
        typingEnabled: boolean;
        typingStrict: boolean;
        choiceEnabled: boolean;
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
        getRevlog: () => RevlogData;
        isSuspendedToday: (cardID: string) => boolean;
        suspendToday: (cardID: string) => void;
        openDashboard: () => void;
        onScopePersist: (scopeKey: string) => void;
        getSessionState: () => { date: string; reviewedIDs: string[]; counters: { new: number; review: number; forget: number; skip: number } } | null;
        saveSessionState: (s: { date: string; reviewedIDs: string[]; counters: { new: number; review: number; forget: number; skip: number } }) => void;
        clearSessionState: () => void;
        emitSessionFinished: (summary: { new: number; review: number; forget: number; skip: number }) => void;
        /** 源上下文预览（M3）：来源块前后各 2 块（只读，不含自身） */
        getContextBlocks: (blockID: string) => Promise<{ id: string; html: string }[]>;
    }

    let { ctx, initialScope = "all", initialCram = false }: {
        ctx: ReviewCtx;
        initialScope?: string;
        initialCram?: boolean;
    } = $props();
    const t = $derived(ctx.i18n);

    /** 会话内重现标记：lvRequeue>0 表示本卡由「忘记卡本批重现」追加 */
    type QueueCard = RiffDueCard & { lvRequeue?: number };
    let queue: QueueCard[] = $state([]);
    let reviewedIDs: string[] = $state([]);
    let current: QueueCard | null = $state(null);
    let showAnswer = $state(false);
    let cardHtml = $state("");
    // 复习范围（M3·FR1）：all | deck:<id> | notebook:<id>
    let scopeKey = $state(initialScope ?? "all");
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
    let sessionSkipped: string[] = []; // 本场跳过排除集（AJ9：跳过的卡不再被下一批拉回）
    let lastAnswered: { html: string; card: RiffDueCard } | null = null; // 回看数据源（AJ2：不再自动打开）

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

    // 回看上一张（M3·FR6）
    let peek = $state<{ html: string; card: RiffDueCard } | null>(null);
    // 超时倒计时（M3·FR8）
    let timeoutLeft = $state(0);
    let timeoutTimer: ReturnType<typeof setInterval> | null = null;
    // 打字模式（M4·FR2，全局练习模式）
    let typingInput = $state("");
    let typingGrade = $state<{ chars: { ch: string; ok: boolean }[]; suggested: Rating1to4 } | null>(null);
    let expectedText = $state("");
    // 评分音效（M 组 P2，Web Audio 合成）
    let audioCtx: AudioContext | null = null;
    // 快捷键帮助覆盖层（AB 组）
    let helpOpen = $state(false);
    let showReschedule = $state(false);
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
            const resp = await fetchSyncPost("/api/block/getBlockDOM", { id: blockID });
            if (seq !== loadSeq) {
                return; // 已切到新卡，丢弃旧响应
            }
            cardHtml = resp?.data?.dom ?? "";
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
        } catch {
            if (seq === loadSeq) {
                cardHtml = "";
                expectedText = "";
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
            const resp = await fetchSyncPost("/api/block/getBlockDOM", { id: blockID });
            const dom = resp?.data?.dom ?? "";
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
            let cards = data.cards ?? [];
            // 「今天不学」+ 本场已跳过的卡本地过滤（内核调度不受影响，AJ9）
            cards = cards.filter(c => !ctx.isSuspendedToday(c.cardID) && !sessionSkipped.includes(c.cardID));
            // 仅新卡 / 仅旧卡模式（睡前巩固包，W 组）
            if (scopeKey === "new" || scopeKey === "old") {
                cards = cards.filter(c => (scopeKey === "new") === (c.state === 0));
            }
            const bl = ctx.settings().batchLimit;
            if (bl > 0) {
                cards = cards.slice(0, bl);
            }
            if (cramActive) {
                // 考前 cram：遗忘多的卡优先（M7·FR4）
                cards = [...cards].sort((a, b) => b.lapses - a.lapses);
            } else if (ctx.settings().reverseOrder) {
                // 倒序模式（431）：内核到期顺序反转，最新到期优先
                cards = [...cards].reverse();
            } else if (ctx.settings().randomOrder) {
                cards = shuffle(cards);
            }
            queue = cards;
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
            errorMsg = friendlyError(e, t);
        } finally {
            loading = false;
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
        await loadBlockDOM(card.blockID);
        restartTimeout();
        // 听写模式：问题态自动朗读答案（M4·FR6，需打字模式开启）
        if (ctx.settings().typingEnabled && ctx.settings().dictationEnabled && expectedText) {
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
        if (!ctx.settings().ttsEnabled || !("speechSynthesis" in window)) {
            return;
        }
        try {
            const text = expectedText || (cardHtml || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            if (!text) return;
            const u = new SpeechSynthesisUtterance(text);
            u.lang = /[\u4e00-\u9fa5]/.test(text) ? "zh-CN" : "en-US";
            u.rate = ctx.settings().ttsRate || 1;
            const voiceName = ctx.settings().ttsVoice;
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
        if (!ctx.settings().sfxEnabled) {
            return;
        }
        if (!audioCtx) audioCtx = new AudioContext();
        try {
            const style = ctx.settings().sfxStyle || "chime";
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
        const s = ctx.settings();
        const g = gradeTyping(expectedText, typingInput, s.typingStrict);
        typingGrade = { chars: g.chars, suggested: g.suggested };
        showAnswer = true;
    }

    // —— 超时模式 ——

    function restartTimeout() {
        stopTimeout();
        const s = ctx.settings();
        if (s.timeoutMode === "off" || !current) {
            timeoutLeft = 0;
            return;
        }
        timeoutLeft = s.timeoutSeconds;
        timeoutTimer = setInterval(() => {
            if (!current || showAnswer) {
                stopTimeout();
                return;
            }
            timeoutLeft -= 1;
            if (timeoutLeft <= 0) {
                stopTimeout();
                if (s.timeoutMode === "reveal") {
                    showAnswer = true;
                } else if (s.timeoutMode === "forget") {
                    rate(1, true);
                }
            }
        }, 1000);
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
        const target = ctx.settings().dailyReviewTarget;
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
        if (!ctx.settings().dailyTipEnabled) {
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
        restartTimeout();
        showMessage(t.review.undoDone, 1500, "info");
    }

    async function rate(rating: Rating, force = false) {
        if (!current || (!showAnswer && !force) || submitting) {
            return;
        }
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
            ctx.appendRevlog({ cardID: current.cardID, deckID: current.deckID, blockID: current.blockID, rating, source: "plugin" });
            reviewedIDs = [...reviewedIDs, current.cardID];
            ctx.saveSessionState({
                date: todayKey(),
                reviewedIDs,
                counters: { new: sessionNew, review: sessionReview, forget: sessionForget, skip: sessionSkip },
            });
            if (rating === 1) {
                sessionForget += 1;
                // 忘记卡本批重现（M3）：评 1 的卡在批尾再出现一次，会话内强化，不动内核调度
                if (ctx.settings().requeueAgain) {
                    queue = [...queue, { ...current, lvRequeue: 1 }];
                }
            } else if (wasNew) {
                sessionNew += 1;
            } else {
                sessionReview += 1;
            }
            await next();
        } catch (e: any) {
            // 评分失败保留现场（AJ11）：当前卡/答案态/队列不动，只提示错误
            errorMsg = friendlyError(e, t);
        } finally {
            submitting = false;
        }
    }

    async function skip() {
        if (!current || submitting) {
            return;
        }
        submitting = true;
        pushHistory();
        try {
            // 重现卡不计内核跳过（同评分类：调度不变）
            if (!current.lvRequeue) {
                await skipReviewRiffCard(current.deckID, current.cardID);
            }
            sessionSkip += 1;
            sessionSkipped = [...sessionSkipped, current.cardID];
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

    async function next() {
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
        if (e.key === "[") {
            if (lastAnswered) { togglePeek(); }
            return;
        }
        if (!showAnswer) { return; }
        if (ctx.settings().ratingStyle === "three") {
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
            sessionNew = ss.counters.new;
            sessionReview = ss.counters.review;
            sessionForget = ss.counters.forget;
            sessionSkip = ss.counters.skip;
        }
        loadQueue();
        // 范围选择器数据源（失败静默：仅影响下拉项，不影响默认全部复习）
        getRiffDecks().then(d => (decks = d)).catch(() => { /* 旁路 */ });
        getNotebooks().then(n => (notebooks = n)).catch(() => { /* 旁路 */ });
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
            {#if streakMilestoneText()}
                <div class="lv-done-milestone lv-anim-rise" style="animation-delay: 120ms">🔥 {streakMilestoneText()}</div>
            {/if}
            {#if dailyTip()}
                <div class="lv-done-tip lv-anim-rise" style="animation-delay: 150ms">💡 {dailyTip()}</div>
            {/if}
            <div class="fn__flex lv-done-actions lv-anim-rise" style="animation-delay: 120ms">
                <button class="b3-button b3-button--text" onclick={loadQueue}>{t.review.again}</button>
                <button class="b3-button b3-button--outline" onclick={undoHistory}>{t.review.undoLast}</button>
                <button class="b3-button b3-button--outline" onclick={ctx.openDashboard}>{t.review.viewStats}</button>
            </div>
        </div>
    {:else}
        <div class="lv-head">
            <select class="b3-select lv-scope" bind:value={scopeKey} onchange={() => { ctx.onScopePersist(scopeKey); loadQueue(); }} title={t.review.scopeTitle}>
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
            <span class="lv-progress">{reviewedIDs.length + 1} / {reviewedIDs.length + queue.length}</span>
            <div class="lv-progress-bar">
                <div class="lv-progress-fill" style={`width:${reviewedIDs.length / Math.max(1, reviewedIDs.length + queue.length) * 100}%`}></div>
            </div>
            {#if cramActive}<span class="b3-chip b3-chip--error">{t.exam.cramOn}</span>{/if}
            {#if current.lvRequeue}<span class="b3-chip b3-chip--warning" title={t.review.requeueTip}>{t.review.requeueChip}</span>{/if}
            {#if ctx.settings().timeoutMode !== "off" && !showAnswer}
                <span class="lv-timeout" class:lv-timeout-low={timeoutLeft <= 10}>⏱ {timeoutText()}</span>
            {/if}
            <span class="lv-tags">
                {#if !(ctx.settings().hideMetaUntilAnswer && !showAnswer)}
                    {#if current.state === 0}<span class="b3-chip b3-chip--primary">{t.review.tagNew}</span>{/if}
                    <span class="b3-chip">{t.review.reps} {current.reps} · {t.review.lapses} {current.lapses}</span>
                {/if}
            </span>
            {#if current.deckID && !(ctx.settings().hideMetaUntilAnswer && !showAnswer)}
                <span class="ft__smaller ft__on-surface" style="opacity:.7">{current.deckID}</span>
            {/if}
            <div class="fn__flex-1"></div>
            <button class="b3-button b3-button--small" title={t.review.ctxToggle} aria-label={t.review.ctxToggle} class:lv-btn-primary={ctxOpen} onclick={toggleContext}>≡</button>
            <button class="b3-button b3-button--small" title={t.review.refreshCard} aria-label={t.review.refreshCard} onclick={refreshCard}>⟳</button>
            <button class="b3-button b3-button--small" title={t.review.helpTitle} aria-label={t.review.helpTitle} onclick={() => (helpOpen = true)}>?</button>
            <button class="b3-button b3-button--small" title={t.review.undoTitle} aria-label={t.review.undoTitle} onclick={undoHistory}>↶</button>
            <button class="b3-button b3-button--small" title={t.review.peekPrev} aria-label={t.review.peekPrev} onclick={togglePeek}>[{t.review.peekPrev.slice(0, 2)}]</button>
            <button class="b3-button b3-button--small" title={t.review.openInEditor} onclick={openInEditor}>{t.review.open}</button>
            <button class="b3-button b3-button--small" title={t.review.suspendToday} aria-label={t.review.suspendToday} onclick={suspendToday}>✕</button>
            <button class="b3-button b3-button--small" onclick={skip}>{t.review.skip}</button>
        </div>
        <div class="lv-card b3-typography" class:lv-anim-glow={showAnswer} bind:this={cardEl} style={`max-width:${ctx.settings().cardMaxWidth}px; width:100%; margin:0 auto;`}>
            <div class="lv-card-content" class:lv-masked={!showAnswer} style={`font-size:${ctx.settings().cardFontScale || 1}em`}>{@html cardHtml}</div>
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
                {#if ctx.settings().typingEnabled}
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
                {:else if ctx.settings().choiceEnabled}
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
                <button class="b3-button b3-button--text lv-reveal">{t.review.showAnswer}</button>
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
            {:else if showAnswer && ctx.settings().ttsEnabled}
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
        <div class="lv-actions" class:lv-actions-compact={ctx.settings().ratingDensity === "compact"}>
            {#if !showAnswer}
                <button class="b3-button b3-button--text lv-btn-wide" onclick={() => (showAnswer = true)}>{t.review.showAnswer}</button>
            {:else if ctx.settings().ratingStyle === "three"}
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
        .lv-done-desc { color: var(--b3-theme-on-surface); font-variant-numeric: tabular-nums; }
        .lv-done-milestone { color: var(--b3-theme-warning); font-weight: 600; }
        .lv-done-tip {
            max-width: 420px;
            color: var(--b3-theme-on-surface);
            font-size: 12px;
            opacity: 0.85;
            line-height: 1.6;
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
                width: 100%; height: 100%;
                background: transparent;
                color: var(--b3-theme-on-surface);
                font-size: 14px;
                opacity: 0.9;
                transition: opacity var(--lv-dur-2) var(--lv-ease), background var(--lv-dur-2) var(--lv-ease);

                &:hover { opacity: 1; background: var(--lv-primary-softer); }
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
