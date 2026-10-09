<script lang="ts">
    import { onDestroy } from "svelte";
    import { type RiffDueCard } from "@/api/riff";
    import { dueCache } from "@/api/due-shared";
    import { getBlockDOM } from "@/api/siyuan";

    let { i18n, onExit }: { i18n: any; onExit: () => void } = $props();
    const t = $derived(i18n);

    const DURATION = 180;
    let phase = $state<"idle" | "loading" | "running" | "empty" | "error" | "done">("idle");
    let errorMsg = $state("");
    let readFailures = $state(0);
    let remaining = $state(DURATION);
    let known = $state(0);
    let unknown = $state(0);
    let cards: { blockID: string; dom: string }[] = $state([]);
    let idx = $state(0);
    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;
    let loadSeq = 0;
    // AR-10：monotonic deadline——后台节流/休眠后按壁钟校正，不靠 interval 次数累计
    let deadline = 0;

    onDestroy(() => {
        disposed = true;
        loadSeq += 1;
        stopTimer();
    });

    function isCurrentLoad(seq: number) {
        return !disposed && seq === loadSeq;
    }

    function exit() {
        disposed = true;
        loadSeq += 1;
        stopTimer();
        onExit();
    }

    function stopTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function startTimer() {
        stopTimer();
        deadline = Date.now() + remaining * 1000;
        timer = setInterval(() => {
            remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            if (remaining <= 0) {
                finish(); // stopTimer 后 phase=done，interval 不再触发——0 秒只完成一次
            }
        }, 250);
    }

    async function fetchDom(blockID: string): Promise<string | null> {
        try {
            // AQ-20：统一内核响应校验，非 0 不再静默渲染空
            const dom = await getBlockDOM(blockID);
            return dom.trim() ? dom : null;
        } catch { return null; }
    }

    async function start() {
        if (phase === "loading" || phase === "running") return;
        const seq = ++loadSeq;
        phase = "loading";
        errorMsg = "";
        readFailures = 0;
        remaining = DURATION;
        known = 0; unknown = 0; idx = 0;
        cards = [];
        try {
            const data = await dueCache.get("");
            if (!isCurrentLoad(seq)) return;
            const due: RiffDueCard[] = data?.cards ?? [];
            if (due.length === 0) {
                phase = "empty";
                return;
            }
            const slice = due.slice(0, 30);
            const loaded: { blockID: string; dom: string }[] = [];
            let failed = 0;
            for (const c of slice) {
                const dom = await fetchDom(c.blockID);
                if (!isCurrentLoad(seq)) return;
                if (dom === null) {
                    failed += 1;
                } else {
                    loaded.push({ blockID: c.blockID, dom });
                }
            }
            cards = loaded;
            readFailures = failed;
            if (cards.length === 0) {
                errorMsg = failed > 0 ? t.challenge.readFailed : t.challenge.empty;
                phase = failed > 0 ? "error" : "empty";
                return;
            }
        } catch (e: any) {
            if (!isCurrentLoad(seq)) return;
            errorMsg = e?.message ?? String(e);
            phase = "error";
            return;
        }
        if (!isCurrentLoad(seq)) return;
        // AR-10：计时点与材料加载完成一致，倒计时期间不吞作答时间
        phase = "running";
        startTimer();
    }

    function mark(ok: boolean) {
        if (ok) known += 1; else unknown += 1;
        idx += 1;
        if (idx >= cards.length) finish();
    }

    function finish() {
        stopTimer();
        if (phase === "done") {
            return; // AR-10：超时与手动停止并发只完成一次
        }
        phase = "done";
    }
</script>

