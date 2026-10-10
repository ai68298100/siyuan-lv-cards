import { describe, expect, it } from "vitest";
import {
    enqueueDelayedRequeue,
    nextRequeueDelay,
    SHORT_REQUEUE_DELAY_MS,
    takeDueRequeues,
} from "../src/core/delayed-requeue";

describe("delayed requeue（会话内遗忘卡短期循环）", () => {
    it("默认延迟几分钟，不会立即把 Again 卡放回队列", () => {
        const pending = enqueueDelayedRequeue([], "card-1", 1_000);
        expect(pending).toEqual([{ card: "card-1", dueAt: 1_000 + SHORT_REQUEUE_DELAY_MS }]);
        expect(takeDueRequeues(pending, 1_000 + SHORT_REQUEUE_DELAY_MS - 1)).toEqual({
            due: [],
            pending,
        });
    });

    it("只释放到期卡并保持未到期卡顺序", () => {
        let pending = enqueueDelayedRequeue([], "card-a", 0, 100);
        pending = enqueueDelayedRequeue(pending, "card-b", 0, 300);
        pending = enqueueDelayedRequeue(pending, "card-c", 0, 200);
        const result = takeDueRequeues(pending, 150);
        expect(result.due).toEqual(["card-a"]);
        expect(result.pending.map(item => item.card)).toEqual(["card-b", "card-c"]);
        expect(nextRequeueDelay(result.pending, 150)).toBe(50);
    });

    it("非法延迟回退为默认延迟，负数延迟才允许显式立即释放", () => {
        expect(enqueueDelayedRequeue([], "fallback", 0, Number.NaN)[0].dueAt).toBe(SHORT_REQUEUE_DELAY_MS);
        expect(enqueueDelayedRequeue([], "now", 100, -1)[0].dueAt).toBe(100);
    });
});
