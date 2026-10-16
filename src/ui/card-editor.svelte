<script lang="ts">
    /** BX-2 W2（v0.162.0）：卡片人工编辑 + 写前差异预览（Kit 级，props 注入可测）。
     * 单字段=块 markdown 整体（三字段级 diff 待字段↔块映射设计定稿后接入 BX-9）。
     * 验收硬性要求：差异先于写入可见；取消/拒绝保留原卡；纯前端流转，不产生评分/外发。 */
    import { charDiff } from "@/core/field-diff";

    let { t, original, onsave, oncancel }: {
        t: any;
        /** 原始块内容（markdown） */
        original: string;
        /** 保存回调（宿主 updateBlock）；resolve(false)=保存失败，面板保持打开可重试 */
        onsave: (md: string) => Promise<boolean | string>;
        oncancel: () => void;
    } = $props();

    // svelte-ignore state_referenced_locally -- 编辑器以打开时的原文为基准（对比锚点刻意固化）；切换详情块时组件随 drawer 重建
    let text = $state(original);
    let saving = $state(false);
    let errMsg = $state("");
    // 差异重算防抖（AQ-548 同款 200ms）：长文输入不逐键跑 diff
    // svelte-ignore state_referenced_locally -- 同上：diff 基准=打开时原文
    let deferred = $state(original);
    let timer: ReturnType<typeof setTimeout> | null = null;
    $effect(() => {
        text;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { deferred = text; }, 200);
        return () => { if (timer) clearTimeout(timer); };
    });

    const segments = $derived(charDiff(original, deferred));
    const changed = $derived(deferred !== original);

    async function save() {
        if (!changed || saving) return;
        saving = true;
        errMsg = "";
        try {
            const ok = await onsave(text);
            if (typeof ok === "string") errMsg = ok;
            else if (!ok) errMsg = t.editor.saveFail;
        } catch (error) {
            // 宿主写入回调可能直接抛出网络/内核错误；保持编辑现场并给出可重试的同一保存入口。
            const reason = error instanceof Error ? error.message : String(error);
            errMsg = reason ? `${t.editor.saveFail}：${reason}` : t.editor.saveFail;
        } finally {
            saving = false;
        }
    }
</script>

<section class="lv-editor" aria-label={t.editor.title}>
    <div class="lv-editor-head ft__smaller ft__on-surface">{t.editor.title}</div>
    <textarea
        class="b3-text-field lv-editor-input"
        bind:value={text}
        aria-label={t.editor.inputLabel}
        rows={4}
        disabled={saving}
    ></textarea>
    <div class="lv-editor-diff" aria-label={t.editor.diffLabel}>
        {#if !changed}
            <span class="ft__smaller ft__on-surface">{t.editor.noChange}</span>
        {:else}
            {#each segments as seg, i (i)}
                {#if seg.kind === "same"}<span>{seg.text}</span>
                {:else if seg.kind === "del"}<del class="lv-editor-del">{seg.text}</del>
                {:else}<ins class="lv-editor-add">{seg.text}</ins>
                {/if}
            {/each}
        {/if}
    </div>
    {#if errMsg}<div class="lv-editor-err ft__smaller">{errMsg}</div>{/if}
    <div class="lv-editor-actions">
        <button class="b3-button b3-button--text b3-button--small" disabled={!changed || saving} onclick={save}>
            {saving ? t.editor.saving : t.editor.save}
        </button>
        <button class="b3-button b3-button--small" onclick={oncancel}>{t.editor.cancel}</button>
        <span class="ft__smaller ft__on-surface lv-editor-hint">{t.editor.hint}</span>
    </div>
</section>

<style>
    .lv-editor {
        display: flex;
        flex-direction: column;
        gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-4);
        padding: var(--lv-sp-3);
        border: 1px solid var(--b3-border-color);
        border-radius: var(--lv-r-m);
    }
    .lv-editor-input {
        width: 100%;
        resize: vertical;
        font-size: var(--lv-type-body-size);
    }
    .lv-editor-diff {
        max-height: 160px;
        overflow: auto;
        padding: var(--lv-sp-2);
        background: var(--lv-color-canvas);
        border-radius: var(--lv-r-s);
        font-size: var(--lv-type-body-size);
        white-space: pre-wrap;
        word-break: break-word;
    }
    .lv-editor-del { color: var(--lv-color-danger); text-decoration: line-through; }
    .lv-editor-add {
        color: var(--lv-color-success);
        text-decoration: none;
        background: color-mix(in srgb, var(--lv-color-success) 12%, transparent);
        border-radius: var(--lv-r-track);
    }
    .lv-editor-err { color: var(--lv-color-danger); }
    .lv-editor-actions {
        display: flex;
        align-items: center;
        gap: var(--lv-sp-2);
    }
    .lv-editor-hint { flex: 1; text-align: right; }
    @media (max-width: 320px) {
        .lv-editor-actions { flex-wrap: wrap; }
        .lv-editor-hint { text-align: left; }
    }
</style>
