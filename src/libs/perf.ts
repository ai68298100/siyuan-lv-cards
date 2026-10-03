// AT-6 启动/首交互/评分性能指标（纯逻辑，node 可单测）。
// 参考 Web Vitals 测量思想但为插件自定义指标：不宣称满足 LCP/INP/CLS。
// 预算：P50/P95 为本机开发参考值（docs/34 E2E-1 实测 LCP 0.84-1.4s / INP 16-72ms），
// 超预算只在诊断中标注 ⚠，不阻断任何功能。

export interface PerfSnapshot {
    startupMs: number | null;
    layoutReadyMs: number | null;
    ratingSamples: number;
    ratingP50Ms: number | null;
    ratingP95Ms: number | null;
    coldStart: boolean;
}

const RATING_SAMPLE_MAX = 50;

export function createPerf(now: () => number = () => performance.now()) {
    let t0 = 0;
    let started = false;
    let tLayout = 0;
    let coldStart = true;
    const ratingMs: number[] = [];

    return {
        /** onload 入口调用一次：启动计时起点 */
        markStart() {
            t0 = now();
            started = true;
        },
        /** onLayoutReady 调用一次：首布局完成 */
        markLayoutReady() {
            if (started) {
                tLayout = now();
            }
        },
        /** 冷/热启动判定：首轮 onboarding 未完成视为冷启动 */
        setCold(cold: boolean) {
            coldStart = cold;
        },
        /** 每次评分提交调用：记录该卡作答耗时（showAnswer→rating） */
        addRatingSample(ms: number) {
            if (Number.isFinite(ms) && ms >= 0) {
                ratingMs.push(Math.round(ms));
                if (ratingMs.length > RATING_SAMPLE_MAX) {
                    ratingMs.shift();
                }
            }
        },
        snapshot(): PerfSnapshot {
            return {
                startupMs: started ? Math.round(now() - t0) : null,
                layoutReadyMs: tLayout || started ? Math.round((tLayout || now()) - t0) : null,
                ratingSamples: ratingMs.length,
                ratingP50Ms: percentile(ratingMs, 50),
                ratingP95Ms: percentile(ratingMs, 95),
                coldStart,
            };
        },
        /** 诊断文本段（含预算标注） */
        diagLines(): string[] {
            const s = this.snapshot();
            const lines = [
                `startup: ${s.startupMs ?? "-"}ms (layoutReady ${s.layoutReadyMs ?? "-"}ms, ${s.coldStart ? "cold" : "warm"})`,
            ];
            if (s.ratingSamples > 0) {
                lines.push(
                    `rating: n=${s.ratingSamples} p50=${s.ratingP50Ms}ms p95=${s.ratingP95Ms}ms`,
                );
            }
            return lines;
        },
    };
}

/** 线性插值百分位；空数组返回 null */
export function percentile(sortedOrNot: number[], p: number): number | null {
    if (sortedOrNot.length === 0) {
        return null;
    }
    const sorted = [...sortedOrNot].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) {
        return sorted[lo];
    }
    return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}
