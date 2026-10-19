import { describe, expect, it, vi } from "vitest";
import {
    OnboardingBootstrapController,
    createDefaultOnboardingState,
} from "../src/core/onboarding-idempotence";
import type { OnboardingState } from "../src/core/onboarding-idempotence";

describe("onboarding-idempotence (AR-4 新手引导与示例卡幂等装配引擎)", () => {
    it("默认初始状态正确", () => {
        const state = createDefaultOnboardingState();
        expect(state.version).toBe(1);
        expect(state.status).toBe("unstarted");
        expect(state.isReadOnlyFallback).toBe(false);
        expect(state.createdSampleDocId).toBeUndefined();
    });

    it("引导生命周期流转：startWizard -> selectPersona -> completeWizard", async () => {
        const saveFn = vi.fn();
        const controller = new OnboardingBootstrapController({
            createDocAction: async () => "doc-1",
            saveStateAction: saveFn,
        });

        // 1. 启动向导
        const started = controller.startWizard(1000);
        expect(started.status).toBe("in-progress");
        expect(started.startedAt).toBe(1000);

        // 2. 选定画像
        const personaState = controller.selectPersona("exam");
        expect(personaState.selectedPersona).toBe("exam");

        // 3. 完成向导
        const completed = await controller.completeWizard(2000);
        expect(completed.status).toBe("completed");
        expect(completed.completedAt).toBe(2000);
        expect(saveFn).toHaveBeenCalled();
    });

    it("跳过向导：skipWizard 记录 skipped 状态与完成时间", async () => {
        const controller = new OnboardingBootstrapController({
            createDocAction: async () => "doc-skip",
        });

        const skipped = await controller.skipWizard(1500);
        expect(skipped.status).toBe("skipped");
        expect(skipped.completedAt).toBe(1500);
    });

    it("并发连击防重入：在途调用自动合并，底层 createDocAction 仅执行一次", async () => {
        let triggerCount = 0;
        let resolveCreate: (id: string) => void = () => {};

        const controller = new OnboardingBootstrapController({
            createDocAction: async (nb, p) => {
                triggerCount++;
                return new Promise(resolve => {
                    resolveCreate = resolve;
                });
            },
        });

        // 用户连续快速点击 3 次
        const p1 = controller.ensureSampleCards("nb-test");
        const p2 = controller.ensureSampleCards("nb-test");
        const p3 = controller.ensureSampleCards("nb-test");

        // 底层仅触发了 1 次
        expect(triggerCount).toBe(1);

        resolveCreate("doc-concurrency-safe");
        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

        expect(r1.docId).toBe("doc-concurrency-safe");
        expect(r2.docId).toBe("doc-concurrency-safe");
        expect(r3.docId).toBe("doc-concurrency-safe");
        expect(triggerCount).toBe(1);
    });

    it("相同笔记本幂等复用：二次调用直接复用已有 docId，绝不重复生成多份文档", async () => {
        let triggerCount = 0;
        const controller = new OnboardingBootstrapController({
            createDocAction: async () => {
                triggerCount++;
                return `doc-created-${triggerCount}`;
            },
        });

        // 第一次创建
        const first = await controller.ensureSampleCards("nb-math");
        expect(first.docId).toBe("doc-created-1");
        expect(first.isReused).toBe(false);
        expect(triggerCount).toBe(1);

        // 第二次调用相同的笔记本
        const second = await controller.ensureSampleCards("nb-math");
        expect(second.docId).toBe("doc-created-1");
        expect(second.isReused).toBe(true);
        expect(triggerCount).toBe(1); // 坚决不再次调用底层创建！
    });

    it("无可用笔记本或只读环境：自动激活免写只读演示降级模式", async () => {
        const createFn = vi.fn();
        const controller = new OnboardingBootstrapController({
            createDocAction: createFn,
        });

        // 传入 null / undefined / 空字符串
        const res = await controller.ensureSampleCards(null);
        expect(res.isReadOnlyFallback).toBe(true);
        expect(res.docId).toBe("doc-demo-walkthrough");
        expect(createFn).not.toHaveBeenCalled(); // 零写物理磁盘
        expect(controller.getState().isReadOnlyFallback).toBe(true);
    });
});
