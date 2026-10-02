import { beforeEach, describe, expect, it } from "vitest";
import { lvLog, lvLogClear, lvLogDump } from "../src/libs/log";

describe("lvLog 环形日志缓冲（324）", () => {
    beforeEach(() => {
        lvLogClear();
    });

    it("dump 为时间戳 + 级别 + 消息格式", () => {
        lvLog("info", "hello");
        const dump = lvLogDump();
        expect(dump).toMatch(/^\d{4}-\d{2}-\d{2}T.* \[info\] hello$/m);
    });

    it("超长消息截断到 500 字符", () => {
        lvLog("warn", "x".repeat(800));
        const line = lvLogDump().split("\n")[0];
        expect(line.length).toBeLessThan(600);
        expect(line).toContain("[warn]");
    });

    it("环形上限 200 条：只保留最近记录", () => {
        for (let i = 0; i < 250; i++) {
            lvLog("info", `m${i}`);
        }
        const dump = lvLogDump();
        expect(dump).not.toContain("m49\n");
        expect(dump).toContain("m249");
        expect(dump.split("\n")).toHaveLength(200);
    });

    it("非字符串消息字符串化；clear 后为空", () => {
        lvLog("error", { code: 42 });
        expect(lvLogDump()).toContain("[error]");
        lvLogClear();
        expect(lvLogDump()).toBe("");
    });
});
