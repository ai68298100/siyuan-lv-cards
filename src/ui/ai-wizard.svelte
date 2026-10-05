<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { showMessage } from "siyuan";
    import { getRiffDecks, createRiffDeck, type RiffDeck } from "@/api/riff";
    import { isAICanceled } from "@/api/ai";
    import { lintAICards } from "@/core/ai-lint";
    import { maskSensitive, scanSensitive, type SensitiveHit } from "@/core/ai-sensitive";
    import { scoreBatch, type Scorecard } from "@/core/ai-quality-scorecard";
    import { planReview, type ReviewPlan } from "@/core/ai-review-strategy";
    import { appendVersion, type CardProvenance, type ProvenanceVersion } from "@/core/ai-provenance";

    /** BU-36 分层预算报告（宿主 assembleGeneratePrompt 纯函数产出） */
    interface BudgetPreview {
        budgetTokens: number;
        budgetSource: "model-registry" | "task-default";
        modelId: string | null;
        totalTokens: number;
        sourceTokens: number;
        needsBatching: boolean;
        layers: { key: string; tokens: number; originalTokens?: number; truncated?: boolean; dropped?: boolean }[];
    }
    import LvChip from "./kit/LvChip.svelte";
    import LvSteps from "./kit/LvSteps.svelte";

    let { i18n, initialSource = "", loadCurrentDoc, loadNotebookMaterial, generate, onCreate, onClose, getUnfinishedJob, onResumeAIJob, onAbandonAIJob, openDocById, isSourceDenied, onDenySource, sensitiveTerms = "", modelTrustKnown, previewBudget }: {
        i18n: any;
        /** 预填材料（leech 改写联动） */
        initialSource?: string;
        /** 调用方实现：构造 prompt → 调 AI → 解析卡片（ADR-7：返回 cards + jobId 供断点续传）；第三参为取消信号（AQ-14）+ 来源 provenance（BW-9 禁止外发判定）；gen 为生成环境快照（BU-15） */
        generate: (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }, opts?: { signal?: AbortSignal; provenance?: { notebookIds?: string[]; docIds?: string[] } }) => Promise<{ cards: { q: string; a: string; d?: number }[]; jobId: string; gen?: { mode: "siyuan" | "custom"; modelId: string | null; templateHash: string } }>;
        /** ADR-7：逐卡提交——卡片携带 origIndex 指向作业 candidates 原位（✕ 移除后仍正确） */
        onCreate: (cards: { q: string; a: string; origIndex: number }[], deckID: string, deckName: string, jobId: string) => Promise<void>;
        onClose: () => void;
        /** 载入当前打开文档（M2·FR6 输入源扩展；不可用时返回 null）；docId 供回源（T02） */
        loadCurrentDoc?: () => Promise<{ name: string; content: string; docId?: string } | null>;
        /** 载入笔记本范围材料（M2·FR6 扩展） */
        loadNotebookMaterial?: (nbId: string) => Promise<string>;
        /** T02 来源清单：按文档 ID 回源跳转（可选——旧宿主不传则不显示回源按钮） */
        openDocById?: (docId: string) => void;
        /** BW-9：来源是否已登记禁止外发（可选——旧宿主不传则不做载入前拦截，generate 侧仍硬阻断） */
        isSourceDenied?: (kind: "doc" | "notebook", id: string) => boolean;
        /** BW-9：登记禁止外发规则（宿主落盘 + 提示；向导侧移除该来源条目） */
        onDenySource?: (kind: "doc" | "notebook", id: string) => void;
        /** BU-8：自定义敏感词（逗号分隔；空=只用内置模式） */
        sensitiveTerms?: string;
        /** BU-14：模型是否可信（登记 active 或内核网关）；不传=按未登记从严 */
        modelTrustKnown?: () => boolean;
        /** BU-36：上下文包分层预算预览（宿主纯函数，零网络；不传=不显示该区） */
        previewBudget?: (source: string, cfg: { count: number; language: string; type: "qa" | "cloze" }) => BudgetPreview | null;
        /** 未完成的 AI 导入（ADR-7 恢复入口）；null=无；failed=失败明细供导出 */
        getUnfinishedJob?: () => { id: string; done: number; total: number; failed: { index: number; q: string; error: string }[] } | null;
        onResumeAIJob?: (id: string) => Promise<void>;
        onAbandonAIJob?: (id: string) => void;
    } = $props();
    const t = $derived(i18n);

    /** T02 来源清单（docs/13 §4）：分条记账——标签/字数/单条移除/文档来源可回源 */
    interface WizardSource {
        id: string;
        label: string;
        content: string;
        docId?: string;
        nbId?: string;
        /** 剪贴板/粘贴来源=未验证（BU-14 审阅计划因子） */
        unverified?: boolean;
    }
    let sourceSeq = 0;
    let sources = $state<WizardSource[]>([]);

    function addSource(label: string, content: string, docId?: string, nbId?: string): void {
        // BW-9：已登记禁止外发的来源在载入前拦截（generate 侧另有硬阻断兜底）
        if (docId && isSourceDenied?.("doc", docId)) {
            errorMsg = t.aiWizard.srcDenied;
            return;
        }
        if (nbId && isSourceDenied?.("notebook", nbId)) {
            errorMsg = t.aiWizard.srcDeniedNb;
            return;
        }
        sources = [...sources, { id: `src-${++sourceSeq}`, label, content, docId, nbId }];
        source = source ? `${source}\n\n${content}` : content;
    }

    /** 移除来源条目：正文尽力删首次出现（用户已手动编辑则只移条目） */
    function removeSource(id: string): void {
        const entry = sources.find((s) => s.id === id);
        if (entry && source.includes(entry.content)) {
            const idx = source.indexOf(entry.content);
            source = (source.slice(0, idx) + source.slice(idx + entry.content.length)).replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n").trim();
        }
        sources = sources.filter((s) => s.id !== id);
    }

    /** BW-9：登记禁止外发（宿主落盘）并移除该来源条目——本会话不再载入（addSource 有拦截） */
    function denySource(src: WizardSource) {
        if (src.docId) {
            onDenySource?.("doc", src.docId);
        } else if (src.nbId) {
            onDenySource?.("notebook", src.nbId);
        }
        removeSource(src.id);
    }

    /** BW-9：本次发送的来源 provenance（载入清单去重；生成侧据此判 deny 规则） */
    function provenance(): { notebookIds: string[]; docIds: string[] } {
        const nb = [...new Set(sources.map(s => s.nbId).filter(Boolean))] as string[];
        const doc = [...new Set(sources.map(s => s.docId).filter(Boolean))] as string[];
        return { notebookIds: nb, docIds: doc };
    }

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

    /** T03 片二：审阅状态——已选(keep)≠已审(review)；入库只取 已选+已接受 */
    let candidates: { q: string; a: string; d?: number; keep: boolean; origIndex: number; review: "pending" | "accepted" | "verified" }[] = $state([]);
    let acceptedCount = $derived(candidates.filter((c) => c.keep && c.review === "accepted").length);
    /** 编辑已接受卡 → 退回未审（修改后需重新核对，docs/13 §5） */
    function touchCandidate(i: number) {
        if (candidates[i]?.review === "accepted") {
            candidates[i] = { ...candidates[i], review: "pending" };
            candidates = [...candidates];
        }
    }
    function setReview(i: number, review: "accepted" | "verified" | "pending") {
        if (review === "accepted") {
            recordUserVersion(i); // BU-15：接受即留痕用户当前文本（编辑后接受=用户版本）
        }
        candidates[i] = { ...candidates[i], review };
        candidates = [...candidates];
    }
    function acceptAll() {
        candidates = candidates.map((c) => (c.keep && c.review !== "verified" ? { ...c, review: "accepted" } : c));
    }
    /** AQ-16 预览 lint：随 candidates（含编辑）响应式重算（批内重复/过长/过短） */
    let lintWarnings: string[][] = $derived.by(() => lintAICards(candidates.map(c => ({ q: c.q, a: c.a }))));
    /** BU-13 质量评分卡：随候选（含编辑）响应式重算；综合分仅审阅提示 */
    let scorecards: Scorecard[] = $derived(scoreBatch(candidates.map(c => ({ q: c.q, a: c.a }))));
    /** BU-14 审阅计划：按因子就高不就低（模型登记/来源可信/批量均分/问题卡占比） */
    let reviewPlan: ReviewPlan | null = $derived.by(() => {
        if (candidates.length === 0) {
            return null;
        }
        const comps = scorecards.map(s => s.composite);
        const avg = comps.reduce((a, b) => a + b, 0) / comps.length;
        const problemRatio = comps.filter(c => c < 70).length / comps.length;
        return planReview({
            taskRisk: "low", // 当前在册任务仅制卡（低风险）；扩展任务登记时随任务声明
            modelTrust: modelTrustKnown?.() === false ? "unknown" : "known",
            sourceTrust: sources.some(s => s.unverified) ? "unverified" : "trusted",
            avgComposite: avg,
            problemRatio,
            totalCards: candidates.length,
        });
    });
    /** BU-15 版本链（会话内）：生成记 ai 版（带 gen 快照）、接受/重生前记 user 版 */
    let prov: CardProvenance[] = $state([]);

    function provOf(i: number): CardProvenance {
        return prov[i] ?? { index: i, versions: [] };
    }
    /** 记 user 版本（与链尾同文则跳过——防重复留痕） */
    function recordUserVersion(i: number) {
        const c = candidates[i];
        if (!c) {
            return;
        }
        const last = provOf(i).versions[provOf(i).versions.length - 1];
        if (last && last.q === c.q && last.a === c.a) {
            return;
        }
        prov[i] = appendVersion(provOf(i), { at: Date.now(), via: "user", q: c.q, a: c.a });
        prov = [...prov];
    }
    /** 记 ai 版本（生成快照必带——gen 缺失时 appendVersion 会整条剔除，此处兜底不发） */
    function recordAIVersion(i: number, card: { q: string; a: string }, gen: { mode: "siyuan" | "custom"; modelId: string | null; templateHash: string }) {
        prov[i] = appendVersion(provOf(i), { at: Date.now(), via: "ai", q: card.q, a: card.a, gen });
        prov = [...prov];
    }
    /** BU-15：回到某历史版本（置回待审——内容变更须重新核对） */
    function restoreVersion(i: number, v: ProvenanceVersion) {
        candidates[i] = { ...candidates[i], q: v.q, a: v.a, review: "pending" };
        candidates = [...candidates];
    }
    /** ADR-7：当前预览对应的作业 ID（导入按 candidates 下标断点记账；重生替换内容不换绑定） */
    let currentJobId = $state("");
    let busy = $state(false);
    let creating = $state(false);
    let errorMsg = $state("");

    let loadDocBusy = $state(false);
    // T02：生成前预览确认（docs/13 §4）——确认后才真正外发
    let previewOpen = $state(false);
    /** BU-36：打开预览时的分层预算报告（随打开时点计算一次；关闭即清） */
    let budgetPv = $state<BudgetPreview | null>(null);
    function openPreview() {
        previewOpen = true;
        budgetPv = previewBudget?.(source.trim(), { count, language, type: cardType }) ?? null;
    }
    // T02：来源分条查看原文（单开）
    let viewSrc = $state<string | null>(null);
    // T03：候选审核——来源依据折叠 + 逐卡卡面预览（单开）
    let sourceOpen = $state(false);
    let previewIdx = $state<number | null>(null);

    /** BU-8：发送前敏感扫描（预览打开时随材料响应式重算；命中只显示打码样本，处置权在用户） */
    let sensOverride = $state(false);
    let sensHits: SensitiveHit[] = $derived(previewOpen ? scanSensitive(source, parseTerms(sensitiveTerms)) : []);
    function parseTerms(raw: string): string[] {
        return (raw ?? "").split(/[,，;；]/).map(s => s.trim()).filter(Boolean);
    }
    function sensLabel(id: string): string {
        const dict = (t as any).aiSens as Record<string, string> | undefined;
        if (id.startsWith("custom:")) {
            return `${t.aiWizard.sensCustom}:${id.slice("custom:".length)}`;
        }
        return dict?.[id] ?? id;
    }
    /** 脱敏后继续：材料原地替换为脱敏文本（用户可在编辑区再核对），命中随之清零 */
    function maskAndContinue() {
        const r = maskSensitive(source, parseTerms(sensitiveTerms));
        source = r.masked;
        sensOverride = false;
    }

    /** BU-13/14 标签映射：维度/层级/说明/建议 i18n（缺键回退机器键，不阻塞显示） */
    function dimLabel(key: string): string {
        return (t.aiScore?.dim as any)?.[key] ?? key;
    }
    function levelLabel(level: string): string {
        return (t.aiScore?.level as any)?.[level] ?? level;
    }
    function noteText(noteKey?: string): string {
        if (!noteKey) { return ""; }
        return (t.aiScore?.note as any)?.[noteKey.replace("aiScore.note.", "")] ?? "";
    }
    function fixText(fixKey?: string): string {
        if (!fixKey) { return ""; }
        return (t.aiScore?.fix as any)?.[fixKey.replace("aiScore.fix.", "")] ?? "";
    }
    /** BU-14 因子标签（planReview factors 形如 "modelTrust:unknown"） */
    function factorLabel(factor: string): string {
        const key = factor.split(":")[0];
        return (t.aiReview?.factor as any)?.[key] ?? factor;
    }
    function planText(plan: ReviewPlan): string {
        const dict = t.aiReview?.plan as any;
        if (!dict) { return plan.decision; }
        if (plan.decision === "sample" && plan.sampleSize) {
            return dict.sample.replace("${n}", String(plan.sampleSize));
        }
        return dict[plan.decision] ?? plan.decision;
    }

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
                addSource(nbOptions.find((n) => n.id === nbId)?.name ?? t.aiWizard.loadNotebook, material, undefined, nbId);
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
                addSource(doc.name || t.aiWizard.loadDoc, doc.content, doc.docId);
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
                addSource(t.aiWizard.srcSelection, sel);
                errorMsg = "";
            } else {
                errorMsg = t.aiWizard.noSelection;
            }
        } catch {
            errorMsg = t.aiWizard.noSelection;
        }
    }

    /** 剪贴板导入（298）：粘贴字幕/讲义直通向导（权限拒绝时降级提示）；剪贴板来源=未验证（BU-14 审阅强度因子） */
    async function loadClipboard() {
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (text) {
                addSource(t.aiWizard.srcClipboard, text);
                sources[sources.length - 1] = { ...sources[sources.length - 1], unverified: true };
                sources = [...sources];
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
        // T02：预填材料（leech 改写联动）记入来源清单
        if (initialSource.trim()) {
            addSource(t.aiWizard.srcInitial, initialSource);
        }
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
        prov = []; // 新一轮生成：版本链重置（BU-15 会话内生命周期随生成批次）
        try {
            // BW-9：随请求携带来源 provenance（generate 侧判 deny 规则——UI 拦截不可绕过的硬门）
            const { cards, jobId, gen } = await generate(source.trim(), { count, language, type: cardType }, { signal: myCtrl.signal, provenance: provenance() });
            if (seq !== genSeq) {
                return; // 旧请求：候选与步骤不写回
            }
            if (cards.length === 0) {
                throw new Error(t.aiWizard.emptyResult);
            }
            candidates = cards.map((c, i) => ({ ...c, keep: true, origIndex: i, review: "pending" }));
            // BU-15：生成候选记 ai 版本（gen 缺失=旧宿主，不留痕不阻塞）
            if (gen) {
                cards.forEach((c, i) => recordAIVersion(i, c, gen));
            }
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
        recordUserVersion(i); // BU-15：重生前留痕当前文本（用户改过未接受也不丢）
        try {
            // 重生成仅替换候选内容：currentJobId 保持原绑定（下标对位不变；作业记录中该卡为旧文本，已知边界）
            const { cards, gen } = await generate(source.trim(), { count: 1, language, type: cardType }, { signal: myCtrl.signal, provenance: provenance() });
            if (seq !== genSeq) {
                return;
            }
            if (cards.length > 0) {
                const keep = candidates[i].keep;
                // 重生成仅替换内容：保持 origIndex 与作业 candidates 对位（内容为新生成，已知边界）
                candidates[i] = { ...cards[0], keep, origIndex: i, review: "pending" };
                candidates = [...candidates];
                if (gen) {
                    recordAIVersion(i, cards[0], gen); // BU-15：重生成记新 ai 版（链上可对比新旧）
                }
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
        // T03：入库口径 = 已选 + 已接受（待核实/未审不入库）
        const picked = candidates.filter(c => c.keep && c.review === "accepted");
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
            <!-- T02 完整工作面（docs/13 §4）：左=来源清单与载入，右=材料编辑与参数 -->
            <div class="lv-wb">
                <div class="lv-wb-side">
                    <div class="lv-eyebrow">{t.aiWizard.source}</div>
                    {#if loadCurrentDoc}
                        <button class="b3-button b3-button--small lv-wb-load" onclick={loadActiveDoc}>{t.aiWizard.loadDoc}</button>
                    {/if}
                    {#if loadNotebookMaterial}
                        <button class="b3-button b3-button--small lv-wb-load" onclick={loadNotebookContent}>{t.aiWizard.loadNotebook}</button>
                        <select class="b3-select lv-wb-load" bind:value={nbId}>
                            {#each nbOptions as n (n.id)}<option value={n.id}>{n.name}</option>{/each}
                        </select>
                    {/if}
                    <button class="b3-button b3-button--small lv-wb-load" onclick={loadSelection}>{t.aiWizard.loadSelection}</button>
                    <button class="b3-button b3-button--small lv-wb-load" onclick={loadClipboard}>{t.aiWizard.loadClipboard}</button>
                    {#if sources.length > 0}
                        <div class="lv-eyebrow" style="margin-top: 10px">{t.aiWizard.srcLedger}</div>
                        <div class="lv-wb-chips">
                            {#each sources as src (src.id)}
                                <div class="lv-wb-chip">
                                    <!-- T02：点标签查看该条原文（只读展开，不影响合并编辑） -->
                                    <button class="lv-wb-view" title={t.aiWizard.viewSource} onclick={() => (viewSrc = viewSrc === src.id ? null : src.id)}>{src.label} · {src.content.length}</button>
                                    <div class="fn__flex-1"></div>
                                    {#if src.docId && openDocById}
                                        <button class="b3-button b3-button--small" style="border: none; background: transparent; padding: 0 2px; min-height: auto" title={t.aiWizard.openSource} onclick={() => openDocById?.(src.docId!)}>📂</button>
                                    {/if}
                                    {#if (src.docId || src.nbId) && onDenySource}
                                        <!-- BW-9：一键登记禁止外发（落盘规则 + 移除该来源） -->
                                        <button class="b3-button b3-button--small" style="border: none; background: transparent; padding: 0 2px; min-height: auto" title={t.aiWizard.denySource} onclick={() => denySource(src)}>🚫</button>
                                    {/if}
                                    <button class="b3-button b3-button--small" style="border: none; background: transparent; padding: 0 2px; min-height: auto" title={t.aiWizard.srcRemove} onclick={() => removeSource(src.id)}>✕</button>
                                </div>
                                {#if viewSrc === src.id}
                                    <div class="ft__smaller" style="white-space: pre-wrap; max-height: 140px; overflow: auto; padding: 8px; border: 1px solid var(--lv-border); border-radius: 6px; margin: -2px 0 4px">{src.content}</div>
                                {/if}
                            {/each}
                        </div>
                    {/if}
                </div>
                <div class="lv-wb-main">
                    {#if source}
                        <!-- 材料可读可改：裁剪即编辑，生成以此处内容为准 -->
                        <textarea
                            class="b3-text-field fn__block"
                            rows="10"
                            bind:value={source}
                            placeholder={t.aiWizard.sourceEditHint}
                            style="font-size: 12px; line-height: 1.6"
                        ></textarea>
                        <div class="ft__smaller ft__on-surface" style="margin-top: 4px; display: flex; gap: 8px; align-items: center">
                            <span>{source.length} 字符 · ≈ {Math.ceil(source.length / 4)} tokens</span>
                            <div class="fn__flex-1"></div>
                            <button class="b3-button b3-button--small" onclick={() => (source = "")}>{t.aiWizard.sourceClear}</button>
                        </div>
                    {:else}
                        <div class="lv-hint" style="padding: 24px 0; text-align: center">{t.aiWizard.sourceEmptyHint}</div>
                    {/if}
                    <div class="fn__flex fn__flex-wrap" style="gap: var(--lv-sp-3); margin-top: var(--lv-sp-3); align-items: center">
                        <span class="ft__smaller ft__on-surface">{t.aiWizard.count}</span>
                        <select class="b3-select" style="max-width: 90px" bind:value={count}>
                            {#each [5, 10, 15, 20] as n (n)}<option value={n}>{n}</option>{/each}
                        </select>
                        <span class="ft__smaller ft__on-surface">{t.aiWizard.language}</span>
                        <select class="b3-select" style="max-width: 140px" bind:value={language}>
                            <option value="中文">中文</option>
                            <option value="English">English</option>
                        </select>
                        <span class="ft__smaller ft__on-surface">{t.aiWizard.cardType}</span>
                        <select class="b3-select" style="max-width: 140px" bind:value={cardType}>
                            <option value="qa">{t.aiWizard.typeQa}</option>
                            <option value="cloze">{t.aiWizard.typeCloze}</option>
                        </select>
                    </div>
                </div>
            </div>
            {#if errorMsg}
                <div class="ft__smaller" style="color: var(--b3-theme-error); margin-bottom: var(--lv-sp-2)">{errorMsg}</div>
            {/if}
            {#if previewOpen}
                <!-- T02 AI 请求预览（docs/13 §4）：实际片段/参数/估算 → 确认后才发送 -->
                <div class="lv-notice" style="display: flex; flex-direction: column; gap: 6px">
                    <div class="lv-eyebrow">{t.aiWizard.previewTitle}</div>
                    <div class="ft__smaller" style="max-height: 120px; overflow: auto; white-space: pre-wrap">{source.trim().slice(0, 600)}{source.trim().length > 600 ? "…" : ""}</div>
                    <div class="ft__smaller ft__on-surface">
                        {t.aiWizard.previewParams.replace("${n}", String(count)).replace("${lang}", language).replace("${type}", cardType === "qa" ? t.aiWizard.typeQa : t.aiWizard.typeCloze)}
                        · ≈ {Math.ceil(source.trim().length / 4)} tokens {t.aiWizard.previewTokens}
                    </div>
                    <div class="ft__smaller ft__on-surface">{t.aiWizard.previewEndpoint}</div>
                    {#if budgetPv}
                        <!-- BU-36：上下文包分层预览（发送前可见截断与预算来源，不静默裁剪） -->
                        <div style="border: 1px solid var(--lv-border); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px">
                            <div class="lv-eyebrow">{t.aiWizard.budgetTitle} · {budgetPv.totalTokens}/{budgetPv.budgetTokens}</div>
                            {#each budgetPv.layers as layer (layer.key)}
                                <div class="fn__flex ft__smaller" style="gap: 8px; align-items: baseline">
                                    <span style="min-width: 72px">{layer.key === "system" ? t.aiWizard.budgetSystem : t.aiWizard.budgetMaterial}</span>
                                    <span class="ft__on-surface">{layer.tokens}</span>
                                    {#if layer.truncated || layer.dropped}
                                        <span style="color: var(--b3-theme-warning)">{layer.dropped ? t.aiWizard.budgetDropped : t.aiWizard.budgetTruncated}</span>
                                    {/if}
                                </div>
                            {/each}
                            <div class="ft__smaller ft__on-surface">
                                {budgetPv.budgetSource === "model-registry"
                                    ? t.aiWizard.budgetFromRegistry.replace("${m}", budgetPv.modelId ?? "")
                                    : t.aiWizard.budgetFromDefault}
                            </div>
                            {#if budgetPv.needsBatching}
                                <div class="ft__smaller" style="color: var(--b3-theme-error)">{t.aiTooLong}</div>
                            {/if}
                        </div>
                    {/if}
                    {#if sensHits.length > 0 && !sensOverride}
                        <!-- BU-8：发送前敏感扫描——命中打码样本展示，处置权在用户 -->
                        <div style="border: 1px solid var(--b3-theme-warning); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px">
                            <div class="ft__smaller" style="font-weight: 600">{t.aiWizard.sensTitle}</div>
                            <div class="fn__flex fn__flex-wrap" style="gap: 6px">
                                {#each sensHits as h (h.id)}
                                    <span class="ft__smaller" style="border: 1px solid var(--lv-border); border-radius: 4px; padding: 1px 6px">{sensLabel(h.id)} ×{h.count}（{h.sample}）</span>
                                {/each}
                            </div>
                            <div class="ft__smaller ft__on-surface">{t.aiWizard.sensNote}</div>
                            <div class="fn__flex" style="gap: var(--lv-sp-2); justify-content: flex-end">
                                <button class="b3-button b3-button--small" onclick={maskAndContinue}>{t.aiWizard.sensMask}</button>
                                <button class="b3-button b3-button--small" onclick={() => (sensOverride = true)}>{t.aiWizard.sensOverride}</button>
                            </div>
                        </div>
                    {/if}
                    <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2)">
                        <button class="b3-button b3-button--small" onclick={() => { previewOpen = false; sensOverride = false; }}>{t.aiWizard.previewBack}</button>
                        <button class="b3-button lv-btn-primary" disabled={busy || (sensHits.length > 0 && !sensOverride)} onclick={() => { previewOpen = false; sensOverride = false; run(); }}>
                            {busy ? t.aiWizard.generating : t.aiWizard.previewConfirm}
                        </button>
                    </div>
                </div>
            {/if}
            <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2)">
                <button class="b3-button b3-button--cancel" onclick={closeWizard}>{window.siyuan.languages.cancel}</button>
                <div class="fn__space"></div>
                <button class="b3-button b3-button--text lv-btn-primary" disabled={busy || !source.trim()} onclick={openPreview}>
                    {busy ? t.aiWizard.generating : `${t.aiWizard.generate} →`}
                </button>
            </div>
        </div>
    {:else}
        <div transition:fade={{ duration: 160 }}>
            <div class="fn__flex" style="align-items: center; gap: var(--lv-sp-2); margin-bottom: var(--lv-sp-2)">
                <button class="b3-button b3-button--small" onclick={() => (step = 1)}>← {t.aiWizard.back}</button>
                <!-- T03：已选≠已审——选中决定集合，接受决定入库资格 -->
                <LvChip tone="default">{t.aiWizard.selCount.replace("${n}", String(candidates.filter(c => c.keep).length))}</LvChip>
                <LvChip tone="primary">{t.aiWizard.accCount.replace("${n}", String(acceptedCount))}</LvChip>
                <div class="fn__flex-1"></div>
                <button class="b3-button b3-button--small" onclick={acceptAll}>{t.aiWizard.acceptAll}</button>
                <!-- T03：来源依据折叠（审核时可对照，不离开本屏） -->
                <button class="b3-button b3-button--small" onclick={() => (sourceOpen = !sourceOpen)}>{t.aiWizard.sourceFold} {sourceOpen ? "▴" : "▾"}</button>
            </div>
            {#if reviewPlan}
                <!-- BU-14 审阅计划：按因子就高不就低；建议性横幅，不代审不阻断（block 档在制卡任务不会出现） -->
                <div class="lv-notice" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: var(--lv-sp-2); padding: 6px 10px">
                    <span class="ft__smaller" style="font-weight: 600">{planText(reviewPlan)}</span>
                    {#each reviewPlan.factors as f (f)}
                        <span class="ft__smaller" style="border: 1px solid var(--lv-border); border-radius: 4px; padding: 0 6px">{factorLabel(f)}</span>
                    {/each}
                    {#if reviewPlan.decision === "sample" && reviewPlan.sampleSize}
                        <span class="ft__smaller ft__on-surface">{t.aiReview.sampleHint}</span>
                    {/if}
                </div>
            {/if}
            {#if sourceOpen}
                <div class="lv-card2" style="margin-bottom: var(--lv-sp-2)">
                    <div class="lv-eyebrow">{t.aiWizard.sourceFold}</div>
                    <div class="ft__smaller" style="max-height: 160px; overflow: auto; white-space: pre-wrap; margin-top: 6px">{source}</div>
                </div>
            {/if}
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
                                <LvChip tone="warn">{warn === "duplicate" ? t.aiWizard.lintDup : warn === "overlong" ? t.aiWizard.lintLong : warn === "tooshort" ? t.aiWizard.lintShort : warn}</LvChip>
                            {/each}
                            {#each scorecards[i]?.dimensions ?? [] as dim (dim.key)}
                                {#if dim.score >= 1 && dim.key !== "cognitive" && dim.key !== "difficulty"}
                                    <!-- BU-13：问题维度 chip（1=提示 warn / 2=问题 error），点「卡面预览」看说明与建议 -->
                                    <LvChip tone={dim.score >= 2 ? "error" : "warn"}>{dimLabel(dim.key)} · {dim.score}</LvChip>
                                {/if}
                            {/each}
                            <div class="fn__flex-1"></div>
                            {#if c.review === "accepted"}<LvChip tone="primary">{t.aiWizard.reviewAccepted}</LvChip>{:else if c.review === "verified"}<LvChip tone="warn">{t.aiWizard.reviewVerified}</LvChip>{/if}
                            <button class="b3-button b3-button--small" title={t.aiWizard.cardPreview} onclick={() => (previewIdx = previewIdx === i ? null : i)}>{t.aiWizard.cardPreview}</button>
                            <button class="b3-button b3-button--small" title={t.aiWizard.regenerate} disabled={regenBusy === i} onclick={() => regenerateCard(i)}>↻</button>
                            <button class="b3-button b3-button--small" onclick={() => (candidates = candidates.filter((_, j) => j !== i))}>✕</button>
                        </label>
                        <textarea class="b3-text-field fn__block" rows="2" bind:value={c.q} oninput={() => touchCandidate(i)} placeholder={t.quickCardQ}></textarea>
                        <textarea class="b3-text-field fn__block" rows="2" bind:value={c.a} oninput={() => touchCandidate(i)} placeholder={t.quickCardA}></textarea>
                        <div class="fn__flex" style="gap: 6px; margin-top: 6px">
                            <button class="b3-button b3-button--small {c.review === 'accepted' ? 'lv-btn-primary' : ''}" onclick={() => setReview(i, "accepted")}>{c.review === "accepted" ? t.aiWizard.reviewAccepted : t.aiWizard.acceptVer}</button>
                            <button class="b3-button b3-button--small {c.review === 'verified' ? 'lv-btn-primary' : ''}" onclick={() => setReview(i, "verified")}>{t.aiWizard.markVerified}</button>
                            <div class="fn__flex-1"></div>
                            <button class="b3-button b3-button--small" title={t.aiWizard.cardPreview} onclick={() => (previewIdx = previewIdx === i ? null : i)}>{t.aiWizard.cardPreview}</button>
                        </div>
                        {#if previewIdx === i}
                            <!-- T03：实际卡面预览（评审稿 .study-card/.study-answer 同构；随编辑实时更新） -->
                            <div class="lv-card2" style="padding: 18px 20px; margin-top: 8px">
                                <div class="lv-eyebrow">{t.aiWizard.previewQLabel}</div>
                                <div style="font-weight: 650; margin: 8px 0; line-height: 1.65">{c.q || "—"}</div>
                                <div style="border-top: 1px solid var(--lv-border); padding-top: 12px; margin-top: 12px">
                                    <div class="lv-eyebrow">{t.aiWizard.previewALabel}</div>
                                    <div style="margin-top: 6px; line-height: 1.65">{c.a || "—"}</div>
                                </div>
                                {#if scorecards[i]}
                                    <!-- BU-13：八维度评分卡（可解释问题 + 修复建议；综合分仅审阅提示，不入库资格由「已接受」决定） -->
                                    <div style="border-top: 1px solid var(--lv-border); padding-top: 12px; margin-top: 12px">
                                        <div class="lv-eyebrow">{t.aiScore.title} · {scorecards[i].composite}</div>
                                        <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px">
                                            {#each scorecards[i].dimensions as dim (dim.key)}
                                                <div class="fn__flex" style="gap: 8px; align-items: baseline">
                                                    <span class="ft__smaller" style="min-width: 88px">{dimLabel(dim.key)}</span>
                                                    {#if dim.level}
                                                        <LvChip tone="default">{levelLabel(dim.level)}</LvChip>
                                                    {/if}
                                                    {#if dim.score > 0}
                                                        <span class="ft__smaller" style="color: var(--b3-theme-warning)">{noteText(dim.noteKey)}</span>
                                                    {/if}
                                                    {#if dim.suggestKey}
                                                        <span class="ft__smaller ft__on-surface">{fixText(dim.suggestKey)}</span>
                                                    {/if}
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                                {#if (prov[i]?.versions.length ?? 0) > 0}
                                    <!-- BU-15：版本链（ai 生成/user 编辑双轨；回到任意历史版本） -->
                                    <div style="border-top: 1px solid var(--lv-border); padding-top: 12px; margin-top: 12px">
                                        <div class="lv-eyebrow">{t.aiScore.versions} · {prov[i].versions.length}</div>
                                        <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px">
                                            {#each [...prov[i].versions].reverse() as v, vi (prov[i].versions.length - 1 - vi)}
                                                <div class="fn__flex" style="gap: 8px; align-items: center">
                                                    <LvChip tone={v.via === "ai" ? "default" : "primary"}>{v.via === "ai" ? t.aiScore.viaAI : t.aiScore.viaUser}</LvChip>
                                                    <span class="ft__smaller" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{(v.via === "ai" ? "⚙ " : "✎ ") + v.q.slice(0, 40)}</span>
                                                    {#if v.q !== c.q || v.a !== c.a}
                                                        <button class="b3-button b3-button--small" onclick={() => restoreVersion(prov[i].versions.length - 1 - vi, v)}>{t.aiScore.restore}</button>
                                                    {/if}
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}
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
                <button class="b3-button b3-button--text lv-btn-primary" disabled={creating || acceptedCount === 0} onclick={importCards} title={t.aiWizard.importReviewed}>
                    {creating ? "…" : `${t.aiWizard.import} (${acceptedCount})`}
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

    /* T02 完整工作面（docs/13 §4）：左=来源清单与载入，右=材料编辑与参数 */
    .lv-wb {
        display: grid;
        grid-template-columns: 230px minmax(0, 1fr);
        gap: var(--lv-sp-4);
        margin-bottom: var(--lv-sp-3);
        @media (max-width: 740px) { grid-template-columns: 1fr; }
    }
    .lv-wb-side { display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
    .lv-wb-side .lv-wb-load { width: 100%; text-align: left; }
    .lv-wb-chips { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
    .lv-wb-chip {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        padding: 3px 6px;
        border: 1px solid var(--lv-border);
        border-radius: 6px;
        background: color-mix(in srgb, var(--b3-theme-on-background) 4%, transparent);
    }
    /* T02：来源条目标签 = 查看原文按钮 */    .lv-wb-view {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: left;
        border: none;
        background: transparent;
        color: inherit;
        font: inherit;
        padding: 0;
        cursor: pointer;
        &:hover { color: var(--b3-theme-primary); }
    }
</style>
