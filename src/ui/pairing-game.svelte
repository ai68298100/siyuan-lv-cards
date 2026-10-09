<script lang="ts">
    import { dueCache } from "@/api/due-shared";
    import { getBlockDOM } from "@/api/siyuan";
    import { extractMarkTexts, MARK_SELECTOR } from "@/core/card-face";
    import LvEmpty from "./kit/LvEmpty.svelte";

    /** 配对挑战（M4·FR4）：到期挖空卡限时配对——左列题面（挖空）× 右列答案（mark 文本），
     * 只入激励不计调度。无挖空的卡自动跳过。 */

    interface Pair {
        cardID: string;
        prompt: string;
        answer: string;
    }

    let { i18n, onExit }: { i18n: any; onExit: () => void } = $props();
    const t = $derived(i18n);

    let phase = $state<"loading" | "running" | "done" | "notEnough">("loading");
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

    $effect(() => {
        load();
        return () => {
            if (timer) { clearInterval(timer); }
        };
    });

    function shuffle<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    async function load() {
        phase = "loading";
        try {
            const due = await dueCache.get("");
            const candidates = (due.cards ?? []).slice(0, 12);
            const found: Pair[] = [];
            for (const c of candidates) {
                if (found.length >= 8) { break; }
                try {
                    // AQ-20：统一内核响应校验，非 0 视为单卡失败跳过
                    const html = await getBlockDOM(c.blockID);
                    const holder = document.createElement("div");
                    holder.innerHTML = html;
                    const marks = extractMarkTexts(holder);
                    if (marks.length === 0) { continue; } // 无挖空的卡不参与配对
                    // 题面：所有挖空段统一替换为 ____（答案串 = 各挖空文本合并）
                    holder.querySelectorAll(MARK_SELECTOR).forEach(m => m.replaceWith(document.createTextNode("____")));
                    const prompt = (holder.textContent ?? "").trim().replace(/\s+/g, " ");
                    if (prompt.length < 4) { continue; }
                    found.push({ cardID: c.cardID, prompt, answer: marks.join(" / ") });
                } catch { /* 单卡失败跳过 */ }
            }
            if (found.length < 4) {
                phase = "notEnough";
                return;
            }
            pairs = found;
            left = shuffle(found);
            right = shuffle(found);
            startTimer();
            phase = "running";
        } catch {
            phase = "notEnough";
        }
    }

    function startTimer() {
        seconds = 0;
        if (timer) { clearInterval(timer); }
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
            if (timer) { clearInterval(timer); }
            phase = "done";
        }
    }
</script>

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
    {:else if phase === "running"}
        <div class="lv-pair-head">
            <span class="b3-chip b3-chip--primary">⏱ {seconds}s</span>
            <span class="b3-chip">{t.pairing.pairs}: {matched.size} / {pairs.length}</span>
            <span class="b3-chip b3-chip--error">{t.pairing.mistakes}: {mistakes}</span>
            <div class="fn__flex-1"></div>
            <button class="b3-button b3-button--small" onclick={onExit}>{t.pairing.exit}</button>
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
            <div class="fn__flex" style="gap: 8px; margin-top: 12px; justify-content: center">
                <button class="b3-button b3-button--text" onclick={load}>{t.pairing.again}</button>
                <button class="b3-button b3-button--cancel" onclick={onExit}>{t.pairing.exit}</button>
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
        gap: 6px;
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
        background: var(--b3-theme-surface);
        cursor: pointer;
        font-size: 13px;
        line-height: 1.5;
        transition: border-color var(--lv-dur-1) var(--lv-ease), background var(--lv-dur-1) var(--lv-ease);
    }
    .lv-pair-cell:hover { border-color: var(--lv-border-strong); }
    .lv-pair-on { border-color: var(--b3-theme-primary); background: var(--lv-primary-soft); }
    .lv-pair-ans { color: var(--b3-theme-on-surface); }
    .lv-pair-result { font-size: 18px; font-weight: 700; }
</style>
