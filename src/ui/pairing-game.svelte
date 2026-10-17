<script lang="ts">
    import { onDestroy } from "svelte";
    import { dueCache } from "@/api/due-shared";
    import { getBlockDOM } from "@/api/siyuan";
    import { extractMarkTexts, MARK_SELECTOR } from "@/core/card-face";
    import LvEmpty from "./kit/LvEmpty.svelte";
    import LvError from "./kit/LvError.svelte";

    /** 配对挑战（M4·FR4）：到期挖空卡限时配对——左列题面（挖空）× 右列答案（mark 文本），
     * 只入激励不计调度。无挖空的卡自动跳过。 */

    interface Pair {
        cardID: string;
        prompt: string;
        answer: string;
    }

    let { i18n, onExit }: { i18n: any; onExit: () => void } = $props();
    const t = $derived(i18n);

    let phase = $state<"loading" | "running" | "done" | "notEnough" | "error">("loading");
    let errorMsg = $state("");
    let pairs = $state<Pair[]>([]);
    // 左列（题面，原序）与右列（答案，洗牌）
    let left = $state<Pair[]>([]);
    let right = $state<Pair[]>([]);
    let pickedLeft = $state("");
    let pickedRight = $state("");
    let matched = $state<Set<string>>(new Set());
    let mistakes = $state(0);
    let seconds = $state(0);
    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;
    let loadGeneration = 0;
    let loadBusy = $state(false);
    let requestBusy = false;

    $effect(() => {
        load();
        return () => {
            stopTimer();
        };
    });

    onDestroy(() => {
        disposed = true;
        loadGeneration += 1;
        stopTimer();
    });

    function stopTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function shuffle<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    async function load() {
        if (requestBusy) return;
        requestBusy = true;
        loadBusy = true;
        const generation = ++loadGeneration;
        stopTimer();
        phase = "loading";
        errorMsg = "";
        try {
            const due = await dueCache.get("");
            if (disposed || generation !== loadGeneration) return;
            const candidates = (due.cards ?? []).slice(0, 12);
            const found: Pair[] = [];
            let failedCards = 0;
            for (const c of candidates) {
                if (found.length >= 8) { break; }
                try {
                    // AQ-20：统一内核响应校验，非 0 视为单卡失败跳过
                    const html = await getBlockDOM(c.blockID);
                    if (disposed || generation !== loadGeneration) return;
                    const holder = document.createElement("div");
                    holder.innerHTML = html;
                    const marks = extractMarkTexts(holder);
                    if (marks.length === 0) { continue; } // 无挖空的卡不参与配对
                    // 题面：所有挖空段统一替换为 ____（答案串 = 各挖空文本合并）
                    holder.querySelectorAll(MARK_SELECTOR).forEach(m => m.replaceWith(document.createTextNode("____")));
                    const prompt = (holder.textContent ?? "").trim().replace(/\s+/g, " ");
                    if (prompt.length < 4) { continue; }
                    found.push({ cardID: c.cardID, prompt, answer: marks.join(" / ") });
                } catch {
                    if (disposed || generation !== loadGeneration) return;
                    failedCards += 1;
                }
            }
            if (found.length < 4) {
                if (failedCards > 0) {
                    errorMsg = t.pairing.loadFailed;
                    phase = "error";
                    return;
                }
                phase = "notEnough";
                return;
            }
            pairs = found;
            left = shuffle(found);
            right = shuffle(found);
            startTimer();
            phase = "running";
        } catch (e: any) {
            if (disposed || generation !== loadGeneration) return;
            errorMsg = e?.message ?? String(e);
            phase = "error";
        } finally {
            requestBusy = false;
            loadBusy = false;
        }
    }

    function startTimer() {
        seconds = 0;
        stopTimer();
        timer = setInterval(() => { seconds += 1; }, 1000);
    }

    function pickLeft(p: Pair) {
        if (matched.has(p.cardID)) { return; }
        pickedLeft = p.cardID;
        tryMatch();
    }

    function pickRight(p: Pair) {
        if (matched.has(p.cardID)) { return; }
        pickedRight = p.cardID;
        tryMatch();
    }

    function tryMatch() {
        if (!pickedLeft || !pickedRight) { return; }
        if (pickedLeft === pickedRight) {
            const next = new Set(matched);
            next.add(pickedLeft);
            matched = next;
        } else {
            mistakes += 1;
        }
        pickedLeft = "";
        pickedRight = "";
        if (matched.size === pairs.length) {
            stopTimer();
            phase = "done";
        }
    }

    function exit() {
        if (phase === "running" && !window.confirm(t.pairing.exitConfirm ?? "当前配对进度不会保存，确定退出吗？")) return;
        onExit();
    }
</script>

