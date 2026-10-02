<script lang="ts">
    import { onMount } from "svelte";
    import { getBlockDOM, setBlockAttrs } from "@/api/siyuan";
    import { emptyOcclusion, serializeOcclusion, type OcclusionRect } from "@/core/occlusion";

    let { blockID, i18n, onSave, onClose }: {
        blockID: string;
        i18n: any;
        /** AR-2：支持 Promise——入组成功才关闭，失败保留已画的遮挡 */
        onSave: () => void | Promise<void>;
        onClose: () => void;
    } = $props();
    const t = $derived(i18n);

    let preview: HTMLDivElement | null = $state(null);
    let overlay: SVGSVGElement | null = $state(null);
    let rects = $state<OcclusionRect[]>([]);
    let drawing = $state<OcclusionRect | null>(null);
    let errorMsg = $state("");
    let busy = $state(false);

    function svgPoint(e: MouseEvent): { x: number; y: number } | null {
        if (!overlay) return null;
        const box = overlay.getBoundingClientRect();
        const x = (e.clientX - box.left) / box.width;
        const y = (e.clientY - box.top) / box.height;
        return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    }

    function onDown(e: MouseEvent) {
        if (!overlay) return;
        const p = svgPoint(e);
        if (!p) return;
        drawing = { x: p.x, y: p.y, w: 0, h: 0 };
        const move = (ev: MouseEvent) => {
            const q = svgPoint(ev);
            if (!q || !drawing) return;
            drawing = { ...drawing, w: q.x - drawing.x, h: q.y - drawing.y };
        };
        const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            if (drawing && Math.abs(drawing.w) > 0.01 && Math.abs(drawing.h) > 0.01) {
                const r = drawing;
                rects = [...rects, {
                    x: Math.min(r.x, r.x + r.w),
                    y: Math.min(r.y, r.y + r.h),
                    w: Math.abs(r.w),
                    h: Math.abs(r.h),
                }];
            }
            drawing = null;
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
    }

    onMount(async () => {
        try {
            // AQ-20：统一内核响应校验，非 0/缺字段直接进错误态
            const dom = await getBlockDOM(blockID);
            if (preview) {
                preview.innerHTML = dom;
                const img = preview.querySelector("img");
                if (!img) {
                    errorMsg = t.occlusionNoImage;
                    return;
                }
                positionOverlay();
                // 图片加载完成后尺寸才稳定，再校一次；窗口缩放同步
                img.addEventListener("load", positionOverlay);
                window.addEventListener("resize", positionOverlay);
            }
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        }
    });

    function positionOverlay() {
        if (!preview || !overlay) return;
        const img = preview.querySelector("img");
        if (!img) return;
        const box = {
            left: img.offsetLeft,
            top: img.offsetTop,
            width: img.offsetWidth,
            height: img.offsetHeight,
        };
        // 坐标相对图片包围盒：覆盖层精确贴在图片上
        overlay.style.left = `${box.left}px`;
        overlay.style.top = `${box.top}px`;
        overlay.style.width = `${box.width}px`;
        overlay.style.height = `${box.height}px`;
    }

    async function save() {
        if (busy || rects.length === 0) return;
        busy = true;
        try {
            const data = emptyOcclusion();
            data.rects = rects;
            await setBlockAttrs(blockID, serializeOcclusion(data));
            await onSave();
            onClose();
        } catch (e: any) {
            errorMsg = e?.message ?? String(e);
        } finally {
            busy = false;
        }
    }
</script>

<div class="lv-occed b3-typography">
    <div class="lv-ob-head">
        <span class="lv-ob-step">{t.occlusion.title}</span>
        <span class="ft__smaller ft__on-surface">{t.occlusion.drawHint}</span>
        <div class="fn__flex-1"></div>
        <button class="b3-button b3-button--small" onclick={() => (rects = rects.slice(0, -1))} disabled={rects.length === 0}>{t.occlusion.undo}</button>
        <button class="b3-button b3-button--small" onclick={() => (rects = [])} disabled={rects.length === 0}>{t.occlusion.clear}</button>
    </div>
    {#if errorMsg}
        <div class="ft__smaller" style="color: var(--b3-theme-error); margin-bottom: var(--lv-sp-2)">{errorMsg}</div>
    {/if}
    <div class="lv-occed-stage lv-card2" bind:this={preview}>
        {#if overlay}
            <!-- 绘图画布：框选本质是指针交互（拖动画框），键盘替代为撤销/清空按钮 -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <svg
                bind:this={overlay}
                class="lv-occed-overlay"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                role="img"
                aria-label={t.occlusion.editorAria}
                onmousedown={onDown}
            >                {#each rects as r, i (i)}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <rect x={r.x * 100} y={r.y * 100} width={r.w * 100} height={r.h * 100}
                        fill="var(--b3-theme-primary)" opacity="0.45"
                        ondblclick={() => (rects = rects.filter((_, j) => j !== i))} />
                {/each}
                {#if drawing}
                    <rect
                        x={Math.min(drawing.x, drawing.x + drawing.w) * 100}
                        y={Math.min(drawing.y, drawing.y + drawing.h) * 100}
                        width={Math.abs(drawing.w) * 100}
                        height={Math.abs(drawing.h) * 100}
                        fill="var(--b3-theme-primary)" opacity="0.3"
                        stroke="var(--b3-theme-primary)" stroke-width="0.4" />
                {/if}
            </svg>
        {/if}
    </div>
    <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-3)">
        <button class="b3-button b3-button--cancel" onclick={onClose}>{window.siyuan.languages.cancel}</button>
        <div class="fn__space"></div>
        <button class="b3-button b3-button--text lv-btn-primary" disabled={busy || rects.length === 0} onclick={save}>
            {t.occlusion.save} ({rects.length})
        </button>
    </div>
</div>

<style>
    .lv-occed { padding: var(--lv-sp-4); }
    .lv-occed .lv-ob-head {
        display: flex; align-items: center; gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-occed .lv-ob-step { font-weight: 700; }
    .lv-occed-stage {
        position: relative;
        width: 100%;
        max-width: 700px;
        margin: 0 auto;
        overflow: auto;
        min-height: 120px;
        user-select: none;
    }
    .lv-occed-overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        cursor: crosshair;
    }
</style>
