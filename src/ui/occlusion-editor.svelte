<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { getBlockDOM, setBlockAttrs } from "@/api/siyuan";
    import { rafThrottle } from "@/libs/throttle";
    import { emptyOcclusion, serializeOcclusion, type OcclusionRect } from "@/core/occlusion";
    import LvKbd from "./kit/LvKbd.svelte";
    import LvIcon from "./kit/LvIcon.svelte";

    let { blockID, i18n, onSave, onClose }: {
        blockID: string;
        i18n: any;
        /** AR-2：支持 Promise——入组成功才关闭，失败保留已画的遮挡 */
        onSave: () => void | Promise<void>;
        onClose: () => void;
    } = $props();
    const t = $derived(i18n);

    let preview: HTMLDivElement | null = $state(null);
    let content: HTMLDivElement | null = $state(null);
    let overlay: SVGSVGElement | null = $state(null);
    let rects = $state<OcclusionRect[]>([]);
    let drawing = $state<OcclusionRect | null>(null);
    let errorMsg = $state("");
    let loading = $state(true);
    let busy = $state(false);
    let disposed = false;
    let loadSeq = 0;
    let image: HTMLImageElement | null = null;
    let activePointerId: number | null = null;
    let cachedOverlayBox: DOMRect | null = null;

    function positionOverlay() {
        if (disposed || !preview || !overlay) return;
        const img = content?.querySelector("img");
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

    const throttledPositionOverlay = rafThrottle(() => {
        positionOverlay();
    });

    function svgPoint(e: PointerEvent): { x: number; y: number } | null {
        if (!overlay) return null;
        const box = cachedOverlayBox ?? overlay.getBoundingClientRect();
        const x = (e.clientX - box.left) / box.width;
        const y = (e.clientY - box.top) / box.height;
        return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    }

    const throttledMoveUpdate = rafThrottle((q: { x: number; y: number }) => {
        if (disposed || !drawing) return;
        drawing = { ...drawing, w: q.x - drawing.x, h: q.y - drawing.y };
    });

    function onMove(e: PointerEvent) {
        if (e.pointerId !== activePointerId || !drawing) return;
        const q = svgPoint(e);
        if (!q) return;
        throttledMoveUpdate(q);
    }

    function finishDrawing(e: PointerEvent, commit: boolean) {
        if (e.pointerId !== activePointerId) return;
        throttledMoveUpdate.flush();
        cachedOverlayBox = null;
        activePointerId = null;
        if (commit && drawing && Math.abs(drawing.w) > 0.01 && Math.abs(drawing.h) > 0.01) {
            const r = drawing;
            rects = [...rects, {
                x: Math.min(r.x, r.x + r.w),
                y: Math.min(r.y, r.y + r.h),
                w: Math.abs(r.w),
                h: Math.abs(r.h),
            }];
        }
        drawing = null;
    }

    function onPointerUp(e: PointerEvent) {
        finishDrawing(e, true);
    }

    function onPointerCancel(e: PointerEvent) {
        finishDrawing(e, false);
    }

    function onDown(e: PointerEvent) {
        if (!overlay || activePointerId !== null) return;
        cachedOverlayBox = overlay.getBoundingClientRect();
        const p = svgPoint(e);
        if (!p) return;
        e.preventDefault();
        activePointerId = e.pointerId;
        drawing = { x: p.x, y: p.y, w: 0, h: 0 };
    }

    async function loadPreview() {
        const seq = ++loadSeq;
        loading = true;
        errorMsg = "";
        if (image) image.removeEventListener("load", throttledPositionOverlay);
        window.removeEventListener("resize", throttledPositionOverlay);
        image = null;
        if (content) content.innerHTML = "";
        try {
            // AQ-20：统一内核响应校验，非 0/缺字段直接进错误态
            const dom = await getBlockDOM(blockID);
            if (disposed || seq !== loadSeq) return;
            if (content) {
                content.innerHTML = dom;
                image = content.querySelector("img");
                if (!image) {
                    errorMsg = t.occlusion?.noImage ?? t.occlusionNoImage ?? "块内没有图片";
                    loading = false;
                    return;
                }
                // 宿主块 HTML 通常只有源尺寸，没有宽高属性；读取后先声明固有比例，
                // 避免图片解码前占位高度为 0 导致遮挡画布跳动。
                if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
                    image.width = image.naturalWidth;
                    image.height = image.naturalHeight;
                } else {
                    image.addEventListener("load", () => {
                        if (image?.naturalWidth && image.naturalHeight) {
                            image.width = image.naturalWidth;
                            image.height = image.naturalHeight;
                            positionOverlay();
                        }
                    }, { once: true });
                }
                positionOverlay();
                // 图片加载完成后尺寸才稳定，再校一次；窗口缩放经帧率节流同步
                image.addEventListener("load", throttledPositionOverlay);
                window.addEventListener("resize", throttledPositionOverlay);
            }
        } catch (e: any) {
            if (!disposed && seq === loadSeq) errorMsg = e?.message ?? String(e);
        } finally {
            if (!disposed && seq === loadSeq) loading = false;
        }
    }

    onMount(loadPreview);

    onMount(() => {
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerCancel);
        };
    });

    onDestroy(() => {
        disposed = true;
        activePointerId = null;
        drawing = null;
        cachedOverlayBox = null;
        throttledMoveUpdate.cancel();
        throttledPositionOverlay.cancel();
        if (image) {
            image.removeEventListener("load", throttledPositionOverlay);
            image = null;
        }
        window.removeEventListener("resize", throttledPositionOverlay);
    });

    async function save() {
        if (busy || loading || errorMsg || rects.length === 0) return;
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

    function clearRects() {
        if (rects.length === 0) return;
        if (window.confirm(t.occlusion.clearConfirm ?? "确定清空已绘制的遮挡区域吗？")) rects = [];
    }

    function removeRect(index: number) {
        if (!window.confirm(t.occlusion.removeConfirm ?? "确定删除这个遮挡区域吗？")) return;
        rects = rects.filter((_, j) => j !== index);
    }

    function close() {
        if (busy) return;
        if (rects.length > 0 && !window.confirm(t.occlusion.discardConfirm ?? "已绘制的遮挡区域尚未保存，确定退出吗？")) return;
        onClose();
    }

    const isMac = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");

    function onKeydown(e: KeyboardEvent) {
        if (busy) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
            if (rects.length > 0) {
                e.preventDefault();
                rects = rects.slice(0, -1);
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            if (rects.length > 0 && !loading && !errorMsg) {
                e.preventDefault();
                void save();
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="lv-occed b3-typography">
    <div class="lv-ob-head">
        <span class="lv-ob-step">{t.occlusion.title}</span>
        <span class="ft__smaller ft__on-surface">{t.occlusion.drawHint}</span>
        <div class="fn__flex-1"></div>
        <button class="b3-button b3-button--small" onclick={() => (rects = rects.slice(0, -1))} disabled={rects.length === 0}>{t.occlusion.undo}</button>
        <button class="b3-button b3-button--small" onclick={clearRects} disabled={rects.length === 0 || busy}>{t.occlusion.clear}</button>
    </div>
    {#if loading}
        <div class="lv-occed-state" aria-busy="true" role="status">
            <div class="lv-occed-state-icon"><LvIcon name="timer" size={28} /></div>
            <div>{t.occlusion.loading ?? "正在读取图片…"}</div>
        </div>
    {:else if errorMsg}
        <div class="lv-occed-state" role="alert">
            <div class="lv-occed-state-icon"><LvIcon name="warning" size={28} /></div>
            <div>{errorMsg}</div>
            <button class="b3-button b3-button--outline" disabled={loading} onclick={loadPreview}>{t.occlusion.retry ?? "重试"}</button>
        </div>
    {/if}
    <div class="lv-occed-stage lv-card2" class:lv-occed-hidden={loading || !!errorMsg} bind:this={preview}>
        <div class="lv-occed-content" bind:this={content}></div>
        <!-- 绘图画布：框选本质是指针交互（拖动画框），键盘替代为撤销/清空按钮 -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <svg
                bind:this={overlay}
                class="lv-occed-overlay"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                role="img"
                aria-label={t.occlusion.editorAria}
                onpointerdown={onDown}
            >                {#each rects as r, i (i)}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <rect x={r.x * 100} y={r.y * 100} width={r.w * 100} height={r.h * 100}
                        fill="var(--lv-color-brand)" opacity="0.45"
                        ondblclick={() => removeRect(i)} />
                {/each}
                {#if drawing}
                    <rect
                        x={Math.min(drawing.x, drawing.x + drawing.w) * 100}
                        y={Math.min(drawing.y, drawing.y + drawing.h) * 100}
                        width={Math.abs(drawing.w) * 100}
                        height={Math.abs(drawing.h) * 100}
                        fill="var(--lv-color-brand)" opacity="0.3"
                        stroke="var(--lv-color-brand)" stroke-width="0.4" />
                {/if}
        </svg>
    </div>
    <div class="fn__flex" style="justify-content: flex-end; gap: var(--lv-sp-2); margin-top: var(--lv-sp-3)">
        <button class="b3-button b3-button--cancel" disabled={busy} onclick={close}>{window.siyuan.languages.cancel}</button>
        <div class="fn__space"></div>
        <button class="b3-button lv-btn-primary" disabled={busy || loading || !!errorMsg || rects.length === 0} aria-busy={busy} onclick={save}>
            {t.occlusion.save} ({rects.length}) <LvKbd k={isMac ? "⌘ ↵" : "Ctrl ↵"} />
        </button>
    </div>
</div>

<style>
    .lv-occed { padding: var(--lv-sp-4); }
    .lv-occed-state {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: var(--lv-sp-2); min-height: 160px; padding: var(--lv-sp-5);
        color: var(--lv-color-text-muted);
    }
    .lv-occed-state-icon { font-size: var(--lv-type-hero-size); }
    .lv-occed-hidden { display: none; }
    .lv-occed .lv-ob-head {
        display: flex; align-items: center; gap: var(--lv-sp-2);
        margin-bottom: var(--lv-sp-3);
    }
    .lv-occed .lv-ob-step { font-weight: var(--lv-fw-bold); }
    .lv-occed-stage {
        position: relative;
        width: 100%;
        max-width: 700px;
        margin: 0 auto;
        overflow: auto;
        min-height: 120px;
        user-select: none;
    }
    .lv-occed-content :global(img) {
        display: block;
        max-width: 100%;
        height: auto;
    }
    .lv-occed-overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        cursor: crosshair;
        touch-action: none;
    }
</style>
