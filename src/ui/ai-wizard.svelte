<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { showMessage } from "siyuan";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";
    import { isAICanceled } from "@/api/ai";
    import { lintAICards } from "@/core/ai-lint";
    import LvSection from "./kit/LvSection.svelte";
    import LvRow from "./kit/LvRow.svelte";
    import LvChip from "./kit/LvChip.svelte";
    import LvSteps from "./kit/LvSteps.svelte";

    let { i18n, initialSource = "", loadCurrentDoc, loadNotebookMaterial, generate, onCreate, onClose, getUnfinishedJob, onResumeAIJob, onAbandonAIJob }: {
        i18n: any;
        /** 预填材料（leech 改写联动） */
        initialSource?: string;
        /** 调用方实现：构造 prompt → 调 AI → 解析卡片（ADR-7：返回 cards + jobId 供断点续传）；第三参为取消信号（AQ-14） */
        generate: (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }, opts?: { signal?: AbortSignal }) => Promise<{ cards: { q: string; a: string; d?: number }[]; jobId: string }>;
        /** ADR-7：逐卡提交——卡片携带 origIndex 指向作业 candidates 原位（✕ 移除后仍正确） */
        onCreate: (cards: { q: string; a: string; origIndex: number }[], deckID: string, deckName: string, jobId: string) => Promise<void>;
        onClose: () => void;
        /** 载入当前打开文档（M2·FR6 输入源扩展；不可用时返回 null） */
        loadCurrentDoc?: () => Promise<{ name: string; content: string } | null>;
        /** 载入笔记本范围材料（M2·FR6 扩展） */
        loadNotebookMaterial?: (nbId: string) => Promise<string>;
        /** 未完成的 AI 导入（ADR-7 恢复入口）；null=无；failed=失败明细供导出 */
        getUnfinishedJob?: () => { id: string; done: number; total: number; failed: { index: number; q: string; error: string }[] } | null;
        onResumeAIJob?: (id: string) => Promise<void>;
        onAbandonAIJob?: (id: string) => void;
    } = $props();
    const t = $derived(i18n);

    /** ADR-7 恢复入口：打开时检查未完成导入 */
    let resume = $state<{ id: string; done: number; total: number; failed: { index: number; q: string; error: string }[] } | null>(null);
    let resumeBusy = $state(false);

    let step = $state(1);
    // 初值语义：leech 改写预填只在打开时注入一次
    // svelte-ignore state_referenced_locally
    let source = $state(initialSource);
    let count = $state(10);
    let language = $state("中文");
    let cardType = $state<"qa" | "cloze">("qa");
    let decks: RiffDeck[] = $state([]);
    let selected = $state("");
    let newName = $state("");

    let candidates: { q: string; a: string; d?: number; keep: boolean; origIndex: number }[] = $state([]);
    /** AQ-16 预览 lint：随 candidates（含编辑）响应式重算（批内重复/过长/过短） */
    let lintWarnings: string[][] = $derived.by(() => lintAICards(candidates.map(c => ({ q: c.q, a: c.a }))));
    /** ADR-7：当前预览对应的作业 ID（导入按 candidates 下标断点记账；重生替换内容不换绑定） */
    let currentJobId = $state("");
    let busy = $state(false);
    let creating = $state(false);
    let errorMsg = $state("");

    let loadDocBusy = $state(false);

    // 笔记本范围源（M2·FR6 扩展）
    let nbOptions = $state<{ id: string; name: string }[]>([]);
    let nbId = $state("");

    async function loadNotebookContent() {
        if (loadDocBusy || !loadNotebookMaterial || !nbId) {
            errorMsg = t.aiWizard.noNotebook;
            return;
        }
        loadDocBusy = true;
        try {
            const material = await loadNotebookMaterial(nbId);
            if (material) {
                source = source ? `${source}\n\n${material}` : material;
                errorMsg = "";
            } else {
                errorMsg = t.aiWizard.noDoc;
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            loadDocBusy = false;
        }
    }

    async function loadActiveDoc() {
        if (loadDocBusy || !loadCurrentDoc) {
            return;
        }
        loadDocBusy = true;
        try {
            const doc = await loadCurrentDoc();
            if (doc?.content) {
                source = source ? `${source}\n\n${doc.content}` : doc.content;
            } else {
                errorMsg = t.aiWizard.noDoc;
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            loadDocBusy = false;
        }
    }

    /** 载入选中文字（防御式：选区在思源主文档同 window，通常可取到；🧪 真机确认） */
    function loadSelection() {
        try {
            const sel = window.getSelection()?.toString().trim();
            if (sel) {
                source = source ? `${source}\n\n${sel}` : sel;
                errorMsg = "";
            } else {
                errorMsg = t.aiWizard.noSelection;
            }
        } catch {
            errorMsg = t.aiWizard.noSelection;
        }
    }

    /** 剪贴板导入（298）：粘贴字幕/讲义直通向导（权限拒绝时降级提示） */
    async function loadClipboard() {
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (text) {
                source = source ? `${source}\n\n${text}` : text;
                errorMsg = "";
            } else {
                errorMsg = t.aiWizard.noClipboard;
            }
        } catch {
            errorMsg = t.aiWizard.noClipboardPerm;
        }
    }

    onMount(async () => {
        // ADR-7 恢复入口：打开时检查未完成的 AI 导入
        resume = getUnfinishedJob?.() ?? null;
        try {
            decks = await getRiffDecks();
            if (decks.length > 0) {
                selected = decks[0].id;
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        }
    });

    async function doResume() {
        if (!resume || resumeBusy || !onResumeAIJob) {
            return;
        }
        resumeBusy = true;
        try {
            await onResumeAIJob(resume.id);
            resume = getUnfinishedJob?.() ?? null;
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            resumeBusy = false;
        }
    }

    function doAbandon() {
        if (!resume || !onAbandonAIJob) {
            return;
        }
        onAbandonAIJob(resume.id);
        resume = null;
    }

    // 生成请求守卫（AQ-14）：换源/重生/关闭向导即取消旧请求；晚到响应只接受最后一次
    let genSeq = 0;
    let genCtrl: AbortController | null = null;

    function cancelGeneration() {
        genSeq += 1; // 使在途响应失效
        genCtrl?.abort();
        genCtrl = null;
        busy = false;
    }

    /** 关闭向导：先取消在途请求再回调宿主（取消不触发 fallback、不写回已关闭向导） */
    function closeWizard() {
        cancelGeneration();
        onClose();
    }

    async function run() {
        if (!source.trim() || busy) {
            return;
        }
        const seq = ++genSeq;
        genCtrl = new AbortController();
        const myCtrl = genCtrl;
        busy = true;
        errorMsg = "";
        try {
            const { cards, jobId } = await generate(source.trim(), { count, language, type: cardType }, { signal: myCtrl.signal });
            if (seq !== genSeq) {
                return; // 旧请求：候选与步骤不写回
            }
            if (cards.length === 0) {
                throw new Error(t.aiWizard.emptyResult);
            }
            candidates = cards.map((c, i) => ({ ...c, keep: true, origIndex: i }));
            // ADR-7：绑定本次作业，导入时按候选下标断点记账
            currentJobId = jobId;
            step = 2;
        } catch (e: any) {
            if (seq !== genSeq || isAICanceled(e)) {
                return; // 取消/被新请求取代：静默，草稿保留可重试
            }
            errorMsg = e?.message ?? String(e);
        } finally {
            if (seq === genSeq) {
                busy = false;
                genCtrl = null;
            }
        }
    }

    /** 单卡重新生成（296）：同源同参 count=1，替换该张、保留勾选态 */
    let regenBusy = $state<number | null>(null);
    async function regenerateCard(i: number) {
        if (regenBusy !== null || busy) {
            return;
        }
        const seq = ++genSeq;
        genCtrl = new AbortController();
        const myCtrl = genCtrl;
        regenBusy = i;
        errorMsg = "";
        try {
            // 重生成仅替换候选内容：currentJobId 保持原绑定（下标对位不变；作业记录中该卡为旧文本，已知边界）
            const { cards } = await generate(source.trim(), { count: 1, language, type: cardType }, { signal: myCtrl.signal });
            if (seq !== genSeq) {
                return;
            }
            if (cards.length > 0) {
                const keep = candidates[i].keep;
                // 重生成仅替换内容：保持 origIndex 与作业 candidates 对位（内容为新生成，已知边界）
                candidates[i] = { ...cards[0], keep, origIndex: i };
                candidates = [...candidates];
            } else {
                errorMsg = t.aiWizard.emptyResult;
            }
        } catch (e: any) {
            if (seq !== genSeq || isAICanceled(e)) {
                return;
            }
            errorMsg = e?.message ?? String(e);
        } finally {
            if (seq === genSeq) {
                genCtrl = null;
            }
            regenBusy = null;
        }
    }

    async function importCards() {
        // ADR-7：origIndex 随候选对象存续（✕ 移除后仍指向作业 candidates 原位）
        const picked = candidates.filter(c => c.keep);
        if (picked.length === 0 || creating) {
            return;
        }
        creating = true;
        errorMsg = "";
        try {
            let deckID = selected;
            let deckName = decks.find(d => d.id === deckID)?.name ?? "";
            if (newName.trim()) {
                const deck = await createRiffDeck(newName.trim());
                deckID = deck.id;
                deckName = deck.name;
            }
            if (!deckID) {
                errorMsg = t.quickCardNeedDeck;
                return;
            }
            await onCreate(picked.map(c => ({ q: c.q, a: c.a, origIndex: c.origIndex })), deckID, deckName, currentJobId);
            closeWizard();
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            creating = false;
        }
    }
</script>

<div class="lv-aiwiz b3-typography">
    {#if resume}
        <!-- ADR-7 恢复入口：上次导入中断，可续传或放弃（已落卡保留） -->
        <div class="lv-aiwiz-resume" role="status">
            <span class="fn__flex-1">{t.aiWizard.resumeHint.replace("${done}", String(resume.done)).replace("${total}", String(resume.total))}</span>
            {#if resume.failed.length > 0}
                <button
                    class="b3-button b3-button--small"
                    title={t.aiWizard.resumeCopyFailed}
                    onclick={() => {
                        const lines = resume.failed.map(f => `#${f.index + 1} [${f.error}] ${f.q}`);
                        navigator.clipboard.writeText(lines.join("\n")).then(
                            () => showMessage(t.aiWizard.resumeCopied, 1500, "info"),
                            () => { /* 剪贴板不可用静默 */ },
                        );
                    }}
                >{t.aiWizard.resumeCopyFailed}({resume.failed.length})</button>
            {/if}
            <button class="b3-button b3-button--text" disabled={resumeBusy} onclick={doResume}>{t.aiWizard.resumeContinue}</button>
            <button class="b3-button b3-button--small" disabled={resumeBusy} onclick={doAbandon}>{window.siyuan.languages.cancel}</button>
        </div>
    {/if}
    <div class="lv-ob-head">
        <LvSteps steps={[t.aiWizard.stepCfg, t.aiWizard.stepPreview]} current={step - 1} />
        <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--small" onclick={closeWizard}>✕</button>
    </div>

    {#if step === 1}
        <div transition:fade={{ duration: 160 }}>
            <LvSection title={t.aiWizard.source}>
                <div style="margin-bottom: var(--lv-sp-2); display: flex; gap: var(--lv-sp-2); flex-wrap: wrap">
                    {#if loadCurrentDoc}
                        <button class="b3-button b3-button--small" onclick={loadActiveDoc}>{t.aiWizard.loadDoc}</button>
                    {/if}
                    {#if loadNotebookMaterial}
                        <button class="b3-button b3-button--small" onclick={loadNotebookContent}>{t.aiWizard.loadNotebook}</button>
                        <select class="b3-select" bind:value={nbId} style="max-width: 160px">
                            {#each nbOptions as n (n.id)}<option value={n.id}>{n.name}</option>{/each}
                        </select>
                    {/if}
                    <button class="b3-button b3-button--small" onclick={loadSelection}>{t.aiWizard.loadSelection}</button>
                    <button class="b3-button b3-button--small" onclick={loadClipboard}>{t.aiWizard.loadClipboard}</button>
                </div>
                {#if source}
                    <div class="ft__smaller ft__on-surface" style="margin-top: 4px">≈ {Math.ceil(source.length / 4)} tokens</div>
                {/if}
            </LvSection>
            <LvSection title={t.aiWizard.config}>
                <LvRow label={t.aiWizard.count}>
                    <select class="b3-select fn__size-60" bind:value={count}>
                        {#each [5, 10, 15, 20] as n (n)}<option value={n}>{n}</option>{/each}
                    </select>
                </LvRow>
                <LvRow label={t.aiWizard.language}>
                    <select class="b3-select fn__size-200" bind:value={language}>
                        <option value="中文">中文</option>
                        <option value="English">English</option>
                    </select>
                </LvRow>
                <LvRow label={t.aiWizard.cardType}>
                    <select class="b3-select fn__size-200" bind:value={cardType}>
                        <option value="qa">{t.aiWizard.typeQa}</option>
                        <option value="cloze">{t.aiWizard.typeCloze}</option>
                    </select>
                </LvRow>
            </LvSection>
            {#if errorMsg}
                <div class="ft__smaller" style="color: var(--b3-theme-error); margin-bottom: var(--lv-sp-2)">{errorMsg}</div>
            {/if}
            <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2)">
                <button class="b3-button b3-button--cancel" onclick={closeWizard}>{window.siyuan.languages.cancel}</button>
                <div class="fn__space"></div>
                <button class="b3-button b3-button--text lv-btn-primary" disabled={busy || !source.trim()} onclick={run}>
                    {busy ? t.aiWizard.generating : `${t.aiWizard.generate} →`}
                </button>
            </div>
        </div>
    {:else}
        <div transition:fade={{ duration: 160 }}>
            <div class="fn__flex" style="align-items: center; gap: var(--lv-sp-2); margin-bottom: var(--lv-sp-2)">
                <button class="b3-button b3-button--small" onclick={() => (step = 1)}>← {t.aiWizard.back}</button>
                <LvChip tone="primary">{candidates.filter(c => c.keep).length} / {candidates.length}</LvChip>
            </div>
            <div class="lv-aiwiz-list">
                {#each candidates as c, i (i)}
                    <div class="lv-card2 lv-aiwiz-card">
                        <label class="fn__flex" style="gap: var(--lv-sp-2); align-items: center">
                            <input type="checkbox" bind:checked={c.keep} />
                            <b class="ft__smaller">#{i + 1}</b>
                            {#if c.d}
                                <LvChip tone={c.d === 3 ? "error" : c.d === 2 ? "warn" : "default"}>{c.d === 3 ? t.aiWizard.diffHard : c.d === 2 ? t.aiWizard.diffMid : t.aiWizard.diffEasy}</LvChip>
                            {/if}
                            {#each lintWarnings[i] ?? [] as warn (warn)}
                                <LvChip tone="warn">{warn === "duplicate" ? t.aiWizard.lintDup : warn === "overlong" ? t.aiWizard.lintLong : t.aiWizard.lintShort}</LvChip>
                            {/each}
                            <div class="fn__flex-1"></div>
                            <button class="b3-button b3-button--small" title={t.aiWizard.regenerate} disabled={regenBusy === i} onclick={() => regenerateCard(i)}>↻</button>
                            <button class="b3-button b3-button--small" onclick={() => (candidates = candidates.filter((_, j) => j !== i))}>✕</button>
                        </label>
                        <textarea class="b3-text-field fn__block" rows="2" bind:value={c.q} placeholder={t.quickCardQ}></textarea>
                        <textarea class="b3-text-field fn__block" rows="2" bind:value={c.a} placeholder={t.quickCardA}></textarea>
                    </div>
                {/each}
            </div>
            {#if errorMsg}
                <div class="ft__smaller" style="color: var(--b3-theme-error); margin-bottom: var(--lv-sp-2)">{errorMsg}</div>
            {/if}
            <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-2)">
                <button class="b3-button b3-button--outline" onclick={() => (step = 1)}>{t.aiWizard.back}</button>
                <input class="b3-text-field" style="width: 180px" placeholder={t.deckNewName} bind:value={newName} />
                <select class="b3-select" style="max-width: 180px" bind:value={selected} disabled={decks.length === 0}>
                    {#each decks as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
                </select>
                <button class="b3-button b3-button--text lv-btn-primary" disabled={creating || candidates.filter(c => c.keep).length === 0} onclick={importCards}>
                    {creating ? "…" : `${t.aiWizard.import} (${candidates.filter(c => c.keep).length})`}
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .lv-aiwiz {
        padding: var(--lv-sp-4);
        max-width: 680px;
        margin: 0 auto;
        height: 100%;
        overflow: auto;
        box-sizing: border-box;
    }
    .lv-aiwiz .lv-ob-head {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-aiwiz-resume {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
        padding: var(--lv-sp-2) var(--lv-sp-3);
        margin-bottom: var(--lv-sp-3);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-r-m);
        background: var(--lv-primary-softer, transparent);
        font-size: 12px;
    }
    .lv-aiwiz-list {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
        max-height: 46vh;
        overflow: auto;
        margin-bottom: var(--lv-sp-2);
    }
    .lv-aiwiz-card {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
    }
</style>
