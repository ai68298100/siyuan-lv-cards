/**
 * 数字滚动 action（灵动感，R53 动效纪律内）：400ms ease-out 计数到目标值。
 * prefers-reduced-motion 直落终值；数据更新跟随写入，不重放动画。
 */
export function countUp(node: HTMLElement, target: number) {
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const render = (v: number) => {
        node.textContent = Number.isFinite(v) ? String(v) : "";
    };
    if (reduced || !Number.isFinite(target)) {
        render(target);
        return {
            update: render,
            destroy: () => {},
        };
    }
    let current = target;
    const dur = 400;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = String(Math.round(target * eased));
        if (p < 1) {
            raf = requestAnimationFrame(step);
        }
    };
    raf = requestAnimationFrame(step);
    return {
        update(next: number) {
            current = next;
            render(current);
        },
        destroy() {
            if (raf) {
                cancelAnimationFrame(raf);
            }
        },
    };
}