<div class="lv-chal b3-typography">
    {#if phase === "idle"}
        <div class="lv-chal-center">
            <div class="lv-chal-icon">⏱</div>
            <div class="lv-chal-title">{t.challenge.title}</div>
            <div class="lv-chal-desc">{t.challenge.desc.replace("${n}", "3")}</div>
            <button class="b3-button b3-button--text lv-btn-primary" onclick={start}>{t.challenge.start}</button>
            <div style="margin-top:var(--lv-sp-3)">
                <button class="b3-button b3-button--cancel" onclick={exit}>{window.siyuan.languages.cancel}</button>
            </div>
        </div>
    {:else if phase === "loading"}
        <div class="lv-chal-center" aria-busy="true">
            <div class="lv-chal-icon">⏳</div>
            <div class="lv-chal-title">{t.challenge.loading}</div>
            <button class="b3-button b3-button--cancel" onclick={exit}>{window.siyuan.languages.cancel}</button>
        </div>
    {:else if phase === "empty"}
        <div class="lv-chal-center">
            <div class="lv-chal-icon">∅</div>
            <div class="lv-chal-title">{t.challenge.empty}</div>
            <div class="fn__flex" style="gap: var(--lv-sp-2)">
                <button class="b3-button b3-button--outline" onclick={start}>{t.challenge.retry}</button>
            <button class="b3-button b3-button--cancel" onclick={exit}>{window.siyuan.languages.cancel}</button>
            </div>
        </div>
    {:else if phase === "error"}
        <div class="lv-chal-center">
            <div class="lv-chal-icon">⚠</div>
            <div class="lv-chal-title">{t.challenge.loadError}</div>
            <div class="lv-chal-desc" role="alert">{errorMsg}</div>
            <div class="fn__flex" style="gap: var(--lv-sp-2)">
                <button class="b3-button b3-button--outline" onclick={start}>{t.challenge.retry}</button>
                <button class="b3-button b3-button--cancel" onclick={exit}>{window.siyuan.languages.cancel}</button>
            </div>
        </div>
    {:else if phase === "running"}
        <div class="lv-chal-head">
            <span class="lv-chal-timer" class:lv-chal-low={remaining <= 30}>
                ⏱ {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </span>
            <span class="lv-chal-score">✓ {known} · ✗ {unknown}</span>
            <button class="b3-button b3-button--small" onclick={finish}>{t.challenge.stop}</button>
        </div>
        {#if readFailures > 0}
            <div class="lv-notice lv-notice--warn" role="status">
                {t.challenge.readPartial.replace("${n}", String(readFailures))}
            </div>
        {/if}
        {#if cards[idx]}
            <div class="lv-chal-card lv-card2 b3-typography">
                {@html cards[idx].dom}
            </div>
            <div class="lv-chal-actions">
                <button class="b3-button lv-chal-btn lv-chal-unknown" onclick={() => mark(false)}>✗ {t.challenge.unknown}</button>
                <button class="b3-button lv-chal-btn lv-chal-known" onclick={() => mark(true)}>✓ {t.challenge.known}</button>
            </div>
        {:else}
            <div class="lv-chal-center">{t.challenge.loading}</div>
        {/if}
    {:else}
        <div class="lv-chal-center">
            <div class="lv-chal-icon">🏁</div>
            <div class="lv-chal-title">{t.challenge.doneTitle}</div>
            <div class="lv-chal-desc">
                ✓ {known} · ✗ {unknown} · {t.review.doneSkip} {t.challenge.skipped}
            </div>
            <button class="b3-button b3-button--text lv-btn-primary" onclick={exit}>{t.challenge.closeBtn}</button>
        </div>
    {/if}
</div>

<style>
    .lv-chal { padding: var(--lv-sp-5); text-align: center; }
    .lv-chal-center { display: flex; flex-direction: column; align-items: center; gap: var(--lv-sp-3); padding: var(--lv-sp-5); }
    .lv-chal-icon { font-size: 32px; }
    .lv-chal-title { font-size: 18px; font-weight: 700; }
    .lv-chal-desc { color: var(--b3-theme-on-surface); margin-bottom: var(--lv-sp-3); }
    .lv-chal-head { display: flex; align-items: center; gap: var(--lv-sp-3); }
    .lv-chal-timer { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--b3-theme-primary); }
    .lv-chal-low { color: var(--b3-theme-error) !important; }
    .lv-chal-score { font-variant-numeric: tabular-nums; margin-left: auto; }
    .lv-chal-card { text-align: left; margin: var(--lv-sp-3) 0; }
    .lv-chal-actions { display: flex; gap: var(--lv-sp-3); justify-content: center; }
    .lv-chal-btn { flex: 1; max-width: 160px; font-weight: 600; }
    .lv-chal-known { background: var(--lv-primary-soft); color: var(--b3-theme-primary); }
    .lv-chal-unknown { background: var(--lv-danger-soft); color: var(--b3-theme-error); }
</style>