<svelte:window on:keydown={(e) => { if (e.key === "Escape") { e.preventDefault(); exit(); } }} />

<div class="lv-pair b3-typography">
    {#if phase === "loading"}
        <div class="lv-pair-center">{t.dashboard.loading}</div>
    {:else if phase === "notEnough"}
        <!-- R53 §3.9：空态走标准组件（图标圈 + 说明 + 动作钮），居中限宽不顶满 -->
        <div class="lv-pair-center">
            <div class="lv-pair-empty-wrap">
                <LvEmpty text={t.pairing.notEnough} actionLabel={t.pairing.exit} onaction={onExit} />
            </div>
        </div>
    {:else if phase === "error"}
        <div class="lv-pair-center">
            <LvError message={errorMsg} onretry={load} retryLabel={t.dashboard.refresh} />
        </div>
    {:else if phase === "running"}
        <div class="lv-pair-head">
            <span class="b3-chip b3-chip--primary">⏱ {seconds}s</span>
            <span class="b3-chip">{t.pairing.pairs}: {matched.size} / {pairs.length}</span>
            <span class="b3-chip b3-chip--error">{t.pairing.mistakes}: {mistakes}</span>
            <div class="fn__flex-1"></div>
            <button class="b3-button b3-button--small" onclick={exit}>{t.pairing.exit}</button>
        </div>
        <div class="lv-pair-grid">
            <div class="lv-pair-col">
                {#each left as p (p.cardID)}
                    {#if !matched.has(p.cardID)}
                        <button class="lv-pair-cell" class:lv-pair-on={pickedLeft === p.cardID} onclick={() => pickLeft(p)}>{p.prompt}</button>
                    {/if}
                {/each}
            </div>
            <div class="lv-pair-col">
                {#each right as p (`r-${p.cardID}`)}
                    {#if !matched.has(p.cardID)}
                        <button class="lv-pair-cell lv-pair-ans" class:lv-pair-on={pickedRight === p.cardID} onclick={() => pickRight(p)}>{p.answer}</button>
                    {/if}
                {/each}
            </div>
        </div>
    {:else}
        <div class="lv-pair-center">
            <div class="lv-done-badge" aria-hidden="true">✓</div>
            <div class="lv-pair-result">{t.pairing.doneTitle}</div>
            <div class="ft__smaller ft__on-surface">
                {t.pairing.doneTime.replace("${s}", String(seconds))} · {t.pairing.mistakes}: {mistakes}
            </div>
            <div class="fn__flex" style="gap: calc(var(--lv-space-unit) * 4); margin-top: 12px; justify-content: center">
                <button class="b3-button lv-btn-primary" disabled={loadBusy} aria-busy={loadBusy} onclick={load}>{loadBusy ? (t.pairing.loading ?? t.dashboard.loading) : t.pairing.again}</button>
                <button class="b3-button b3-button--outline" onclick={exit}>{t.pairing.exit}</button>
            </div>
        </div>
    {/if}
</div>

<style>
    .lv-pair { min-height: 320px; display: flex; flex-direction: column; }
    .lv-pair-empty-wrap { width: min(440px, 100%); }
    .lv-pair-center {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: calc(var(--lv-space-unit) * 3);
        padding: var(--lv-sp-5);
        text-align: center;
    }
    .lv-pair-head { display: flex; align-items: center; gap: var(--lv-sp-2); margin-bottom: var(--lv-sp-3); }
    .lv-pair-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--lv-sp-3); }
    .lv-pair-col { display: flex; flex-direction: column; gap: var(--lv-sp-2); }
    .lv-pair-cell {
        text-align: left;
        padding: var(--lv-sp-3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-color-surface);
        box-shadow: var(--lv-shadow-card), var(--lv-inset-shine);
        cursor: pointer;
        font-size: var(--lv-type-body-size);
        line-height: var(--lv-lh-meta);
        transition: border-color var(--lv-dur-1) var(--lv-ease),
            background var(--lv-dur-1) var(--lv-ease),
            transform var(--lv-dur-1) var(--lv-ease),
            box-shadow var(--lv-dur-1) var(--lv-ease);

        &:hover {
            border-color: var(--lv-border-strong);
            transform: translateY(-1px);
            box-shadow: var(--lv-shadow-card-hover), var(--lv-inset-shine);
        }
        &:active {
            transform: translateY(1px) scale(0.985);
        }
    }
    .lv-pair-on {
        border-color: var(--lv-color-brand) !important;
        background: var(--lv-primary-soft) !important;
        color: var(--lv-color-brand);
        box-shadow: 0 0 0 1px var(--lv-color-brand), var(--lv-shadow-card) !important;
    }
    .lv-pair-ans { color: var(--lv-color-text-muted); }
    .lv-pair-result { font-size: var(--lv-type-section-size); font-weight: 700; }
</style>
