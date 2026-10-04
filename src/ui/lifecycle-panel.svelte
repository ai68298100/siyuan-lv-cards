<script lang="ts">
    /** BI-5/6/7 内容状态面板（Kit 级，props 注入可测）：当前状态 + 为什么解释（BI-7）+
     *  下一动作建议（BI-6，可跳过不自动执行）+ 状态流转（转移必带原因，BI-5）+ 轨迹。
     *  快照与持久化由宿主注入；建议动作经 onaction 由宿主映射到真实入口。 */
    import { CONTENT_TRANSITIONS, type ContentState } from "@/core/content-lifecycle";
    import { nextActions, type NextAction } from "@/core/next-action";
    import { explainState } from "@/core/state-explain";
    import LvChip from "./kit/LvChip.svelte";

    export interface LcSnapshot {
        state: ContentState;
        history: { from: ContentState; to: ContentState; reason: string; at: number }[];
    }

    let { t, snapshot, onopen, ontransition, onaction }: {
        t: any;
        /** null=尚未开档（宿主按需创建，浏览不隐式建档） */
        snapshot: LcSnapshot | null;
        onopen: () => void;
        ontransition: (to: ContentState, reason: string) => boolean;
        /** BI-6 建议动作派发（宿主映射到真实入口；建议可跳过） */
        onaction: (action: NextAction) => void;
    } = $props();

    /** i18n 点路径取值（"stateWhy.source" → t.stateWhy.source；嵌套对象统一走这里） */
    function tv(path: string): string {
        const v = path.split(".").reduce<any>((o, k) => o?.[k], t);
        return typeof v === "string" ? v : path;
    }

    const state = $derived(snapshot?.state ?? null);
    const explain = $derived(state ? explainState(state) : null);
    const suggestions = $derived(state ? nextActions(state) : []);
    const targets = $derived(state ? CONTENT_TRANSITIONS[state] : []);
    const historyNewestFirst = $derived(snapshot ? [...snapshot.history].reverse() : []);

    /** BI-7 修复动作派发：resume/unarchive 是生命周期转移，其余走宿主动作映射 */
    function onRepair() {
        if (!state || !explain?.repair) return;
        if (explain.repair === "resume") {
            ontransition("inReview", t.lc.reason.resume);
        } else if (explain.repair === "unarchive") {
            ontransition("source", t.lc.reason.source);
        } else {
            onaction(explain.repair as NextAction);
        }
    }
</script>

<section class="lv-lc">
    <h4>{t.lc.title}</h4>
    {#if !snapshot}
        <p class="lv-lc-hint ft__smaller ft__on-surface">{t.lc.hint}</p>
        <button class="b3-button b3-button--small" onclick={onopen}>{t.lc.open}</button>
    {:else}
        <div class="lv-lc-now">
            <LvChip tone="primary">{t.lc.state[state!]}</LvChip>
            {#if explain}
                <span class="lv-lc-why ft__smaller ft__on-surface">{tv(explain.whyKey)}</span>
                <button class="b3-button b3-button--text b3-button--small" onclick={onRepair}>{tv(explain.repairLabelKey!)}</button>
            {/if}
        </div>
        <div class="lv-lc-next">
            <div class="ft__smaller ft__on-surface">{t.lc.next}</div>
            <div class="lv-lc-actions">
                {#each suggestions as s (s.action)}
                    <button class="b3-button b3-button--small" onclick={() => onaction(s.action)}>{tv(s.labelKey)}</button>
                {/each}
            </div>
        </div>
        {#if targets.length > 0}
            <div class="lv-lc-flow">
                <div class="ft__smaller ft__on-surface">{t.lc.flow}</div>
                <div class="lv-lc-actions">
                    {#each targets as to (to)}
                        <button class="b3-button b3-button--small" onclick={() => ontransition(to, t.lc.reason[to])}>
                            {t.lc.state[to]}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
        <div class="lv-lc-history">
            <div class="ft__smaller ft__on-surface">{t.lc.history}</div>
            {#if historyNewestFirst.length === 0}
                <p class="ft__smaller ft__on-surface">{t.lc.historyEmpty}</p>
            {:else}
                <ul>
                    {#each historyNewestFirst as h}
                        <li class="ft__smaller">
                            {t.lc.state[h.from]} → {t.lc.state[h.to]} · {h.reason} · {new Date(h.at).toLocaleString()}
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/if}
</section>

<style>
    .lv-lc { margin-bottom: var(--lv-sp-4); }
    .lv-lc h4 { margin: 0 0 var(--lv-sp-2); }
    .lv-lc-hint { margin: 0 0 var(--lv-sp-2); }
    .lv-lc-now { display: flex; align-items: center; gap: var(--lv-sp-2); flex-wrap: wrap; margin-bottom: var(--lv-sp-2); }
    .lv-lc-why { flex: 1 1 auto; min-width: 0; }
    .lv-lc-next, .lv-lc-flow, .lv-lc-history { margin-bottom: var(--lv-sp-2); }
    .lv-lc-actions { display: flex; flex-wrap: wrap; gap: var(--lv-sp-1); margin-top: var(--lv-sp-1); }
    .lv-lc-history ul { margin: var(--lv-sp-1) 0 0; padding-left: 18px; }
    @media (max-width: 320px) {
        .lv-lc-now { flex-direction: column; align-items: flex-start; }
    }
</style>
