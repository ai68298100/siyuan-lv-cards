import { describe, expect, it } from "vitest";
import { createPerf, percentile } from "../src/libs/perf";

// AT-6 性能指标：百分位计算 + 埋点状态机 + 采样上限
describe("percentile", () => {
    it("空数组返回 null", () => {
        expect(percentile([], 50)).toBeNull();
    });

    it("单值数组恒等于该值", () => {
        expect(percentile([42], 50)).toBe(42);
        expect(percentile([42], 95)).toBe(42);
    });

    it("奇数长度取中位，偶数长度线性插值", () => {
        expect(percentile([3, 1, 2], 50)).toBe(2);
        expect(percentile([1, 2, 3, 4], 50)).toBe(3); // (2+3)/2 = 2.5 → 四舍五入 3
        expect(percentile([10, 20], 50)).toBe(15);
    });

    it("P95 取高位样本（线性插值）", () => {
        const data = Array.from({ length: 100 }, (_, i) => i + 1);
        expect(percentile(data, 95)).toBe(95); // idx=94.05 → 95 + 0.05*1 → 95
        expect(percentile(data, 100)).toBe(100);
    });

    it("不修改入参顺序", () => {
        const data = [5, 1, 3];
        percentile(data, 50);
        expect(data).toEqual([5, 1, 3]);
    });
});

describe("createPerf 埋点状态机", () => {
    it("未 markStart 时 snapshot 启动值为 null", () => {
        let t = 100;
        const perf = createPerf(() => t);
        const s = perf.snapshot();
        expect(s.startupMs).toBeNull();
        expect(s.layoutReadyMs).toBeNull();
        expect(s.ratingSamples).toBe(0);
        expect(s.ratingP50Ms).toBeNull();
    });

    it("start→layoutReady 记录启动耗时；冷热标记可设置", () => {
        let t = 0;
        const perf = createPerf(() => t);
        perf.markStart();
        perf.setCold(false);
        t = 500;
        perf.markLayoutReady();
        const s = perf.snapshot();
        expect(s.startupMs).toBe(500);
        expect(s.layoutReadyMs).toBe(500);
        expect(s.coldStart).toBe(false);
    });

    it("评分采样：p50/p95 计算正确，超上限丢弃最旧样本", () => {
        let t = 0;
        const perf = createPerf(() => t);
        perf.markStart();
        for (let i = 1; i <= 60; i++) {
            perf.addRatingSample(i * 10);
        }
        const s = perf.snapshot();
        expect(s.ratingSamples).toBe(50); // 上限 50
        expect(s.ratingP50Ms).toBe(355); // 保留 110..600，p50 = 350+360 中点
        expect(s.ratingP95Ms).toBe(576); // p95 = 575.5 → 四舍五入 576
        expect(s.startupMs).toBe(0); // t0=0 是合法时间戳（performance.now 从 0 起）
    });

    it("非法采样（NaN/负数）被丢弃", () => {
        const perf = createPerf(() => 0);
        perf.markStart();
        perf.addRatingSample(Number.NaN);
        perf.addRatingSample(-5);
        expect(perf.snapshot().ratingSamples).toBe(0);
    });

    it("diagLines 输出启动与评分段", () => {
        let t = 0;
        const perf = createPerf(() => t);
        perf.markStart();
        perf.addRatingSample(100);
        t = 800;
        perf.markLayoutReady();
        const lines = perf.diagLines();
        expect(lines[0]).toContain("startup: 800ms");
        expect(lines[0]).toContain("cold");
        expect(lines[1]).toContain("n=1");
        expect(lines[1]).toContain("p50=100ms");
    });
});
