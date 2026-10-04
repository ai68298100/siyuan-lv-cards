import { describe, expect, it } from "vitest";
import {
    disableTarget, enableTarget, emptyKillSwitch, grantConsent, isJobQuarantined, killSwitchBlock,
    normalizeKillSwitch, quarantineJob, revokeConsent, KILL_EVENT_CAP,
} from "../src/core/ai-kill-switch";

// BU-31 紧急停用/撤销同意/隔离批次：停用后前置检查阻断；事件不含敏感内容
describe("ai-kill-switch（BU-31）", () => {
    it("停用/启用：幂等、事件留痕（scope 非明文键）", () => {
        const d = emptyKillSwitch();
        disableTarget(d, "provider:custom:https://api.x.com", 1000);
        disableTarget(d, "provider:custom:https://api.x.com", 1001); // 幂等
        expect(d.disabledTargets).toEqual(["provider:custom:https://api.x.com"]);
        expect(d.events).toHaveLength(1);
        enableTarget(d, "provider:custom:https://api.x.com", 1002);
        expect(d.disabledTargets).toEqual([]);
        expect(d.events.map(e => e.kind)).toEqual(["disable", "enable"]);
        expect(d.events.every(e => !e.scope.includes("材料"))).toBe(true); // 无敏感内容
    });

    it("撤销同意=总闸：killSwitchBlock 优先返回 consent-revoked；重新授予恢复", () => {
        const d = emptyKillSwitch();
        disableTarget(d, "task:cards-generate", 1000);
        revokeConsent(d, 1001);
        expect(killSwitchBlock(d, ["task:cards-generate", "provider:siyuan:"])).toBe("consent-revoked");
        grantConsent(d, 1002);
        expect(killSwitchBlock(d, ["task:cards-generate"])).toBe("target-disabled");
        expect(killSwitchBlock(d, ["provider:siyuan:"])).toBeNull();
    });

    it("模型粒度目标命中即阻断；无关目标不阻断", () => {
        const d = emptyKillSwitch();
        disableTarget(d, "model:gpt-4o-mini", 1000);
        expect(killSwitchBlock(d, ["model:gpt-4o-mini"])).toBe("target-disabled");
        expect(killSwitchBlock(d, ["model:glm-4-flash"])).toBeNull();
    });

    it("隔离批次：幂等、带 job: 前缀、恢复入口跳过判定", () => {
        const d = emptyKillSwitch();
        quarantineJob(d, "job-abc", 1000);
        quarantineJob(d, "job-abc", 1001);
        expect(isJobQuarantined(d, "job-abc")).toBe(true);
        expect(isJobQuarantined(d, "job-other")).toBe(false);
        expect(d.quarantinedJobs).toEqual(["job:job-abc"]);
    });

    it("事件限流：超 50 条仅保留最新", () => {
        const d = emptyKillSwitch();
        for (let i = 0; i < 60; i++) {
            disableTarget(d, `provider:x:${i}`, 1000 + i);
            enableTarget(d, `provider:x:${i}`, 1000 + i);
        }
        expect(d.events.length).toBe(KILL_EVENT_CAP);
    });

    it("normalize 白名单：结构非法落空库；事件残缺剔除；scope 截断", () => {
        const d = normalizeKillSwitch({
            revoked: "yes",
            disabledTargets: ["provider:a", "", 42],
            quarantinedJobs: ["job:1"],
            events: [{ at: 1, kind: "disable", scope: "s" }, { at: "x" }, null],
        });
        expect(d.revoked).toBe(false);
        expect(d.disabledTargets).toEqual(["provider:a"]);
        expect(d.events).toHaveLength(1);
        expect(normalizeKillSwitch(null)).toEqual(emptyKillSwitch());
        const long = normalizeKillSwitch({ disabledTargets: ["x".repeat(200)] });
        expect(long.disabledTargets[0].length).toBe(120);
    });
});
